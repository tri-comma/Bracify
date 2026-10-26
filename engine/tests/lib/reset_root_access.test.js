import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

// --- SSR first: no window/document globals exist yet ---
test('SSR output contains no folder access UI', async () => {
    assert.strictEqual(typeof globalThis.window, 'undefined');
    const { processHTML } = require('../../server/renderer.cjs');
    const out = await processHTML('<html><body><h1>Hi</h1></body></html>', {}, async () => null);
    assert.ok(!out.includes('bracify-disconnect-btn'));
    assert.ok(!out.includes('bracify-init-overlay'));
    assert.ok(!out.includes('Disconnect Folder'));
    assert.strictEqual(typeof require('../../lib/engine.cjs').resetRootAccess, 'undefined');
});

// --- Minimal IndexedDB stub (single DB, object stores as Maps) ---
function createFakeIndexedDB(initial = {}) {
    const stores = { handles: new Map(Object.entries(initial)) };
    const fake = {
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
    return fake;
}

const fakeHandle = {
    kind: 'directory', name: 'proj',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async () => { throw new Error('nf'); },
    getDirectoryHandle: async () => { throw new Error('nf'); }
};

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 2000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return true; await wait(10); }
    return false;
}

// Boots the real engine in a fresh jsdom (file:// URL). Engine is required before DOMContentLoaded fires.
function boot({ url = 'file:///project/index.html', stored = {} } = {}) {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="app">App</div></body></html>', { url });
    const idb = createFakeIndexedDB(stored);
    dom.window.indexedDB = idb;
    dom.window.showDirectoryPicker = async () => fakeHandle;
    dom.window.scrollTo = () => { };
    Object.assign(globalThis, {
        window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser,
        history: dom.window.history, location: dom.window.location, Node: dom.window.Node,
        HTMLElement: dom.window.HTMLElement, HTMLScriptElement: dom.window.HTMLScriptElement,
        FormData: dom.window.FormData
    });
    delete require.cache[enginePath];
    const Bracify = require('../../lib/engine.cjs');
    return { dom, idb, Bracify, doc: dom.window.document };
}

test('restores stored handle and shows Disconnect Folder button in local mode', async () => {
    const { idb, Bracify, doc } = boot({ stored: { root: fakeHandle } });
    assert.ok(await until(() => doc.getElementById('bracify-disconnect-btn')), 'button should exist');
    assert.strictEqual(doc.getElementById('bracify-init-overlay'), null);
    assert.strictEqual(Bracify.rootHandle, fakeHandle);
    assert.ok(idb.stores.handles.has('root'));
});

test('clicking Disconnect Folder clears storage and shows overlay', async () => {
    const { idb, Bracify, doc } = boot({ stored: { root: fakeHandle } });
    const btn = await until(() => doc.getElementById('bracify-disconnect-btn')) && doc.getElementById('bracify-disconnect-btn');
    btn.click();
    assert.ok(await until(() => doc.getElementById('bracify-init-overlay')), 'overlay should show');
    assert.strictEqual(idb.stores.handles.has('root'), false);
    assert.strictEqual(Bracify.rootHandle, null);
    assert.strictEqual(doc.getElementById('bracify-disconnect-btn'), null);
    assert.ok(doc.getElementById('bracify-btn-choose'));
});

test('resetRootAccess() returns a Promise, clears storage and shows overlay', async () => {
    const { idb, Bracify, doc } = boot({ stored: { root: fakeHandle } });
    await until(() => Bracify.rootHandle);
    const p = Bracify.resetRootAccess();
    assert.ok(p && typeof p.then === 'function');
    await p;
    assert.strictEqual(idb.stores.handles.has('root'), false);
    assert.strictEqual(Bracify.rootHandle, null);
    assert.ok(doc.getElementById('bracify-init-overlay'));
    // calling again does not duplicate the overlay
    await Bracify.resetRootAccess();
    assert.strictEqual(doc.querySelectorAll('#bracify-init-overlay').length, 1);
});

test('?bracify_reset=1 clears stored handle, shows overlay and strips the param', async () => {
    const { idb, Bracify, doc, dom } = boot({
        url: 'file:///project/index.html?bracify_reset=1&keep=2#top', stored: { root: fakeHandle }
    });
    assert.ok(await until(() => doc.getElementById('bracify-init-overlay')), 'overlay should show');
    assert.strictEqual(idb.stores.handles.has('root'), false);
    assert.strictEqual(Bracify.rootHandle, null);
    assert.ok(!dom.window.location.search.includes('bracify_reset'));
    assert.ok(dom.window.location.search.includes('keep=2'));
    assert.strictEqual(dom.window.location.hash, '#top');
});

test('no reset parameter: stored handle is kept, no overlay', async () => {
    const { idb, doc } = boot({ stored: { root: fakeHandle } });
    await until(() => doc.getElementById('bracify-disconnect-btn'));
    assert.strictEqual(doc.getElementById('bracify-init-overlay'), null);
    assert.ok(idb.stores.handles.has('root'));
});

test('no Disconnect button when no folder is connected', async () => {
    const { doc } = boot();
    assert.ok(await until(() => doc.getElementById('bracify-init-overlay')));
    assert.strictEqual(doc.getElementById('bracify-disconnect-btn'), null);
});

test('no overlay and no button outside file:// mode', async () => {
    const { doc } = boot({ url: 'http://localhost:3000/index.html' });
    await wait(150);
    assert.strictEqual(doc.getElementById('bracify-init-overlay'), null);
    assert.strictEqual(doc.getElementById('bracify-disconnect-btn'), null);
});

test('resetRootAccess during a pending permission check is not overridden by the restore', async () => {
    let release;
    const slow = {
        ...fakeHandle,
        queryPermission: () => new Promise(r => { release = () => r('granted'); })
    };
    const { Bracify, doc } = boot({ stored: { root: slow } });
    await until(() => release);
    await Bracify.resetRootAccess();
    release();
    await wait(100);
    assert.strictEqual(Bracify.rootHandle, null);
    assert.strictEqual(doc.querySelectorAll('#bracify-init-overlay').length, 1);
    assert.strictEqual(doc.getElementById('bracify-disconnect-btn'), null);
});

test('Studio page (real index.html + layout partial) shows the engine disconnect button on file://', async () => {
    const fs = require('fs');
    const path = require('path');
    const studioDir = path.resolve(path.dirname(enginePath), '..', '..', 'studio');
    const mk = (p) => {
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            return {
                kind: 'directory', name: path.basename(p),
                getDirectoryHandle: async (n) => { const c = path.join(p, n); if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return mk(c); throw new Error('nf'); },
                getFileHandle: async (n) => { const c = path.join(p, n); if (fs.existsSync(c) && fs.statSync(c).isFile()) return mk(c); throw new Error('nf'); },
                queryPermission: async () => 'granted', requestPermission: async () => 'granted'
            };
        }
        return { kind: 'file', name: path.basename(p), getFile: async () => ({ text: async () => fs.readFileSync(p, 'utf8') }) };
    };
    const root = mk(studioDir);
    const { doc, Bracify, dom } = boot({ url: 'file:///studio/index.html', stored: { root } });
    const html = fs.readFileSync(path.join(studioDir, 'index.html'), 'utf8');
    const parsed = new dom.window.DOMParser().parseFromString(html, 'text/html');
    await until(() => Bracify.rootHandle);
    // render the real Studio page through the engine
    doc.body.innerHTML = parsed.body.innerHTML;
    doc.body.setAttribute('data-t-include', parsed.body.getAttribute('data-t-include'));
    await Bracify.initializeBracify();
    assert.ok(doc.querySelector('.studio-header'), 'layout partial should be included');
    const btn = doc.getElementById('bracify-disconnect-btn');
    assert.ok(btn, 'engine disconnect button should exist on Studio');
    assert.notStrictEqual(btn.style.display, 'none');
    assert.ok(!btn.hidden);
});
