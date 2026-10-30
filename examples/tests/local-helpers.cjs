/**
 * Local (file://, True Zero Server) environment helpers: the real engine.cjs runs in jsdom with a
 * File System Access API directory handle backed by a real folder on disk (not a hand-written fixture).
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const { ENGINE_LIB } = require('./helpers.cjs');

class FsFileHandle {
    constructor(p) { this.kind = 'file'; this.name = path.basename(p); this.p = p; }
    async getFile() {
        const content = fs.readFileSync(this.p, 'utf8');
        return { name: this.name, text: async () => content };
    }
    async createWritable() {
        const p = this.p;
        let buf = '';
        return { write: async (d) => { buf += d; }, close: async () => { fs.writeFileSync(p, buf); } };
    }
}

class FsDirHandle {
    constructor(p) { this.kind = 'directory'; this.name = path.basename(p); this.p = p; }
    async getDirectoryHandle(name) {
        const full = path.join(this.p, name);
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return new FsDirHandle(full);
        throw new Error('NotFoundError: ' + name);
    }
    async getFileHandle(name) {
        const full = path.join(this.p, name);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return new FsFileHandle(full);
        throw new Error('NotFoundError: ' + name);
    }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
}

// Minimal IndexedDB stub (object stores as Maps) so the engine can persist/restore the folder handle.
function createFakeIndexedDB(initial = {}) {
    const stores = { handles: new Map(Object.entries(initial)) };
    return {
        stores,
        open() {
            const request = {};
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: (n) => n in stores },
                    createObjectStore: (n) => { stores[n] = new Map(); },
                    transaction: () => {
                        const tx = {};
                        tx.objectStore = (n) => ({
                            put: (v, k) => { stores[n].set(k, v); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); },
                            delete: (k) => { stores[n].delete(k); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); },
                            get: (k) => {
                                const req = {};
                                setTimeout(() => { req.result = stores[n].get(k); req.onsuccess && req.onsuccess(); }, 0);
                                return req;
                            }
                        });
                        return tx;
                    }
                };
                request.result = db;
                request.onupgradeneeded && request.onupgradeneeded({ target: request });
                request.onsuccess && request.onsuccess({ target: request });
            }, 0);
            return request;
        }
    };
}

// External scripts / stylesheets must fail fast (like a browser without those files), never touch the network.
class Offline extends ResourceLoader { fetch() { return Promise.reject(new Error('offline (test)')); } }

// The engine logs every binding to console.log while running in the browser: keep test output readable.
const originalLog = console.log;
console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[Engine]')) return;
    originalLog.apply(console, args);
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return true; await wait(10); }
    throw new Error('timeout waiting for ' + what);
}

const GLOBAL_KEYS = ['window', 'document', 'DOMParser', 'history', 'location', 'Node', 'HTMLElement', 'HTMLScriptElement', 'FormData'];

/**
 * Open <root>/<page>?<query> as file:// in jsdom with the real engine.
 * @param {object} o
 * @param {string} o.root           app folder on disk (use a temp copy if the test may write)
 * @param {string} [o.page]         file relative to root
 * @param {string} [o.query]        query string without '?'
 * @param {boolean} [o.connected]   a folder handle is stored (True Zero Server mode) - default true
 * @param {boolean} [o.noPicker]    browser without File System Access API
 */
function bootLocal(o) {
    const page = o.page || 'index.html';
    const file = path.join(o.root, page);
    const html = fs.readFileSync(file, 'utf8');
    const url = pathToFileURL(file).href + (o.query ? '?' + o.query : '');
    const dom = new JSDOM(html, { url, resources: new Offline(), runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
    const win = dom.window;
    const rootHandle = new FsDirHandle(o.root);
    const idb = createFakeIndexedDB(o.connected === false ? {} : { root: rootHandle });
    win.indexedDB = idb;
    if (!o.noPicker) win.showDirectoryPicker = async () => rootHandle;
    win.scrollTo = () => { };
    // jsdom (nwsapi) quirk: `link[name="null"]` matches every <link> without a name attribute, while real browsers
    // match nothing. The engine's SPA head sync builds such selectors, so neutralize them to keep jsdom faithful.
    const headQuery = win.document.head.querySelectorAll.bind(win.document.head);
    win.document.head.querySelectorAll = (sel) => headQuery(String(sel).replace(/\[(name|property|href)="null"\]/g, '[$1="__absent__"]'));
    const saved = {};
    const map = {
        window: win, document: win.document, DOMParser: win.DOMParser, history: win.history, location: win.location,
        Node: win.Node, HTMLElement: win.HTMLElement, HTMLScriptElement: win.HTMLScriptElement, FormData: win.FormData
    };
    for (const k of GLOBAL_KEYS) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: map[k], configurable: true, writable: true, enumerable: true });
    }
    // Like a browser on file://: the engine is whatever the page's own <script src> points to (resolved relative to the page)
    const m = html.match(/<script[^>]*\bsrc="([^"]*(?:bracify|engine)\.c?js)"/);
    // Pages without an engine tag (synthetic fixtures in other test suites) and root-absolute srcs (the server's URL
    // space, e.g. /bracify.js, /engine/engine.cjs) get the repository engine
    const enginePath = (m && !m[1].startsWith('/')) ? path.resolve(path.dirname(file), m[1]) : ENGINE_LIB;
    delete require.cache[enginePath];
    const Bracify = require(enginePath); // registers the DOMContentLoaded bootstrap + SPA link/form interception
    const doc = win.document;
    const api = {
        dom, win, doc, Bracify, idb, rootHandle,
        /** Wait until the engine finished rendering the current page (Disconnect button is the last thing it adds). */
        ready: () => until(() => doc.getElementById('bracify-disconnect-btn'), 6000, 'engine render (' + page + ')'),
        /** Click an SPA link and wait for the re-render. */
        async click(sel) {
            const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
            if (!el) throw new Error('nothing to click: ' + sel);
            const btn = doc.getElementById('bracify-disconnect-btn');
            if (btn) btn.remove(); // the SPA swap re-adds it once rendering completes
            el.click();
            await api.ready();
        },
        /** Submit a GET form through the engine's SPA form interception. */
        async submit(form) {
            const btn = doc.getElementById('bracify-disconnect-btn');
            if (btn) btn.remove();
            form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
            await api.ready();
        },
        cleanup() {
            for (const k of GLOBAL_KEYS) {
                if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k];
            }
            delete require.cache[enginePath];
            win.close();
        }
    };
    return api;
}

module.exports = { FsDirHandle, FsFileHandle, createFakeIndexedDB, bootLocal, until, wait };
