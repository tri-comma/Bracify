import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Final Mystery Diagnostic', () => {
    let Bracify;
    let dom;
    let logs = [];

    function setupEnvironment(html) {
        dom = new JSDOM(html);
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        delete require.cache[enginePath];
        Bracify = require(enginePath);
        logs = [];
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.Node;
        delete global.DOMParser;
    });

    test('REPRODUCE: Why is name cleared?', async () => {
        // EXACT HTML as provided in the screenshot
        const html = `
            <form method="POST" action="/_sys/data/projects.json">
                <input type="hidden" name="id" value="studio">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" name="name" placeholder="e.g. My Awesome App" required="" value="Bracify Studio">
                </div>
                <div class="form-group">
                    <label>Local Path</label>
                    <input type="text" name="path" placeholder="/Users/name/projects/my-app" required="" value="./studio">
                </div>
            </form>
        `;

        setupEnvironment(html);

        // EXACT __BRACIFY_DATA__ from user
        global.window.__BRACIFY_DATA__ = {
            "_sys": { "query": { "id": "studio" }, "params": {} },
            "project": [{ "id": "studio", "name": "Bracify Studio", "path": "./studio", "status": "active", "port": 3000 }]
        };
        global.window._sys = global.window.__BRACIFY_DATA__._sys;

        const logger = (msg) => logs.push(msg);
        const engine = new Bracify.Engine({ logger });

        // Execute processing
        // We simulate the initializeBracify call: 
        // engine.processElement(document.body, data, { requireScope: true })
        const data = { ...global.window.__BRACIFY_DATA__, _sys: global.window._sys };
        await engine.processElement(document.body, data, { requireScope: true });

        console.log('--- ENGINE LOGS ---');
        logs.forEach(l => console.log(l));
        console.log('-------------------');

        const nameInput = document.querySelector('input[name="name"]');

        // Check if value remains
        assert.strictEqual(nameInput.value, 'Bracify Studio', 'Project Name should NOT be cleared');
    });

    test('REPRODUCE: Does sibling leakage occur?', async () => {
        const html = `
            <div data-t-scope="project"></div>
            <input type="text" name="name" value="PRESERVED">
        `;
        setupEnvironment(html);

        global.window.__BRACIFY_DATA__ = {
            project: { name: "Scoped Name" },
            name: "ROOT_NAME"
        };
        global.window._sys = { query: {}, params: {} };

        const engine = new Bracify.Engine({ logger: (m) => logs.push(m) });
        const data = { ...global.window.__BRACIFY_DATA__, _sys: global.window._sys };

        // This is where the leak might happen if localConfig is shared among siblings
        await engine.processElement(document.body, data, { requireScope: true });

        console.log('--- LEAK LOGS ---');
        logs.forEach(l => console.log(l));

        const input = document.querySelector('input[name="name"]');

        // IF LEAK HAPPENS: inScope becomes true for the input, 
        // and it picks up "ROOT_NAME" or matching data.
        assert.strictEqual(input.value, 'PRESERVED', 'Sibling should NOT inherit inScope state');
    });
});
