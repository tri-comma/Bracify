import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SQLiteAdapter = require('../../server/db/drivers/sqlite.cjs');
const sqlite3 = require('sqlite3');

// README "演算子": `=`, `:ne`, `:gt`, `:gte`, `:lt`, `:lte`, and equality on non-string JSON values.
test('SQLiteAdapter: operators and non-string equality filters', async (t) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-filters-'));
    const adapter = new SQLiteAdapter({ sqlite3, projectPath: projectRoot });
    await adapter.init();
    await adapter.save('items', 'a', { name: 'A', cat: 2, price: 500, stock: 0, ok: true, status: 'active' });
    await adapter.save('items', 'b', { name: 'B', cat: 3, price: 1000, stock: 10, ok: false, status: 'draft' });
    await adapter.save('items', 'c', { name: 'C', cat: 2, price: 1500, stock: 5, ok: true, status: 'active' });
    // numbers posted from an HTML form arrive as strings
    await adapter.save('items', 'd', { name: 'D', cat: '3', price: '2000', stock: '1', ok: 'true' });
    const names = async (f) => (await adapter.find('items', f)).map(r => r.name).sort().join('');

    await t.test('equality on numbers and booleans', async () => {
        assert.strictEqual(await names({ cat: '2' }), 'AC');
        assert.strictEqual(await names({ cat: '3' }), 'BD');
        assert.strictEqual(await names({ ok: 'true' }), 'ACD');
        assert.strictEqual(await names({ ok: 'false' }), 'B');
        assert.strictEqual(await names({ status: 'active' }), 'AC');
    });

    await t.test('numeric comparison operators', async () => {
        assert.strictEqual(await names({ 'price:gt': '1000' }), 'CD');
        assert.strictEqual(await names({ 'price:gte': '1000' }), 'BCD');
        assert.strictEqual(await names({ 'stock:lt': '10' }), 'ACD');
        assert.strictEqual(await names({ 'stock:lte': '10' }), 'ABCD');
        assert.strictEqual(await names({ 'price:gt': '600', 'stock:gt': '0' }), 'BCD');
    });

    await t.test(':ne', async () => {
        assert.strictEqual(await names({ 'status:ne': 'draft' }), 'ACD'); // missing field also counts as "not draft"
        assert.strictEqual(await names({ 'cat:ne': '2' }), 'BD');
    });

    await t.test('operators combine with _sort / _limit / _offset', async () => {
        const r = await adapter.find('items', { 'price:gte': '500', _sort: 'price', _order: 'desc', _limit: '2', _offset: '1' });
        assert.deepStrictEqual(r.map(x => x.name), ['C', 'B']);
    });

    await t.test('unresolved placeholders / empty values are still ignored', async () => {
        assert.strictEqual(await names({ 'price:gt': '{?min}', cat: '' }), 'ABCD');
    });

    await t.test('remove() matches non-string values, never expands wildcards', async () => {
        await adapter.save('items', 'e', { name: '*E', cat: 9 });
        await adapter.remove('items', { name: '*' }); // literal match: nothing is named "*"
        assert.strictEqual((await adapter.find('items')).length, 5);
        await adapter.remove('items', { cat: '9' });
        assert.strictEqual((await adapter.find('items')).length, 4);
    });

    await adapter.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
});
