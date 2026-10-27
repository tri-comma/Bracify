/**
 * Issue #13 - Data source (SSR): data-t-source JSON fetch/parse and the control
 * parameters (filter, _sort/_order, _limit/_offset) end-to-end through the real
 * Express server + SQLite adapter + renderer.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { makeProject, removeDir } from './helpers.cjs';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const ARTICLES = [
    { id: 'a1', title: 'Cherry', category: 'Tech', views: 5, created: '2025-01-03' },
    { id: 'a2', title: 'apple', category: 'Life', views: 40, created: '2025-01-01' },
    { id: 'a3', title: 'Banana', category: 'Tech', views: 100, created: '2025-01-05' },
    { id: 'a4', title: 'Durian', category: 'Tech', views: 7, created: '2025-01-02' },
    { id: 'a5', title: 'Elder', category: 'Life', views: 9, created: '2025-01-04' }
];

const LIST_PAGE = `<!DOCTYPE html><html><head>
<link data-t-source="articles" href="/_sys/data/articles.json?category={?category}&_sort={?_sort}&_order={?_order}&_limit={?_limit}&_offset={?_offset}">
</head><body>
<p id="count">{articles._length}</p>
<ul id="list"><li data-t-list="articles">{articles.title}</li></ul>
</body></html>`;

let server, port, dir;

before(async () => {
    dir = makeProject({
        'list.html': LIST_PAGE,
        'detail.html': `<!DOCTYPE html><html><head>
<link data-t-source="article" href="/_sys/data/articles.json?id={?id}&_limit=1">
</head><body><h1 id="t">{article.title}</h1><span data-t-if="article.views:gt=50" id="pop">popular</span>
<a id="lnk" href="/x/{article.id}" class="c-{article.category}">l</a>
<p id="d">{article.created | date: 'dd.mm.yyyy'}</p></body></html>`,
        'missing.html': `<!DOCTYPE html><html><head>
<link data-t-source="nothing" href="/_sys/data/nothing.json">
</head><body><ul id="l"><li data-t-list="nothing">{nothing.title}</li></ul><p id="fb" data-t-if="!nothing">no data</p></body></html>`,
        'bad.html': `<!DOCTYPE html><html><head>
<link data-t-source="evil" href="/_sys/data/../data.json">
<link data-t-source="sys" href="/_sys/data/_secret.json">
</head><body><p id="e">{evil.title}</p><p id="s">{sys.title}</p></body></html>`,
        'short.html': `<!DOCTYPE html><html><head>
<link data-t-source="articles" href="/_sys/data/articles.json?category={?c}&_sort=views">
</head><body><ul id="list"><li data-t-list="articles">{articles.title}</li></ul></body></html>`,
        'auto.html': `<!DOCTYPE html><html><head>
<link data-t-source="articles" href="/_sys/data/articles.json?category={?}&_sort=views">
</head><body><ul id="list"><li data-t-list="articles">{articles.title}</li></ul></body></html>`,
        'xss.html': `<!DOCTYPE html><html><head>
<link data-t-source="a" href="/_sys/data/xss.json?_limit=1">
</head><body><p id="p">{a.t}</p></body></html>`
    });
    server = new EngineServer(0, () => { }, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    port = await server.start();
    for (const a of ARTICLES) await db.save('articles', a.id, a);
    await db.save('xss', 'x1', { t: '</script><script id="pwn">1</script><b>' });
});

after(async () => {
    await server.stop();
    await removeDir(dir);
});

async function page(file, query = '') {
    const res = await fetch(`http://localhost:${port}/${file}${query}`);
    const html = await res.text();
    return { res, html, doc: new JSDOM(html).window.document };
}
const titles = (doc) => [...doc.querySelectorAll('#list li')].map(li => li.textContent);

describe('SSR data-t-source: fetch & parse', () => {
    test('stored JSON documents are loaded and expanded in a list', async () => {
        const { doc } = await page('list.html');
        assert.deepStrictEqual(titles(doc).sort(), ['Banana', 'Cherry', 'Durian', 'Elder', 'apple']);
        assert.strictEqual(doc.querySelector('#count').textContent, '5');
    });

    test('numbers, strings and nested JSON values keep their types after the round trip', async () => {
        const { doc } = await page('detail.html', '?id=a3');
        assert.strictEqual(doc.querySelector('#t').textContent, 'Banana');
        assert.ok(doc.querySelector('#pop'), 'views(100) > 50 evaluated numerically');
        assert.strictEqual(doc.querySelector('#lnk').getAttribute('href'), '/x/a3');
        assert.strictEqual(doc.querySelector('#lnk').className, 'c-Tech');
        assert.strictEqual(doc.querySelector('#d').textContent, '05.01.2025');
    });

    test('_limit=1 unwraps the single record into an object', async () => {
        const { doc } = await page('detail.html', '?id=a2');
        assert.strictEqual(doc.querySelector('#t').textContent, 'apple');
        assert.strictEqual(doc.querySelector('#pop'), null, 'views(40) is not > 50');
    });

    test('unknown id: no record, placeholders stay and the page still renders (200)', async () => {
        const { res, doc } = await page('detail.html', '?id=zzz');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(doc.querySelector('#pop'), null);
    });

    test('an entity with no data: list is removed and !source fallback shows', async () => {
        const { res, doc } = await page('missing.html');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(doc.querySelectorAll('#l li').length, 0);
        assert.ok(doc.querySelector('#fb'));
    });

    test('path traversal / system entity hrefs are blocked: nothing is loaded', async () => {
        const { res, doc } = await page('bad.html');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(doc.querySelector('#e').textContent, '{evil.title}');
        assert.strictEqual(doc.querySelector('#s').textContent, '{sys.title}');
    });

    test('the data API itself is not readable by direct GET (403)', async () => {
        const res = await fetch(`http://localhost:${port}/_sys/data/articles.json`);
        assert.strictEqual(res.status, 403);
    });

    test('data containing </script> cannot break out of the injected state script or the page', async () => {
        const { doc } = await page('xss.html');
        assert.strictEqual(doc.getElementById('pwn'), null);
        assert.strictEqual(doc.querySelector('#p').textContent, '</script><script id="pwn">1</script><b>');
    });
});

describe('SSR query parameters: filtering', () => {
    test('exact match filter from the URL', async () => {
        const { doc } = await page('list.html', '?category=Tech');
        assert.deepStrictEqual(titles(doc).sort(), ['Banana', 'Cherry', 'Durian']);
    });

    test('filter with no match renders an empty list', async () => {
        const { doc } = await page('list.html', '?category=None');
        assert.deepStrictEqual(titles(doc), []);
    });

    test('an empty parameter value is ignored (all records)', async () => {
        const { doc } = await page('list.html', '?category=');
        assert.strictEqual(titles(doc).length, 5);
    });

    test('an absent parameter ({?category} unresolved) is ignored (all records)', async () => {
        const { doc } = await page('list.html');
        assert.strictEqual(titles(doc).length, 5);
    });

    test('values with SQL metacharacters are treated as plain data', async () => {
        const { res, doc } = await page('list.html', '?category=' + encodeURIComponent("x' OR '1'='1"));
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(titles(doc), []);
    });
});

describe('SSR {?} URL parameter shorthands in data-t-source href', () => {
    test('{?name} reads _sys.query.name (key names may differ)', async () => {
        const { doc } = await page('short.html', '?c=Life');
        assert.deepStrictEqual(titles(doc), ['Elder', 'apple']);
    });

    test('{?name} with the parameter absent applies no filter', async () => {
        const { doc } = await page('short.html');
        assert.strictEqual(titles(doc).length, 5);
    });

    test('bare {?} auto-binds the URL parameter with the same name as the key (README spec)',
        async () => {
            const { doc } = await page('auto.html', '?category=Life');
            assert.deepStrictEqual(titles(doc), ['Elder', 'apple']);
        });
});

describe('SSR query parameters: sorting', () => {
    test('_sort ascending (default order)', async () => {
        const { doc } = await page('list.html', '?_sort=views');
        assert.deepStrictEqual(titles(doc), ['Cherry', 'Durian', 'Elder', 'apple', 'Banana']);
    });

    test('_sort with _order=desc', async () => {
        const { doc } = await page('list.html', '?_sort=views&_order=desc');
        assert.deepStrictEqual(titles(doc), ['Banana', 'apple', 'Elder', 'Durian', 'Cherry']);
    });

    test('numeric sort is numeric, not lexicographic (100 after 40)', async () => {
        const { doc } = await page('list.html', '?_sort=views&_order=asc');
        assert.strictEqual(titles(doc).at(-1), 'Banana');
    });

    test('string sort on a date-like field', async () => {
        const { doc } = await page('list.html', '?_sort=created');
        assert.deepStrictEqual(titles(doc), ['apple', 'Durian', 'Cherry', 'Elder', 'Banana']);
    });

    test('sorting combined with a filter', async () => {
        const { doc } = await page('list.html', '?category=Tech&_sort=views&_order=desc');
        assert.deepStrictEqual(titles(doc), ['Banana', 'Durian', 'Cherry']);
    });

    test('an unknown sort key does not break rendering', async () => {
        const { res, doc } = await page('list.html', '?_sort=nope');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(titles(doc).length, 5);
    });
});

describe('SSR query parameters: pagination (_limit / _offset)', () => {
    const q = (o) => '?_sort=views&_order=asc' + o;
    // views asc: Cherry(5) Durian(7) Elder(9) apple(40) Banana(100)

    test('_limit caps the number of items', async () => {
        const { doc } = await page('list.html', q('&_limit=2'));
        assert.deepStrictEqual(titles(doc), ['Cherry', 'Durian']);
    });

    test('_limit + _offset select a page', async () => {
        assert.deepStrictEqual(titles((await page('list.html', q('&_limit=2&_offset=2'))).doc), ['Elder', 'apple']);
        assert.deepStrictEqual(titles((await page('list.html', q('&_limit=2&_offset=4'))).doc), ['Banana']);
    });

    test('_offset beyond the end gives an empty list', async () => {
        const { doc } = await page('list.html', q('&_limit=2&_offset=50'));
        assert.deepStrictEqual(titles(doc), []);
    });

    test('_limit larger than the data returns everything', async () => {
        const { doc } = await page('list.html', q('&_limit=100'));
        assert.strictEqual(titles(doc).length, 5);
    });

    test('_limit=0 returns nothing', async () => {
        const { doc } = await page('list.html', q('&_limit=0'));
        assert.deepStrictEqual(titles(doc), []);
    });

    test('_offset alone skips records (README: "読み飛ばす件数")', async () => {
        const { doc } = await page('list.html', q('&_offset=3'));
        assert.deepStrictEqual(titles(doc), ['apple', 'Banana']);
    });

    test('non-numeric _limit is ignored', async () => {
        const { res, doc } = await page('list.html', q('&_limit=abc'));
        assert.strictEqual(res.status, 200);
        assert.strictEqual(titles(doc).length, 5);
    });
});
