/**
 * Issue #85 - values substituted into the QUERY part of a data-t-source href ({?key}, the `key={?}` shorthand,
 * data placeholders such as {_sys.query.key} / {cfg.tag}) must be encodeURIComponent-ed, so a value like
 * `x&id=1` stays ONE parameter value instead of injecting an extra filter. Path (and fragment) substitution is unchanged.
 * Covered end-to-end in SSR (real Express server + SQLite, and the renderer with a request-recording fetcher)
 * and in CSR (jsdom + local JSON filtering, and a request-recording BracifyFetcher).
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { makeProject, removeDir, render, csr, cleanupAll } from './helpers.cjs';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const { processHTML } = require('../../server/renderer.cjs');
const { filterLocalData, resolveSourceHref } = require('../../lib/engine.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

// Cleanups of csrRecord() pages, run together with the helpers' own pending cleanups.
const cleanupPending = [];
afterEach(() => {
    cleanupAll();
    while (cleanupPending.length) cleanupPending.pop()();
});

// Values that are unsafe (or ambiguous) when pasted raw into a query string.
const VALUES = [
    ['ampersand', 'a&b'],
    ['equals', 'a=b'],
    ['hash', 'a#b'],
    ['percent', '50%'],
    ['percent-escape lookalike', 'a%26b'],
    ['plus', 'a+b'],
    ['space', 'a b'],
    ['Japanese', '日本語'],
    ['filter injection', 'x&id=1'],
    ['limit injection', 'x&_limit=1'],
    ['mixed', 'a&b=c#d+e f%g 日本']
];

const HREFS = {
    explicit: 'books.json?title={?title}',
    shorthand: 'books.json?title={?}',
    dataPath: 'books.json?title={_sys.query.title}'
};

// One record per value plus a decoy; id 1 matters for the injection values (`&id=1`).
const BOOKS = [
    { id: 1, title: 'decoy' },
    ...VALUES.map(([, v], i) => ({ id: i + 2, title: v })),
    { id: 100, title: 'x' }
];
const ALL = BOOKS.map(b => b.title).sort();

const link = (href) => `<link data-t-source="s" href="_sys/data/${href}">`;
const BODY = '<ul id="l"><li data-t-list="s">{s.title}</li></ul>';
const html = (head, body) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const items = (doc) => [...doc.querySelectorAll('#l li')].map(li => li.textContent).sort();

/** The query of a recorded request, as a server would parse it. */
const queryOf = (href) => new URL(href, 'http://localhost/').searchParams;
/** Asserts the request carries exactly one `title` parameter with the original value and nothing else. */
function assertSingleTitle(href, value) {
    const q = queryOf(href);
    assert.deepStrictEqual([...q.keys()], ['title'], `extra/missing params in ${href}`);
    assert.strictEqual(q.get('title'), value, `value corrupted in ${href}`);
}

/** SSR through the renderer; the fetcher records every request and filters like the local fetcher does. */
async function ssrRecord(head, query, extraData = {}, sources = {}) {
    const requests = [];
    const out = await processHTML(
        html(head, BODY),
        { _sys: { query, params: {} }, ...extraData },
        async () => null,
        async (href, name) => {
            requests.push(href);
            if (name in sources) return sources[name];
            return filterLocalData(BOOKS, href);
        }
    );
    return { doc: new JSDOM(out).window.document, requests };
}

/** CSR with a recording BracifyFetcher. */
async function csrRecord(head, query) {
    const requests = [];
    const qs = new URLSearchParams(query).toString();
    const r = await csr(html(head, BODY), {
        url: 'http://localhost/page.html' + (qs ? '?' + qs : ''),
        fetcher: async (href) => { requests.push(href); return filterLocalData(BOOKS, href); }
    });
    cleanupPending.push(r.cleanup);
    return { doc: r.document, requests };
}

// ---- real server (SSR end-to-end: Express query parsing + SQLite filtering) ----
let server, port, dir;
before(async () => {
    dir = makeProject({
        'explicit.html': html(link(HREFS.explicit), BODY),
        'shorthand.html': html(link(HREFS.shorthand), BODY),
        'datapath.html': html(link(HREFS.dataPath), BODY)
    });
    server = new EngineServer(0, () => { }, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    port = await server.start();
    for (const b of BOOKS) await db.save('books', String(b.id), b);
});
after(async () => {
    await server.stop();
    await removeDir(dir);
});

async function serverSsr(file, title) {
    const res = await fetch(`http://localhost:${port}/${file}?title=${encodeURIComponent(title)}`);
    return new JSDOM(await res.text()).window.document;
}

describe('SSR (Express + SQLite)', () => {
    for (const [label, value] of VALUES) {
        test(`{?title}: <${label}> renders exactly the record titled ${JSON.stringify(value)}`, async () =>
            assert.deepStrictEqual(items(await serverSsr('explicit.html', value)), [value]));
    }
    for (const [name, file] of [['title={?}', 'shorthand.html'], ['{_sys.query.title}', 'datapath.html']]) {
        test(`${name}: filter injection stays one value`, async () =>
            assert.deepStrictEqual(items(await serverSsr(file, 'x&id=1')), ['x&id=1']));
    }
    test('a normal value still filters', async () =>
        assert.deepStrictEqual(items(await serverSsr('explicit.html', 'decoy')), ['decoy']));
});

// ---- renderer / CSR: exact request URL + rendered records ----
for (const [mode, run] of [['SSR renderer', ssrRecord], ['CSR', csrRecord]]) {
    describe(`${mode}: {?title}`, () => {
        for (const [label, value] of VALUES) {
            test(`<${label}> is sent as a single title parameter and renders that record`, async () => {
                const { doc, requests } = await run(link(HREFS.explicit), { title: value });
                const mine = requests.filter(r => r.includes('books.json'));
                assert.ok(mine.length >= 1, 'books.json was requested');
                for (const r of mine) assertSingleTitle(r, value);
                assert.deepStrictEqual(items(doc), [value]);
            });
        }
        test('a normal value is sent unchanged and filters', async () => {
            const { doc, requests } = await run(link(HREFS.explicit), { title: 'decoy' });
            for (const r of requests.filter(r => r.includes('books.json'))) assertSingleTitle(r, 'decoy');
            assert.deepStrictEqual(items(doc), ['decoy']);
        });
        test('no title param -> filter ignored, all records (existing behavior)', async () => {
            const { doc } = await run(link(HREFS.explicit), {});
            assert.deepStrictEqual(items(doc), ALL);
        });
    });

    describe(`${mode}: other placeholder forms`, () => {
        for (const [name, href] of [['title={?} shorthand', HREFS.shorthand], ['{_sys.query.title}', HREFS.dataPath]]) {
            for (const value of ['x&id=1', 'x&_limit=1']) {
                test(`${name}: ${JSON.stringify(value)} is one parameter`, async () => {
                    const { doc, requests } = await run(link(href), { title: value });
                    for (const r of requests.filter(r => r.includes('books.json'))) assertSingleTitle(r, value);
                    assert.deepStrictEqual(items(doc), [value]);
                });
            }
        }
        test('whole-query placeholder books.json?{?q} becomes one encoded value', async () => {
            const { requests } = await run(link('books.json?{?q}'), { q: 'a=b&id=1' });
            assert.ok(requests.includes('_sys/data/books.json?' + encodeURIComponent('a=b&id=1')), requests.join());
        });
    });

    describe(`${mode}: path placeholders keep their raw substitution`, () => {
        test('books/{?a}.json (no query): path value is not encoded', async () => {
            const { requests } = await run(link('books/{?a}.json'), { a: 'x y' });
            assert.ok(requests.includes('_sys/data/books/x y.json'), requests.join());
        });
        test('books/{?a}.json?t={?b}: path raw, query encoded', async () => {
            const { requests } = await run(link('books/{?a}.json?t={?b}'), { a: 'x y', b: 'p&q' });
            assert.ok(requests.includes('_sys/data/books/x y.json?t=p%26q'), requests.join());
        });
    });
}

describe('CSR with the built-in local fetcher (render helper)', () => {
    for (const [label, value] of VALUES) {
        test(`{?title} with <${label}> renders exactly that record`, async () =>
            assert.deepStrictEqual(items(await render('csr', BODY, { head: link(HREFS.explicit), sources: { books: BOOKS }, query: { title: value } })), [value]));
    }
    test('title={?} with a filter-injection value renders exactly that record', async () =>
        assert.deepStrictEqual(items(await render('csr', BODY, { head: link(HREFS.shorthand), sources: { books: BOOKS }, query: { title: 'x&id=1' } })), ['x&id=1']));
});

describe('SSR: data placeholders inside a query string (earlier source / initial data)', () => {
    for (const [label, value] of VALUES) {
        test(`{cfg.tag} from an earlier data-t-source with <${label}> is one parameter`, async () => {
            const head = '<link data-t-source="cfg" href="_sys/data/cfg.json">' +
                '<link data-t-source="s" href="_sys/data/books.json?title={cfg.tag}">';
            const { doc, requests } = await ssrRecord(head, {}, {}, { cfg: { tag: value } });
            const mine = requests.filter(r => r.includes('books.json'));
            assert.strictEqual(mine.length, 1);
            assertSingleTitle(mine[0], value);
            assert.deepStrictEqual(items(doc), [value]);
        });
    }
    test('{q} from the initial data with a filter-injection value is one parameter', async () => {
        const { requests } = await ssrRecord(link('books.json?title={q}'), {}, { q: 'x&id=1' });
        assertSingleTitle(requests.find(r => r.includes('books.json')), 'x&id=1');
    });
});

describe('multiple placeholders: each value is encoded independently', () => {
    const head = link('books.json?title={?title}&category_id={?category_id}');
    for (const [mode, run] of [['SSR renderer', ssrRecord], ['CSR', csrRecord]]) {
        test(`${mode}: both values stay single parameters`, async () => {
            const { requests } = await run(head, { title: 'a&b=c', category_id: '1&id=2' });
            const mine = requests.filter(r => r.includes('books.json'));
            assert.ok(mine.length >= 1);
            for (const r of mine) {
                const q = queryOf(r);
                assert.deepStrictEqual([...q.keys()].sort(), ['category_id', 'title']);
                assert.strictEqual(q.get('title'), 'a&b=c');
                assert.strictEqual(q.get('category_id'), '1&id=2');
            }
        });
    }
});

describe('resolveSourceHref: where the query starts', () => {
    const data = { _sys: { query: { a: 'x y', b: 'p&q' } }, d: { v: 'k=1' } };
    const cases = [
        ['no placeholders', 'books.json?t=1', 'books.json?t=1'],
        ['path placeholder, no query', 'books/{?a}.json', 'books/x y.json'],
        ['path raw, query encoded', 'books/{?a}.json?t={?b}', 'books/x y.json?t=p%26q'],
        ['whole query is one value', 'books.json?{?b}', 'books.json?p%26q'],
        ['data placeholder in query', 'books.json?t={d.v}', 'books.json?t=k%3D1'],
        ['fragment is raw', 'books.json?t={?b}#f{?a}', 'books.json?t=p%26q#fx y'],
        ['? after # belongs to the fragment', 'books.json#f?{?a}', 'books.json#f?x y'],
        ['unresolved placeholder stays literal', 'books.json?t={?zzz}', 'books.json?t={?zzz}']
    ];
    for (const [name, href, expected] of cases) {
        test(name, () => assert.strictEqual(resolveSourceHref(href, data), expected));
    }
    test('escapeOutput: path values get brace-escaped, query values are percent-encoded', () => {
        assert.strictEqual(resolveSourceHref('b/{?a}?t={?a}', { _sys: { query: { a: '{x}' } } }, true), 'b/\\{x\\}?t=%7Bx%7D');
    });
});
