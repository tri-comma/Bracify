/**
 * Issue #55: every example page loads the client engine with ONE relative script tag (bracify.js / ../bracify.js).
 * The server answers that URL with its own engine; on file:// the page loads the committed copy next to the pages.
 * That copy must never drift from engine/lib/engine.cjs.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const h = require('./helpers.cjs');

// Public pages only: "_"-prefixed folders (_parts, _sys) are partials / data, not pages
function pages(dir, rel = '') {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('_')) continue;
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) out.push(...pages(path.join(dir, e.name), r));
        else if (e.name.endsWith('.html')) out.push(r);
    }
    return out;
}

const ENGINE_COPY = path.join(h.APP_DIR, 'bracify.js');

describe('examples load the engine through the single bracify.js URL', () => {
    const list = pages(h.APP_DIR);

    test('there are example pages to check', () => {
        assert.ok(list.length >= 10, String(list.length));
    });

    for (const page of list) {
        test(`${page}: exactly one engine script tag, relative bracify.js`, () => {
            const doc = new JSDOM(fs.readFileSync(path.join(h.APP_DIR, page), 'utf-8')).window.document;
            const srcs = Array.from(doc.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
            const engine = srcs.filter(s => /(^|\/)(bracify|engine)\.c?js$/.test(s));
            const depth = page.split('/').length - 1;
            const expected = '../'.repeat(depth) + 'bracify.js';
            assert.deepStrictEqual(engine, [expected], `${page} script tags: ${JSON.stringify(srcs)}`);
            assert.ok(!/\/engine\/|engine\/lib/.test(doc.documentElement.outerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '')),
                `${page} must not reference the repository layout or /engine/`);
            // file:// mode: the tag must resolve to a real file next to the pages
            assert.ok(fs.existsSync(path.resolve(h.APP_DIR, path.dirname(page), expected)), `${expected} must exist relative to ${page}`);
        });
    }

    test('examples/bracify-books/bracify.js is byte-identical to engine/lib/engine.cjs (run `npm run sync:examples` after changing the engine)', () => {
        assert.ok(fs.existsSync(ENGINE_COPY), 'examples/bracify-books/bracify.js is missing: run `npm run sync:examples`');
        const same = Buffer.compare(fs.readFileSync(ENGINE_COPY), fs.readFileSync(h.ENGINE_LIB)) === 0;
        assert.ok(same, 'examples/bracify-books/bracify.js differs from engine/lib/engine.cjs: run `npm run sync:examples`');
    });

    test('server mode: the page tag resolves to the engine through the real server', async () => {
        const appDir = h.makeAppCopy();
        const server = await h.startServer(appDir);
        try {
            const res = await fetch(server.base + '/bracify.js');
            assert.strictEqual(res.status, 200);
            assert.match(res.headers.get('content-type') || '', /^text\/javascript\b/i);
            assert.strictEqual(await res.text(), fs.readFileSync(h.ENGINE_LIB, 'utf-8'));
            const html = await (await fetch(server.base + '/index.html')).text();
            assert.strictEqual((html.match(/<script[^>]*\bsrc="bracify\.js"/g) || []).length, 1);
        } finally {
            await server.stop();
            await h.removeDir(appDir);
        }
    });
});
