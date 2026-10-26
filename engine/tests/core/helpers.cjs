/**
 * Shared helpers for the core template feature tests (issue #13).
 * Not a test file itself (does not match *.test.js).
 */
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { processHTML } = require('../../server/renderer.cjs');

const enginePath = require.resolve('../../lib/engine.cjs');

/**
 * SSR: render an HTML string through the real server renderer.
 * @param {string} html
 * @param {object} [opts]
 * @param {object} [opts.data]   initial data context (e.g. { _sys: { query: {} } })
 * @param {object} [opts.files]  virtual include files: { 'path': 'html' }
 * @param {object} [opts.sources] data sources keyed by entity: { articles: [...] }
 *                               (served through the dataFetcher; honours the same
 *                               query-string filtering as the CSR local fetcher is NOT applied here)
 * @returns {Promise<{ doc: Document, html: string, data: object }>}
 */
async function ssr(html, opts = {}) {
    const data = opts.data || { _sys: { query: {}, params: {} } };
    const files = opts.files || {};
    const sources = opts.sources || {};
    const out = await processHTML(
        html,
        data,
        async (p) => (p in files ? files[p] : null),
        async (href) => {
            const m = href.match(/_sys\/data\/([a-zA-Z0-9_-]+)\.json/);
            return m && m[1] in sources ? sources[m[1]] : null;
        }
    );
    const doc = new JSDOM(out).window.document;
    return { doc, html: out, data };
}

/**
 * CSR: load the real engine.cjs into a jsdom window and run initializeBracify().
 * The engine is required only after the document has finished loading, so its
 * automatic DOMContentLoaded bootstrap does not fire and run a second time.
 *
 * @param {string} html
 * @param {object} [opts]
 * @param {string} [opts.url]    page URL (query string becomes _sys.query)
 * @param {object} [opts.files]  files served by the stubbed fetch(): { 'path': 'text' }
 *                               (leading slash is ignored; JSON files may be objects)
 * @param {object} [opts.hydrated] window.__BRACIFY_DATA__ (SSR-injected data)
 * @param {Function} [opts.fetcher] window.BracifyFetcher override
 * @returns {Promise<{ Bracify, document, window, fetched: string[], cleanup: Function }>}
 */
async function csr(html, opts = {}) {
    // Script-tag loading (the engine's file:// fallback for data) must fail like a browser 404,
    // without touching the real network: every external resource request is rejected.
    class Offline extends ResourceLoader { fetch() { return Promise.reject(new Error('offline (test)')); } }
    const dom = new JSDOM(html, {
        url: opts.url || 'http://localhost/',
        resources: new Offline(),
        runScripts: 'dangerously',
        virtualConsole: new VirtualConsole()
    });
    await new Promise((resolve) => {
        if (dom.window.document.readyState === 'complete') resolve();
        else dom.window.addEventListener('load', resolve);
    });

    const saved = {};
    const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(global, k); Object.defineProperty(global, k, { value: v, configurable: true, writable: true, enumerable: true }); };
    set('window', dom.window);
    set('document', dom.window.document);
    set('location', dom.window.location);
    set('Node', dom.window.Node);
    set('DOMParser', dom.window.DOMParser);

    const fetched = [];
    const files = opts.files || {};
    const origFetch = global.fetch;
    global.fetch = async (p) => {
        const key = String(p).split('?')[0].replace(/^\//, '');
        fetched.push(String(p));
        if (!(key in files)) return { ok: false, status: 404, text: async () => '', json: async () => { throw new Error('404'); } };
        const body = files[key];
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
    };

    if (opts.hydrated) dom.window.__BRACIFY_DATA__ = opts.hydrated;
    if (opts.fetcher) dom.window.BracifyFetcher = opts.fetcher;

    delete require.cache[enginePath];
    const Bracify = require('../../lib/engine.cjs');
    await Bracify.initializeBracify();

    return {
        Bracify,
        document: dom.window.document,
        window: dom.window,
        fetched,
        cleanup() {
            global.fetch = origFetch;
            for (const k of Object.keys(saved)) {
                if (saved[k]) Object.defineProperty(global, k, saved[k]);
                else delete global[k];
            }
            delete require.cache[enginePath];
            dom.window.close();
        }
    };
}

/** Create an isolated project directory on disk. files: { 'rel/path': 'content' } */
function makeProject(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-core-'));
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return dir;
}

async function removeDir(dir) {
    for (let i = 0; i < 5; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); return; }
        catch (e) { await new Promise(r => setTimeout(r, 100)); }
    }
}

const pending = [];
function cleanupAll() { while (pending.length) pending.pop()(); }

/**
 * Render a page in the given mode ('ssr' | 'csr') and return the resulting Document.
 * @param {'ssr'|'csr'} mode
 * @param {string} body  inner HTML of <body>
 * @param {object} [o]
 * @param {string} [o.head]      inner HTML of <head> (e.g. data-t-source links)
 * @param {object} [o.sources]   { entity: json } served for _sys/data/<entity>.json
 * @param {object} [o.files]     include files { 'path': 'html' }
 * @param {object} [o.query]     URL query parameters (_sys.query)
 * @param {string} [o.bodyAttrs] attributes for <body> (e.g. data-t-include)
 */
async function render(mode, body, o = {}) {
    const html = '<!DOCTYPE html><html><head>' + (o.head || '') + '</head><body ' + (o.bodyAttrs || '') + '>' + body + '</body></html>';
    const query = o.query || {};
    const sources = o.sources || {};
    const files = o.files || {};
    if (mode === 'ssr') {
        const { doc } = await ssr(html, { data: { _sys: { query, params: {} } }, files, sources });
        return doc;
    }
    const qs = new URLSearchParams(query).toString();
    const csrFiles = { ...files };
    for (const [k, v] of Object.entries(sources)) csrFiles['_sys/data/' + k + '.json'] = v;
    const r = await csr(html, { url: 'http://localhost/page.html' + (qs ? '?' + qs : ''), files: csrFiles });
    pending.push(r.cleanup);
    return r.document;
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

module.exports = { ssr, csr, render, cleanupAll, makeProject, removeDir, text };
