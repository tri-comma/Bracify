// Helper (not a test) for include_cycle.test.js. Runs in a child process / worker so that an
// unbounded include recursion can only hang the child, never the test runner.
// Usage as child: node include_cycle_child.cjs server <projectDir>   -> prints "PORT:<n>"
// Usage as worker: worker_threads with workerData { mode: 'engine', pages, entry, jsdom }
const path = require('path');
const { isMainThread, parentPort, workerData } = require('worker_threads');

if (!isMainThread && workerData && workerData.mode === 'engine') {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/' });
    global.window = dom.window; global.document = dom.window.document;
    global.location = dom.window.location; global.Node = dom.window.Node;
    global.DOMParser = dom.window.DOMParser;
    const Bracify = require(path.join(__dirname, '../../lib/engine.cjs'));
    const pages = workerData.pages;
    const engine = new Bracify.Engine({ includeResolver: async (p) => (p in pages ? pages[p] : null) });
    // Module loading (jsdom) can be very slow on loaded/cloud-synced disks. Signal readiness and wait for
    // the parent's "go" so the parent's hang timer measures only the render, not startup.
    parentPort.postMessage({ ready: true });
    parentPort.once('message', async () => {
        const root = document.createElement('div');
        root.innerHTML = pages[workerData.entry];
        try {
            await engine.processElement(root, { _sys: { query: {}, params: {} } }, {});
            parentPort.postMessage({ ok: true, html: root.innerHTML });
        } catch (e) {
            parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
        }
    });
} else if (isMainThread && process.argv[2] === 'server') {
    const EngineServer = require('../../server/index.cjs');
    const sqlite3 = require('sqlite3').verbose();
    (async () => {
        const server = new EngineServer(0, () => {}, { sqlite3 });
        await server.setCurrentProjectPath(process.argv[3]);
        const port = await server.start();
        console.log('PORT:' + port);
    })();
}
