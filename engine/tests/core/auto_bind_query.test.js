/**
 * Issue #39 - README: in a data-t-source href, a bare `{?}` auto-binds the URL parameter with the SAME NAME
 * as the key on its left (`books.json?title={?}` == `books.json?title={?title}`).
 * Covered in SSR (real Express server + SQLite) and CSR (jsdom + local JSON filtering).
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { makeProject, removeDir, render, cleanupAll } from './helpers.cjs';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

afterEach(cleanupAll);

const BOOKS = [
    { id: 1, title: 'Atlas', category_id: 10 },
    { id: 2, title: 'Beacon', category_id: 20 },
    { id: 3, title: 'Cairn', category_id: 10 },
    { id: 4, title: 'Delta', category_id: 10 }
];
const ALL = BOOKS.map(b => b.title);

const HREFS = {
    title: 'books.json?title={?}',
    two: 'books.json?title={?}&category_id={?}',
    id: 'books.json?id={?}',
    limit: 'books.json?_limit={?}',
    // explicit form that must keep working (equivalence reference)
    explicit: 'books.json?title={?title}'
};
const BODY = '<ul id="l"><li data-t-list="s">{s.title}</li></ul>';
const BODY_TEXT = BODY + '<p id="t">[{?}]</p>';

const link = (href) => `<link data-t-source="s" href="_sys/data/${href}">`;
const html = (head, body) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

let server, port, dir;
before(async () => {
    dir = makeProject({
        'title.html': html(link(HREFS.title), BODY),
        'two.html': html(link(HREFS.two), BODY),
        'id.html': html(link(HREFS.id), BODY),
        'limit.html': html(link(HREFS.limit), BODY),
        'explicit.html': html(link(HREFS.explicit), BODY),
        'text.html': html(link(HREFS.title), BODY_TEXT)
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

const items = (doc) => [...doc.querySelectorAll('#l li')].map(li => li.textContent).sort();
async function ssr(file, query = '') {
    const res = await fetch(`http://localhost:${port}/${file}${query}`);
    return new JSDOM(await res.text()).window.document;
}
const csr = (href, query = {}, body = BODY) => render('csr', body, { head: link(href), sources: { books: BOOKS }, query });

describe('SSR: bare {?} auto-binds the same-named URL parameter (#39)', () => {
    test('[Red] title={?} with ?title=Beacon -> only Beacon', async () =>
        assert.deepStrictEqual(items(await ssr('title.html', '?title=Beacon')), ['Beacon']));
    test('[Green] explicit title={?title} with ?title=Beacon -> only Beacon (equivalence reference)', async () =>
        assert.deepStrictEqual(items(await ssr('explicit.html', '?title=Beacon')), ['Beacon']));
    test('[Red] title={?}&category_id={?} both params -> intersection', async () =>
        assert.deepStrictEqual(items(await ssr('two.html', '?title=Cairn&category_id=10')), ['Cairn']));
    test('[Red] title={?}&category_id={?} with mismatching pair -> 0 items (both filters applied)', async () =>
        assert.deepStrictEqual(items(await ssr('two.html', '?title=Cairn&category_id=20')), []));
    test('[Red] title={?}&category_id={?} with only category_id -> filtered by category_id', async () =>
        assert.deepStrictEqual(items(await ssr('two.html', '?category_id=20')), ['Beacon']));
    test('[Green] title={?} with no title param -> filter ignored, all records (README empty rule)', async () =>
        assert.deepStrictEqual(items(await ssr('title.html')), ALL));
    test('[Green] title={?} with empty ?title= -> filter ignored, all records', async () =>
        assert.deepStrictEqual(items(await ssr('title.html', '?title=')), ALL));
    test('[Green] title={?} ignores an unrelated param (?q=Beacon) -> all records', async () =>
        assert.deepStrictEqual(items(await ssr('title.html', '?q=Beacon')), ALL));
    test('[Red] id={?} with ?id=2 -> Beacon', async () =>
        assert.deepStrictEqual(items(await ssr('id.html', '?id=2')), ['Beacon']));
    test('[Green] id={?} with no id -> no records (#38 rule)', async () =>
        assert.deepStrictEqual(items(await ssr('id.html')), []));
    test('[Red] _limit={?} with ?_limit=2 -> 2 records (README example)', async () =>
        assert.strictEqual(items(await ssr('limit.html', '?_limit=2')).length, 2));
    test('[Green] {?} outside a data-t-source href is not expanded into data (text)', async () => {
        const doc = await ssr('text.html', '?title=Beacon');
        assert.ok(!doc.querySelector('#t').textContent.includes('Beacon'));
    });
});

describe('CSR: bare {?} auto-binds the same-named URL parameter (#39)', () => {
    test('[Red] title={?} with ?title=Beacon -> only Beacon', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.title, { title: 'Beacon' })), ['Beacon']));
    test('[Green] explicit title={?title} with ?title=Beacon -> only Beacon (equivalence reference)', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.explicit, { title: 'Beacon' })), ['Beacon']));
    test('[Red] title={?}&category_id={?} both params -> intersection', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.two, { title: 'Cairn', category_id: '10' })), ['Cairn']));
    test('[Red] title={?}&category_id={?} with mismatching pair -> 0 items (both filters applied)', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.two, { title: 'Cairn', category_id: '20' })), []));
    test('[Red] title={?}&category_id={?} with only category_id -> filtered by category_id', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.two, { category_id: '20' })), ['Beacon']));
    test('[Green] title={?} with no title param -> filter ignored, all records (README empty rule)', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.title)), ALL));
    test('[Green] title={?} with empty ?title= -> filter ignored, all records', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.title, { title: '' })), ALL));
    test('[Green] title={?} ignores an unrelated param (?q=Beacon) -> all records', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.title, { q: 'Beacon' })), ALL));
    test('[Red] id={?} with ?id=2 -> Beacon', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.id, { id: '2' })), ['Beacon']));
    test('[Green] id={?} with no id -> no records (#38 rule)', async () =>
        assert.deepStrictEqual(items(await csr(HREFS.id)), []));
    test('[Red] _limit={?} with ?_limit=2 -> 2 records (README example)', async () =>
        assert.strictEqual(items(await csr(HREFS.limit, { _limit: '2' })).length, 2));
    test('[Green] {?} outside a data-t-source href is not expanded into data (text)', async () => {
        const doc = await csr(HREFS.title, { title: 'Beacon' }, BODY_TEXT);
        assert.ok(!doc.querySelector('#t').textContent.includes('Beacon'));
    });
});

describe('expandAutoBind (#39)', () => {
    const { expandAutoBind } = require('../../lib/engine.cjs');
    const cases = [
        ['first param after ?', 'a.json?title={?}', 'a.json?title={?title}'],
        ['param after &', 'a.json?x=1&title={?}', 'a.json?x=1&title={?title}'],
        ['fragment kept', 'a.json?title={?}#top', 'a.json?title={?title}#top'],
        ['repeated key', 'a.json?t={?}&t={?}', 'a.json?t={?t}&t={?t}'],
        ['key with - _ . digits', 'a.json?a-b_c.d1={?}', 'a.json?a-b_c.d1={?a-b_c.d1}'],
        ['no query string', 'a.json', 'a.json'],
        ['operator key unchanged', 'a.json?price:gt={?}', 'a.json?price:gt={?}'],
        ['mixed value (prefix) unchanged', 'a.json?x=pre{?}', 'a.json?x=pre{?}'],
        ['mixed value (suffix) unchanged', 'a.json?y={?}z', 'a.json?y={?}z'],
        ['escaped braces unchanged', 'a.json?t=\\{?\\}', 'a.json?t=\\{?\\}'],
        ['URL-encoded key unchanged', 'a.json?f%20g={?}', 'a.json?f%20g={?}']
    ];
    for (const [name, input, expected] of cases) {
        test(name, () => assert.strictEqual(expandAutoBind(input), expected));
    }
});
