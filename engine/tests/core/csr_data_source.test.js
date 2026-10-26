/**
 * Issue #13 - Data source (CSR): data-t-source JSON fetch/parse and the local
 * control parameters (filter, _sort/_order, _limit/_offset) executed by the
 * browser engine (lib/engine.cjs) in a jsdom window with a stubbed network.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { csr, render, cleanupAll } from './helpers.cjs';

afterEach(cleanupAll);

const ARTICLES = [
    { id: 1, title: 'Cherry', category: 'Tech', views: 5, created: '2025-01-03' },
    { id: 2, title: 'apple', category: 'Life', views: 40, created: '2025-01-01' },
    { id: 3, title: 'Banana', category: 'Tech', views: 100, created: '2025-01-05' },
    { id: 4, title: 'Durian', category: 'Tech', views: 7, created: '2025-01-02' },
    { id: 5, title: 'Elder', category: 'Life', views: 9, created: '2025-01-04' }
];

/** Render a list page whose data-t-source href is `href`, with the given query string. */
async function list(href, query = {}) {
    const doc = await render('csr', '<ul id="l"><li data-t-list="a">{a.title}</li></ul>', {
        head: `<link data-t-source="a" href="${href}">`,
        sources: { articles: ARTICLES },
        query
    });
    return [...doc.querySelectorAll('#l li')].map(li => li.textContent);
}
const U = '_sys/data/articles.json';

describe('CSR data-t-source: fetch & parse', () => {
    test('JSON is fetched from the data URL (relative and leading-slash forms) and parsed', async () => {
        assert.strictEqual((await list(U)).length, 5);
        assert.strictEqual((await list('/' + U)).length, 5);
    });

    test('the request goes to the declared URL', async () => {
        const r = await csr('<html><head><link data-t-source="a" href="_sys/data/articles.json"></head><body></body></html>', {
            files: { [U]: ARTICLES }
        });
        try { assert.ok(r.fetched.some(u => u.includes('_sys/data/articles.json'))); } finally { r.cleanup(); }
    });

    test('a single JSON object (not an array) is exposed as an object', async () => {
        const doc = await render('csr', '<h1 id="t">{one.title}</h1>', {
            head: '<link data-t-source="one" href="_sys/data/one.json">', sources: { one: { title: 'Solo' } }
        });
        assert.strictEqual(doc.querySelector('#t').textContent, 'Solo');
    });

    test('a 404 / missing file yields no data and the page still renders', async () => {
        const doc = await render('csr', '<ul id="l"><li data-t-list="gone">{gone.title}</li></ul><p id="p">ok</p>', {
            head: '<link data-t-source="gone" href="_sys/data/gone.json">'
        });
        assert.strictEqual(doc.querySelectorAll('#l li').length, 0);
        assert.strictEqual(doc.querySelector('#p').textContent, 'ok');
    });

    test('invalid hrefs (traversal, wrong folder, bad entity name) are never fetched', async () => {
        const hrefs = ['_sys/data/../secret.json', '/etc/passwd', '_sys/other/x.json', '_sys/data/a.b.json', 'https://evil.example/_sys/data/x.json'];
        const links = hrefs.map((h, i) => `<link data-t-source="x${i}" href="${h}">`).join('');
        const r = await csr(`<html><head>${links}</head><body><p id="p">{x0.a}</p></body></html>`, { files: { 'secret.json': { a: 1 } } });
        try {
            assert.strictEqual(r.fetched.length, 0, 'no network request may be made for rejected URLs');
            assert.strictEqual(r.document.querySelector('#p').textContent, '{x0.a}');
        } finally { r.cleanup(); }
    });

    test('hydrated SSR data (window.__BRACIFY_DATA__) is used without refetching', async () => {
        const r = await csr(
            '<html><head><link data-t-source="a" href="_sys/data/articles.json"></head><body><p id="p">{a.title}</p></body></html>',
            { hydrated: { a: { title: 'FromSSR' } }, files: { [U]: [{ title: 'FromNetwork' }] } });
        try {
            assert.strictEqual(r.document.querySelector('#p').textContent, 'FromSSR');
            assert.strictEqual(r.fetched.length, 0);
        } finally { r.cleanup(); }
    });

    test('a custom window.BracifyFetcher takes precedence over the built-in fetcher', async () => {
        const calls = [];
        const r = await csr(
            '<html><head><link data-t-source="a" href="_sys/data/articles.json?x=1"></head><body><p id="p">{a.title}</p></body></html>',
            { files: { [U]: [{ title: 'Net' }] }, fetcher: async (href, name) => { calls.push([href, name]); return { title: 'Custom' }; } });
        try {
            assert.strictEqual(r.document.querySelector('#p').textContent, 'Custom');
            assert.deepStrictEqual(calls, [['_sys/data/articles.json?x=1', 'a']]);
            assert.strictEqual(r.fetched.length, 0);
        } finally { r.cleanup(); }
    });
});

describe('CSR query parameters: filtering', () => {
    test('exact match filter', async () => {
        assert.deepStrictEqual((await list(U + '?category=Tech')).sort(), ['Banana', 'Cherry', 'Durian']);
    });

    test('numeric field matches by string equality', async () => {
        assert.deepStrictEqual(await list(U + '?views=40'), ['apple']);
    });

    test('multiple filters are ANDed', async () => {
        assert.deepStrictEqual(await list(U + '?category=Tech&views=7'), ['Durian']);
    });

    test('no match gives an empty list', async () => {
        assert.deepStrictEqual(await list(U + '?category=None'), []);
    });

    test('an empty value is ignored (README: all records)', async () => {
        assert.strictEqual((await list(U + '?category=')).length, 5);
    });

    test('{_sys.query.x} resolved from the page URL', async () => {
        assert.deepStrictEqual((await list(U + '?category={_sys.query.cat}', { cat: 'Life' })).sort(), ['Elder', 'apple']);
    });

    test('{?x} shorthand resolved from the page URL', async () => {
        assert.deepStrictEqual((await list(U + '?category={?c}', { c: 'Life' })).sort(), ['Elder', 'apple']);
    });

    test('an unresolved placeholder (parameter absent) does not filter everything out', async () => {
        assert.strictEqual((await list(U + '?category={?c}')).length, 5);
        assert.strictEqual((await list(U + '?category={_sys.query.c}')).length, 5);
    });

    test('bare {?} auto-binds the URL parameter with the same name as the key (README spec)',
        { todo: 'bug: bare {?} is documented as auto-binding "category={?}" to ?category=..., but it is never resolved and is silently ignored' },
        async () => {
            assert.deepStrictEqual((await list(U + '?category={?}', { category: 'Life' })).sort(), ['Elder', 'apple']);
        });

    test('limit=1 with exactly one match unwraps to an object', async () => {
        const doc = await render('csr', '<h1 id="t">{a.title}</h1>', {
            head: `<link data-t-source="a" href="${U}?id=3&_limit=1">`, sources: { articles: ARTICLES }
        });
        assert.strictEqual(doc.querySelector('#t').textContent, 'Banana');
    });
});

describe('CSR query parameters: sorting', () => {
    test('_sort ascending by default, numeric compare', async () => {
        assert.deepStrictEqual(await list(U + '?_sort=views'), ['Cherry', 'Durian', 'Elder', 'apple', 'Banana']);
    });

    test('_order=desc', async () => {
        assert.deepStrictEqual(await list(U + '?_sort=views&_order=desc'), ['Banana', 'apple', 'Elder', 'Durian', 'Cherry']);
    });

    test('_order is case-insensitive', async () => {
        assert.deepStrictEqual(await list(U + '?_sort=views&_order=DESC'), ['Banana', 'apple', 'Elder', 'Durian', 'Cherry']);
    });

    test('string sort is case-insensitive', async () => {
        assert.deepStrictEqual(await list(U + '?_sort=title'), ['apple', 'Banana', 'Cherry', 'Durian', 'Elder']);
    });

    test('sort combined with filter', async () => {
        assert.deepStrictEqual(await list(U + '?category=Tech&_sort=views&_order=desc'), ['Banana', 'Durian', 'Cherry']);
    });

    test('sort key and order taken from URL parameters', async () => {
        assert.deepStrictEqual(
            await list(U + '?_sort={_sys.query._sort}&_order={_sys.query._order}', { _sort: 'created', _order: 'desc' }),
            ['Banana', 'Elder', 'Cherry', 'Durian', 'apple']);
    });

    test('an unknown sort key keeps the original order and does not throw', async () => {
        assert.strictEqual((await list(U + '?_sort=nope')).length, 5);
    });
});

describe('CSR query parameters: pagination (_limit / _offset)', () => {
    const s = '?_sort=views&_order=asc';
    // views asc: Cherry(5) Durian(7) Elder(9) apple(40) Banana(100)

    test('_limit', async () => {
        assert.deepStrictEqual(await list(U + s + '&_limit=2'), ['Cherry', 'Durian']);
    });

    test('_limit + _offset', async () => {
        assert.deepStrictEqual(await list(U + s + '&_limit=2&_offset=2'), ['Elder', 'apple']);
        assert.deepStrictEqual(await list(U + s + '&_limit=2&_offset=4'), ['Banana']);
    });

    test('_offset alone', async () => {
        assert.deepStrictEqual(await list(U + s + '&_offset=3'), ['apple', 'Banana']);
    });

    test('_offset beyond the end gives an empty list', async () => {
        assert.deepStrictEqual(await list(U + s + '&_limit=2&_offset=50'), []);
    });

    test('_limit larger than the data returns everything', async () => {
        assert.strictEqual((await list(U + s + '&_limit=100')).length, 5);
    });

    test('page links: _offset computed from the current URL parameter', async () => {
        const doc = await render('csr', '<ul id="l"><li data-t-list="a">{a.title}</li></ul><a id="n" href="?_offset={_sys.query._offset + 2}">next</a>', {
            head: `<link data-t-source="a" href="${U}?_sort=views&_limit=2&_offset={_sys.query._offset}">`,
            sources: { articles: ARTICLES },
            query: { _offset: '2' }
        });
        assert.deepStrictEqual([...doc.querySelectorAll('#l li')].map(li => li.textContent), ['Elder', 'apple']);
        assert.strictEqual(doc.querySelector('#n').getAttribute('href'), '?_offset=4');
    });
});
