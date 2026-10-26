import { test, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #32: Prototype Pollution via dot-notation keys
// in the Data API (unflatten() in engine/server/index.cjs).

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const POLLUTION_KEYS = ['x', 'polluted', 'cpoll', 'id', 'toString'];
const baselineKeys = Object.getOwnPropertyNames(Object.prototype).sort();

function cleanPrototype() {
    for (const k of Object.getOwnPropertyNames(Object.prototype)) {
        if (!baselineKeys.includes(k)) delete Object.prototype[k];
    }
    for (const k of POLLUTION_KEYS) {
        if (!baselineKeys.includes(k)) delete Object.prototype[k];
    }
}

// Always leave the process clean for other test files
after(cleanPrototype);

function newedKeys() {
    return Object.getOwnPropertyNames(Object.prototype).filter(k => !baselineKeys.includes(k));
}

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-pp-'));
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    try {
        await fn({ server, base: `http://localhost:${port}` });
    } finally {
        cleanPrototype();
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

function post(base, entity, body) {
    return fetch(`${base}/_sys/data/${entity}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        redirect: 'manual'
    });
}

test('unflatten(): dangerous path segments must not pollute Object.prototype', async (t) => {
    await withServer(async ({ server }) => {
        const cases = [
            ['__proto__.x', '__proto__ leading'],
            ['constructor.prototype.x', 'constructor.prototype'],
            ['a.__proto__.x', '__proto__ nested'],
            ['a.constructor.prototype.x', 'nested constructor.prototype'],
            ['prototype.x', 'prototype segment'],
            ['__proto__.id', '__proto__.id'],
        ];
        for (const [key, label] of cases) {
            await t.test(`${label} (${key})`, () => {
                try {
                    try { server.unflatten({ [key]: 'PWNED', ok: '1' }); } catch { /* rejecting is acceptable */ }
                    assert.strictEqual(({}).x, undefined, `({}).x leaked via ${key}`);
                    assert.strictEqual(({}).id, undefined, `({}).id leaked via ${key}`);
                    assert.deepStrictEqual(newedKeys(), [], `Object.prototype gained keys via ${key}`);
                } finally {
                    cleanPrototype();
                }
            });
        }
    });
});

test('Data API: POST with __proto__/constructor.prototype keys does not pollute', async (t) => {
    await withServer(async ({ base }) => {
        for (const body of [
            '__proto__.polluted=POLLUTED&reviewer=a',
            'constructor.prototype.cpoll=PWNED&reviewer=a',
            'a.__proto__.x=Y&reviewer=a',
            'prototype.x=Y&reviewer=a',
        ]) {
            await t.test(body, async () => {
                try {
                    await post(base, 'reviews', body);
                    assert.strictEqual(({}).polluted, undefined);
                    assert.strictEqual(({}).cpoll, undefined);
                    assert.strictEqual(({}).x, undefined);
                    assert.deepStrictEqual(newedKeys(), []);
                } finally {
                    cleanPrototype();
                }
            });
        }
    });
});

test('Data API: __proto__.id=1 must not make later creates overwrite one record', async () => {
    await withServer(async ({ base }) => {
        await post(base, 'reviews', '__proto__.id=1&reviewer=attacker');
        for (const i of [1, 2]) {
            await post(base, 'reviews', `reviewer=victim${i}&book_id=1`);
        }
        const rows = await db.find('reviews', {});
        const victims = rows.filter(r => String(r.reviewer).startsWith('victim'));
        assert.strictEqual(victims.length, 2, 'two creates must yield two distinct records');
        assert.notStrictEqual(victims[0].id, victims[1].id);
    });
});

test('Regression guard: legit dotted keys still nest', async () => {
    await withServer(async ({ server, base }) => {
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(server.unflatten({ 'meta.tag': 'x', 'meta.n.k': 'y', 'list.0': 'a', name: 'n' }))),
            { meta: { tag: 'x', n: { k: 'y' } }, list: ['a'], name: 'n' }
        );
        await post(base, 'things', 'meta.tag=x&name=n');
        const rows = await db.find('things', {});
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].meta.tag, 'x');
        assert.strictEqual(rows[0].name, 'n');
    });
});
