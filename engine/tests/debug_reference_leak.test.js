import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Reference Leak Debugging', () => {
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

    test('BUG REPRODUCTION: Sibling scope leakage due to object reference sharing', async () => {
        // Here, Sibling 1 has a scope.
        // Sibling 2 (the form) is at the root level and should be protected.
        const html = `
            <div data-t-scope="project"></div>
            <form>
                <input type="text" name="name" value="SSR_PRESERVED">
            </form>
        `;
        setupEnvironment(html);

        // Collision source at root (or query)
        global.window.__BRACIFY_DATA__ = { project: { name: "Project Name" } };
        global.window._sys = { query: { name: "CLEARED_BY_QUERY" }, params: {} };

        const engine = new Bracify.Engine();

        // Start hydration (strict mode)
        // Root element (body) children are processed in a loop.
        await engine.processElement(document.body, { ...global.window.__BRACIFY_DATA__, _sys: global.window._sys }, { requireScope: true });

        const input = document.querySelector('input[name="name"]');

        // If the bug exists, the div sets localConfig.inScope = true.
        // If that localConfig object is SHARED with the next sibling (form)...
        // the form will be incorrectly bound.
        assert.strictEqual(input.value, 'SSR_PRESERVED', 'Sibling should NOT leak inScope status to next sibling');
    });
});
