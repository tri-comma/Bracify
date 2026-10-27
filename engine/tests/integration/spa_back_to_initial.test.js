import { test, describe, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

// Issue #40: the first history entry has state === null, so Back to it must still re-render.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('SPA Back to the initial history entry (#40)', () => {
    let dom;
    let fetched;

    const page = (h1) => `<!DOCTYPE html><html><head><title>${h1}</title></head><body>
        <h1>${h1}</h1>
        <a href="books.html" id="to-books">Books</a>
        <a href="authors.html" id="to-authors">Authors</a>
        <a href="index.html" id="to-index">Dashboard</a>
    </body></html>`;

    // Server-side rendering stand-in: the response depends on the requested path + query.
    function render(url) {
        const u = new URL(url, 'http://localhost/');
        if (u.pathname.endsWith('books.html')) return page('Books');
        if (u.pathname.endsWith('authors.html')) return page('Authors');
        if (u.pathname.endsWith('book.html')) return page('Book ' + u.searchParams.get('id'));
        return page('Dashboard');
    }

    async function setup(url) {
        dom = new JSDOM(render(url), { url });
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.history = dom.window.history;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;
        global.FormData = dom.window.FormData;
        global.URL = dom.window.URL;
        global.URLSearchParams = dom.window.URLSearchParams;
        global.fetch = async (r) => global.window.fetch(r);
        try {
            Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
        } catch (e) { }
        global.window.scrollTo = () => { };

        fetched = [];
        global.window.fetch = async (r) => {
            fetched.push(r);
            return { ok: true, text: async () => render(r) };
        };

        delete require.cache[enginePath];
        const Bracify = require(enginePath);
        await Bracify.initializeBracify(); // lets DOMContentLoaded register the SPA listeners
        await sleep(50);
        fetched = [];
        return Bracify;
    }

    const h1 = () => document.querySelector('h1').textContent;

    async function waitFor(cond, ms = 2000) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (cond()) return;
            await sleep(5);
        }
    }

    // Resolves once the clicked link's navigation rendered `expected` (assertions below report a mismatch)
    async function click(id, expected) {
        document.getElementById(id).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        await waitFor(() => h1() === expected);
    }

    // jsdom fires popstate asynchronously after history.back()/forward()
    async function traverse(dir, expected) {
        const popped = new Promise(r => dom.window.addEventListener('popstate', r, { once: true }));
        history[dir]();
        await popped;
        if (expected !== undefined) await waitFor(() => h1() === expected);
    }

    afterEach(() => { dom && dom.window.close(); });

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.history;
        delete global.Node;
        delete global.DOMParser;
        delete global.FormData;
        delete global.fetch;
        delete global.URL;
        delete global.URLSearchParams;
        delete global.navigator;
    });

    test('1. Back from the 2nd page re-renders the initial page', async () => {
        await setup('http://localhost/index.html');
        assert.strictEqual(history.state, null, 'precondition: initial entry has no state');
        await click('to-books', 'Books');
        assert.strictEqual(location.pathname, '/books.html');
        assert.strictEqual(h1(), 'Books');

        await traverse('back', 'Dashboard');
        assert.strictEqual(location.pathname, '/index.html');
        assert.strictEqual(h1(), 'Dashboard', 'content must follow the URL back to the initial page');
    });

    test('2. Query string (and hash) of the initial URL are preserved on Back', async () => {
        await setup('http://localhost/book.html?id=1#top');
        assert.strictEqual(h1(), 'Book 1');
        await click('to-authors', 'Authors');
        assert.strictEqual(h1(), 'Authors');

        await traverse('back', 'Book 1');
        assert.strictEqual(location.pathname, '/book.html');
        assert.strictEqual(location.search, '?id=1');
        assert.strictEqual(location.hash, '#top');
        assert.strictEqual(h1(), 'Book 1', 'book 1 must be re-rendered');
        assert.ok(fetched.some(f => f === '/book.html?id=1'),
            'the initial page must be re-fetched with its query: ' + JSON.stringify(fetched));
    });

    test('3. Back then Forward shows the second page again', async () => {
        await setup('http://localhost/index.html');
        await click('to-books', 'Books');
        await traverse('back', 'Dashboard');
        await traverse('forward', 'Books');
        assert.strictEqual(location.pathname, '/books.html');
        assert.strictEqual(h1(), 'Books');
    });

    test('4. index -> books -> authors, Back twice returns to index', async () => {
        await setup('http://localhost/index.html');
        await click('to-books', 'Books');
        await click('to-authors', 'Authors');
        assert.strictEqual(h1(), 'Authors');

        await traverse('back', 'Books');
        assert.strictEqual(location.pathname, '/books.html');
        assert.strictEqual(h1(), 'Books', 'step 1: Back to a pushed entry works');

        await traverse('back', 'Dashboard');
        assert.strictEqual(location.pathname, '/index.html');
        assert.strictEqual(h1(), 'Dashboard', 'step 2: Back to the initial entry must re-render');
    });

    test('5. Hash-only history change on the initial page does not fetch or re-render', async () => {
        await setup('http://localhost/index.html');
        const body = document.body;
        const marker = document.createElement('div');
        marker.id = 'marker';
        body.appendChild(marker);
        await sleep(50);
        const before = fetched.length;

        location.hash = '#section'; // browser-made entry, state === null
        await sleep(50);
        await traverse('back');     // popstate with path+search equal to the current page
        await sleep(50);

        assert.strictEqual(location.pathname, '/index.html');
        assert.strictEqual(fetched.length, before, 'no fetch for a hash-only popstate');
        assert.ok(document.getElementById('marker'), 'DOM must not be re-rendered');
    });

    test('6. Back to a state-less entry that is not the first one also re-renders', async () => {
        // Same root cause from another angle: any entry without state.path (not only the first load)
        await setup('http://localhost/index.html');
        await click('to-books', 'Books');
        history.pushState(null, '', '/books.html?manual=1'); // foreign entry without state
        await click('to-authors', 'Authors');
        assert.strictEqual(h1(), 'Authors');
        await traverse('back', 'Books');
        assert.strictEqual(location.pathname, '/books.html');
        assert.strictEqual(location.search, '?manual=1');
        assert.strictEqual(h1(), 'Books');
    });

    test('7. Back follows the URL even when the previous navigation threw after the DOM swap', async () => {
        const Bracify = await setup('http://localhost/index.html');
        let calls = 0;
        global.window.scrollTo = () => { if (++calls === 1) throw new Error('boom after swap'); };
        // navigate rejects after swapping the DOM and pushing the URL
        await assert.rejects(Bracify.navigate('books.html'), /boom after swap/);
        assert.strictEqual(h1(), 'Books');
        assert.strictEqual(location.pathname, '/books.html');
        global.window.scrollTo = () => { };
        await traverse('back', 'Dashboard');
        assert.strictEqual(location.pathname, '/index.html');
        assert.strictEqual(h1(), 'Dashboard', 'a failed navigation must not leave the rendered path stale');
    });
});
