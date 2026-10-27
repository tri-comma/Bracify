import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #67: the SSR template cache (keyed by request path) was built by resolving includes
// with an EMPTY query, so dynamic includes (data-t-include="{?p}", "{_sys.query.p}", "{article.template}") resolved
// to an empty path and were dropped. From the 2nd request on the include stayed empty whatever ?p= said.
// Every test below requests the SAME page file several times on ONE server instance (unlike
// include_traversal.test.js / include_cycle.test.js, which copy the page to a new file per request to dodge this).

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const SECRET_PARENT = 'SECRET-PARENT-DIR-67ab';

async function withProject(pages, fn) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-dyninc-'));
    const dir = path.join(parent, 'proj');
    fs.mkdirSync(path.join(dir, '_sys', 'data'), { recursive: true });
    fs.mkdirSync(path.join(dir, '_parts'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'secret.html'), `<p>${SECRET_PARENT}</p>`);
    fs.writeFileSync(path.join(dir, '_parts', 'header.html'), '<header>STATIC-HEADER</header>');
    fs.writeFileSync(path.join(dir, '_parts', 'a.html'), '<p>PART-A</p>');
    fs.writeFileSync(path.join(dir, '_parts', 'b.html'), '<p>PART-B</p>');
    fs.writeFileSync(path.join(dir, '_parts', 'wrap.html'), '<section>WRAP-START<div data-t-include="{?p}"></div>WRAP-END</section>');
    for (const [name, html] of Object.entries(pages)) {
        fs.writeFileSync(path.join(dir, name), `<!DOCTYPE html><html><body>${html}</body></html>`);
    }
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const get = async (page, query = '') => {
        const res = await fetch(`http://localhost:${port}/${page}${query}`);
        return { status: res.status, body: await res.text() };
    };
    const q = (p) => `?p=${encodeURIComponent(p)}`;
    try {
        await fn({ server, dir, parent, get, q });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(parent, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

// Asserts the response contains exactly the expected one of PART-A / PART-B
const only = (body, want, label) => {
    const other = want === 'PART-A' ? 'PART-B' : 'PART-A';
    assert.ok(body.includes(want), `${label}: expected ${want}, got: ${body.slice(0, 300)}`);
    assert.ok(!body.includes(other), `${label}: unexpected ${other}`);
};

test('Dynamic include cache: {?p} resolves per request on the same page (A then B)', async () => {
    await withProject({ 'dyn.html': '<div data-t-include="{?p}"></div>' }, async ({ get, q }) => {
        only((await get('dyn.html', q('_parts/a.html'))).body, 'PART-A', '1st (A)');
        only((await get('dyn.html', q('_parts/b.html'))).body, 'PART-B', '2nd (B)');
    });
});

test('Dynamic include cache: {?p} order B, A, B and repeated A on the same page', async () => {
    await withProject({ 'dyn.html': '<div data-t-include="{?p}"></div>' }, async ({ get, q }) => {
        only((await get('dyn.html', q('_parts/b.html'))).body, 'PART-B', '1st (B)');
        only((await get('dyn.html', q('_parts/a.html'))).body, 'PART-A', '2nd (A)');
        only((await get('dyn.html', q('_parts/b.html'))).body, 'PART-B', '3rd (B)');
        only((await get('dyn.html', q('_parts/a.html'))).body, 'PART-A', '4th (A)');
    });
});

test('Dynamic include cache: {_sys.query.p} resolves per request', async () => {
    await withProject({ 'dyn.html': '<main data-t-include="{_sys.query.p}"></main>' }, async ({ get, q }) => {
        only((await get('dyn.html', q('_parts/a.html'))).body, 'PART-A', '1st (A)');
        only((await get('dyn.html', q('_parts/b.html'))).body, 'PART-B', '2nd (B)');
        only((await get('dyn.html', q('_parts/a.html'))).body, 'PART-A', '3rd (A)');
    });
});

test('Dynamic include cache: data-derived {article.template} follows the record on every request', async () => {
    const db = require('../../server/db/index.cjs');
    const entity = 'dyninc_articles';
    const page = '<link data-t-source="article" href="_sys/data/' + entity + '.json?_limit=1">' +
        '<div data-t-include="{article.template}"></div>';
    await withProject({ 'art.html': page }, async ({ get }) => {
        try {
            await db.put(entity, { template: '_parts/a.html' });
            only((await get('art.html')).body, 'PART-A', '1st (record -> A)');
            await db.put(entity, { template: '_parts/b.html' });
            only((await get('art.html')).body, 'PART-B', '2nd (record -> B)');
            await db.put(entity, { template: '_parts/a.html' });
            only((await get('art.html')).body, 'PART-A', '3rd (record -> A)');
        } finally {
            try { await db.delete(entity); } catch { }
        }
    });
});

test('Dynamic include cache: static include stays rendered on every request next to a dynamic one (guard)', async () => {
    const page = '<div data-t-include="_parts/header.html"></div><main data-t-include="{?p}"></main>';
    await withProject({ 'mix.html': page }, async ({ get, q }) => {
        for (const [p, want] of [['_parts/a.html', 'PART-A'], ['_parts/b.html', 'PART-B'], ['_parts/a.html', 'PART-A']]) {
            const r = await get('mix.html', q(p));
            assert.ok(r.body.includes('STATIC-HEADER'), `static include missing for ${p}: ${r.body.slice(0, 300)}`);
            only(r.body, want, `dynamic include for ${p}`);
        }
    });
});

test('Dynamic include cache: a static-only page is still served identically from the cache (guard)', async () => {
    await withProject({ 'static.html': '<div data-t-include="_parts/header.html"></div>' }, async ({ get }) => {
        for (let i = 0; i < 3; i++) {
            const r = await get('static.html');
            assert.strictEqual(r.body.split('STATIC-HEADER').length - 1, 1, `request ${i + 1}: ${r.body.slice(0, 300)}`);
        }
    });
});

test('Dynamic include cache: dynamic include inside a static partial resolves per request', async () => {
    await withProject({ 'nest.html': '<div data-t-include="_parts/wrap.html"></div>' }, async ({ get, q }) => {
        const r1 = await get('nest.html', q('_parts/a.html'));
        assert.ok(r1.body.includes('WRAP-START') && r1.body.includes('WRAP-END'), 'wrapper missing (1st)');
        only(r1.body, 'PART-A', '1st (A)');
        const r2 = await get('nest.html', q('_parts/b.html'));
        assert.ok(r2.body.includes('WRAP-START') && r2.body.includes('WRAP-END'), 'wrapper missing (2nd)');
        only(r2.body, 'PART-B', '2nd (B)');
    });
});

test('Dynamic include cache: traversal and _sys guards still apply on cached requests', async () => {
    await withProject({ 'dyn.html': '<div data-t-include="{?p}"></div>' }, async ({ get, q }) => {
        await get('dyn.html', q('_parts/a.html')); // 1st request: populates the cache
        for (const p of ['../secret.html', '_parts/../../secret.html', '_sys/data/x.json', '..\\secret.html']) {
            const r = await get('dyn.html', q(p));
            assert.ok(!r.body.includes(SECRET_PARENT), `leaked via cached request p=${p}`);
        }
        // and a legit include still works afterwards
        only((await get('dyn.html', q('_parts/b.html'))).body, 'PART-B', 'legit after blocked requests');
    });
});

test('Dynamic include cache: dynamic include inside a data-t-list template resolves per request', async () => {
    const db = require('../../server/db/index.cjs');
    const entity = 'dyninc_items';
    const page = '<link data-t-source="items" href="_sys/data/' + entity + '.json">' +
        '<ul><li data-t-list="items"><div data-t-include="{?p}"></div></li></ul>';
    await withProject({ 'list.html': page }, async ({ get, q }) => {
        try {
            await db.put(entity, { name: 'one' });
            only((await get('list.html', q('_parts/a.html'))).body, 'PART-A', '1st (A)');
            only((await get('list.html', q('_parts/b.html'))).body, 'PART-B', '2nd (B)');
        } finally {
            try { await db.delete(entity); } catch { }
        }
    });
});
