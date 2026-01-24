import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

describe('Integrated SPA Navigation Test', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html, url = 'http://localhost/index.html') {
        dom = new JSDOM(html, { url });
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.history = dom.window.history;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;
        global.FormData = dom.window.FormData;
        global.URL = dom.window.URL;
        global.URLSearchParams = dom.window.URLSearchParams;

        // Mock global fetch to delegate to JSDOM's window.fetch
        global.fetch = async (resource, options) => {
            return global.window.fetch(resource, options);
        };

        try {
            Object.defineProperty(global, 'navigator', {
                value: dom.window.navigator,
                configurable: true,
                writable: true
            });
        } catch (e) { }

        // Mock scrollTo
        global.window.scrollTo = (x, y) => {
            global.window.scrollX = x;
            global.window.scrollY = y;
        };

        delete require.cache[enginePath];
        Bracify = require(enginePath);
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.history;
        delete global.Node;
        delete global.DOMParser;
        delete global.FormData;
        delete global.fetch;
    });

    test('1. SSR Link Click Interception & DOM Replacement', async () => {
        const initialHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Page A</title></head>
            <body data-t-scope="pageA">
                <h1>Page A</h1>
                <a href="pageB.html" id="link-to-b">Go to B</a>
                <script>window.state_preserved = true;</script>
            </body>
            </html>
        `;
        setupEnvironment(initialHtml);

        // Mock Fetch for pageB.html
        global.window.fetch = async (url) => {
            if (url === 'pageB.html') {
                return {
                    ok: true,
                    text: async () => `
                        <!DOCTYPE html>
                        <html>
                        <head><title>Page B</title></head>
                        <body>
                            <h1>Page B</h1>
                            <div id="content-b">Dynamic Content</div>
                        </body>
                        </html>
                    `
                };
            }
            return { ok: false };
        };

        // Initialize engine (simulation of DOMContentLoaded)
        await Bracify.initializeBracify();

        // Check initial state
        assert.strictEqual(document.title, 'Page A');
        global.window.state_preserved = true;

        // Simulate Link Click
        const link = document.getElementById('link-to-b');
        const clickEvent = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(clickEvent);

        // Wait for async navigation
        await new Promise(resolve => setTimeout(resolve, 150));

        // Check if DOM was replaced
        assert.strictEqual(document.title, 'Page B', 'Title should be updated');
        assert.ok(document.body.innerHTML.includes('Page B'), 'Body should be replaced');
        assert.ok(document.getElementById('content-b'), 'New element should exist');

        // State Persistence test
        assert.strictEqual(global.window.state_preserved, true, 'Global window state should persist through navigation');
    });

    test('2. Form GET Interception (Search / Pagination)', async () => {
        const initialHtml = `
            <!DOCTYPE html>
            <html>
            <body>
                <form action="search.html" method="GET" id="search-form">
                    <input type="text" name="q" value="bracify">
                    <button type="submit" id="submit-btn">Search</button>
                </form>
            </body>
            </html>
        `;
        setupEnvironment(initialHtml);

        let requestedUrl = '';
        global.window.fetch = async (url) => {
            requestedUrl = url;
            return {
                ok: true,
                text: async () => '<body><h1>Search Results</h1></body>'
            };
        };

        await Bracify.initializeBracify();

        // Simulate Form Submit
        const form = document.getElementById('search-form');
        const submitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);

        // Wait for async navigation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check URL construction
        assert.ok(requestedUrl.includes('search.html?q=bracify'), 'Form should be serialized into query string');
        assert.ok(document.body.innerHTML.includes('Search Results'), 'Body should be replaced by search results');
    });

    test('3. Scroll Position Reset on Navigation', async () => {
        const initialHtml = `<body><a href="page2.html" id="link">Link</a></body>`;
        setupEnvironment(initialHtml);

        global.window.fetch = async () => ({
            ok: true,
            text: async () => '<body>New Page</body>'
        });

        await Bracify.initializeBracify();

        // Set scroll to some position
        window.scrollTo(0, 500);
        assert.strictEqual(window.scrollY, 500);

        // Navigate
        const link = document.getElementById('link');
        link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

        await new Promise(resolve => setTimeout(resolve, 100));

        // Scroll should be reset to 0
        assert.strictEqual(window.scrollY, 0, 'Scroll should be reset to top on navigation');
    });

    test('4. CSR Simulation (FSA Permissions)', async () => {
        // Mocking direct file:// access logic
        const initialHtml = `<body><a href="page2.html" id="link">Link</a></body>`;
        setupEnvironment(initialHtml, 'file:///C:/project/index.html');

        // Mock rootHandle access
        Bracify.rootHandle = { kind: 'directory' };

        // Mock internal readFileContent and resolvePathHandle by overriding factory result 
        // (Simplest way in test is to mock Bracify.readFileContent directly)
        Bracify.readFileContent = async () => '<body>CSR Page 2</body>';
        Bracify.resolvePathHandle = async () => ({ kind: 'file' });

        await Bracify.initializeBracify();

        const link = document.getElementById('link');
        link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));

        await new Promise(resolve => setTimeout(resolve, 100));

        assert.ok(document.body.innerHTML.includes('CSR Page 2'), 'CSR mode should also replace DOM via navigate');
        assert.ok(Bracify.rootHandle, 'Root handle (permission) should persist');
    });
});
