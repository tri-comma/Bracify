import { test, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { JSDOM } from 'jsdom';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Issue #54: `{src._total}` (matching records before _limit/_offset), `_fields` projection and an optional
// BRACIFY_MAX_LIMIT cap, so pagination needs no second unpaged "matched" source dumped into the page.
//
// Proposals under test (flagged in the report):
//  - `_limit=1` (single-object expansion): `{src._total}` is a meta property of the unwrapped object, resolved exactly like
//    on the array form, so `{shelf._length}` / `{shelf._total}` templates work for any _limit.
//  - `_fields` applies to what is embedded/displayed; a relation key (author_id) must be listed to keep `{book.author.name}`.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();
const { csr } = require('../core/helpers.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep-alive GET over node:http. Not fetch() with "Connection: close": on Windows the server closing the socket right
// after a ~100 KB body (the 1000-row pages here) intermittently loses the tail, the client then hangs ~19 s and fails with
// UND_ERR_RES_CONTENT_LENGTH_MISMATCH (reproduced with a bare http.createServer, no Bracify code involved).
const agent = new http.Agent({ keepAlive: true });
const httpGet = (url) => new Promise((resolve, reject) => {
    http.get(url, { agent }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
    }).on('error', reject);
});

const N = 1000;
const SRC = (qs) => `<link data-t-source="shelf" href="_sys/data/books.json?${qs}">`;
const page = (head, body) => `<html><head>${head}</head><body>${body}</body></html>`;
const COUNT = '<p id="c">{shelf._length}/{shelf._total}</p>';
const AUTHORS = '<link data-t-source="authors" href="_sys/data/authors.json">';

const PAGES = {
    'list.html': page(SRC('_limit=3&_offset={?_offset}'), COUNT +
        '<a id="next" data-t-if="shelf._total:gt={_sys.query._offset + 20}" href="#">next</a>' +
        '<ul><li data-t-list="shelf"><b>{shelf.title}</b></li></ul>'),
    'filtered.html': page(SRC('status=open&_limit=3'), COUNT),
    'sorted.html': page(SRC('_sort=price&_order=desc&_limit=2&_offset=1'), COUNT + '<ul><li data-t-list="shelf"><i>{shelf.title}</i></li></ul>'),
    'single.html': page(SRC('id=b0002&_limit=1'), '<p id="s">{shelf.title}|{shelf._total}</p>'),
    'single-many.html': page(SRC('status=open&_limit=1&_sort=id'), '<p id="s">{shelf.title}|{shelf._total}</p>'),
    'fields.html': page(SRC('_fields=id,title,nope&_limit=3'),
        '<ul><li data-t-list="shelf"><b>{shelf.id}:{shelf.title}:{shelf.price}:{shelf.secret}</b></li></ul>'),
    'fields-single.html': page(SRC('id=b0001&_limit=1&_fields=title'), '<p id="s">{shelf.id}|{shelf.title}|{shelf.price}</p>'),
    'rel.html': page(SRC('_fields=id,title,author_id&_limit=2') + AUTHORS,
        '<ul><li data-t-list="shelf"><b>{shelf.title}/{shelf.author.name}</b></li></ul>'),
    'rel-missing.html': page(SRC('_fields=id,title&_limit=2') + AUTHORS,
        '<ul><li data-t-list="shelf"><b>{shelf.title}/{shelf.author.name}</b></li></ul>'),
    'max.html': page(SRC('_limit={?_limit}'), COUNT),
    'bulk.html': page('<link data-t-source="shelf" href="_sys/data/bulk.json?_limit={?_limit}">', COUNT),
    'ls1.html': page('<link data-t-source="r" href="_sys/data/bulk.json?id=ls1&_limit=1">', '<p id="t">{r.title}|{r._total}</p>'),
    'ls2.html': page('<link data-t-source="r" href="_sys/data/bulk.json?id=ls2&_limit=1">', '<p id="t">{r.title}|{r._total}</p>')
};

// One project with N records shared by all server tests (seeding is the slow part)
let shop = null;
async function withShop(fn) {
    if (!shop) shop = await startShop();
    await fn(shop);
}
after(async () => {
    agent.destroy();
    if (!shop) return;
    await shop.server.stop();
    for (let i = 0; i < 5; i++) {
        try { fs.rmSync(shop.dir, { recursive: true, force: true }); break; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
});

async function startShop() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-total-'));
    for (const [name, content] of Object.entries(PAGES)) fs.writeFileSync(path.join(dir, name), content);
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    for (let a = 1; a <= 3; a++) await db.save('authors', `a${a}`, { name: `Author ${a}` });
    for (let i = 1; i <= N; i++) {
        const id = 'b' + String(i).padStart(4, '0');
        await db.save('books', id, { title: `Book ${i}`, price: i, secret: `SECRET-${i}`, status: i % 2 ? 'open' : 'closed', author_id: `a${(i % 3) + 1}` });
    }
    const get = (p) => httpGet(base + p);
    return { base, get, server, dir };
}

const texts = (html, re) => [...html.matchAll(re)].map(m => m[1]);
const el = (html, id) => (html.match(new RegExp(`<[a-z]+ id="${id}"[^>]*>([\\s\\S]*?)</`)) || [])[1];
// Run the injected state scripts in jsdom and return window.__BRACIFY_DATA__
function embedded(html) {
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const data = dom.window.__BRACIFY_DATA__;
    assert.ok(data, 'state script present');
    return data;
}

test('#54 SSR: _total counts matches before _limit/_offset, next link works, and the page stays small', async () => {
    await withShop(async ({ get }) => {
        const p0 = await get('/list.html?_offset=0');
        assert.strictEqual(el(p0, 'c'), '3/1000', '_length is the page size, _total the unpaged count');
        assert.ok(p0.includes('id="next"'), 'next link shown while _total > offset + 20');
        assert.ok(!p0.includes('Book 4<'), 'only the limited rows are rendered');
        // The issue: the whole entity (and fields nobody shows) must not be embedded in the page
        assert.ok(!p0.includes('SECRET-500'), 'unrequested rows are not embedded');
        assert.ok(p0.length < 20000, `page must not carry all ${N} records (got ${p0.length} bytes)`);

        const plast = await get('/list.html?_offset=990');
        assert.strictEqual(el(plast, 'c'), '3/1000');
        assert.ok(!plast.includes('id="next"'), 'no next link once _total <= offset + 20');
    });
});

test('#54 SSR: _total honours filters and ignores _sort/_offset', async () => {
    await withShop(async ({ get }) => {
        assert.strictEqual(el(await get('/filtered.html'), 'c'), '3/500');
        const s = await get('/sorted.html');
        assert.strictEqual(el(s, 'c'), '2/1000');
        assert.deepStrictEqual(texts(s, /<i>(.*?)<\/i>/g), ['Book 999', 'Book 998'], 'sort/offset still apply to the rows');
    });
});

test('#54 PROPOSAL SSR: _limit=1 single object exposes _total like the array form', async () => {
    await withShop(async ({ get }) => {
        assert.strictEqual(el(await get('/single.html'), 's'), 'Book 2|1');
        assert.strictEqual(el(await get('/single-many.html'), 's'), 'Book 1|500', '_total is the count of all matches, not 1');
    });
});

test('#54 hydration: __BRACIFY_DATA__ carries _total and CSR shows it without refetching', async () => {
    await withShop(async ({ get }) => {
        const html = await get('/list.html?_offset=0');
        const data = embedded(html);
        assert.strictEqual(data.shelf._total, 1000, '__BRACIFY_DATA__.shelf must expose _total');
        assert.strictEqual(data.shelf.length, 3);
        const r = await csr(html, { url: 'http://localhost/list.html?_offset=0' });
        try {
            assert.strictEqual(r.document.querySelector('#c').textContent.trim(), '3/1000');
            assert.ok(r.document.querySelector('#next'), 'next link still rendered after hydration');
            assert.strictEqual(r.fetched.filter(f => f.includes('_sys/data')).length, 0, 'no data refetch');
        } finally { r.cleanup(); }
    });
});

test('#54 hydration with _offset>0: embedded rows are not sliced a second time', async () => {
    await withShop(async ({ get }) => {
        const html = await get('/list.html?_offset=40');
        const r = await csr(html, { url: 'http://localhost/list.html?_offset=40' });
        try {
            assert.deepStrictEqual([...r.document.querySelectorAll('b')].map(b => b.textContent), ['Book 41', 'Book 42', 'Book 43']);
            assert.strictEqual(r.document.querySelector('#c').textContent.trim(), '3/1000');
            assert.strictEqual(r.fetched.filter(f => f.includes('_sys/data')).length, 0, 'no data refetch');
        } finally { r.cleanup(); }
    });
});

test('#54 BRACIFY_MAX_LIMIT: -1 and non-numeric _limit are clamped too, empty _limit stays uncapped', async () => {
    const saved = process.env.BRACIFY_MAX_LIMIT;
    try {
        await withShop(async ({ get }) => {
            process.env.BRACIFY_MAX_LIMIT = '5';
            assert.strictEqual(el(await get('/max.html?_limit=-1'), 'c'), '5/1000', '-1 would be unlimited in SQLite');
            assert.strictEqual(el(await get('/max.html?_limit=abc'), 'c'), '5/1000');
            assert.strictEqual(el(await get('/max.html?_limit=0'), 'c'), '0/1000', '0 is a valid limit (returns nothing)');
            assert.strictEqual(el(await get('/max.html?_limit='), 'c'), '1000/1000', 'empty _limit is ignored (documented)');
        });
    } finally {
        if (saved === undefined) delete process.env.BRACIFY_MAX_LIMIT; else process.env.BRACIFY_MAX_LIMIT = saved;
    }
});

test('#54 SPA navigation: a source reusing its name on the next page does not show the previous page rows', async () => {
    const state = (rows, total) => '<script type="application/json" id="__bracify_state__">' +
        JSON.stringify({ sys: { query: {}, params: {} }, data: { _sys: { query: {}, params: {} }, s: rows }, totals: { s: total } }) + '</script>' +
        '<script>(function () { var s = JSON.parse(document.getElementById("__bracify_state__").textContent); window._sys = s.sys; window.__BRACIFY_SSR__ = true; var d = window.__BRACIFY_DATA__ = s.data; for (var k in s.totals) Object.defineProperty(d[k], "_total", { value: s.totals[k] }); })();</script>';
    const body = '<p id="c">{s._length}/{s._total}</p><ul><li data-t-list="s"><b>{s.title}</b></li></ul>';
    const link = (qs) => '<link data-t-source="s" href="_sys/data/books.json?' + qs + '">';
    const a = page(link('_limit=2') + state([{ id: 'a1', title: 'A1' }, { id: 'a2', title: 'A2' }], 9), body);
    const b = page(link('status=closed') + state([{ id: 'c1', title: 'Closed 1' }], 1), body);
    const r = await csr(a, { url: 'http://localhost/a.html', files: { 'b.html': b } });
    const savedHistory = global.history;
    global.history = r.window.history;
    try {
        assert.strictEqual(r.document.querySelector('#c').textContent.trim(), '2/9');
        await r.Bracify.navigate('/b.html');
        assert.strictEqual(r.document.querySelector('#c').textContent.trim(), '1/1');
        assert.deepStrictEqual([...r.document.querySelectorAll('b')].map(x => x.textContent), ['Closed 1']);
    } finally { global.history = savedHistory; r.cleanup(); }
});

test('#54 SQLite computes _total with COUNT instead of loading rows', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../server/db/drivers/sqlite.cjs'), 'utf8');
    assert.match(src, /COUNT\(\*\)/i, 'sqlite driver counts matches in SQL');
});

test('#54 local/CSR mode: _total from the unpaged local data (same value as SSR)', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: 'b' + i, title: 'Book ' + i, status: i % 2 ? 'open' : 'closed' }));
    const body = '<p id="c">{shelf._length}/{shelf._total}</p>' +
        '<a id="next" data-t-if="shelf._total:gt={_sys.query._offset + 20}" href="#">n</a>';
    const run = async (qs, query = '') => {
        const r = await csr(page(SRC(qs), body), { url: 'http://localhost/p.html' + query, files: { '_sys/data/books.json': rows } });
        const out = { c: r.document.querySelector('#c').textContent.trim(), next: !!r.document.querySelector('#next') };
        r.cleanup();
        return out;
    };
    assert.deepStrictEqual(await run('_limit=3&_offset={?_offset}', '?_offset=0'), { c: '3/50', next: true });
    assert.deepStrictEqual(await run('_limit=3&_offset={?_offset}', '?_offset=40'), { c: '3/50', next: false });
    assert.strictEqual((await run('status=open&_limit=3')).c, '3/25');
});

test('#54 PROPOSAL local mode: _limit=1 single object exposes _total', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: 'b' + i, title: 'Book ' + i }));
    const r = await csr(page(SRC('_limit=1'), '<p id="s">{shelf.title}|{shelf._total}</p>'),
        { url: 'http://localhost/p.html', files: { '_sys/data/books.json': rows } });
    try { assert.strictEqual(r.document.querySelector('#s').textContent.trim(), 'Book 0|10'); }
    finally { r.cleanup(); }
});

test('#54 _fields in SSR: limits embedded and displayed fields, id always kept, unknown ignored', async () => {
    await withShop(async ({ get }) => {
        const p = await get('/fields.html');
        assert.deepStrictEqual(texts(p, /<b>(.*?)<\/b>/g), ['b0001:Book 1::', 'b0002:Book 2::', 'b0003:Book 3::']);
        assert.ok(!p.includes('SECRET-'), 'unlisted fields are not embedded in the page');
        const d = embedded(p);
        assert.deepStrictEqual(Object.keys(d.shelf[0]).sort(), ['id', 'title']);
        // id is always included even when not listed
        assert.strictEqual(el(await get('/fields-single.html'), 's'), 'b0001|Book 1|');
    });
});

test('#54 _fields in local mode', async () => {
    const rows = [{ id: 'x', title: 'T', price: 5, secret: 's' }, { id: 'y', title: 'U', price: 6, secret: 't' }];
    const r = await csr(page(SRC('_fields=title,nope'), '<ul><li data-t-list="shelf"><b>{shelf.id}:{shelf.title}:{shelf.price}</b></li></ul>'),
        { url: 'http://localhost/p.html', files: { '_sys/data/books.json': rows } });
    try {
        assert.deepStrictEqual([...r.document.querySelectorAll('b')].map(b => b.textContent), ['x:T:', 'y:U:']);
    } finally { r.cleanup(); }
});

test('#54 DECISION _fields + relations: the relation key must be listed (no auto-include)', async () => {
    await withShop(async ({ get }) => {
        assert.deepStrictEqual(texts(await get('/rel.html'), /<b>(.*?)<\/b>/g), ['Book 1/Author 2', 'Book 2/Author 3']);
        assert.deepStrictEqual(texts(await get('/rel-missing.html'), /<b>(.*?)<\/b>/g), ['Book 1/', 'Book 2/'],
            'author_id was projected away, so the relation resolves to empty (documented)');
    });
});

test('#54 BRACIFY_MAX_LIMIT: default cap 1000 is not hit below it, set = _limit clamped, _total unaffected', async () => {
    const saved = process.env.BRACIFY_MAX_LIMIT;
    try {
        await withShop(async ({ get }) => {
            delete process.env.BRACIFY_MAX_LIMIT;
            assert.strictEqual(el(await get('/max.html?_limit=500'), 'c'), '500/1000', 'below the default cap');
            process.env.BRACIFY_MAX_LIMIT = '5';
            assert.strictEqual(el(await get('/max.html?_limit=500'), 'c'), '5/1000', 'clamped to the cap');
            assert.strictEqual(el(await get('/max.html?_limit=1000000000'), 'c'), '5/1000');
            assert.strictEqual(el(await get('/max.html?_limit=2'), 'c'), '2/1000', 'below the cap is untouched');
        });
    } finally {
        if (saved === undefined) delete process.env.BRACIFY_MAX_LIMIT; else process.env.BRACIFY_MAX_LIMIT = saved;
    }
});

test('#54 BRACIFY_MAX_LIMIT: on by default (1000), 0 disables it, invalid value falls back to the default', async () => {
    const saved = process.env.BRACIFY_MAX_LIMIT;
    try {
        await withShop(async ({ get }) => {
            for (let i = 1; i <= 1100; i++) await db.save('bulk', 'k' + i, { n: i });
            delete process.env.BRACIFY_MAX_LIMIT;
            assert.strictEqual(el(await get('/bulk.html?_limit=5000'), 'c'), '1000/1100', 'default cap');
            assert.strictEqual(el(await get('/bulk.html?_limit=-1'), 'c'), '1000/1100');
            assert.strictEqual(el(await get('/bulk.html'), 'c'), '1100/1100', 'a missing _limit stays unlimited');
            process.env.BRACIFY_MAX_LIMIT = 'abc';
            assert.strictEqual(el(await get('/bulk.html?_limit=5000'), 'c'), '1000/1100', 'invalid value = default');
            process.env.BRACIFY_MAX_LIMIT = '0';
            assert.strictEqual(el(await get('/bulk.html?_limit=5000'), 'c'), '1100/1100', '0 disables the cap');
            process.env.BRACIFY_MAX_LIMIT = '2000';
            assert.strictEqual(el(await get('/bulk.html?_limit=5000'), 'c'), '1100/1100', 'cap raised');
            process.env.BRACIFY_MAX_LIMIT = '5';
            assert.strictEqual(el(await get('/bulk.html?_limit=5000'), 'c'), '5/1100');
        });
    } finally {
        if (saved === undefined) delete process.env.BRACIFY_MAX_LIMIT; else process.env.BRACIFY_MAX_LIMIT = saved;
    }
});

test('#54 U+2028 / U+2029 in a record survive the state embed on initial load and SPA navigation', async () => {
    await withShop(async ({ get }) => {
        await db.save('bulk', 'ls1', { title: 'A B' });
        await db.save('bulk', 'ls2', { title: 'C D' });
        const p1 = await get('/ls1.html'), p2 = await get('/ls2.html');
        const stateJson = p1.match(/<script type="application\/json" id="__bracify_state__">(.*?)<\/script>/s)[1];
        assert.ok(!stateJson.includes(' ') && !stateJson.includes(' '), 'raw line separators are escaped in the state');
        const savedHistory = global.history;
        const r = await csr(p1, { url: 'http://localhost/ls1.html', files: { 'ls2.html': p2 } });
        global.history = r.window.history;
        try {
            assert.strictEqual(r.window.__BRACIFY_DATA__.r.title, 'A B');
            assert.strictEqual(r.window.__BRACIFY_DATA__.r._total, 1, '_total re-attached');
            assert.strictEqual(r.document.querySelector('#t').textContent, 'A B|1');
            await r.Bracify.navigate('/ls2.html');
            assert.strictEqual(r.document.querySelector('#t').textContent, 'C D|1', 'same source name, new page data');
            assert.strictEqual(r.fetched.filter(f => f.includes('_sys/data')).length, 0, 'no data refetch');
        } finally { global.history = savedHistory; r.cleanup(); }
    });
});
