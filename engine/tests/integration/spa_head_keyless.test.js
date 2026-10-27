import { test, describe, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

// Issue #89: syncHead() keyed <meta> by name/property only; <meta charset> and <meta http-equiv>
// all got the key 'no-key' and were appended again on every SPA navigation.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('SPA head sync of keyless <meta> (charset / http-equiv) (#89)', () => {
    let dom;

    const CSP1 = "default-src 'self'";
    const CSP2 = "default-src 'self'; img-src *";

    // Per-page head fragments, keyed by pathname
    const pages = {
        '/a.html': {
            title: 'A',
            head: `<meta charset="utf-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta http-equiv="Content-Security-Policy" content="${CSP1}">
                <meta name="description" content="desc A">
                <meta property="og:title" content="og A">
                <meta itemprop="x" content="1">
                <link rel="stylesheet" href="/css/a.css">
                <link rel="stylesheet" href="/css/shared.css">
                <link data-t-source="/_sys/data/books.json" href="/_sys/data/books.json?x=a">`
        },
        // Same shared metas, same CSP content
        '/b.html': {
            title: 'B',
            head: `<meta charset="utf-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta http-equiv="Content-Security-Policy" content="${CSP1}">
                <meta name="description" content="desc B">
                <meta property="og:title" content="og B">
                <meta itemprop="x" content="1">
                <link rel="stylesheet" href="/css/b.css">
                <link rel="stylesheet" href="/css/shared.css">
                <link data-t-source="/_sys/data/books.json" href="/_sys/data/books.json?x=b">`
        },
        // Different CSP content, X-UA-Compatible absent
        '/c.html': {
            title: 'C',
            head: `<meta charset="utf-8">
                <meta http-equiv="Content-Security-Policy" content="${CSP2}">
                <meta name="description" content="desc C">
                <meta itemprop="x" content="2">
                <link rel="stylesheet" href="/css/shared.css">`
        },
        // No metas at all
        '/d.html': {
            title: 'D',
            head: ''
        },
        // Case differences in the http-equiv name denote the same header
        '/e.html': {
            title: 'E',
            head: `<meta charset="utf-8">
                <meta http-equiv="content-security-policy" content="${CSP1}">`
        },
        // Page-specific inline style (the engine drops and re-adds <style> on every navigation)
        '/s.html': {
            title: 'S',
            head: `<meta charset="utf-8"><style>.s { color: red }</style>`
        }
    };

    function render(url) {
        const u = new URL(url, 'http://localhost/');
        const p = pages[u.pathname] || pages['/a.html'];
        return `<!DOCTYPE html><html><head><title>${p.title}</title>${p.head}</head><body>
            <h1>${p.title}</h1>
            <a href="/a.html" id="to-a">A</a>
            <a href="/b.html" id="to-b">B</a>
            <a href="/c.html" id="to-c">C</a>
            <a href="/d.html" id="to-d">D</a>
            <a href="/e.html" id="to-e">E</a>
            <a href="/s.html" id="to-s">S</a>
        </body></html>`;
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
        global.window.BracifyFetcher = async () => null; // data-t-source requests: no data needed here
        global.window.fetch = async (r) => ({ ok: true, text: async () => render(r) });

        delete require.cache[enginePath];
        const Bracify = require(enginePath);
        await Bracify.initializeBracify(); // lets DOMContentLoaded register the SPA listeners
        await sleep(50);
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

    async function go(id, expected) {
        document.getElementById(id).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        await waitFor(() => h1() === expected);
        assert.strictEqual(h1(), expected, 'navigation to ' + expected + ' must complete');
    }

    const charsets = () => Array.from(document.head.querySelectorAll('meta[charset]'));
    const httpEquivs = (name) => Array.from(document.head.querySelectorAll('meta[http-equiv]'))
        .filter(m => m.getAttribute('http-equiv').toLowerCase() === name.toLowerCase());
    const contents = (metas) => metas.map(m => m.getAttribute('content'));

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

    test('1. Precondition: the initial page has one of each keyless meta', async () => {
        await setup('http://localhost/a.html');
        assert.strictEqual(charsets().length, 1);
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1);
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1);
    });

    test('2. <meta charset> does not accumulate over repeated navigations', async () => {
        await setup('http://localhost/a.html');
        for (let i = 0; i < 3; i++) {
            await go('to-b', 'B');
            await go('to-a', 'A');
        }
        assert.strictEqual(charsets().length, 1, 'exactly one <meta charset> after 6 navigations');
        assert.strictEqual(charsets()[0].getAttribute('charset'), 'utf-8');
    });

    test('3. <meta http-equiv> does not accumulate over repeated navigations', async () => {
        await setup('http://localhost/a.html');
        for (let i = 0; i < 3; i++) {
            await go('to-b', 'B');
            await go('to-a', 'A');
        }
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1, 'exactly one X-UA-Compatible');
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1, 'exactly one Content-Security-Policy');
        assert.deepStrictEqual(contents(httpEquivs('X-UA-Compatible')), ['IE=edge']);
        assert.deepStrictEqual(contents(httpEquivs('Content-Security-Policy')), [CSP1]);
    });

    test('4. Total <meta> count is stable across navigations between same-shaped pages', async () => {
        await setup('http://localhost/a.html');
        const initial = document.head.querySelectorAll('meta').length;
        for (let i = 0; i < 4; i++) {
            await go('to-b', 'B');
            await go('to-a', 'A');
        }
        assert.strictEqual(document.head.querySelectorAll('meta').length, initial);
    });

    test('5. A page whose http-equiv content differs replaces it (only the new content remains)', async () => {
        await setup('http://localhost/a.html');
        await go('to-c', 'C');
        assert.deepStrictEqual(contents(httpEquivs('Content-Security-Policy')), [CSP2],
            'the old CSP content must be gone, the new one present exactly once');
        await go('to-a', 'A');
        assert.deepStrictEqual(contents(httpEquivs('Content-Security-Policy')), [CSP1],
            'and back again');
    });

    test('6. A keyless meta present on the old page but absent on the new page is removed', async () => {
        await setup('http://localhost/a.html');
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1);
        await go('to-c', 'C'); // C has no X-UA-Compatible
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 0, 'X-UA-Compatible must be removed');
        assert.strictEqual(charsets().length, 1, 'shared charset stays (once)');
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1);
        await go('to-a', 'A'); // and A brings it back
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1, 'X-UA-Compatible is re-added once');
    });

    test('7. A page without any meta clears all keyless metas, and returning adds each once', async () => {
        await setup('http://localhost/a.html');
        await go('to-d', 'D');
        assert.strictEqual(charsets().length, 0);
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 0);
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 0);
        await go('to-a', 'A');
        assert.strictEqual(charsets().length, 1);
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1);
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1);
    });

    test('8. The http-equiv name is matched case-insensitively', async () => {
        await setup('http://localhost/a.html');
        await go('to-e', 'E'); // lower-case "content-security-policy"
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1,
            'the same header in another case is the same meta, not a second one');
        assert.deepStrictEqual(contents(httpEquivs('Content-Security-Policy')), [CSP1]);
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 0);
    });

    test('9. Different keyless kinds do not clobber each other', async () => {
        // charset, X-UA-Compatible and CSP must be tracked independently
        await setup('http://localhost/a.html');
        await go('to-c', 'C');
        await go('to-b', 'B');
        assert.strictEqual(charsets().length, 1);
        assert.strictEqual(httpEquivs('X-UA-Compatible').length, 1);
        assert.strictEqual(httpEquivs('Content-Security-Policy').length, 1);
        assert.deepStrictEqual(contents(httpEquivs('Content-Security-Policy')), [CSP1]);
    });

    test('10. A meta without name/property/charset/http-equiv (itemprop) is matched by identity', async () => {
        const items = () => Array.from(document.head.querySelectorAll('meta[itemprop]'));
        await setup('http://localhost/a.html');
        assert.deepStrictEqual(contents(items()), ['1']);
        for (let i = 0; i < 3; i++) { // identical on both pages: stays exactly one copy
            await go('to-b', 'B');
            await go('to-a', 'A');
        }
        assert.deepStrictEqual(contents(items()), ['1'], 'identical meta is not duplicated');
        await go('to-c', 'C'); // different content: only the new one remains
        assert.deepStrictEqual(contents(items()), ['2'], 'the old content must be gone');
        await go('to-d', 'D'); // absent: removed
        assert.strictEqual(items().length, 0, 'absent meta must be removed');
        await go('to-a', 'A');
        assert.deepStrictEqual(contents(items()), ['1'], 'and added once on return');
    });

    // ---- Guards: behavior that already works must stay unchanged ----

    test('G1. Title follows each navigation', async () => {
        await setup('http://localhost/a.html');
        await go('to-b', 'B');
        assert.strictEqual(document.title, 'B');
        await go('to-c', 'C');
        assert.strictEqual(document.title, 'C');
    });

    test('G2. meta name / property are updated in place, never duplicated, and removed when absent', async () => {
        await setup('http://localhost/a.html');
        await go('to-b', 'B');
        const names = document.head.querySelectorAll('meta[name="description"]');
        assert.strictEqual(names.length, 1);
        assert.strictEqual(names[0].getAttribute('content'), 'desc B');
        const props = document.head.querySelectorAll('meta[property="og:title"]');
        assert.strictEqual(props.length, 1);
        assert.strictEqual(props[0].getAttribute('content'), 'og B');
        await go('to-c', 'C'); // no og:title
        assert.strictEqual(document.head.querySelectorAll('meta[property="og:title"]').length, 0);
        assert.strictEqual(document.head.querySelector('meta[name="description"]').getAttribute('content'), 'desc C');
    });

    test('G3. Stylesheet links are keyed by href: shared one kept once, page-specific one swapped', async () => {
        await setup('http://localhost/a.html');
        const hrefs = () => Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map(l => l.getAttribute('href')).sort();
        assert.deepStrictEqual(hrefs(), ['/css/a.css', '/css/shared.css']);
        await go('to-b', 'B');
        await go('to-a', 'A');
        await go('to-b', 'B');
        assert.deepStrictEqual(hrefs(), ['/css/b.css', '/css/shared.css']);
    });

    test('G4. data-t-source links (#46) are updated in place, never duplicated', async () => {
        await setup('http://localhost/a.html');
        await go('to-b', 'B');
        await go('to-a', 'A');
        await go('to-b', 'B');
        const links = document.head.querySelectorAll('link[data-t-source]');
        assert.strictEqual(links.length, 1);
        assert.strictEqual(links[0].getAttribute('href'), '/_sys/data/books.json?x=b');
        await go('to-c', 'C'); // no data-t-source link
        assert.strictEqual(document.head.querySelectorAll('link[data-t-source]').length, 0);
    });

    test('G5. Page <style> is replaced on each navigation, not accumulated', async () => {
        await setup('http://localhost/s.html');
        for (let i = 0; i < 3; i++) {
            await go('to-a', 'A');
            await go('to-s', 'S');
        }
        assert.strictEqual(document.head.querySelectorAll('style').length, 1);
    });
});
