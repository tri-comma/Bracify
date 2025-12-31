import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Diagnostics: DATA RESOLUTION COLLISION', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html) {
        dom = new JSDOM(html, { url: 'http://localhost/project.html' });
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
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.Node;
        delete global.DOMParser;
    });

    test('Reproduce NG: Conflict between Root-Data and Scoped-Data during Hydration', async () => {
        // SSR pre-rendered input.
        const html = `
            <input type="text" name="name" value="Bracify Studio">
        `;
        setupEnvironment(html);

        // --- THE TRIGGER ---
        // If data.name exists at the root and is "", 
        // AND the engine is running in a mode that allows root-level binding...
        global.window.__BRACIFY_DATA__ = {
            name: "", // Conflicting root-level property
            project: { name: "Bracify Studio" }
        };
        global.window._sys = { query: {}, params: {} };

        // Even with requireScope: true, if the engine somehow thinks it is inScope, it will bind.
        // Let's test if any automatic inScope elevation happens.
        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');

        // IF THIS IS "", we found the leak.
        assert.strictEqual(input.value, 'Bracify Studio', 'Project Name should be preserved against root-level pollution');
    });

    test('Reproduce NG: Does auto-expansion of single-item arrays cause a collision?', async () => {
        const html = `
            <input type="text" name="name" value="Bracify Studio">
        `;
        setupEnvironment(html);

        // window.__BRACIFY_DATA__ contains projects as an array of 1.
        // Bracify's getNestedValue automatically expands single-item arrays.
        // If 'name' is resolved against this, it might find projects[0].name?
        global.window.__BRACIFY_DATA__ = {
            projects: [{ name: "" }]
        };
        global.window._sys = { query: {}, params: {} };

        await Bracify.initializeBracify();

        const input = document.querySelector('input[name="name"]');
        assert.strictEqual(input.value, 'Bracify Studio', 'Auto-expansion should not bypass hydration guard');
    });
});
