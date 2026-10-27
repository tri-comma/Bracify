import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #33: legacy System API (/_sys/api/*, /_sys/server/*)
// lacked the checkOrigin CSRF guard, and cors() granted `Access-Control-Allow-Origin: *`.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const EVIL = 'http://evil.com';
const JSON_H = { 'Content-Type': 'application/json' };
const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };

async function withServer(fn, options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-csrf-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>HELLO-PROJECT</body></html>');
    const server = new EngineServer(0, () => {}, { sqlite3, ...options });
    const opened = [];
    server.setOpenProjectHandler(async (req, res) => {
        // Mirrors gui/main.js: switches the served project to req.body.path
        opened.push(req.body && req.body.path);
        res.json({ ok: true, path: req.body && req.body.path });
    });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://localhost:${port}`;
    try {
        await fn({ server, base, dir, opened, host: `localhost:${port}`, port });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

const writeReq = (base, name, v, headers = {}) => fetch(`${base}/_sys/data/${name}.json`, {
    method: 'POST', headers: { ...JSON_H, ...headers }, body: JSON.stringify({ id: 'r1', v }), redirect: 'manual'
});
const stored = async (name) => (await db.find(name, { id: 'r1' }))[0];
const closeReq = (base, headers = {}) => fetch(`${base}/_sys/api/close-project`, {
    method: 'POST', headers: { ...JSON_H, ...headers }, body: '{}'
});
const openReq = (base, headers = {}) => fetch(`${base}/_sys/api/open-project`, {
    method: 'POST', headers: { ...JSON_H, ...headers }, body: JSON.stringify({ path: os.tmpdir() })
});
const projectStatus = async (base) => (await fetch(`${base}/index.html`)).status;

// ---------- Cross-origin POSTs must be rejected, with no side effect ----------

test('POST /_sys/data/<entity>.json: cross-origin is 403 and writes nothing', async () => {
    await withServer(async ({ base }) => {
        const res = await writeReq(base, 'csrf_victim', 'HACKED', { Origin: EVIL });
        assert.strictEqual(res.status, 403);
        const rec = await stored('csrf_victim');
        assert.ok(!rec, `data was written cross-origin: ${JSON.stringify(rec)}`);
    });
});

test('POST /_sys/api/close-project: cross-origin is 403 and project stays served', async () => {
    await withServer(async ({ base, server }) => {
        const res = await closeReq(base, { Origin: EVIL });
        assert.strictEqual(res.status, 403);
        assert.ok(server.currentProjectPath, 'currentProjectPath was cleared');
        assert.strictEqual(await projectStatus(base), 200);
    });
});

test('POST /_sys/api/open-project: cross-origin is 403 and handler is not invoked', async () => {
    await withServer(async ({ base, opened }) => {
        const res = await openReq(base, { Origin: EVIL });
        assert.strictEqual(res.status, 403);
        assert.deepStrictEqual(opened, [], 'open-project handler ran for a cross-origin request');
    });
});

test('POST /_sys/server/start|stop: cross-origin is 403 (system server)', async (t) => {
    await withServer(async ({ base }) => {
        for (const action of ['start', 'stop']) {
            await t.test(action, async () => {
                const res = await fetch(`${base}/_sys/server/${action}`, {
                    method: 'POST',
                    headers: { ...FORM_H, Origin: EVIL },
                    body: 'id=nope',
                    redirect: 'manual'
                });
                assert.strictEqual(res.status, 403);
            });
        }
    }, { manageProjects: true });
});

test('Origin "null" (sandboxed iframe / file://) and lookalike hosts are rejected', async (t) => {
    await withServer(async ({ base, host, port }) => {
        for (const origin of ['null', `http://${host}.evil.com`, `http://evil.com:${port}`]) {
            await t.test(origin, async () => {
                const res = await closeReq(base, { Origin: origin });
                assert.strictEqual(res.status, 403);
                assert.strictEqual(await projectStatus(base), 200);
            });
        }
    });
});

test('Cross-origin simple (form content-type) request is rejected', async () => {
    await withServer(async ({ base, server }) => {
        const res = await fetch(`${base}/_sys/api/close-project`, {
            method: 'POST',
            headers: { ...FORM_H, Origin: EVIL },
            body: 'a=1'
        });
        assert.strictEqual(res.status, 403);
        assert.ok(server.currentProjectPath);
    });
});

// ---------- CORS ----------

test('CORS: preflight from evil origin is not granted (no ACAO * / echo)', async (t) => {
    await withServer(async ({ base }) => {
        for (const p of ['/_sys/data/csrf_victim.json', '/_sys/api/close-project', '/_sys/api/open-project', '/_sys/server/start']) {
            await t.test(p, async () => {
                const res = await fetch(`${base}${p}`, {
                    method: 'OPTIONS',
                    headers: {
                        Origin: EVIL,
                        'Access-Control-Request-Method': 'POST',
                        'Access-Control-Request-Headers': 'content-type'
                    }
                });
                const acao = res.headers.get('access-control-allow-origin');
                assert.notStrictEqual(acao, '*', 'ACAO: * on preflight');
                assert.notStrictEqual(acao, EVIL, 'evil origin echoed on preflight');
            });
        }
    }, { manageProjects: true });
});

test('CORS: actual cross-origin responses carry no ACAO * / echo', async () => {
    await withServer(async ({ base }) => {
        const responses = [
            await writeReq(base, 'cors_probe', 1, { Origin: EVIL }),
            await closeReq(base, { Origin: EVIL }),
            await fetch(`${base}/_sys/data/csrf_victim.json`, { headers: { Origin: EVIL } }),
            await fetch(`${base}/index.html`, { headers: { Origin: EVIL } }),
        ];
        for (const res of responses) {
            const acao = res.headers.get('access-control-allow-origin');
            assert.notStrictEqual(acao, '*');
            assert.notStrictEqual(acao, EVIL);
        }
    });
});

// ---------- Regression guards (must pass before and after the fix) ----------

test('Guard: same-origin requests still work', async () => {
    await withServer(async ({ base, opened, server }) => {
        const sameOrigin = { Origin: base };

        let res = await writeReq(base, 'csrf_same', 'OK', sameOrigin);
        assert.ok(res.status < 400, `status ${res.status}`);
        assert.strictEqual((await stored('csrf_same')).v, 'OK');

        res = await openReq(base, sameOrigin);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(opened.length, 1);

        res = await closeReq(base, sameOrigin);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(server.currentProjectPath, null);
    });
});

test('Guard: requests without Origin (CLI/curl/tests) still work', async () => {
    await withServer(async ({ base, opened, server }) => {
        let res = await writeReq(base, 'csrf_noorigin', 'OK');
        assert.ok(res.status < 400, `status ${res.status}`);
        assert.strictEqual((await stored('csrf_noorigin')).v, 'OK');

        res = await openReq(base);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(opened.length, 1);

        res = await closeReq(base);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(server.currentProjectPath, null);
    });
});

test('Guard: same-origin / no-Origin server control is not blocked by the Origin check', async () => {
    await withServer(async ({ base }) => {
        for (const headers of [{}, { Origin: base }]) {
            const res = await fetch(`${base}/_sys/server/start`, {
                method: 'POST',
                headers: { ...FORM_H, ...headers },
                body: 'id=nope',
                redirect: 'manual'
            });
            assert.notStrictEqual(res.status, 403);
        }
    }, { manageProjects: true });
});

test('Guard: project pages are still served (GET) without Origin', async () => {
    await withServer(async ({ base }) => {
        assert.strictEqual(await projectStatus(base), 200);
    });
});

test('Guard: Data API cross-origin writes are still 403', async () => {
    await withServer(async ({ base }) => {
        const res = await fetch(`${base}/_sys/data/reviews.json`, {
            method: 'POST', headers: { ...FORM_H, Origin: EVIL }, body: 'a=1'
        });
        assert.strictEqual(res.status, 403);
        const del = await fetch(`${base}/_sys/data/reviews.json?_method=DELETE`, {
            method: 'POST', headers: { ...FORM_H, Origin: EVIL }, body: 'id=1'
        });
        assert.strictEqual(del.status, 403);
    });
});

test('Removed legacy route (#69): same-origin POST /_sys/api/data/write no longer writes', async () => {
    await withServer(async ({ base }) => {
        for (const headers of [{}, { Origin: base }]) {
            const res = await fetch(`${base}/_sys/api/data/write`, {
                method: 'POST', headers: { ...JSON_H, ...headers }, body: JSON.stringify({ name: 'legacy_gone', data: { v: 1 } })
            });
            assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
            const text = await res.text();
            assert.ok(!/"ok"\s*:\s*true/.test(text), text.slice(0, 200));
        }
        assert.ok(!(await db.get('legacy_gone')), 'legacy write route still stores data');
        for (const p of ['/_sys/api/data/list', '/_sys/api/data/read?name=legacy_gone']) {
            assert.strictEqual((await fetch(`${base}${p}`)).status, 403);
        }
    });
});
