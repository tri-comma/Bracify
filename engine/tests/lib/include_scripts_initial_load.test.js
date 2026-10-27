import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');
const { ssr } = require('../core/helpers.cjs');

// Issue #48: <script> tags inside a data-t-include partial must run exactly once on the initial CSR load
// (like SSR, where they are part of the static HTML). The engine inserts includes with innerHTML, which browsers
// never execute; hydrateScripts() only ran from navigate().

/** External scripts are served from memory ({ 'ext.js': 'code' }); everything else fails like a 404. */
class MemoryLoader extends ResourceLoader {
    constructor(scripts) { super(); this.scripts = scripts; }
    fetch(url) {
        const key = String(url).split('/').pop();
        if (key in this.scripts) return Promise.resolve(Buffer.from(this.scripts[key]));
        return Promise.reject(new Error('offline (test): ' + url));
    }
}

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

/**
 * Local-mode style CSR boot: page scripts run at parse time (runScripts: 'dangerously'), then the real engine
 * runs initializeBracify() with includes served by a stubbed fetch().
 */
async function boot(html, { files = {}, scripts = {}, url = 'http://localhost/index.html' } = {}) {
    const dom = new JSDOM(html, { url, resources: new MemoryLoader(scripts), runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
    await new Promise((resolve) => {
        if (dom.window.document.readyState === 'complete') resolve();
        else dom.window.addEventListener('load', resolve);
    });
    dom.window.scrollTo = () => { };
    const saved = {};
    const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(global, k); Object.defineProperty(global, k, { value: v, configurable: true, writable: true, enumerable: true }); };
    set('window', dom.window);
    set('document', dom.window.document);
    set('location', dom.window.location);
    set('history', dom.window.history);
    set('Node', dom.window.Node);
    set('DOMParser', dom.window.DOMParser);
    const origFetch = global.fetch;
    global.fetch = async (p) => {
        const key = String(p).split('?')[0].replace(/^\//, '');
        if (!(key in files)) return { ok: false, status: 404, text: async () => '' };
        return { ok: true, status: 200, text: async () => files[key] };
    };
    delete require.cache[enginePath];
    const Bracify = require(enginePath);
    cleanups.push(() => {
        global.fetch = origFetch;
        for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(global, k, saved[k]); else delete global[k]; }
        delete require.cache[enginePath];
        dom.window.close();
    });
    await Bracify.initializeBracify();
    return { Bracify, window: dom.window, document: dom.window.document };
}

const page = (body) => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
const PART = '<span id="s">part</span><script>window.__ran=(window.__ran||0)+1;</script>';

describe('Issue #48: scripts of data-t-include partials on the initial CSR load', () => {
    test('partial script runs exactly once; page script still runs once (issue repro)', async () => {
        const { window, document } = await boot(
            page('<div data-t-include="_parts/s.html"></div><script>window.__body=(window.__body||0)+1;</script>'),
            { files: { '_parts/s.html': PART } });
        assert.strictEqual(document.getElementById('s').textContent, 'part', 'partial markup is rendered');
        assert.strictEqual(window.__body, 1, 'page script ran once');
        assert.strictEqual(window.__ran, 1, 'partial script ran exactly once');
    });

    test('guard: a page script (not from an include) is never executed a second time', async () => {
        const { window } = await boot(
            page('<div data-t-include="_parts/s.html"></div><script>window.__page=(window.__page||0)+1;</script>'),
            { files: { '_parts/s.html': PART } });
        assert.strictEqual(window.__page, 1, 'page script ran exactly once');
    });

    test('guard: a page without includes runs its scripts once', async () => {
        const { window } = await boot(page('<p>x</p><script>window.__page=(window.__page||0)+1;</script>'));
        assert.strictEqual(window.__page, 1);
    });

    test('nested include: the script of an include inside an include runs once', async () => {
        const { window, document } = await boot(
            page('<div data-t-include="_parts/outer.html"></div>'),
            {
                files: {
                    '_parts/outer.html': '<div id="o"><div data-t-include="_parts/s.html"></div></div><script>window.__outer=(window.__outer||0)+1;</script>',
                    '_parts/s.html': PART
                }
            });
        assert.ok(document.querySelector('#o #s'), 'nested partial markup is rendered');
        assert.strictEqual(window.__outer, 1, 'outer partial script ran once');
        assert.strictEqual(window.__ran, 1, 'nested partial script ran once');
    });

    test('external <script src> in a partial is loaded and executed once', async () => {
        const { window } = await boot(
            page('<div data-t-include="_parts/e.html"></div>'),
            {
                files: { '_parts/e.html': '<span id="e">ext</span><script src="ext.js"></script>' },
                scripts: { 'ext.js': 'window.__ext=(window.__ext||0)+1;' }
            });
        // external scripts load asynchronously in jsdom
        const end = Date.now() + 2000;
        while (window.__ext === undefined && Date.now() < end) await new Promise(r => setTimeout(r, 20));
        await new Promise(r => setTimeout(r, 100));
        assert.strictEqual(window.__ext, 1, 'external partial script executed exactly once');
    });

    test('SPA navigation to a page with the same partial still runs its script (once per page view)', async () => {
        const { Bracify, window } = await boot(
            page('<div data-t-include="_parts/s.html"></div><a href="b.html">b</a>'),
            {
                files: {
                    '_parts/s.html': PART,
                    'b.html': page('<div data-t-include="_parts/s.html"></div>')
                }
            });
        assert.strictEqual(window.__ran, 1, 'ran once on the initial page');
        await Bracify.navigate('b.html');
        assert.strictEqual(window.__ran, 2, 'ran once more for the navigated page (not twice)');
    });

    test('server mode: partial scripts already in the SSR HTML are not run again on hydration', async () => {
        // SSR output has the include expanded (no data-t-include left): the script is static HTML and runs at parse time.
        const { html } = await ssr(
            page('<div data-t-include="_parts/s.html"></div>'),
            { files: { '_parts/s.html': PART } });
        assert.ok(html.includes('window.__ran'), 'SSR output contains the partial script');
        assert.ok(!html.includes('data-t-include'), 'SSR output has no include left to re-insert');
        const { window } = await boot(html, { url: 'http://localhost/index.html' });
        assert.strictEqual(window.__ran, 1, 'script ran once (at parse), not again during hydration');
    });
});

describe('Issue #48 review: script types and special regions on the initial CSR load', () => {
    test('type="application/json" in a partial is left untouched and parseable', async () => {
        const json = '{"a":1}';
        const { document } = await boot(page('<div data-t-include="_parts/j.html"></div>'),
            { files: { '_parts/j.html': '<script type="application/json" id="j">' + json + '</script>' } });
        const el = document.getElementById('j');
        assert.strictEqual(el.textContent, json);
        assert.deepStrictEqual(JSON.parse(el.textContent), { a: 1 });
    });

    test('type="text/template" in a partial keeps its text', async () => {
        const tpl = '<b>{x}</b>';
        const { document } = await boot(page('<div data-t-include="_parts/t.html"></div>'),
            { files: { '_parts/t.html': '<script type="text/template" id="t">' + tpl + '</script>' } });
        assert.strictEqual(document.getElementById('t').textContent, tpl);
    });

    test('type="module" in a partial is not IIFE-wrapped and keeps text and attributes', async () => {
        const code = 'export const a = 1;';
        const { document } = await boot(page('<div data-t-include="_parts/m.html"></div>'),
            { files: { '_parts/m.html': '<script type="module" id="m">' + code + '</script>' } });
        const el = document.getElementById('m');
        assert.strictEqual(el.textContent, code);
        assert.strictEqual(el.getAttribute('type'), 'module');
    });

    test('a script inside <template> in a partial is not executed', async () => {
        const { window } = await boot(page('<div data-t-include="_parts/p.html"></div>'),
            { files: { '_parts/p.html': '<template><script>window.__tpl=(window.__tpl||0)+1;</script></template>' } });
        assert.strictEqual(window.__tpl, undefined);
    });

    test('page scripts inside data-t-scope and data-t-if regions run exactly once', async () => {
        const { window } = await boot(page(
            '<div data-t-scope="{}"><script>window.__sc=(window.__sc||0)+1;</script></div>' +
            '<div data-t-if="true"><script>window.__if=(window.__if||0)+1;</script></div>'));
        assert.strictEqual(window.__sc, 1);
        assert.strictEqual(window.__if, 1);
    });

    test('documented limitation: a page script inside a data-t-list template runs at parse plus once per row', async () => {
        const { window, document } = await boot(page(
            '<script>window.__BRACIFY_DATA__={items:[{n:1},{n:2}]};</script><ul><li data-t-list="items"><script>window.__li=(window.__li||0)+1;</script></li></ul>'));
        assert.strictEqual(document.querySelectorAll('li').length, 2, 'two rows rendered');
        assert.strictEqual(window.__li, 1 + 2, 'parse-time run plus one per cloned row (accepted, see engine comment)');
    });
});
