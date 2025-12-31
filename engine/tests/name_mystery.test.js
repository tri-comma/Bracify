import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('The "Name" Mystery Diagnostic', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html) {
        dom = new JSDOM(html);
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        delete require.cache[enginePath];
        Bracify = require(enginePath);
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.Node;
        delete global.DOMParser;
    });

    test('Is "name" treated differently than "path"?', async () => {
        const html = `
            <form>
                <input type="text" name="name" value="SSR_NAME">
                <input type="text" name="path" value="SSR_PATH">
            </form>
        `;
        setupEnvironment(html);

        // Data structure matching user
        global.window.__BRACIFY_DATA__ = {
            project: { name: "Bracify Studio", path: "./studio" }
        };
        global.window._sys = { query: { id: "studio" }, params: {} };

        // Test with different scenarios of "name" being in query or root

        // Scenario 1: Clean environment
        await Bracify.initializeBracify();
        assert.strictEqual(document.querySelector('input[name="name"]').value, 'SSR_NAME');
        assert.strictEqual(document.querySelector('input[name="path"]').value, 'SSR_PATH');

        // Scenario 2: "name" is in the root data as empty string (e.g. from global pollution)
        setupEnvironment(html);
        global.window.__BRACIFY_DATA__ = {
            name: "", // POLLUTION
            project: { name: "Bracify Studio", path: "./studio" }
        };
        global.window._sys = { query: { id: "studio" }, params: {} };

        // BUT! If requireScope is true (default), it should still be protected.
        await Bracify.initializeBracify();
        assert.strictEqual(document.querySelector('input[name="name"]').value, 'SSR_NAME', 'Should be protected by guard');

        // Scenario 3: Leakage makes guard think we ARE in scope
        setupEnvironment(html);
        global.window.__BRACIFY_DATA__ = {
            name: "", // POLLUTION
            project: { name: "Bracify Studio", path: "./studio" }
        };
        global.window._sys = { query: { id: "studio" }, params: {} };

        // If we force inScope: true (simulating a leak)
        const engine = new Bracify.Engine();
        await engine.processElement(document.body, { ...global.window.__BRACIFY_DATA__ }, { requireScope: true, inScope: true });

        // NOW IT SHOULD BE CLEARED (Reproduction of the mechanism)
        assert.strictEqual(document.querySelector('input[name="name"]').value, '', 'If guard is bypassed, value IS cleared');
    });
});
