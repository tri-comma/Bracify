import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Final Leak Diagnostic', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html, includes = {}) {
        dom = new JSDOM(html);
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        delete require.cache[enginePath];
        Bracify = require(enginePath);

        global.window.fetch = async (path) => {
            if (includes[path]) return { ok: true, text: async () => includes[path] };
            return { ok: false };
        };
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.Node;
        delete global.DOMParser;
    });

    test('Does include replacement cause root-level elements to be treated as inScope?', async () => {
        const layout = `
            <div class="layout">
                <main data-t-content="main"></main>
            </div>
        `;
        const html = `
            <body data-t-include="layout.html">
                <div data-t-content="main">
                    <input type="text" name="name" value="PRESERVED">
                </div>
            </body>
        `;
        setupEnvironment(html, { "layout.html": layout });

        // Data that would clear the input if it was in scope
        global.window.__BRACIFY_DATA__ = { name: "" };
        global.window._sys = { query: {}, params: {} };

        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');

        // If the include process somehow sets inScope=true for the body or main, this will be ""
        assert.strictEqual(input.value, 'PRESERVED', 'Input should NOT be cleared after include hydration');
    });
});
