/**
 * Issue #47 - SSR/CSR parity for URL parameters.
 *  (1) A repeated query param (`?tag=a&tag=b`) resolves to its LAST value everywhere `_sys.query` is built
 *      (SSR used to expose Express's array, which source filters treat as unresolved -> all records).
 *  (2) A scope-less named form control is auto-filled from `_sys.query` in CSR exactly like in SSR.
 * Covered in SSR (real Express server + SQLite) and CSR (jsdom + local JSON filtering).
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { makeProject, removeDir, csr, cleanupAll } from './helpers.cjs';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); cleanupAll(); });

const BOOKS = [
    { id: 1, title: 'Atlas', category_id: 10 },
    { id: 2, title: 'Beacon', category_id: 20 },
    { id: 3, title: 'Cairn', category_id: 10 }
];
const ALL = BOOKS.map(b => b.title);

const SOURCE = '<link data-t-source="s" href="_sys/data/books.json?category_id={?category_id}">';
const LIST = '<ul id="l"><li data-t-list="s">{s.title}</li></ul>';
const PAGES = {
    list: [SOURCE, LIST],
    tag: ['', '<p id="t">[{?tag}]</p>'],
    cond: ['', '<p id="a" data-t-if="_sys.query.tag=a">A</p><p id="b" data-t-if="_sys.query.tag=b">B</p>'],
    inputs: ['', `<form>
        <input id="txt" name="q" value="">
        <input id="pre" name="p" value="keep">
        <textarea id="ta" name="memo"></textarea>
        <select id="sel" name="sort"><option value="a">a</option><option value="b">b</option></select>
        <input id="chk" type="checkbox" name="flag" value="1">
        <input id="r1" type="radio" name="color" value="red"><input id="r2" type="radio" name="color" value="blue">
    </form>`],
    scoped: ['', '<form data-t-scope="x"><input id="in" name="q" value=""></form>'],
    outside: ['', '<form data-t-scope="x"><input id="in" name="q"></form><input id="out" name="q" value="">']
};
const html = (head, body) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

let server, port, dir;
before(async () => {
    dir = makeProject(Object.fromEntries(Object.entries(PAGES).map(([k, [h, b]]) => [k + '.html', html(h, b)])));
    server = new EngineServer(0, () => { }, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    port = await server.start();
    for (const b of BOOKS) await db.save('books', String(b.id), b);
});
after(async () => {
    await server.stop();
    await removeDir(dir);
});

// Unified runners: `qs` is a raw query string such as 'tag=a&tag=b' (repeated keys allowed).
async function ssrPage(page, qs = '') {
    const res = await fetch(`http://localhost:${port}/${page}.html${qs ? '?' + qs : ''}`);
    return new JSDOM(await res.text()).window.document;
}
async function csrPage(page, qs = '') {
    const [h, b] = PAGES[page];
    const r = await csr(html(h, b), {
        url: 'http://localhost/' + page + '.html' + (qs ? '?' + qs : ''),
        files: { '_sys/data/books.json': BOOKS }
    });
    cleanups.push(r.cleanup);
    return r.document;
}

const items = (d) => [...d.querySelectorAll('#l li')].map(li => li.textContent).sort();
const val = (d, id) => d.getElementById(id).value;
const missing = (d, id) => d.getElementById(id) === null;

for (const [mode, run] of [['SSR', ssrPage], ['CSR', csrPage]]) {
    describe(`${mode}: repeated query param resolves to the last value (#47)`, () => {
        test('[Green] single value filters (reference)', async () =>
            assert.deepStrictEqual(items(await run('list', 'category_id=10')), ['Atlas', 'Cairn']));
        test('[Red in SSR] ?category_id=10&category_id=20 filters by the last value (20)', async () =>
            assert.deepStrictEqual(items(await run('list', 'category_id=10&category_id=20')), ['Beacon']));
        test('[Red in SSR] ?category_id=20&category_id=10 filters by the last value (10)', async () =>
            assert.deepStrictEqual(items(await run('list', 'category_id=20&category_id=10')), ['Atlas', 'Cairn']));
        test('[Green] empty value -> filter ignored, all records (README empty rule)', async () =>
            assert.deepStrictEqual(items(await run('list', 'category_id=')), ALL));
        test('[Red in SSR] {?tag} with ?tag=a&tag=b renders the last value', async () =>
            assert.strictEqual((await run('tag', 'tag=a&tag=b')).getElementById('t').textContent, '[b]'));
        test('[Green] {?tag} with a single value', async () =>
            assert.strictEqual((await run('tag', 'tag=a')).getElementById('t').textContent, '[a]'));
        test('[Red in SSR] data-t-if sees a single string for a repeated param (?tag=a&tag=b -> B only)', async () => {
            const d = await run('cond', 'tag=a&tag=b');
            assert.ok(missing(d, 'a'), 'tag==a must not match');
            assert.ok(!missing(d, 'b'), 'tag==b must match the last value');
        });
    });

    describe(`${mode}: scope-less named controls are filled from _sys.query (#47)`, () => {
        test('[Red in CSR] text input gets ?q=hello', async () =>
            assert.strictEqual(val(await run('inputs', 'q=hello'), 'txt'), 'hello'));
        test('[Red in CSR] input value attribute is set too', async () =>
            assert.strictEqual((await run('inputs', 'q=hello')).getElementById('txt').getAttribute('value'), 'hello'));
        test('[Red in CSR] textarea gets the value', async () =>
            assert.strictEqual(val(await run('inputs', 'memo=note'), 'ta'), 'note'));
        test('[Red in CSR] select gets the value', async () =>
            assert.strictEqual(val(await run('inputs', 'sort=b'), 'sel'), 'b'));
        test('[Red in CSR] checkbox is checked for a truthy value', async () =>
            assert.strictEqual((await run('inputs', 'flag=true')).getElementById('chk').checked, true));
        test('[Red in CSR] radio with the matching value is checked, the other is not', async () => {
            const d = await run('inputs', 'color=blue');
            assert.strictEqual(d.getElementById('r2').checked, true);
            assert.strictEqual(d.getElementById('r1').checked, false);
        });
        test('[Red in CSR] an existing value attribute IS overwritten when the param is present (SSR rule: not "only when empty")', async () =>
            assert.strictEqual(val(await run('inputs', 'p=new'), 'pre'), 'new'));
        test('[Green] an existing value attribute is kept when the param is absent', async () =>
            assert.strictEqual(val(await run('inputs', 'q=hello'), 'pre'), 'keep'));
        test('[Green] no matching param -> input stays empty', async () =>
            assert.strictEqual(val(await run('inputs'), 'txt'), ''));
        test('[Red] repeated param fills the last value (?q=a&q=b -> b)', async () =>
            assert.strictEqual(val(await run('inputs', 'q=a&q=b'), 'txt'), 'b'));
        test('[Green] input inside a data-t-scope form is filled from _sys.query (guard)', async () =>
            assert.strictEqual(val(await run('scoped', 'q=hello'), 'in'), 'hello'));
        test('[Red in CSR] scoped and scope-less inputs with the same name both get the value', async () => {
            const d = await run('outside', 'q=hello');
            assert.strictEqual(val(d, 'in'), 'hello');
            assert.strictEqual(val(d, 'out'), 'hello');
        });
    });
}

describe('CSR: SPA navigation builds _sys.query with the same rule (#47)', () => {
    test('[Green] Bracify.navigate to ?tag=a&tag=b leaves the last value in _sys.query.tag', async () => {
        const [h, b] = PAGES.tag;
        const page = html(h, b);
        const r = await csr(page, { url: 'http://localhost/tag.html', files: { 'tag.html': page } });
        cleanups.push(r.cleanup);
        // helpers.cjs does not expose these globals; navigate() needs them
        global.history = r.window.history;
        global.FormData = r.window.FormData;
        cleanups.push(() => { delete global.history; delete global.FormData; });
        r.window.scrollTo = () => { };
        await r.window.Bracify.navigate('tag.html?tag=a&tag=b');
        assert.strictEqual(r.window._sys.query.tag, 'b');
    });
});
