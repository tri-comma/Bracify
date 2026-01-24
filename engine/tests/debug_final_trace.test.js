import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../lib/engine.cjs');

describe('Final Trace: Exactly WHY is it binding?', () => {
    let Bracify;
    let dom;
    let logs = [];

    function setupEnvironment(html) {
        dom = new JSDOM(html, { url: 'http://localhost/project.html' });
        global.window = dom.window;
        global.document = dom.window.document;
        global.location = dom.window.location;
        global.Node = dom.window.Node;
        global.DOMParser = dom.window.DOMParser;

        delete require.cache[enginePath];
        Bracify = require(enginePath);
        logs = [];
    }

    test('Trace: Root-level binding without scope attributes', async () => {
        const html = `
            <input type="text" name="name" value="SSR_VALUE">
        `;
        setupEnvironment(html);

        global.window.__BRACIFY_DATA__ = { name: "EMPTY_OVERWRITE" };
        global.window._sys = { query: {}, params: {} };

        // We use a custom logger to see if applyAutoBindings is even ATTEMPTED
        const logger = (msg) => logs.push(msg);
        const engine = new Bracify.Engine({ logger });

        // CASE A: Normal Hydration (Strict)
        await engine.processElement(document.body, { ...global.window.__BRACIFY_DATA__ }, { requireScope: true });

        // ASSERT: Should have NO 'BINDING' logs for 'name' because it's guarded.
        const bindLogs = logs.filter(l => l.toUpperCase().includes('BINDING: NAME="NAME"'));
        assert.strictEqual(bindLogs.length, 0, 'Should NOT bind at root level during hydration');
        assert.strictEqual(document.querySelector('input').value, 'SSR_VALUE');

        // CASE B: What if we simulate a call WITHOUT requireScope?
        await engine.processElement(document.body, { ...global.window.__BRACIFY_DATA__ }, { requireScope: false });

        // ASSERT: Should have a log now!
        const bindLogsNG = logs.filter(l => l.includes('BINDING: name="name"'));
        assert.ok(bindLogsNG.length > 0, 'Should bind when guard is off');
        assert.strictEqual(document.querySelector('input').value, 'EMPTY_OVERWRITE');
    });
});
