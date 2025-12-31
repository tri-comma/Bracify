import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Regression Test: SPA Navigation & Hydration Integrity', () => {
    let Bracify;
    let dom;
    let fetchCalls = [];

    function setupEnvironment(initialUrl = 'http://localhost/index.html') {
        dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
            url: initialUrl,
            contentType: "text/html"
        });
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;
        global.history = dom.window.history;

        // Navigator is read-only in some environments
        Object.defineProperty(global, 'navigator', {
            value: dom.window.navigator,
            configurable: true
        });

        // Mock Fetch
        fetchCalls = [];
        global.fetch = async (url) => {
            fetchCalls.push(url);
            // Return a mock SSR-prefilled HTML for project.html?id=studio
            if (url.includes('project.html?id=studio')) {
                return {
                    ok: true,
                    text: async () => `
                        <head>
                            <title>Project Details</title>
                        </head>
                        <body>
                            <form>
                                <input type="text" name="name" value="Bracify Studio">
                                <input type="text" name="path" value="./studio">
                            </form>
                        </body>
                    `
                };
            }
            // Return raw template if query is missing (reproducing the bug)
            return {
                ok: true,
                text: async () => `
                    <body>
                        <form>
                            <input type="text" name="name" value="">
                            <input type="text" name="path" value="">
                        </form>
                    </body>
                `
            };
        };

        delete require.cache[enginePath];
        Bracify = require(enginePath);
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.navigator;
        delete global.Node;
        delete global.DOMParser;
        delete global.history;
    });

    test('REGRESSION 1: navigate() must NOT strip query parameters when fetching', async () => {
        setupEnvironment();

        // Target: Navigate with query
        const targetPath = 'http://localhost/project.html?id=studio';
        await Bracify.navigate(targetPath);

        // Assert 1: fetch should have been called with the FULL path
        assert.ok(fetchCalls.includes(targetPath), `Fetch should be called with "${targetPath}", but was: ${fetchCalls[0]}`);

        // Assert 2: The current value should be from the SSR result, not cleared
        const nameInput = document.querySelector('input[name="name"]');
        assert.strictEqual(nameInput.value, 'Bracify Studio', 'Value should be pre-filled from SSR HTML');
    });

    test('REGRESSION 2: applyAutoBindings must NOT overwrite SSR values when out-of-scope (strict hydration)', async () => {
        setupEnvironment();

        // Simulate a page already rendered by SSR but with root-level data collisions
        document.body.innerHTML = `
            <form>
                <input type="text" name="name" value="SSR_VALUE">
            </form>
        `;

        // Root-level data has "name" (pollution)
        global.window.__BRACIFY_DATA__ = { name: "MALICIOUS_OVERWRITE" };
        global.window._sys = { query: {}, params: {} };

        // Start Hydration (initializeBracify uses console.log as logger in my previous debug edit)
        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');
        assert.strictEqual(input.value, 'SSR_VALUE', 'SSR value must be protected from root-level collision during hydration');
    });
});
