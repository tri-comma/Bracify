import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLiteAdapter = require('../../server/db/drivers/sqlite.cjs');
const sqlite3 = require('sqlite3');

test('SQLiteAdapter: Comprehensive CRUD and Features', async (t) => {
    const projectRoot = path.join(__dirname, 'test_project_sqlite');
    const sysDir = path.join(projectRoot, '_sys');

    // Setup
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.mkdirSync(sysDir, { recursive: true });

    const adapter = new SQLiteAdapter({ sqlite3, projectPath: projectRoot });

    await t.test('init and close', async () => {
        await adapter.init();
        assert.ok(fs.existsSync(path.join(sysDir, 'data.db')), 'Database file should be created');
        await adapter.close();
    });

    await t.test('Basic CRUD: save, find, remove, list', async () => {
        await adapter.init();

        // Save
        const id1 = await adapter.save('items', null, { name: 'Item 1', tags: ['a', 'b'] });
        const id2 = await adapter.save('items', 'manual_id', { name: 'Item 2', tags: ['b', 'c'] });

        assert.ok(id1, 'Should return generated ID');
        assert.strictEqual(id2, 'manual_id', 'Should respect manual ID');

        // List
        const entities = await adapter.list();
        assert.ok(entities.find(e => e.name === 'items'), 'Should list items entity');

        // Find (all)
        const all = await adapter.find('items');
        assert.strictEqual(all.length, 2);

        // Find (filter)
        const filtered = await adapter.find('items', { id: 'manual_id' });
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].name, 'Item 2');

        // Remove
        await adapter.remove('items', { id: 'manual_id' });
        const afterRemove = await adapter.find('items');
        assert.strictEqual(afterRemove.length, 1);
        assert.strictEqual(afterRemove[0].id, id1);

        await adapter.close();
    });

    await t.test('Advanced Filtering (JSON & Wildcards)', async () => {
        await adapter.init();
        await adapter.save('users', 'u1', { name: 'Alice', role: 'admin', email: 'alice@example.com' });
        await adapter.save('users', 'u2', { name: 'Bob', role: 'editor', email: 'bob@work.com' });
        await adapter.save('users', 'u3', { name: 'Charlie', role: 'admin', email: 'charlie@gmail.com' });

        // Filter by JSON field
        const admins = await adapter.find('users', { role: 'admin' });
        assert.strictEqual(admins.length, 2);

        // Forward wildcard
        const exampleUsers = await adapter.find('users', { email: '*@example.com' });
        assert.strictEqual(exampleUsers.length, 1);
        assert.strictEqual(exampleUsers[0].name, 'Alice');

        // Middle wildcard
        const workUsers = await adapter.find('users', { email: 'bob*' });
        assert.strictEqual(workUsers.length, 1);

        await adapter.close();
    });

    await t.test('Sorting and Pagination', async () => {
        await adapter.init();
        for (let i = 1; i <= 5; i++) {
            await adapter.save('pages', `p${i}`, { title: `Page ${i}`, order: 5 - i });
        }

        // Sort by JSON field (desc)
        const sorted = await adapter.find('pages', { _sort: 'order', _order: 'desc' });
        assert.strictEqual(sorted[0].id, 'p1'); // p1 has order 4
        assert.strictEqual(sorted[4].id, 'p5'); // p5 has order 0

        // Limit and Offset
        const paginated = await adapter.find('pages', { _limit: 2, _offset: 1, _sort: 'id' });
        assert.strictEqual(paginated.length, 2);
        assert.strictEqual(paginated[0].id, 'p2');
        assert.strictEqual(paginated[1].id, 'p3');

        await adapter.close();
    });

    await t.test('Compatibility Helpers (get/put)', async () => {
        await adapter.init();

        // put (save with __default__)
        await adapter.put('settings', { theme: 'dark' });

        // get (retrieve __default__)
        const settings = await adapter.get('settings');
        assert.strictEqual(settings.theme, 'dark');
        assert.strictEqual(settings.id, '__default__');

        await adapter.close();
    });

    await t.test('System Config (getConfig/saveConfig)', async () => {
        await adapter.init();

        const myConfig = { version: '1.0' };
        await adapter.saveConfig('app', myConfig);

        const retrieved = await adapter.getConfig('app');
        assert.deepStrictEqual(retrieved, myConfig);

        const nonExistent = await adapter.getConfig('none');
        assert.strictEqual(nonExistent, null);

        await adapter.close();
    });

    await t.test('Auto-migration from JSON files', async () => {
        const dataDir = path.join(sysDir, 'data');
        if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });

        const jsonData = [{ id: 'j1', val: 'a' }, { id: 'j2', val: 'b' }];
        fs.writeFileSync(path.join(dataDir, 'migration_test.json'), JSON.stringify(jsonData));

        // Init should trigger migration
        await adapter.init();

        const migrated = await adapter.find('migration_test');
        assert.strictEqual(migrated.length, 2);
        assert.strictEqual(migrated.find(m => m.id === 'j1').val, 'a');

        await adapter.close();
    });

    await t.test('Security: SQL Injection Resilience', async () => {
        await adapter.init();

        // Cleanup 'items' to ensure clean state
        await adapter.remove('items');

        // 1. Malicious entity name (though usually validated by manager)
        const maliciousEntity = "items' OR '1'='1";
        const res1 = await adapter.find(maliciousEntity);
        assert.strictEqual(res1.length, 0, 'Should not return any data for malicious entity name');

        // 2. Malicious filter key
        await adapter.save('items', 's1', { name: 'safe' });
        const maliciousKey = "name' = 'safe') OR ('1'='1";
        const res2 = await adapter.find('items', { [maliciousKey]: 'value' });
        assert.strictEqual(res2.length, 0, 'Should not return data for malicious key');

        // 3. Malicious filter value
        const res3 = await adapter.find('items', { name: "' OR '1'='1" });
        assert.strictEqual(res3.length, 0, 'Should not return data for malicious value');

        // 4. Malicious sort / order / limit (Blind Injection attempts)
        const res4 = await adapter.find('items', {
            _sort: "name'); DELETE FROM data_records; --",
            _order: "DESC; --",
            _limit: "10; --"
        });
        assert.strictEqual(res4.length, 1, 'Should stay safe and return exactly 1 item');

        // Verify that the DELETE attempt failed and data still exists
        const count = await adapter.find('items');
        assert.strictEqual(count.length, 1, 'Data should NOT have been deleted by injection');

        await adapter.close();
    });

    // Cleanup
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
});
