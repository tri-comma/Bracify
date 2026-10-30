import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Issue #55: one engine URL for every mode. The server serves the client engine at the virtual path /bracify.js
// (always its own copy, so SSR and the browser run the same version) as text/javascript; the legacy
// /engine/engine.cjs keeps working but must no longer be sent as application/node (blocked under nosniff / strict CSP).

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3');

const ENGINE_FILE = path.resolve(__dirname, '../../lib/engine.cjs');
const ENGINE_SRC = fs.readFileSync(ENGINE_FILE, 'utf-8');
const JS_MIME = /^text\/javascript;\s*charset=utf-8$/i;

let tmp, server, base;

const get = async (p, init) => {
    const res = await fetch(base + p, init);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, text: buf.toString('utf-8') };
};

before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-engurl-'));
    fs.writeFileSync(path.join(tmp, 'index.html'), '<html><body><p>home</p></body></html>');
    // A project file with the engine's name must NOT replace the server's engine
    fs.writeFileSync(path.join(tmp, 'bracify.js'), 'window.__PROJECT_COPY__ = true; /* STALE-ENGINE */');
    fs.mkdirSync(path.join(tmp, 'sub'));
    fs.writeFileSync(path.join(tmp, 'sub', 'real.js'), 'window.__real = 1;');
    server = new EngineServer(0, () => { }, { sqlite3 });
    await server.setCurrentProjectPath(tmp);
    const port = await server.start();
    base = `http://localhost:${port}`;
});

after(async () => {
    if (server) await server.stop();
    for (let i = 0; i < 5; i++) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); break; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
});

test('/bracify.js is served as text/javascript with the engine source', async () => {
    const r = await get('/bracify.js');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type') || '', JS_MIME);
    assert.strictEqual(r.text, ENGINE_SRC, 'body must be exactly engine/lib/engine.cjs');
});

test('the server engine wins over a same-named project file', async () => {
    const r = await get('/bracify.js');
    assert.ok(!r.text.includes('STALE-ENGINE'), 'the project copy must not be served');
    assert.strictEqual(r.text, ENGINE_SRC);
});

test('the engine response is executable under X-Content-Type-Options: nosniff', async () => {
    for (const p of ['/bracify.js', '/engine/engine.cjs']) {
        const ct = (await get(p)).headers.get('content-type') || '';
        assert.match(ct, /^(text|application)\/(x-)?(javascript|ecmascript)\b/i, `${p} -> ${ct}`);
        assert.doesNotMatch(ct, /application\/node/, p);
    }
});

test('legacy /engine/engine.cjs keeps working and is text/javascript', async () => {
    const r = await get('/engine/engine.cjs');
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /^text\/javascript\b/i);
    assert.strictEqual(r.text, ENGINE_SRC);
});

test('/bracify.js supports HEAD and a stable ETag / conditional GET', async () => {
    const head = await get('/bracify.js', { method: 'HEAD' });
    assert.strictEqual(head.status, 200);
    assert.match(head.headers.get('content-type') || '', JS_MIME);
    assert.strictEqual(head.text, '', 'HEAD has no body');
    assert.strictEqual(Number(head.headers.get('content-length')), Buffer.byteLength(ENGINE_SRC));

    const etag = (await get('/bracify.js')).headers.get('etag');
    assert.ok(etag, 'an ETag is sent');
    assert.strictEqual((await get('/bracify.js')).headers.get('etag'), etag, 'ETag is stable between requests');
    const cond = await get('/bracify.js', { headers: { 'If-None-Match': etag } });
    assert.strictEqual(cond.status, 304);
});

test('/bracify.js is only the root virtual path: /sub/bracify.js is not the engine', async () => {
    const r = await get('/sub/bracify.js');
    assert.strictEqual(r.status, 404);
    assert.ok(!r.text.includes(ENGINE_SRC.slice(0, 200)));
    // an ordinary project script in a subfolder is still served as a normal static file
    assert.strictEqual((await get('/sub/real.js')).status, 200);
});

test('every alias of the root bracify.js serves the engine, never the stale project file', async () => {
    for (const p of ['/%62racify.js', '//bracify.js', '/./bracify.js', '/BRACIFY.JS']) {
        // raw request targets: fetch() would normalise "//" and "/./"
        const r = await new Promise((resolve, reject) => {
            const req = http.request({ host: 'localhost', port: new URL(base).port, path: p, method: 'GET' }, (res) => {
                let t = ''; res.setEncoding('utf-8'); res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, text: t }));
            });
            req.on('error', reject); req.end();
        });
        assert.strictEqual(r.status, 200, p);
        assert.ok(!r.text.includes('STALE-ENGINE'), p + ' served the project copy');
        assert.strictEqual(r.text, ENGINE_SRC, p);
    }
});

test('/bracify.js is sent with Cache-Control: no-cache', async () => {
    assert.match((await get('/bracify.js')).headers.get('cache-control') || '', /no-cache/);
});
