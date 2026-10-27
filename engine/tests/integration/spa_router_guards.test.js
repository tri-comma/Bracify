import { test, describe, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

// Issue #46: the SPA click handler must leave browser-owned clicks alone, the last navigation must win,
// and data-t-source links in <head> must be replaced (not accumulated) across navigations.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('SPA router guards, last-navigation-wins and head data-t-source sync (#46)', () => {
    let dom;
    let fetched;   // requested URLs, in order
    let delays;    // path -> ms the mock server holds the response
    let Bracify;
    let fetcherDelay = 0; // ms the data fetcher holds (makes initializeBracify slow)
    let navCalls;  // paths passed to BracifyLib.navigate

    const page = (h1, extraHead = '', extraBody = '') => `<!DOCTYPE html><html><head><title>${h1}</title>${extraHead}</head><body>
        <h1>${h1}</h1>${extraBody}
        <a href="books.html" id="to-books">Books</a>
        <a href="authors.html" id="to-authors">Authors</a>
        <a href="index.html" id="to-index">Dashboard</a>
        <a href="book.html?id=5" id="to-book5">Book 5</a>
        <a href="book.html?id=1" id="to-book1">Book 1</a>
        <a href="authors.html" id="dl" download>Download</a>
        <a href="authors.html" id="ext1" rel="external">External</a>
        <a href="authors.html" id="ext2" rel="noopener external">External2</a>
        <a href="authors.html" id="blank" target="_blank">Blank</a>
        <a href="http://example.com/x.html" id="http">Http</a>
        <a href="#top" id="hash">Hash</a>
        <a href="slow.html" id="to-slow">Slow</a>
    </body></html>`;

    // Server-side rendering stand-in: the response depends on the requested path + query.
    function render(url) {
        const u = new URL(url, 'http://localhost/');
        if (u.pathname.endsWith('books.html')) return page('Books', '', '<script>window.__booksRan = (window.__booksRan || 0) + 1;</script>');
        if (u.pathname.endsWith('authors.html')) return page('Authors', '', '<script>window.__authorsRan = (window.__authorsRan || 0) + 1;</script>');
        if (u.pathname.endsWith('slow.html')) return page('Slow', '<link data-t-source="slow" href="_sys/data/slow.json">',
            '<script>window.__slowRan = (window.__slowRan || 0) + 1;</script><p data-t-bind="slow.0.name"></p>');
        if (u.pathname.endsWith('book.html')) {
            const id = u.searchParams.get('id');
            return page('Book ' + id, `
                <meta name="description" content="book ${id}">
                <link data-t-source="book" href="_sys/data/books.json?id=${id}&_limit=1">
                <link data-t-source="bookReviews" href="_sys/data/reviews.json?book_id=${id}">
                <link data-t-source="site" href="_sys/data/site.json">
                <link rel="stylesheet" href="book.css">
                <style>.book-${id} { color: red; }</style>`);
        }
        return page('Dashboard');
    }

    async function setup(url) {
        dom = new JSDOM(render(url), { url, runScripts: 'dangerously' });
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
        delays = {};
        fetcherDelay = 0;
        // Data API requests (data-t-source) are answered by BracifyFetcher so only page fetches hit window.fetch
        global.window.BracifyFetcher = async () => {
            if (fetcherDelay) await sleep(fetcherDelay);
            return [];
        };
        global.window.fetch = async (r, opts) => {
            fetched.push(r);
            const u = new URL(r, 'http://localhost/');
            const ms = delays[u.pathname + u.search] ?? delays[u.pathname] ?? 0;
            if (ms) {
                await new Promise((resolve, reject) => {
                    const t = setTimeout(resolve, ms);
                    const sig = opts && opts.signal;
                    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); reject(new dom.window.DOMException('aborted', 'AbortError')); });
                });
            }
            return { ok: true, text: async () => render(r) };
        };

        delete require.cache[enginePath];
        Bracify = require(enginePath);
        await Bracify.initializeBracify(); // lets DOMContentLoaded register the SPA listeners
        await sleep(50);
        fetched = [];
        navCalls = [];
        const orig = Bracify.navigate;
        Bracify.navigate = function (...args) { navCalls.push(args[0]); return orig.apply(this, args); };
        return Bracify;
    }

    const h1 = () => document.querySelector('h1').textContent;
    const sources = () => [...document.head.querySelectorAll('link[data-t-source]')]
        .map(l => l.getAttribute('data-t-source') + '=' + l.getAttribute('href'));

    async function waitFor(cond, ms = 2000) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (cond()) return;
            await sleep(5);
        }
    }

    // Dispatches a click and returns the event, so tests can inspect defaultPrevented
    function fire(id, init = {}) {
        const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ...init });
        document.getElementById(id).dispatchEvent(ev);
        return ev;
    }

    async function click(id, expected) {
        fire(id);
        await waitFor(() => h1() === expected);
    }

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

    describe('1. click handler leaves browser-owned clicks alone', () => {
        for (const mod of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
            test(`1a. ${mod} click is not intercepted`, async () => {
                await setup('http://localhost/index.html');
                const ev = fire('to-books', { [mod]: true });
                await sleep(30);
                assert.strictEqual(ev.defaultPrevented, false, 'the browser must open the link itself');
                assert.deepStrictEqual(navCalls, [], 'navigate must not be called');
            });
        }

        test('1b. middle click (button 1) is not intercepted', async () => {
            await setup('http://localhost/index.html');
            const ev = fire('to-books', { button: 1 });
            await sleep(30);
            assert.strictEqual(ev.defaultPrevented, false);
            assert.deepStrictEqual(navCalls, []);
        });

        test('1c. link with a download attribute is not intercepted', async () => {
            await setup('http://localhost/index.html');
            const ev = fire('dl');
            await sleep(30);
            assert.strictEqual(ev.defaultPrevented, false);
            assert.deepStrictEqual(navCalls, []);
        });

        test('1d. rel="external" and rel="noopener external" are not intercepted', async () => {
            await setup('http://localhost/index.html');
            const e1 = fire('ext1');
            const e2 = fire('ext2');
            await sleep(30);
            assert.strictEqual(e1.defaultPrevented, false, 'rel="external"');
            assert.strictEqual(e2.defaultPrevented, false, 'rel="noopener external"');
            assert.deepStrictEqual(navCalls, []);
        });

        test('1e. a click already defaultPrevented by an earlier listener is not navigated', async () => {
            await setup('http://localhost/index.html');
            // Capture phase on document runs before the engine's bubble-phase listener
            document.addEventListener('click', (e) => e.preventDefault(), true);
            fire('to-books');
            await sleep(30);
            assert.deepStrictEqual(navCalls, [], 'navigate must not run for an already handled click');
            assert.strictEqual(h1(), 'Dashboard');
        });

        test('1f. a normal left click is still intercepted (guard)', async () => {
            await setup('http://localhost/index.html');
            const ev = fire('to-books');
            await waitFor(() => h1() === 'Books');
            assert.strictEqual(ev.defaultPrevented, true);
            assert.deepStrictEqual(navCalls, ['books.html']);
            assert.strictEqual(h1(), 'Books');
            assert.strictEqual(location.pathname, '/books.html');
        });

        test('1g. target=_blank, http and #-only links are still not intercepted (guard)', async () => {
            await setup('http://localhost/index.html');
            const ev1 = fire('blank');
            const ev2 = fire('http');
            const ev3 = fire('hash');
            await sleep(30);
            assert.strictEqual(ev1.defaultPrevented, false, '_blank');
            assert.strictEqual(ev2.defaultPrevented, false, 'http');
            assert.strictEqual(ev3.defaultPrevented, false, 'hash only');
            assert.deepStrictEqual(navCalls, []);
        });
    });

    describe('2. the last navigation wins', () => {
        test('2a. slow books.html then quick authors.html: Authors stays', async () => {
            await setup('http://localhost/index.html');
            const lenBefore = history.length;
            delays['/books.html'] = 300;
            fire('to-books');
            await sleep(50);
            fire('to-authors');
            await sleep(500); // let the stale response (if any) land

            assert.strictEqual(h1(), 'Authors', 'older response must not replace the DOM');
            assert.strictEqual(location.pathname, '/authors.html', 'older response must not change the URL');
            assert.strictEqual(Bracify._renderedPath, '/authors.html', 'stale response must not update _renderedPath');
            assert.strictEqual(history.length, lenBefore + 1, 'stale response must not push a history entry');
            assert.strictEqual(history.state && history.state.path, 'authors.html');
        });

        test('2b. a stale response does not run its scripts', async () => {
            await setup('http://localhost/index.html');
            delays['/books.html'] = 300;
            fire('to-books');
            await sleep(50);
            fire('to-authors');
            await sleep(500);

            assert.strictEqual(h1(), 'Authors');
            assert.strictEqual(window.__authorsRan, 1, 'the newest page script runs once');
            assert.strictEqual(window.__booksRan, undefined, 'the stale page script must not run');
        });

        test('2c. Back during an in-flight navigation (popstate skip case) cancels it', async () => {
            await setup('http://localhost/books.html');
            location.hash = '#x';   // browser-made entry: /books.html#x on top of /books.html
            await sleep(30);
            delays['/authors.html'] = 300;
            fire('to-authors');     // in flight; nothing pushed yet
            await sleep(30);
            await traverse('back'); // target /books.html equals _renderedPath: popstate handler skips
            await sleep(500);

            assert.strictEqual(h1(), 'Books', 'the in-flight navigation must not land after the user went Back');
            assert.strictEqual(location.pathname, '/books.html');
            assert.strictEqual(Bracify._renderedPath, '/books.html');
        });
    });

    describe('2d. cancellation is commit-aware and generation-based', () => {
        test('2d. hash-only popstate during initializeBracify of a committed navigation keeps its scripts', async () => {
            await setup('http://localhost/index.html');
            fetcherDelay = 300;
            fire('to-slow');
            await waitFor(() => h1() === 'Slow'); // committed: DOM swapped, initializeBracify is waiting on the fetcher
            assert.strictEqual(Bracify._renderedPath, '/slow.html');
            location.hash = '#x';
            await sleep(30);
            await sleep(600);
            assert.strictEqual(h1(), 'Slow');
            assert.strictEqual(window.__slowRan, 1, 'the committed page script runs exactly once');
        });

        test('2e. a fetch that ignores the abort signal and resolves late is discarded by the generation guard', async () => {
            await setup('http://localhost/index.html');
            const realFetch = global.window.fetch;
            global.window.fetch = async (r, opts) => realFetch(r); // drops the signal
            // The mock only delays when it sees a signal listener target; emulate a late response directly
            const inner = global.window.fetch;
            global.window.fetch = async (r, opts) => {
                if (String(r).includes('books.html')) await sleep(300);
                return inner(r);
            };
            fire('to-books');
            await sleep(50);
            fire('to-authors');
            await sleep(500);
            assert.strictEqual(h1(), 'Authors');
            assert.strictEqual(location.pathname, '/authors.html');
            assert.strictEqual(Bracify._renderedPath, '/authors.html');
            assert.strictEqual(window.__booksRan, undefined);
        });

        test('2f. a non-stale fetch rejection is rethrown, a stale one is swallowed', async () => {
            await setup('http://localhost/index.html');
            global.window.fetch = async (r) => { throw new Error('boom'); };
            await assert.rejects(() => Bracify.navigate('books.html'), /boom/);

            let rejectFirst;
            global.window.fetch = async (r) => {
                if (String(r).includes('books.html')) {
                    await new Promise((_, rej) => { rejectFirst = rej; });
                }
                return { ok: true, text: async () => render(r) };
            };
            const first = Bracify.navigate('books.html');
            await sleep(20);
            const second = Bracify.navigate('authors.html');
            rejectFirst(new Error('stale boom'));
            await first; // swallowed: no rejection
            await second;
            assert.strictEqual(h1(), 'Authors');
        });
    });

    describe('3. head data-t-source links are replaced, not accumulated', () => {
        test('3a. book.html?id=1 -> ?id=5 keeps exactly one link per data-t-source name', async () => {
            await setup('http://localhost/book.html?id=1');
            assert.deepStrictEqual(sources().sort(), [
                'book=_sys/data/books.json?id=1&_limit=1',
                'bookReviews=_sys/data/reviews.json?book_id=1',
                'site=_sys/data/site.json'
            ]);
            await click('to-book5', 'Book 5');
            await waitFor(() => location.search === '?id=5');
            assert.deepStrictEqual(sources().sort(), [
                'book=_sys/data/books.json?id=5&_limit=1',
                'bookReviews=_sys/data/reviews.json?book_id=5',
                'site=_sys/data/site.json'
            ], 'one link per name, with the new page hrefs');
        });

        test('3b. navigating back and forth does not grow the head link count', async () => {
            await setup('http://localhost/book.html?id=1');
            const count = () => document.head.querySelectorAll('link[data-t-source]').length;
            const initial = count();
            for (let i = 0; i < 3; i++) {
                await click('to-book5', 'Book 5');
                await click('to-book1', 'Book 1');
            }
            await traverse('back', 'Book 5');
            await traverse('back', 'Book 1');
            assert.strictEqual(count(), initial, 'link count must stay at one per name: ' + JSON.stringify(sources()));
            // Also the content must be the current page's (jsdom's [name="null"] quirk can hide duplicates behind a wrong match)
            assert.deepStrictEqual(sources().sort(), [
                'book=_sys/data/books.json?id=1&_limit=1',
                'bookReviews=_sys/data/reviews.json?book_id=1',
                'site=_sys/data/site.json'
            ]);
        });

        test('3c. title, meta, stylesheet and style still sync (guard)', async () => {
            await setup('http://localhost/index.html');
            await click('to-book5', 'Book 5');
            assert.strictEqual(document.title, 'Book 5');
            assert.strictEqual(document.head.querySelector('meta[name="description"]').getAttribute('content'), 'book 5');
            assert.strictEqual(document.head.querySelectorAll('link[rel="stylesheet"][href="book.css"]').length, 1);
            assert.ok(document.head.querySelector('style').textContent.includes('.book-5'));

            await click('to-book1', 'Book 1');
            assert.strictEqual(document.title, 'Book 1');
            assert.strictEqual(document.head.querySelector('meta[name="description"]').getAttribute('content'), 'book 1');
            assert.strictEqual(document.head.querySelectorAll('link[rel="stylesheet"][href="book.css"]').length, 1);
            assert.strictEqual(document.head.querySelectorAll('style').length, 1);
            assert.ok(document.head.querySelector('style').textContent.includes('.book-1'));

            await click('to-index', 'Dashboard');
            assert.strictEqual(document.head.querySelectorAll('link[rel="stylesheet"]').length, 0, 'page-specific css removed');
            assert.strictEqual(document.head.querySelectorAll('link[data-t-source]').length, 0, 'sources absent on the new page are removed');
        });
    });
});
