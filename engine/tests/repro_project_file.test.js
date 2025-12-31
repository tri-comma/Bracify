import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');
const Renderer = require('../server/renderer.cjs');

describe('Final Desperate Reproduction: project.html', () => {
    let Bracify;
    let dom;

    function setupEnvironment(html, url = 'http://localhost/project.html') {
        dom = new JSDOM(html, { url });
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

    test('Reproduce NG: The "Project Values are Empty" Mystery', async () => {
        const projectHtml = fs.readFileSync('studio/project.html', 'utf8');
        const layoutHtml = fs.readFileSync('studio/_parts/layout.html', 'utf8');

        // SSR Render
        const mockData = { project: { id: 'mjtkgoaslxxc', name: 'Bracify Studio', port: 3000 } };
        const ssrHtml = await Renderer.processHTML(
            projectHtml,
            { _sys: { query: { id: 'mjtkgoaslxxc' } } },
            async () => layoutHtml,
            async () => mockData.project
        );

        // Hydration: URL with id
        setupEnvironment(ssrHtml, "http://localhost/project.html?id=mjtkgoaslxxc");

        // --- THE CRITICAL PART ---
        // If the real environment is missing __BRACIFY_DATA__ (because it's not injected)
        // and link tags are gone...
        global.window.__BRACIFY_DATA__ = {}; // Empty data!
        global.window._sys = { query: { id: 'mjtkgoaslxxc' }, params: {} };
        global.window.BracifyFetcher = async () => ({}); // Returns empty object!

        // Hydration execute
        await Bracify.initializeBracify();

        const nameInput = document.querySelector('input[name="name"]');

        // IF THE BUG EXISTS IN THE CURRENT LOGIC: it would be ""
        // IF THE CURRENT LOGIC IS FIXED: it should stay "Bracify Studio"
        assert.strictEqual(nameInput.value, 'Bracify Studio', 'Hydration CLEARed the value even though it should be guarded!');
    });
});
