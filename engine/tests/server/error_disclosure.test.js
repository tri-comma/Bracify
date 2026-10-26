import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Regression tests for Issue #44: error responses must not leak stack traces,
// absolute paths or raw internal error messages; form failures follow PRG.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();
const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SECRET = 'SQLITE_ERROR at C:\\secret\\path';
const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_H = { 'Content-Type': 'application/json' };

async function withServer(fn, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-errdisc-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>HELLO-PROJECT</body></html>');
    const server = new EngineServer(0, () => {}, { sqlite3, ...options });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://localhost:${port}`;
    try {
        await fn({ server, base, dir, host: `localhost:${port}` });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

async function withPatched(obj, key, impl, fn) {
    const orig = obj[key];
    obj[key] = impl;
    try { await fn(); } finally { obj[key] = orig; }
}

// No stack frames, absolute paths, node_modules or internals in the text
function assertNoLeak(text, { dir, extra = [] } = {}) {
    const bad = [
        [/\bat\s+(async\s+)?[\w.<>$]+\s+\(/, 'stack frame (fn)'],
        [/\bat\s+\S*[\\/]\S+:\d+/i, 'stack frame (path)'],
        [/node_modules/i, 'node_modules'],
        [/[A-Za-z]:\\/, 'windows absolute path'],
        [/\/home\//, '/home path'],
        [/Cannot read properties/i, 'TypeError message'],
        [/SQLITE/i, 'SQLITE message'],
        [/secret/i, 'secret text'],
        [/body-parser|raw-body|SyntaxError|Unexpected token/i, 'parser internals'],
    ];
    for (const [re, label] of bad) {
        assert.ok(!re.test(text), `response leaks ${label}: ${text.slice(0, 400)}`);
    }
    const roots = [dir, os.tmpdir(), ENGINE_ROOT].filter(Boolean);
    for (const r of roots) assert.ok(!text.includes(r), `response leaks path ${r}: ${text.slice(0, 400)}`);
    for (const x of extra) assert.ok(!text.includes(x), `response leaks "${x}": ${text.slice(0, 400)}`);
}

const req = (base, p, opts = {}) => fetch(`${base}${p}`, { redirect: 'manual', ...opts });

// ---------- Body parser errors ----------

test('150KB urlencoded body -> 413 with no stack/path disclosure', async () => {
    await withServer(async ({ base, dir }) => {
        const body = 'title=' + 'a'.repeat(150 * 1024);
        const res = await req(base, '/_sys/data/posts.json', { method: 'POST', headers: FORM_H, body });
        const text = await res.text();
        assert.strictEqual(res.status, 413, text.slice(0, 300));
        assertNoLeak(text, { dir });
    });
});

test('150KB JSON body -> 413 with no disclosure', async () => {
    await withServer(async ({ base, dir }) => {
        const body = JSON.stringify({ title: 'a'.repeat(150 * 1024) });
        const res = await req(base, '/_sys/data/posts.json', { method: 'POST', headers: JSON_H, body });
        const text = await res.text();
        assert.strictEqual(res.status, 413, text.slice(0, 300));
        assertNoLeak(text, { dir });
    });
});

test('malformed JSON -> 400 with no disclosure', async () => {
    await withServer(async ({ base, dir }) => {
        const res = await req(base, '/_sys/data/posts.json', { method: 'POST', headers: JSON_H, body: '{"a": ' });
        const text = await res.text();
        assert.strictEqual(res.status, 400, text.slice(0, 300));
        assertNoLeak(text, { dir });
    });
});

test('malformed JSON on legacy API -> 400 with no disclosure', async () => {
    await withServer(async ({ base, dir }) => {
        const res = await req(base, '/_sys/api/data/write', { method: 'POST', headers: JSON_H, body: '{nope' });
        const text = await res.text();
        assert.strictEqual(res.status, 400, text.slice(0, 300));
        assertNoLeak(text, { dir });
    });
});

test('body limit is configurable (options.bodyLimit)', async () => {
    await withServer(async ({ base }) => {
        const body = 'title=' + 'a'.repeat(150 * 1024);
        const res = await req(base, '/_sys/data/bigposts.json', { method: 'POST', headers: FORM_H, body });
        assert.notStrictEqual(res.status, 413, 'a larger configured limit should accept 150KB');
        assert.ok(res.status < 400, `unexpected status ${res.status}`);
    }, { bodyLimit: '1mb' });
});

// ---------- Empty bodies ----------

test('POST with no body and no Content-Type does not 500 / leak', async () => {
    await withServer(async ({ base, dir }) => {
        const res = await req(base, '/_sys/data/emptyposts.json', { method: 'POST' });
        const text = await res.text();
        assert.ok(res.status < 500, `status ${res.status}: ${text.slice(0, 300)}`);
        assertNoLeak(text, { dir });
    });
});

test('POST ?_method=DELETE with no body removes by query id (no 500)', async () => {
    await withServer(async ({ base, dir }) => {
        await db.save('delitems', 'x1', { name: 'one' });
        const res = await req(base, '/_sys/data/delitems.json?_method=DELETE&id=x1', { method: 'POST' });
        const text = await res.text();
        assert.ok(res.status >= 200 && res.status < 400, `status ${res.status}: ${text.slice(0, 300)}`);
        assertNoLeak(text, { dir });
        const left = await db.find('delitems', { id: 'x1' });
        assert.strictEqual(left.length, 0, 'record should have been deleted');
    });
});

test('DELETE method with no body removes by query id (no 500)', async () => {
    await withServer(async ({ base, dir }) => {
        await db.save('delitems2', 'y1', { name: 'one' });
        const res = await req(base, '/_sys/data/delitems2.json?id=y1', { method: 'DELETE' });
        const text = await res.text();
        assert.ok(res.status >= 200 && res.status < 400, `status ${res.status}: ${text.slice(0, 300)}`);
        assertNoLeak(text, { dir });
        const left = await db.find('delitems2', { id: 'y1' });
        assert.strictEqual(left.length, 0, 'record should have been deleted');
    });
});

test('legacy write with no body does not 500 / leak', async () => {
    await withServer(async ({ base, dir }) => {
        const res = await req(base, '/_sys/api/data/write', { method: 'POST' });
        const text = await res.text();
        assert.ok(res.status < 500, `status ${res.status}: ${text.slice(0, 300)}`);
        assertNoLeak(text, { dir });
    });
});

// ---------- SSR errors ----------

test('SSR error does not echo message / path', async () => {
    await withServer(async ({ base, server, dir }) => {
        // The renderer is an ESM namespace (immutable): swap getRenderer on the instance
        const failing = {
            processHTML: async () => { throw new Error(`boom at ${path.join(dir, 'index.html')} ${SECRET}`); }
        };
        await withPatched(server, 'getRenderer', async () => failing, async () => {
            const res = await fetch(`${base}/index.html`);
            const text = await res.text();
            assert.strictEqual(res.status, 500);
            assertNoLeak(text, { dir, extra: ['boom'] });
        });
    });
});

// ---------- Data API db errors ----------

test('Data API db error (JSON client): generic error, no raw message', async () => {
    await withServer(async ({ base, dir }) => {
        await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
            const res = await req(base, '/_sys/data/posts.json', { method: 'POST', headers: JSON_H, body: JSON.stringify({ a: 1 }) });
            const text = await res.text();
            assert.strictEqual(res.status, 500);
            assertNoLeak(text, { dir });
        });
    });
});

test('Data API db error (form POST): redirect back to Referer with ?error=, no 500 page', async () => {
    await withServer(async ({ base, host, dir }) => {
        await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
            const res = await req(base, '/_sys/data/posts.json', {
                method: 'POST',
                headers: { ...FORM_H, Referer: `${base}/form.html?x=1`, Origin: base },
                body: 'title=hello'
            });
            const text = await res.text();
            assert.ok([302, 303].includes(res.status), `expected redirect, got ${res.status}: ${text.slice(0, 300)}`);
            const loc = new URL(res.headers.get('location'), base);
            assert.strictEqual(loc.host, host);
            assert.strictEqual(loc.pathname, '/form.html');
            assert.ok(loc.searchParams.has('error'), `no error param in ${loc}`);
            assert.strictEqual(loc.searchParams.get('x'), '1');
            assertNoLeak(decodeURIComponent(loc.search) + text, { dir });
        });
    });
});

test('Data API db error (form PUT via _method): redirect back with ?error=', async () => {
    await withServer(async ({ base, dir }) => {
        await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
            const res = await req(base, '/_sys/data/posts.json?_method=PUT&id=1', {
                method: 'POST',
                headers: { ...FORM_H, Referer: `${base}/edit.html` },
                body: 'title=hello'
            });
            assert.ok([302, 303].includes(res.status), `got ${res.status}`);
            const loc = new URL(res.headers.get('location'), base);
            assert.strictEqual(loc.pathname, '/edit.html');
            assert.ok(loc.searchParams.has('error'));
            assertNoLeak(decodeURIComponent(loc.search), { dir });
        });
    });
});

test('Data API db error (form DELETE via _method): redirect back with ?error=', async () => {
    await withServer(async ({ base, dir }) => {
        await withPatched(db, 'remove', async () => { throw new Error(SECRET); }, async () => {
            const res = await req(base, '/_sys/data/posts.json?_method=DELETE&id=1', {
                method: 'POST',
                headers: { ...FORM_H, Referer: `${base}/list.html` },
                body: ''
            });
            assert.ok([302, 303].includes(res.status), `got ${res.status}`);
            const loc = new URL(res.headers.get('location'), base);
            assert.strictEqual(loc.pathname, '/list.html');
            assert.ok(loc.searchParams.has('error'));
            assertNoLeak(decodeURIComponent(loc.search), { dir });
        });
    });
});

test('Legacy Data API read/write/list db error: generic JSON, no raw message', async () => {
    await withServer(async ({ base, dir }) => {
        await withPatched(db, 'put', async () => { throw new Error(SECRET); }, async () => {
            const res = await req(base, '/_sys/api/data/write', { method: 'POST', headers: JSON_H, body: JSON.stringify({ name: 'n', data: {} }) });
            const text = await res.text();
            assert.strictEqual(res.status, 500);
            assertNoLeak(text, { dir });
        });
        // GET /_sys/api/data/read|list are blocked by the underscore guard (403, never reach the handler)
        for (const p of ['/_sys/api/data/read?name=n', '/_sys/api/data/list']) {
            const res = await fetch(`${base}${p}`);
            const text = await res.text();
            assert.strictEqual(res.status, 403);
            assertNoLeak(text, { dir });
        }
    });
});

// ---------- Regression guards ----------

test('guard: normal form POST / PUT / DELETE succeed', async () => {
    await withServer(async ({ base }) => {
        const ref = { Referer: `${base}/page.html` };
        let res = await req(base, '/_sys/data/guard.json', { method: 'POST', headers: { ...FORM_H, ...ref }, body: 'id=g1&name=a' });
        assert.ok([302, 303].includes(res.status), `POST ${res.status}`);
        const loc = new URL(res.headers.get('location'), base);
        assert.strictEqual(loc.pathname, '/page.html');
        assert.ok(!loc.searchParams.has('error'));
        assert.strictEqual((await db.find('guard', { id: 'g1' })).length, 1);

        res = await req(base, '/_sys/data/guard.json?_method=PUT&id=g1', { method: 'POST', headers: { ...FORM_H, ...ref }, body: 'name=b' });
        assert.ok([302, 303].includes(res.status), `PUT ${res.status}`);
        assert.strictEqual((await db.find('guard', { id: 'g1' }))[0].name, 'b');

        res = await req(base, '/_sys/data/guard.json?_method=DELETE&id=g1', { method: 'POST', headers: { ...FORM_H, ...ref }, body: '' });
        assert.ok([302, 303].includes(res.status), `DELETE ${res.status}`);
        assert.strictEqual((await db.find('guard', { id: 'g1' })).length, 0);
    });
});

test('guard: normal JSON POST works and 404 still works', async () => {
    await withServer(async ({ base }) => {
        let res = await req(base, '/_sys/data/guardj.json', { method: 'POST', headers: JSON_H, body: JSON.stringify({ id: 'j1', n: 1 }) });
        assert.ok(res.status < 400, `status ${res.status}`);
        assert.strictEqual((await db.find('guardj', { id: 'j1' })).length, 1);

        res = await fetch(`${base}/no-such-page.html`);
        assert.strictEqual(res.status, 404);
        res = await fetch(`${base}/index.html`);
        assert.strictEqual(res.status, 200);
        assert.match(await res.text(), /HELLO-PROJECT/);
    });
});

// ---------- Final error handler ----------

test('malformed percent-escape and directory requests: no stack/path disclosure', async () => {
    await withServer(async ({ base, dir }) => {
        fs.mkdirSync(path.join(dir, 'sub'));
        for (const p of ['/engine/%E0%A4%A', '/sub', '/%E0%A4%A']) {
            const res = await fetch(`${base}${p}`);
            const text = await res.text();
            assert.ok(res.status >= 400 && res.status < 500, `${p} -> ${res.status}`);
            assertNoLeak(text, { dir });
        }
    });
});

test('error text in redirect is bounded', async () => {
    await withServer(async ({ server }) => {
        let loc;
        server.redirectBack({ body: {}, protocol: 'http', get: () => 'x', header: () => 'http://x/p' }, { redirect: (c, u) => { loc = u; } }, 'e'.repeat(5000));
        assert.ok(loc.length < 500, `location length ${loc.length}`);
    });
});
