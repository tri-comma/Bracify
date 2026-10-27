/**
 * Issue #38 - A filter on the `id` key whose value is empty or an unresolved placeholder
 * must return NO records (not "all records", which `_limit=1` then collapses to the first one).
 * Other keys keep the documented rule: an empty filter value is ignored (all records).
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
    { id: 3, title: 'Cairn', category_id: 10 }
];
const ALL_TITLES = BOOKS.map(b => b.title);

const SOURCES = {
    one: 'books.json?id={?id}&_limit=1',
    list: 'books.json?id={?id}',
    cat: 'books.json?category_id={?category_id}',
    // `x` is never defined: the placeholder stays unresolved
    unresolved: 'books.json?id={x.id}&_limit=1',
    unresolvedList: 'books.json?id={x.id}'
};
const BODY_ONE = '<p id="one">[{one.title}]</p>';
const BODY_LIST = '<ul id="l"><li data-t-list="s">{s.title}</li></ul>';

const link = (name, href) => `<link data-t-source="${name}" href="_sys/data/${href}">`;
const html = (head, body) => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

// ---- unified runner: returns { one, items } text from either mode --------------------------
let server, port, dir;
before(async () => {
    dir = makeProject({
        'one.html': html(link('one', SOURCES.one), BODY_ONE),
        'unresolved.html': html(link('one', SOURCES.unresolved), BODY_ONE),
        'list.html': html(link('s', SOURCES.list), BODY_LIST),
        'cat.html': html(link('s', SOURCES.cat), BODY_LIST),
        'unresolvedlist.html': html(link('s', SOURCES.unresolvedList), BODY_LIST)
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

async function ssrPage(file, query = '') {
    const res = await fetch(`http://localhost:${port}/${file}${query}`);
    return new JSDOM(await res.text()).window.document;
}
async function csrPage(head, body, query = {}) {
    return render('csr', body, { head, sources: { books: BOOKS }, query });
}
const one = (doc) => doc.querySelector('#one').textContent;
const items = (doc) => [...doc.querySelectorAll('#l li')].map(li => li.textContent);
const noRecordLeaked = (text) => ALL_TITLES.forEach(t => assert.ok(!text.includes(t), `no book may be returned, got "${text}"`));

describe('SSR: empty / unresolved id filter returns no records (#38)', () => {
    test('[Red] single source, ?id= (empty) -> not found', async () => noRecordLeaked(one(await ssrPage('one.html', '?id='))));
    test('[Red] single source, no id param -> not found', async () => noRecordLeaked(one(await ssrPage('one.html'))));
    test('[Green] single source, ?id=2 -> book 2', async () => assert.ok(one(await ssrPage('one.html', '?id=2')).includes('Beacon')));
    test('[Red] list source id={?id}, no id -> 0 items', async () => assert.deepStrictEqual(items(await ssrPage('list.html')), []));
    test('[Red] list source id={?id}, ?id= -> 0 items', async () => assert.deepStrictEqual(items(await ssrPage('list.html', '?id=')), []));
    test('[Green] other key (category_id) empty -> all records (ignored filter)', async () =>
        assert.deepStrictEqual(items(await ssrPage('cat.html', '?category_id=')).sort(), ALL_TITLES));
    test('[Green] other key (category_id) set -> filtered', async () =>
        assert.deepStrictEqual(items(await ssrPage('cat.html', '?category_id=10')).sort(), ['Atlas', 'Cairn']));
    test('[Red] unresolved {x.id} (x missing), _limit=1 -> not found', async () => noRecordLeaked(one(await ssrPage('unresolved.html'))));
    test('[Red] unresolved {x.id} (x missing), list -> 0 items', async () => assert.deepStrictEqual(items(await ssrPage('unresolvedlist.html')), []));
});

describe('CSR: empty / unresolved id filter returns no records (#38)', () => {
    test('[Red] single source, ?id= (empty) -> not found', async () =>
        noRecordLeaked(one(await csrPage(link('one', SOURCES.one), BODY_ONE, { id: '' }))));
    test('[Red] single source, no id param -> not found', async () =>
        noRecordLeaked(one(await csrPage(link('one', SOURCES.one), BODY_ONE))));
    test('[Green] single source, ?id=2 -> book 2', async () =>
        assert.ok(one(await csrPage(link('one', SOURCES.one), BODY_ONE, { id: '2' })).includes('Beacon')));
    test('[Red] list source id={?id}, no id -> 0 items', async () =>
        assert.deepStrictEqual(items(await csrPage(link('s', SOURCES.list), BODY_LIST)), []));
    test('[Red] list source id={?id}, ?id= -> 0 items', async () =>
        assert.deepStrictEqual(items(await csrPage(link('s', SOURCES.list), BODY_LIST, { id: '' })), []));
    test('[Green] other key (category_id) empty -> all records (ignored filter)', async () =>
        assert.deepStrictEqual(items(await csrPage(link('s', SOURCES.cat), BODY_LIST, { category_id: '' })).sort(), ALL_TITLES));
    test('[Green] other key (category_id) set -> filtered', async () =>
        assert.deepStrictEqual(items(await csrPage(link('s', SOURCES.cat), BODY_LIST, { category_id: '10' })).sort(), ['Atlas', 'Cairn']));
    test('[Red] unresolved {x.id} (x missing), _limit=1 -> not found', async () =>
        noRecordLeaked(one(await csrPage(link('one', SOURCES.unresolved), BODY_ONE))));
    test('[Red] unresolved {x.id} (x missing), list -> 0 items', async () =>
        assert.deepStrictEqual(items(await csrPage(link('s', SOURCES.unresolvedList), BODY_LIST)), []));
});
