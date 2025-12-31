import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

describe('Full Hydration & Collision Protection', () => {
    let Bracify;
    let dom;

    function setupJSDOM(html = '<html><body></body></html>', url = 'http://localhost/') {
        dom = new JSDOM(html, { url });

        // Define globals safely
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        // Safely handle navigator (readonly in newer Node.js)
        try {
            Object.defineProperty(global, 'navigator', {
                value: dom.window.navigator,
                configurable: true,
                enumerable: true,
                writable: true
            });
        } catch (e) {
            // If already defined and not configurable, skip
        }

        // Re-require to ensure engine sees the new globals
        delete require.cache[enginePath];
        Bracify = require('../../lib/engine.cjs');
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.Node;
        delete global.DOMParser;
    });

    test('Protection: Should PRESERVE SSR values against root-level query parameter collisions', async () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <input type="text" name="name" value="Bracify Studio">
            </body>
            </html>
        `;

        setupJSDOM(html, "http://localhost/project.html?name=OVERWRITTEN_BY_URL");

        // Mock data and system state
        global.window.__BRACIFY_DATA__ = { project: { name: 'Bracify Studio' } };
        global.window._sys = { query: { name: 'OVERWRITTEN_BY_URL' }, params: {} };
        global.window.BracifyFetcher = async () => global.window.__BRACIFY_DATA__;

        // Trigger Hydration
        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');
        assert.strictEqual(input.value, 'Bracify Studio', 'Value should NOT be overwritten by root-level query parameter');
    });

    test('Functionality: Should STILL BIND when inside a valid scope', async () => {
        const html = `
            <div data-t-scope="project">
                <input type="text" name="name" value="OLD">
            </div>
        `;

        setupJSDOM(html);

        global.window.__BRACIFY_DATA__ = { project: { name: 'Bracify Studio' } };
        global.window._sys = { query: {}, params: {} };
        global.window.BracifyFetcher = async () => global.window.__BRACIFY_DATA__;

        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');
        assert.strictEqual(input.value, 'Bracify Studio', 'Binding should occur when a scope is explicitly defined');
    });
});
