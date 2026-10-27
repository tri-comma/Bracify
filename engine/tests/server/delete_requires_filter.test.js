import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #35: DELETE (or POST ?_method=DELETE) without any data filter
// wiped every record of the entity. It must be rejected like PUT without an id (400), deleting nothing.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const SQLiteAdapter = require('../../server/db/drivers/sqlite.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_H = { 'Content-Type': 'application/json' };

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-delfilter-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>HELLO</body></html>');
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    try {
        await db.save('authors', '1', { name: 'A' });
        await db.save('authors', '2', { name: 'B' });
        await db.save('authors', '3', { name: 'C' });
        await fn({ base, ids: async () => (await db.find('authors', {})).map(r => String(r.id)).sort() });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

const ALL = ['1', '2', '3'];
const url = (base, qs = '') => `${base}/_sys/data/authors.json${qs}`;

test('DELETE without any filter is 400 and deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base), { method: 'DELETE', redirect: 'manual' });
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await ids(), ALL, 'records were deleted by a filterless DELETE');
    });
});

test('DELETE with empty JSON body {} (no filter) is 400 and deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base), { method: 'DELETE', headers: JSON_H, body: '{}', redirect: 'manual' });
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await ids(), ALL);
    });
});

test('DELETE with only reserved params (_limit) is 400 and deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base, '?_limit=1'), { method: 'DELETE', redirect: 'manual' });
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await ids(), ALL);
    });
});

test('POST ?_method=DELETE form post without filter is 400 and deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base, '?_method=DELETE'), {
            method: 'POST', headers: FORM_H, body: 'x=1', redirect: 'manual'
        });
        // Same as PUT without id: no data-t-redirect => 400
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(await ids(), ALL, 'records were deleted by a filterless form DELETE');
    });
});

test('POST ?_method=DELETE without filter + data-t-redirect: redirects back with error, deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base, '?_method=DELETE'), {
            method: 'POST', headers: FORM_H, body: 'x=1&data-t-redirect=%2Fdone.html', redirect: 'manual'
        });
        // Same as PUT without id: 303 to the redirect target carrying ?error=...
        assert.strictEqual(res.status, 303);
        assert.match(res.headers.get('location') || '', /[?&]error=/);
        assert.deepStrictEqual(await ids(), ALL);
    });
});

test('DELETE with id deletes exactly that record', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base, '?id=2'), { method: 'DELETE', redirect: 'manual' });
        assert.ok(res.status >= 200 && res.status < 400, `unexpected status ${res.status}`);
        assert.deepStrictEqual(await ids(), ['1', '3']);
    });
});

test('POST ?_method=DELETE&id=1 deletes exactly that record', async () => {
    await withServer(async ({ base, ids }) => {
        const res = await fetch(url(base, '?id=1&_method=DELETE'), {
            method: 'POST', headers: FORM_H, body: 'x=1', redirect: 'manual'
        });
        assert.ok(res.status >= 200 && res.status < 400, `unexpected status ${res.status}`);
        assert.deepStrictEqual(await ids(), ['2', '3']);
    });
});

test('DELETE with empty id= deletes nothing', async () => {
    await withServer(async ({ base, ids }) => {
        await fetch(url(base, '?id='), { method: 'DELETE', redirect: 'manual' });
        assert.deepStrictEqual(await ids(), ALL);
    });
});

test('SQLiteAdapter.remove(entity, {}) refuses instead of wiping the entity', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-delfilter-unit-'));
    const adapter = new SQLiteAdapter({ sqlite3, projectPath: projectRoot });
    try {
        await adapter.init();
        await adapter.save('authors', '1', { name: 'A' });
        await adapter.save('authors', '2', { name: 'B' });
        await assert.rejects(() => adapter.remove('authors', {}));
        assert.strictEqual((await adapter.find('authors', {})).length, 2, 'remove({}) wiped the entity');
        // A real filter still works
        await adapter.remove('authors', { id: '1' });
        assert.deepStrictEqual((await adapter.find('authors', {})).map(r => r.id), ['2']);
    } finally {
        if (adapter.db) await new Promise(r => adapter.db.close(() => r()));
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(projectRoot, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
});
