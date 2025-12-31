import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('The Smoking Gun Diagnostic', () => {
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

    test('NG REPRODUCTION: Values are cleared when data is missing and query param matches', async () => {
        // This simulates the actual project.html result in the browser:
        // 1. data-t-scope is stripped.
        // 2. data-t-source link is stripped.
        // 3. window.__BRACIFY_DATA__ is not provided or can't be found.
        const html = `
            <form>
                <input type="text" name="name" value="SSR_PREFILLED">
            </form>
        `;
        setupEnvironment(html);

        // Query param ?name= is present (empty)
        global.window._sys = { query: { name: "" }, params: {} };
        // Data is missing
        global.window.__BRACIFY_DATA__ = undefined;

        // Hydration starts
        // If initializeBracify is called, it SHOULD protect this because it's not inScope.
        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');

        // GOAL: This should FAIL (value becomes "") to prove we found the bug's trigger.
        assert.strictEqual(input.value, 'SSR_PREFILLED', 'Value should NOT be cleared if data is missing');
    });
});
