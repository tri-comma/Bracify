// Issue #45 review: <form data-t-redirect> -> hidden input must carry the bound value (also per list row)
// and never duplicate across SSR -> hydration -> repeat hydration.
import { test, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');
const renderer = require('../../server/renderer.cjs');

const TEMPLATE = `<!DOCTYPE html><html><head>
<link data-t-source="books" href="/_sys/data/books.json">
</head><body>
<form id="top" method="post" action="/_sys/data/x.json" data-t-redirect="done.html"><input name="a" value="1"></form>
<ul><li data-t-list="books"><form class="row" method="post" action="/_sys/data/x.json" data-t-redirect="book.html?id={books.id}"><button>x</button></form></li></ul>
</body></html>`;
const books = [{ id: 7 }, { id: 8 }];

after(() => { for (const k of ['window', 'document', 'location', 'Node', 'DOMParser']) delete global[k]; });

const hiddenVals = (root) => Array.from(root.querySelectorAll('input[name="data-t-redirect"]')).map(i => i.getAttribute('value'));

test('SSR: top form and per-row forms get one correct hidden input each', async () => {
    const data = { _sys: { query: {}, params: {} } };
    const html = await renderer.processHTML(TEMPLATE, data, async () => null, async () => JSON.parse(JSON.stringify(books)), null);
    const d = new JSDOM(html).window.document;
    assert.deepStrictEqual(hiddenVals(d.getElementById('top')), ['done.html']);
    const rows = Array.from(d.querySelectorAll('form.row')).map(f => hiddenVals(f));
    assert.deepStrictEqual(rows, [['book.html?id=7'], ['book.html?id=8']]);

    // Hydration (twice) on the SSR output must not duplicate or change them
    const dom = new JSDOM(html, { url: 'http://localhost/index.html' });
    global.window = dom.window; global.document = dom.window.document; global.location = dom.window.location;
    global.Node = dom.window.Node; global.DOMParser = dom.window.DOMParser;
    try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, enumerable: true, writable: true }); } catch { }
    window._sys = { query: {}, params: {} };
    window.__BRACIFY_DATA__ = JSON.parse(JSON.stringify({ ...data, books }));
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    await new Promise(r => setTimeout(r, 0));
    delete require.cache[enginePath];
    const Bracify = require('../../lib/engine.cjs');
    await Bracify.initializeBracify();
    await Bracify.initializeBracify();
    assert.deepStrictEqual(hiddenVals(document.getElementById('top')), ['done.html']);
    assert.deepStrictEqual(Array.from(document.querySelectorAll('form.row')).map(f => hiddenVals(f)), [['book.html?id=7'], ['book.html?id=8']]);
});

test('CSR-only: placeholders in data-t-redirect are bound in the hidden input too', async () => {
    const dom = new JSDOM(TEMPLATE, { url: 'http://localhost/index.html' });
    global.window = dom.window; global.document = dom.window.document; global.location = dom.window.location;
    global.Node = dom.window.Node; global.DOMParser = dom.window.DOMParser;
    window._sys = { query: {}, params: {} };
    window.__BRACIFY_DATA__ = { _sys: { query: {}, params: {} }, books };
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    await new Promise(r => setTimeout(r, 0));
    delete require.cache[enginePath];
    const Bracify = require('../../lib/engine.cjs');
    await Bracify.initializeBracify();
    const rows = Array.from(document.querySelectorAll('form.row')).map(f => hiddenVals(f));
    assert.deepStrictEqual(rows, [['book.html?id=7'], ['book.html?id=8']]);
});
