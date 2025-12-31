import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('User Environment Reproduction (True Cause)', () => {
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

    test('REPRODUCE: Value is cleared with Array data and missing scope attribute', async () => {
        // EXACT snippet from user (simplified but keeping key parts)
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <link data-t-source="project" href="_sys/data/projects.json?id=studio&_limit=1">
            </head>
            <body>
                <form method="POST" action="/_sys/data/projects.json">
                    <input type="hidden" name="id" value="studio">
                    <div class="form-group">
                        <label>Project Name</label>
                        <!-- SSR pre-filled value -->
                        <input type="text" name="name" value="Bracify Studio">
                    </div>
                    <div class="form-group">
                        <label>Local Path</label>
                        <input type="text" name="path" value="./studio">
                    </div>
                </form>
            </body>
            </html>
        `;

        setupEnvironment(html);

        // EXACT __BRACIFY_DATA__ from user
        global.window.__BRACIFY_DATA__ = {
            "_sys": { "query": { "id": "studio" }, "params": {} },
            "project": [{ "id": "studio", "name": "Bracify Studio", "path": "./studio", "status": "active", "port": 3000 }]
        };
        global.window._sys = global.window.__BRACIFY_DATA__._sys;

        // Execute Hydration
        await Bracify.initializeBracify();

        const nameInput = document.querySelector('input[name="name"]');

        // ASSERT: If this becomes "", we've reproduced it!
        assert.strictEqual(nameInput.value, 'Bracify Studio', 'Value should be preserved even if data matches but scope is missing');
    });
});
