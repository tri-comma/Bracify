/**
 * Issue #18 - Automatic data relation / lookup (`article.category.name` resolved via
 * `category_id` against the `categories` data source), identically in SSR and CSR,
 * plus end-to-end through the real Express server + SQLite.
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { render, cleanupAll, makeProject, removeDir } from './helpers.cjs';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

afterEach(cleanupAll);

const src = (n) => `<link data-t-source="${n}" href="_sys/data/${n}.json">`;
const heads = (...names) => names.map(src).join('');

const ARTICLES = [
    { id: 1, title: 'A1', category_id: 2 },
    { id: 2, title: 'A2', category_id: '3' },
    { id: 3, title: 'A3', category_id: 99 }
];
const CATEGORIES = [{ id: 2, name: 'Tech' }, { id: 3, name: 'Life' }];

for (const mode of ['ssr', 'csr']) {
    describe(`data relation (${mode})`, () => {
        const page = (body, sources) => render(mode, body, { head: heads(...Object.keys(sources)), sources });
        const $ = (doc, sel) => doc.querySelector(sel);

        test('basic lookup of a single object via foreign key', async () => {
            const doc = await page('<p id="p">{article.category.name}</p>', {
                article: { id: 1, category_id: 2 }, categories: CATEGORIES
            });
            assert.strictEqual($(doc, '#p').textContent, 'Tech');
        });

        test('inside data-t-list, ids compared as strings, missing record renders like any missing value', async () => {
            const doc = await page('<ul id="l"><li data-t-list="articles">{articles.title}:{articles.category.name}</li></ul>',
                { articles: ARTICLES, categories: CATEGORIES });
            assert.deepStrictEqual([...doc.querySelectorAll('#l li')].map(l => l.textContent), ['A1:Tech', 'A2:Life', 'A3:']);
        });

        test('data-t-if on a related field', async () => {
            const doc = await page('<ul id="l"><li data-t-list="articles"><b data-t-if="articles.category.name=Tech">{articles.title}</b></li></ul>',
                { articles: ARTICLES, categories: CATEGORIES });
            assert.deepStrictEqual([...doc.querySelectorAll('#l b')].map(l => l.textContent), ['A1']);
        });

        test('attribute binding with related id', async () => {
            const doc = await page('<a id="a" href="/cat.html?id={article.category.id}">x</a>',
                { article: { id: 1, category_id: 2 }, categories: CATEGORIES });
            assert.strictEqual($(doc, '#a').getAttribute('href'), '/cat.html?id=2');
        });

        test('data-t-scope on a related object', async () => {
            const doc = await page('<div data-t-scope="article.category"><span id="s">{name}</span></div>',
                { article: { id: 1, category_id: 2 }, categories: CATEGORIES });
            assert.strictEqual($(doc, '#s').textContent, 'Tech');
        });

        test('a real property always wins over lookup', async () => {
            const doc = await page('<p id="p">{article.category}</p>',
                { article: { id: 1, category: 'Inline', category_id: 2 }, categories: CATEGORIES });
            assert.strictEqual($(doc, '#p').textContent, 'Inline');
        });

        test('camelCase XId foreign key', async () => {
            const doc = await page('<p id="p">{article.category.name}</p>',
                { article: { id: 1, categoryId: 3 }, categories: CATEGORIES });
            assert.strictEqual($(doc, '#p').textContent, 'Life');
        });

        test('plural variants: category->categories, box->boxes, user->users, exact name', async () => {
            const doc = await page('<p id="p">{i.category.name}|{i.box.label}|{i.user.name}|{i.staff.n}</p>', {
                i: { id: 1, category_id: 1, box_id: 1, user_id: 1, staff_id: 1 },
                categories: [{ id: 1, name: 'C' }], boxes: [{ id: 1, label: 'B' }],
                users: [{ id: 1, name: 'U' }], staff: [{ id: 1, n: 'S' }]
            });
            assert.strictEqual($(doc, '#p').textContent, 'C|B|U|S');
        });

        test('single-object source is matched by its id', async () => {
            const doc = await page('<p id="p">{article.category.name}|{b.category.name}</p>', {
                article: { id: 1, category_id: 5 }, b: { id: 1, category_id: 6 }, categories: { id: 5, name: 'Solo' }
            });
            assert.strictEqual($(doc, '#p').textContent, 'Solo|');
        });

        test('looked-up values are HTML-escaped', async () => {
            const doc = await page('<p id="p">{article.category.name}</p>', {
                article: { id: 1, category_id: 2 }, categories: [{ id: 2, name: '<b id="pwn">x</b>' }]
            });
            assert.strictEqual($(doc, '#pwn'), null);
            assert.strictEqual($(doc, '#p').textContent, '<b id="pwn">x</b>');
        });

        test('chained lookup (article -> category -> section)', async () => {
            const doc = await page('<p id="p">{article.category.section.title}</p>', {
                article: { id: 1, category_id: 2 },
                categories: [{ id: 2, name: 'Tech', section_id: 7 }], sections: [{ id: 7, title: 'Top' }]
            });
            assert.strictEqual($(doc, '#p').textContent, 'Top');
        });

        test('scoped form auto-binding does not follow relations; foreign key is still filled', async () => {
            const doc = await page(
                '<form data-t-scope="article"><input id="a" name="category.name"><input id="b" name="category"><input id="c" name="category_id"></form>',
                { article: { id: 1, category_id: 2 }, categories: CATEGORIES });
            assert.strictEqual($(doc, '#a').value, '');
            assert.strictEqual($(doc, '#b').value, '');
            assert.strictEqual($(doc, '#c').value, '2');
        });

        test('duplicate ids resolve to the first record; whole record usable in data-t-if', async () => {
            const doc = await page('<p id="p">{article.category.name}</p><i id="i" data-t-if="article.category">yes</i>', {
                article: { id: 1, category_id: 2 }, categories: [{ id: 2, name: 'First' }, { id: '2', name: 'Second' }]
            });
            assert.strictEqual($(doc, '#p').textContent, 'First');
            assert.ok($(doc, '#i'));
        });

        test('self-referential data terminates (finite path, no infinite loop)', async () => {
            const doc = await page('<p id="p">{a.category.category.category.name}</p>', {
                a: { id: 1, category_id: 1 }, categories: [{ id: 1, name: 'Loop', category_id: 1 }]
            });
            assert.strictEqual($(doc, '#p').textContent, 'Loop');
        });

        test('no matching source leaves the value undefined', async () => {
            const doc = await page('<p id="p">[{article.category.name}]</p>', { article: { id: 1, category_id: 2 } });
            assert.ok(!$(doc, '#p').textContent.includes('Tech'));
        });
    });
}

describe('data relation (SSR via real server + SQLite)', () => {
    let server, port, dir;
    before(async () => {
        dir = makeProject({
            'list.html': `<!DOCTYPE html><html><head>${heads('articles', 'categories')}</head><body>
<ul id="l"><li data-t-list="articles"><a href="/cat.html?id={articles.category.id}">{articles.title}</a> {articles.category.name}</li></ul></body></html>`
        });
        server = new EngineServer(0, () => { }, { sqlite3 });
        await server.setCurrentProjectPath(dir);
        port = await server.start();
        await db.save('categories', '2', { id: 2, name: 'Tech' });
        await db.save('categories', '3', { id: 3, name: 'Life' });
        await db.save('articles', '1', { id: 1, title: 'First', category_id: 2 });
        await db.save('articles', '2', { id: 2, title: 'Second', category_id: 3 });
    });
    after(async () => { await server.stop(); await removeDir(dir); });

    test('categories are joined into the rendered articles list', async () => {
        const res = await fetch(`http://localhost:${port}/list.html`);
        const doc = new JSDOM(await res.text()).window.document;
        const items = [...doc.querySelectorAll('#l li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()).sort();
        assert.deepStrictEqual(items, ['First Tech', 'Second Life']);
        const hrefs = [...doc.querySelectorAll('#l a')].map(a => a.getAttribute('href')).sort();
        assert.deepStrictEqual(hrefs, ['/cat.html?id=2', '/cat.html?id=3']);
    });
});
