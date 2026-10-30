import { test, describe, afterEach, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');

// Issue #55: syncHead() / hydrateScripts() recognise the engine's own <script> by its file name so SPA navigation
// neither removes it from <head> nor executes it a second time. The single engine URL is bracify.js; the legacy
// engine.js / engine.cjs names keep working. A stand-in script counts its executions in window.__engineRuns.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class MemoryLoader extends ResourceLoader {
    fetch(url) {
        const name = String(url).split('?')[0].split('/').pop();
        if (['bracify.js', 'engine.js', 'engine.cjs'].includes(name)) {
            return Promise.resolve(Buffer.from('window.__engineRuns = (window.__engineRuns || 0) + 1;'));
        }
        return Promise.reject(new Error('offline (test): ' + url));
    }
}

let dom;
const saved = {};

const render = (title, src) => `<!DOCTYPE html><html><head><title>${title}</title>
<script src="${src}"></script></head><body>
<h1>${title}</h1><a href="/b.html" id="to-b">B</a><a href="/a.html" id="to-a">A</a>
<script src="${src}" id="body-engine"></script>
</body></html>`;

async function setup(src, url = 'http://localhost/a.html') {
    dom = new JSDOM(render('A', src), { url, resources: new MemoryLoader(), runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
    const w = dom.window;
    const set = (k, v) => { saved[k] = saved[k] || Object.getOwnPropertyDescriptor(global, k); Object.defineProperty(global, k, { value: v, configurable: true, writable: true, enumerable: true }); };
    set('window', w); set('document', w.document); set('location', w.location); set('history', w.history);
    set('Node', w.Node); set('DOMParser', w.DOMParser); set('FormData', w.FormData); set('URL', w.URL); set('URLSearchParams', w.URLSearchParams);
    w.scrollTo = () => { };
    w.BracifyFetcher = async () => null;
    // Every page fetched during SPA navigation carries the same engine tags
    const f = async (r) => ({ ok: true, status: 200, text: async () => render(String(r).includes('b.html') ? 'B' : 'A', src) });
    w.fetch = f;
    set('fetch', f);
    delete require.cache[enginePath];
    const Bracify = require(enginePath);
    await Bracify.initializeBracify();
    // DOMContentLoaded (SPA listeners) and the external engine stand-ins load asynchronously
    const end = Date.now() + 3000;
    while (Date.now() < end && dom.window.__engineRuns !== 2) await sleep(5);
    await sleep(50);
}

const h1 = () => document.querySelector('h1').textContent;
async function go(id, expected) {
    document.getElementById(id).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const end = Date.now() + 3000;
    while (Date.now() < end && h1() !== expected) await sleep(5);
    assert.strictEqual(h1(), expected, 'navigation must complete');
    await sleep(50);
}

afterEach(() => { dom && dom.window.close(); delete require.cache[enginePath]; });
after(() => {
    for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(global, k, saved[k]); else delete global[k]; }
});

describe('SPA navigation keeps the engine script alone (#55)', () => {
    for (const src of ['bracify.js', '../bracify.js', '/bracify.js', 'engine.js', '/engine/engine.cjs']) {
        test(`${src}: stays in <head> and is not executed again`, async () => {
            await setup(src);
            const before = document.head.querySelector('script[src]');
            assert.ok(before, 'precondition: engine script in head');
            assert.strictEqual(dom.window.__engineRuns, 2, 'precondition: head + body tags ran once each on load');
            await go('to-b', 'B');
            await go('to-a', 'A');
            assert.strictEqual(document.head.querySelector('script[src]'), before, 'the very same head <script> element is kept');
            assert.strictEqual(document.head.querySelectorAll('script[src]').length, 1, 'no duplicate engine tag in head');
            assert.strictEqual(dom.window.__engineRuns, 2, 'engine script must not run again after SPA navigation');
        });
    }
});
