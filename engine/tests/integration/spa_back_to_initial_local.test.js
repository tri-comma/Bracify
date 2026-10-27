import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { bootLocal, until, wait } = require('../../../examples/tests/local-helpers.cjs');
const enginePath = require.resolve('../../lib/engine.cjs');

// Issue #87: in file:// folder-access (rootHandle) mode the initial history entry has state === null and its
// location is a filesystem path, so Back to it used to be ignored. The initial entry must carry a project-relative path.

const page = (h1) => `<!DOCTYPE html><html><head><title>${h1}</title></head><body>
    <h1>${h1}</h1>
    <a href="books.html" id="to-books">Books</a>
    <a href="authors.html" id="to-authors">Authors</a>
    <a href="index.html" id="to-index">Dashboard</a>
</body></html>`;

describe('SPA Back to the initial history entry in file:// folder-access mode (#87)', () => {
    let root;
    let b;

    function makeProject() {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-87-'));
        fs.writeFileSync(path.join(root, 'index.html'), page('Dashboard'));
        fs.writeFileSync(path.join(root, 'books.html'), page('Books'));
        fs.writeFileSync(path.join(root, 'authors.html'), page('Authors'));
        return root;
    }

    async function open(o = {}) {
        b = bootLocal({ root: root || makeProject(), ...o });
        await b.ready();
        return b;
    }

    const h1 = () => b.doc.querySelector('h1').textContent;

    async function traverse(dir, expected) {
        const popped = new Promise(r => b.win.addEventListener('popstate', r, { once: true }));
        b.win.history[dir]();
        await popped;
        if (expected !== undefined) await until(() => h1() === expected, 2000, 'h1 to become ' + expected);
    }

    afterEach(() => {
        if (b) b.cleanup();
        b = null;
        if (root) fs.rmSync(root, { recursive: true, force: true });
        root = null;
    });

    test('1. Back from the 2nd page re-renders the initial page', async () => {
        await open();
        assert.ok(b.Bracify.rootHandle, 'precondition: rootHandle mode');
        assert.strictEqual(b.win.location.protocol, 'file:');
        await b.click('#to-books');
        assert.strictEqual(h1(), 'Books');

        await traverse('back');
        await wait(150);
        assert.ok(b.win.location.pathname.endsWith('/index.html'));
        assert.strictEqual(h1(), 'Dashboard', 'content must follow history back to the initial page');
    });

    test('2. Initial entry carries a project-relative path state', async () => {
        await open();
        const st = b.win.history.state;
        assert.ok(st && st.path, 'initial entry must have state.path, got ' + JSON.stringify(st));
        assert.ok(!/^[a-z]:|^\/|^file:/i.test(st.path), 'state.path must be project-relative, got ' + st.path);
        assert.strictEqual(st.path.split('?')[0], 'index.html');
    });

    test('3. index -> books -> authors, Back twice returns to index; Forward works', async () => {
        await open();
        await b.click('#to-books');
        await b.click('#to-authors');
        assert.strictEqual(h1(), 'Authors');

        await traverse('back', 'Books');
        assert.strictEqual(h1(), 'Books', 'Back within SPA entries keeps working');

        await traverse('back');
        await wait(150);
        assert.strictEqual(h1(), 'Dashboard', 'Back to the initial entry must re-render');

        await traverse('forward', 'Books');
        assert.strictEqual(h1(), 'Books');
    });

    test('4. Initial page query string is preserved on Back', async () => {
        await open({ query: 'id=1' });
        await b.click('#to-books');
        await traverse('back');
        await wait(150);
        assert.strictEqual(b.win.location.search, '?id=1');
        assert.strictEqual(h1(), 'Dashboard');
    });

    test('5. A popstate to the already rendered page does not re-render', async () => {
        await open();
        const marker = b.doc.createElement('div');
        marker.id = 'marker';
        b.doc.body.appendChild(marker);
        b.win.location.hash = '#section'; // hash-only entry; Back lands on the rendered path
        await wait(50);
        await traverse('back');
        await wait(150);
        assert.ok(b.doc.getElementById('marker'), 'DOM must not be re-rendered for the same rendered path');
    });

    test('6. A foreign initial state is preserved and path is merged in', async () => {
        // Someone else (a script of the page) set state before DOMContentLoaded finished: keep it.
        root = makeProject();
        const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
            .replace('<body>', '<body><script>history.replaceState({ mine: 1 }, "");</script>');
        fs.writeFileSync(path.join(root, 'index.html'), html);
        await open();
        const st = b.win.history.state;
        assert.ok(st && st.mine === 1, 'foreign state must survive, got ' + JSON.stringify(st));
        await until(() => b.win.history.state.path, 2000, 'path to be merged into the foreign state');
        assert.strictEqual(b.win.history.state.mine, 1);
        assert.strictEqual(b.win.history.state.path, 'index.html');
    });

    test('8. Initial page in a subfolder: Back re-renders it (path is relative to the chosen folder)', async () => {
        root = makeProject();
        fs.mkdirSync(path.join(root, 'docs'));
        fs.writeFileSync(path.join(root, 'docs', 'a.html'), page('Docs A'));
        await open({ page: 'docs/a.html' });
        assert.strictEqual(b.win.history.state.path, 'docs/a.html');
        await b.click('#to-books'); // navigate resolves hrefs from the chosen folder
        assert.strictEqual(h1(), 'Books');

        await traverse('back');
        await wait(150);
        assert.ok(b.win.location.pathname.endsWith('/docs/a.html'));
        assert.strictEqual(h1(), 'Docs A');
    });

    test('9. A subfolder named like the chosen folder, holding a same-named file, is not confused with the root', async () => {
        root = makeProject();
        const name = path.basename(root);
        fs.mkdirSync(path.join(root, name));
        fs.writeFileSync(path.join(root, name, 'index.html'), page('Nested'));
        await open({ page: name + '/index.html' });
        await until(() => b.win.history.state && b.win.history.state.path, 2000, 'initial state');
        assert.strictEqual(b.win.history.state.path, name + '/index.html');
        await b.click('#to-books');
        await traverse('back');
        await until(() => h1() === 'Nested', 2000, 'Nested page after Back');
    });

    test('10. Back is not skipped when the URL collides with a different rendered project file', async () => {
        root = makeProject();
        fs.mkdirSync(path.join(root, 'docs'));
        fs.writeFileSync(path.join(root, 'docs', 'books.html'), page('DocsBooks'));
        await open({ page: 'docs/books.html' });
        await b.click('#to-books'); // renders root books.html while the URL stays /docs/books.html
        assert.strictEqual(h1(), 'Books');
        assert.ok(b.win.location.pathname.endsWith('/docs/books.html'));
        await traverse('back');
        await until(() => h1() === 'DocsBooks', 2000, 'DocsBooks after Back');
    });
});

// Server mode (#40) must keep following the URL; the fix must not touch it.
describe('Server mode Back to the initial entry still works (#40, guard for #87)', () => {
    let dom;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const render = (url) => {
        const u = new URL(url, 'http://localhost/');
        if (u.pathname.endsWith('books.html')) return page('Books');
        return page('Dashboard');
    };

    afterEach(() => {
        dom && dom.window.close();
        for (const k of ['window', 'document', 'location', 'history', 'Node', 'DOMParser', 'FormData', 'fetch', 'URL', 'URLSearchParams', 'navigator']) delete global[k];
    });

    test('7. http:// Back to the initial page re-renders it', async () => {
        dom = new JSDOM(render('/index.html'), { url: 'http://localhost/index.html' });
        const w = dom.window;
        Object.assign(global, { window: w, document: w.document, location: w.location, history: w.history, Node: w.Node, DOMParser: w.DOMParser, FormData: w.FormData, URL: w.URL, URLSearchParams: w.URLSearchParams });
        try { Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true, writable: true }); } catch (e) { }
        w.scrollTo = () => { };
        w.fetch = async (r) => ({ ok: true, text: async () => render(r) });
        global.fetch = async (r) => w.fetch(r);
        delete require.cache[enginePath];
        const Bracify = require(enginePath);
        await Bracify.initializeBracify();
        await sleep(50);
        const h1 = () => w.document.querySelector('h1').textContent;

        w.document.getElementById('to-books').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
        for (let i = 0; i < 200 && h1() !== 'Books'; i++) await sleep(5);
        assert.strictEqual(h1(), 'Books');

        const popped = new Promise(r => w.addEventListener('popstate', r, { once: true }));
        w.history.back();
        await popped;
        for (let i = 0; i < 200 && h1() !== 'Dashboard'; i++) await sleep(5);
        assert.strictEqual(w.location.pathname, '/index.html');
        assert.strictEqual(h1(), 'Dashboard');
    });
});
