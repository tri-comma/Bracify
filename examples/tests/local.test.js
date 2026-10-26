/**
 * Local execution environment (README "ローカル開発モード / True Zero Server Mode"):
 * the real engine.cjs runs in jsdom on a file:// URL, reading includes and _sys/data/*.json
 * through a File System Access API directory handle backed by a real folder on disk.
 * The very same app files are also served by the real server, so rendered output can be compared.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const h = require('./helpers.cjs');
const { bootLocal, until, wait } = require('./local-helpers.cjs');

let appDir;
let server;
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const texts = (doc, sel) => Array.from(doc.querySelectorAll(sel)).map(text);
const titles = (doc) => texts(doc, 'tbody tr td:nth-child(2) a');

/** Everything a user can see or submit in <main>: text, form control state and link targets. */
function snapshot(doc) {
    const main = doc.querySelector('main');
    return {
        // The server leaves \{escaped\} placeholders for the client engine to unescape, so compare the unescaped text.
        text: text(main).replace(/\\\{/g, '{').replace(/\\\}/g, '}'),
        fields: Array.from(main.querySelectorAll('input, select, textarea')).map(f => [f.name, f.type, (f.type === 'checkbox' || f.type === 'radio') ? f.checked : f.value]),
        links: Array.from(main.querySelectorAll('a[href]')).map(a => a.getAttribute('href')),
        actions: Array.from(main.querySelectorAll('form')).map(f => f.getAttribute('action'))
    };
}

/** Render a page through the real server (SSR) for comparison. */
async function serverDoc(pageWithQuery) {
    const res = await fetch(server.base + '/' + pageWithQuery);
    assert.strictEqual(res.status, 200, pageWithQuery);
    return new JSDOM(await res.text()).window.document;
}

/** Render a page through the engine in file:// mode. Always cleaned up. */
async function localDoc(pageWithQuery, fn) {
    const [page, query] = pageWithQuery.split('?');
    const b = bootLocal({ root: appDir, page, query });
    try {
        await b.ready();
        return await fn(b);
    } finally {
        b.cleanup();
    }
}

describe('Bracify Books: local mode (file:// + File System Access API)', () => {
    before(async () => {
        appDir = h.makeAppCopy();
        server = await h.startServer(appDir); // same files, served by the real server
    });
    after(async () => {
        await server.stop();
        await h.removeDir(appDir);
    });

    describe('folder connection', () => {
        test('restores the stored folder handle, renders, and shows the Disconnect Folder button', async () => {
            await localDoc('index.html', async (b) => {
                assert.strictEqual(b.Bracify.rootHandle.name, b.rootHandle.name);
                assert.strictEqual(text(b.doc.querySelector('h1')), 'Dashboard');
                const btn = b.doc.getElementById('bracify-disconnect-btn');
                assert.ok(btn, 'Disconnect Folder button');
                assert.strictEqual(btn.textContent, 'Disconnect Folder');
                assert.strictEqual(b.doc.getElementById('bracify-init-overlay'), null);
            });
        });

        test('Disconnect Folder discards the handle and shows the folder picker again', async () => {
            await localDoc('index.html', async (b) => {
                b.doc.getElementById('bracify-disconnect-btn').click();
                await until(() => b.doc.getElementById('bracify-init-overlay'), 2000, 'overlay');
                assert.strictEqual(b.idb.stores.handles.has('root'), false);
                assert.strictEqual(b.Bracify.rootHandle, null);
                assert.ok(b.doc.getElementById('bracify-btn-choose'));
            });
        });

        test('?bracify_reset=1 forgets the stored folder; resetRootAccess() is available', async () => {
            const b = bootLocal({ root: appDir, page: 'index.html', query: 'bracify_reset=1' });
            try {
                await until(() => b.doc.getElementById('bracify-init-overlay'), 3000, 'overlay');
                assert.strictEqual(b.idb.stores.handles.has('root'), false);
                assert.ok(!b.win.location.search.includes('bracify_reset'));
                assert.strictEqual(typeof b.Bracify.resetRootAccess, 'function');
            } finally { b.cleanup(); }
        });

        test('choosing the folder from the overlay renders the page', async () => {
            const b = bootLocal({ root: appDir, page: 'index.html', connected: false });
            try {
                await until(() => b.doc.getElementById('bracify-btn-choose'), 3000, 'overlay');
                b.doc.getElementById('bracify-btn-choose').click();
                await b.ready();
                assert.strictEqual(texts(b.doc, '.stat b')[0], '8');
                assert.ok(b.idb.stores.handles.has('root'), 'handle persisted for the next visit');
            } finally { b.cleanup(); }
        });
    });

    describe('rendering (includes, data sources, filters, sort, pagination)', () => {
        test('dashboard: layout + header/footer includes, _length counts, relations, pipes, conditions', async () => {
            await localDoc('index.html', async ({ doc }) => {
                assert.strictEqual(text(doc.querySelector('a.brand')), 'Bracify Books');
                assert.match(text(doc.querySelector('footer')), /© 2026 Bracify Examples/);
                assert.deepStrictEqual(texts(doc, '.stat b'), ['8', '4', '8', '20']);
                assert.strictEqual(doc.querySelectorAll('.cards li').length, 3);
                assert.match(texts(doc, '.cards li')[0], /No\. 1 Small Software by Ken Tanaka · Technology \$1,800\.00 2024\/04\/18/);
                assert.ok(texts(doc, '.notice').some(t => /Big library/.test(t)));
                assert.ok(!texts(doc, '.notice').some(t => /empty|Welcome/.test(t)));
                assert.match(texts(doc, 'section:nth-of-type(3) li')[0], /Low stock/);
            });
        });

        test('books list: _limit/_offset paging, exact-match filters, _sort/_order', async () => {
            await localDoc('books.html', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc), ["The Lighthouse Keeper's Atlas", 'Kitchen Physics', 'Salt Roads']);
                assert.match(text(doc.querySelector('p.muted')), /Showing 3 of 8 book\(s\)/);
                assert.deepStrictEqual(texts(doc, '.pager a'), ['Next →']);
            });
            await localDoc('books.html?_offset=6', async ({ doc }) => {
                assert.strictEqual(titles(doc).length, 2);
                assert.deepStrictEqual(texts(doc, '.pager a'), ['← Previous']);
            });
            await localDoc('books.html?category=1', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc).sort(), ["The Lighthouse Keeper's Atlas", 'Tides and Letters']);
            });
            await localDoc('books.html?status=draft&q=&category=', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc), ['Unfinished Manuscript']); // empty values ignored
            });
            await localDoc('books.html?q=Salt%20Roads', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc), ['Salt Roads']);
            });
            await localDoc('books.html?sort=year&order=desc', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc), ['Unfinished Manuscript', 'Small Software', 'Plain HTML']);
            });
            await localDoc('books.html?category=4&status=published&sort=year&order=asc', async ({ doc }) => {
                assert.deepStrictEqual(titles(doc), ['Plain HTML', 'Small Software']);
            });
            await localDoc('books.html?q=Nope', async ({ doc }) => {
                assert.ok(texts(doc, '.notice').some(t => /No books match/.test(t)));
            });
        });

        test('search form is filled from the URL; radios/selects reflect the query', async () => {
            await localDoc('books.html?q=Salt%20Roads&category=3&status=published&sort=year&order=desc', async ({ doc }) => {
                const f = doc.querySelector('form.filters');
                assert.strictEqual(f.querySelector('[name=q]').value, 'Salt Roads');
                assert.strictEqual(f.querySelector('[name=category][value="3"]').checked, true);
                assert.strictEqual(f.querySelector('[name=status]').value, 'published');
                assert.strictEqual(f.querySelector('[name=sort]').value, 'year');
                assert.strictEqual(f.querySelector('[name=order][value=desc]').checked, true);
            });
        });

        test('detail / edit / author pages: single record (_limit=1), relations, nested data, auto-bound forms', async () => {
            await localDoc('book.html?id=1', async ({ doc }) => {
                assert.strictEqual(text(doc.querySelector('article h2')), "The Lighthouse Keeper's Atlas");
                assert.match(text(doc.querySelector('article > p:nth-of-type(2)')), /by Hana Mori in Fiction Featured/);
                assert.deepStrictEqual(texts(doc, '.tag'), ['novel', 'sea', 'memory']);
                assert.strictEqual(text(doc.querySelector('h3')), 'Reviews (2)');
                assert.match(texts(doc, '.reviews li')[0], /^Bob 4\/5 Recommended Regular reader/);
            });
            await localDoc('book-edit.html?id=1', async ({ doc }) => {
                const form = doc.querySelector('form[method=POST]');
                assert.strictEqual(form.querySelector('[name=title]').value, "The Lighthouse Keeper's Atlas");
                assert.strictEqual(form.querySelector('[name=author_id]:checked').value, '1');
                assert.strictEqual(form.querySelector('[name=featured]').checked, true);
                assert.strictEqual(form.querySelector('[name="meta.isbn"]').value, '978-0-00-000001-1');
                assert.strictEqual(form.querySelector('[name="tags.2"]').value, 'memory');
            });
            await localDoc('author.html?id=4', async ({ doc }) => {
                assert.strictEqual(text(doc.querySelector('article h2')), 'Ken Tanaka');
                assert.deepStrictEqual(texts(doc, 'article li'), ['Small Software (2024, Technology)', 'Plain HTML (2023, Technology)']);
            });
            await localDoc('authors.html?country=jp', async ({ doc }) => {
                assert.deepStrictEqual(texts(doc, '.card h2 a'), ['Hana Mori', 'Ken Tanaka']);
                assert.deepStrictEqual(texts(doc.querySelectorAll('.card')[0], 'ul li'), ['Website', 'Interview']);
            });
        });

        test('playground: pipes, arithmetic, operators in data-t-if, relations, event-handler data pattern', async () => {
            await localDoc('pipes.html?x=5&_offset=20', async ({ doc }) => {
                const t = (id) => text(doc.getElementById(id));
                assert.strictEqual(t('p-date'), '2019/05/14');
                assert.strictEqual(t('p-currency-usd'), '$1,500.00');
                assert.strictEqual(t('p-chain'), 'A RETIRED...');
                assert.strictEqual(t('p-default'), 'no isbn');
                assert.strictEqual(t('a-paren'), '(1500 + 100) x 3 = 4800');
                assert.strictEqual(t('a-page'), 'next offset: 30');
                for (const id of ['c-exists', 'c-neg', 'c-eq', 'c-ne', 'c-gt', 'c-gte', 'c-lt', 'c-lte', 'c-and', 'c-or', 'c-var']) assert.ok(doc.getElementById(id), id);
                assert.strictEqual(doc.getElementById('c-never'), null);
                assert.strictEqual(t('r-author'), 'Hana Mori (JP) wrote this Fiction book.');
                assert.strictEqual(t('s-query'), '?x = 5 / 5');
                assert.strictEqual(doc.getElementById('e-button').getAttribute('data-id'), '1');
                assert.strictEqual(doc.getElementById('e-button').getAttribute('onclick'), "alert('Book id: ' + this.dataset.id)");
            });
        });

        test('about: snippet include, escaping is unescaped by the engine', async () => {
            await localDoc('about.html', async ({ doc }) => {
                assert.match(text(doc.querySelector('section.card')), /small library and reading-log app/);
                assert.ok(text(doc.querySelector('main')).includes('{book.title}'), '\\{book.title\\} -> {book.title}');
                assert.ok(!doc.querySelector('main').innerHTML.includes('\\{'));
            });
        });
    });

    describe('parity with the server renderer (same files, same data)', () => {
        const pages = [
            'index.html', 'index.html?welcome=1', 'books.html', 'books.html?_offset=3', 'books.html?_offset=6',
            'books.html?category=1', 'books.html?status=draft', 'books.html?author=2', 'books.html?q=Salt%20Roads', 'books.html?q=Nope',
            'books.html?sort=year&order=desc', 'books.html?category=4&status=published&sort=year&order=asc&_offset=1',
            'books.html?q=Salt%20Roads&category=3&status=published&sort=year&order=desc',
            'book.html?id=1', 'book.html?id=2', 'book.html?id=8', 'book.html?id=999', 'book.html',
            'book-new.html', 'book-edit.html?id=1', 'book-edit.html?id=8',
            'authors.html', 'authors.html?country=es', 'author.html?id=1', 'author.html?id=3', 'author-new.html', 'author-edit.html?id=2',
            'about.html?from=test', 'pipes.html', 'pipes.html?x=5&_offset=20'
        ];
        for (const p of pages) {
            test(p, async () => {
                const expected = snapshot(await serverDoc(p));
                const actual = await localDoc(p, async ({ doc }) => snapshot(doc));
                assert.deepStrictEqual(actual.text, expected.text);
                assert.deepStrictEqual(actual.fields, expected.fields);
                assert.deepStrictEqual(actual.links, expected.links);
                assert.deepStrictEqual(actual.actions, expected.actions);
            });
        }
    });

    describe('SPA navigation (no page reload, folder access preserved)', () => {
        test('header links, pager, row links and back/forward all stay in the SPA', async () => {
            const b = bootLocal({ root: appDir, page: 'index.html' });
            try {
                await b.ready();
                b.win.spaMarker = 'same window'; // README: window globals survive SPA transitions
                const startHandle = b.Bracify.rootHandle;

                await b.click("header a[href='books.html']");
                assert.strictEqual(text(b.doc.querySelector('h1')), 'Books');
                assert.strictEqual(b.doc.title, 'Books | Bracify Books');
                assert.deepStrictEqual(titles(b.doc), ["The Lighthouse Keeper's Atlas", 'Kitchen Physics', 'Salt Roads']);
                assert.ok(b.win.location.href.endsWith('/books.html'));

                await b.click('.pager a');
                assert.strictEqual(b.win._sys.query._offset, '3');
                assert.strictEqual(titles(b.doc).length, 3);
                assert.match(text(b.doc.querySelector('p.muted')), /from #4/);
                assert.deepStrictEqual(texts(b.doc, '.pager a'), ['← Previous', 'Next →']);

                await b.click('tbody tr a'); // first title -> detail
                assert.strictEqual(b.win._sys.query.id !== undefined, true);
                assert.strictEqual(text(b.doc.querySelector('article h2')).length > 0, true);

                await b.click("a[href^='book-edit.html']");
                assert.ok(b.doc.querySelector('form[method=POST] [name=title]').value.length > 0, 'edit form populated after SPA navigation');

                // the document (and the connected folder) survived every transition: no reload happened
                assert.strictEqual(b.win.spaMarker, 'same window', 'no full page reload happened');
                assert.strictEqual(b.Bracify.rootHandle, startHandle);
                assert.ok(b.doc.getElementById('bracify-disconnect-btn'));

                // history: go back through pushState entries
                const popped = new Promise(r => b.win.addEventListener('popstate', r, { once: true }));
                b.win.history.back();
                await popped;
                await until(() => b.doc.querySelector('article h2') && b.doc.getElementById('bracify-disconnect-btn'), 4000, 'detail page after history.back()');
                assert.ok(!b.doc.querySelector('[name=title]'), 'the edit form is gone');
                assert.ok(b.win.location.href.includes('book.html?id='), b.win.location.href);
            } finally { b.cleanup(); }
        });

        test('GET search form is intercepted: submitting navigates with the query string', async () => {
            const b = bootLocal({ root: appDir, page: 'books.html' });
            try {
                await b.ready();
                const form = b.doc.querySelector('form.filters');
                form.querySelector('[name=category][value="4"]').checked = true;
                form.querySelector('[name=sort]').value = 'year';
                form.querySelector('[name=order][value=desc]').checked = true;
                await b.submit(form);
                assert.deepStrictEqual(b.win._sys.query, { category: '4', sort: 'year', order: 'desc' }); // empty fields are dropped
                assert.deepStrictEqual(titles(b.doc), ['Small Software', 'Plain HTML']);
                // the form shows what was searched
                assert.strictEqual(b.doc.querySelector('form.filters [name=category][value="4"]').checked, true);
                assert.strictEqual(b.doc.querySelector('form.filters [name=sort]').value, 'year');
            } finally { b.cleanup(); }
        });

        test('navigating between all pages keeps the data sources of the new page (head sync)', async () => {
            const b = bootLocal({ root: appDir, page: 'index.html' });
            try {
                await b.ready();
                for (const [sel, check] of [
                    ["header a[href='authors.html']", (d) => d.querySelectorAll('.card').length === 4],
                    ["header a[href='pipes.html']", (d) => text(d.getElementById('p-date')) === '2019/05/14'],
                    ["header a[href='about.html']", (d) => /small library/.test(text(d.querySelector('main')))],
                    ["header a[href='book-new.html']", (d) => d.querySelectorAll('[name=author_id]').length === 4],
                    ["header a.brand", (d) => texts(d, '.stat b')[0] === '8'],
                    ["header a[href='books.html']", (d) => titles(d).length === 3],
                    ["header a.brand", (d) => texts(d, '.stat b')[0] === '8']
                ]) {
                    await b.click(sel);
                    assert.ok(check(b.doc), 'after clicking ' + sel + ' -> ' + text(b.doc.querySelector('main')).slice(0, 120));
                }
            } finally { b.cleanup(); }
        });
    });

    describe('read-only mock mode (no folder access)', () => {
        test('browser without File System Access API: home page renders from window.__BRACIFY_DATA__ without crashing', async () => {
            const fs = require('fs');
            const path = require('path');
            const b = bootLocal({ root: appDir, page: 'index.html', connected: false, noPicker: true });
            try {
                await until(() => b.doc.getElementById('bracify-btn-skip'), 3000, 'unsupported-browser overlay');
                assert.match(text(b.doc.getElementById('bracify-init-overlay')), /Unsupported Browser/);
                // What the (generated) _sys/data/*.js files would provide in mock mode
                const data = {};
                for (const n of ['site', 'books', 'authors', 'categories', 'reviews']) {
                    data[n] = JSON.parse(fs.readFileSync(path.join(appDir, '_sys', 'data', n + '.json'), 'utf8'));
                }
                b.win.__BRACIFY_DATA__ = data;
                b.doc.getElementById('bracify-btn-skip').click();
                await until(() => !/\{books\._length\}/.test(b.doc.body.innerHTML), 5000, 'mock render');
                assert.strictEqual(b.doc.getElementById('bracify-init-overlay'), null);
                assert.deepStrictEqual(texts(b.doc, '.stat b'), ['8', '4', '8', '20']);
                // README: in mock mode data-t-include may be unavailable. The layout is not merged, but the page body still renders.
                assert.match(text(b.doc.querySelector('[data-t-content=page-title]')), /Dashboard/);
                assert.strictEqual(b.doc.querySelectorAll('.cards li').length, 3, 'exact-match filters and _sort/_limit still work');
                assert.strictEqual(b.doc.getElementById('bracify-disconnect-btn'), null, 'no folder, no disconnect button');
            } finally { b.cleanup(); }
        });

        test('without any data the page still renders (placeholders stay, no exception)', async () => {
            const b = bootLocal({ root: appDir, page: 'about.html', connected: false, noPicker: true });
            try {
                await until(() => b.doc.getElementById('bracify-btn-skip'), 3000, 'overlay');
                b.doc.getElementById('bracify-btn-skip').click();
                await wait(300);
                assert.strictEqual(b.doc.getElementById('bracify-init-overlay'), null);
                assert.strictEqual(text(b.doc.querySelector('[data-t-content=page-title]')), 'About');
                assert.ok(b.doc.querySelector('[data-t-content=main-body]'));
            } finally { b.cleanup(); }
        });
    });
});
