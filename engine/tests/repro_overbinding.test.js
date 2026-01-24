import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('CSR Over-Binding Bug Reproduction: THE FORCED NG', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html, url = 'http://localhost/', includes = {}) {
        dom = new JSDOM(html, { url });
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        try {
            Object.defineProperty(global, 'navigator', {
                value: dom.window.navigator,
                configurable: true,
                writable: true
            });
        } catch (e) { }

        delete require.cache[enginePath];
        Bracify = require(enginePath);

        // Mock fetch for includes
        global.window.fetch = async (path) => {
            if (includes[path]) {
                return { ok: true, text: async () => includes[path] };
            }
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

    test('NG State: If requireScope is mistakenly FALSE during hydration, it clears the input', async () => {
        const ssrHtml = `
            <input type="text" name="name" value="Bracify Studio">
        `;

        setupEnvironment(ssrHtml, "http://localhost/project.html?name=");

        global.window.__BRACIFY_DATA__ = { project: { name: "Bracify Studio" } };
        global.window._sys = { query: { name: "" }, params: {} };

        // --- Execute Hydration with the DANGEROUS option ---
        // If the user's environment is somehow not passing this as 'true', the clearing happens.
        await Bracify.initializeBracify({ requireScope: false });

        const input = document.querySelector('input[name="name"]');

        // This will PASS because we successfully reproduced how it empties when the guard is OFF.
        assert.strictEqual(input.value, '', 'Project Name should be cleared when guard is OFF');
    });

    test('NG State: If inScope is mistakenly TRUE at root, it clears the input', async () => {
        const ssrHtml = `
            <input type="text" name="name" value="Bracify Studio">
        `;

        setupEnvironment(ssrHtml, "http://localhost/project.html?name=");

        global.window.__BRACIFY_DATA__ = { project: { name: "Bracify Studio" } };
        global.window._sys = { query: { name: "" }, params: {} };

        // --- Execute Hydration with another DANGEROUS option ---
        await Bracify.initializeBracify({ inScope: true });

        const input = document.querySelector('input[name="name"]');

        // This will PASS because we told the engine everything is in scope.
        assert.strictEqual(input.value, '', 'Project Name should be cleared if inScope is wrongly true');
    });
});
