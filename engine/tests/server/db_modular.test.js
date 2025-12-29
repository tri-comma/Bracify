import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3');

test('DB Modularization: Config Loading and Routing', async (t) => {
    const projectRoot = path.join(__dirname, 'mock_db_project');
    const sysDir = path.join(projectRoot, '_sys');

    // Setup
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.mkdirSync(sysDir, { recursive: true });

    db.setDriver(sqlite3);

    // Initial init to create data.db
    await db.init(projectRoot);
    const ProjectDBAdapter = require('../../server/db/drivers/sqlite.cjs');

    await t.test('should default to internal SQLite when no config is present', async () => {
        // No config saved yet
        await db.save('default_entity', '1', { val: 'default' });
        assert.ok(fs.existsSync(path.join(sysDir, 'data.db')), 'Data should go to internal SQLite');

        const res = await db.find('default_entity');
        assert.strictEqual(res[0].val, 'default');
    });

    await t.test('should load config from DB config table (name=db)', async () => {
        const dbConfig = [
            { "target_entity": "external_data", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'external.db') } }
        ];

        // Use an internal helper or just wait for another init after manually inserting config
        // Actually, we use projectDB.saveConfig in the actual implementation, but db manager doesn't export it.
        // We can use a trick: save it using projectDB directly or via init sequence.

        // We need access to the internal projectDB to save the config for the NEXT init
        const pDB = new ProjectDBAdapter({ sqlite3, projectPath: projectRoot });
        await pDB.init();
        await pDB.saveConfig('db', dbConfig);
        await pDB.close();

        await db.init(projectRoot);

        await db.save('external_data', '1', { val: 'from_external' });
        assert.ok(fs.existsSync(path.join(projectRoot, 'external.db')), 'External DB file should be created based on config');

        const results = await db.find('external_data');
        assert.strictEqual(results[0].val, 'from_external');

        await db.close();
    });

    await t.test('should support priority routing (Exact > Longest Pattern > Order)', async () => {
        const complexConfig = [
            { "target_entity": "logs_*", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'logs_pattern.db') } },
            { "target_entity": "logs_special", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'logs_exact.db') } },
            { "target_entity": "data*", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'data_prefix.db') } },
            { "target_entity": "data_2024*", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'data_long.db') } },
            { "target_entity": "conflict*", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'conflict_1.db') } },
            { "target_entity": "*conflict", "engine": "sqlite", "option": { "storage": path.join(projectRoot, 'conflict_2.db') } }
        ];

        const pDB = new ProjectDBAdapter({ sqlite3, projectPath: projectRoot });
        await pDB.init();
        await pDB.saveConfig('db', complexConfig);
        await pDB.close();

        await db.init(projectRoot);

        // 1. Exact match test
        await db.save('logs_special', '1', { type: 'exact' });
        assert.ok(fs.existsSync(path.join(projectRoot, 'logs_exact.db')));

        // 2. Pattern match test
        await db.save('logs_any', '1', { type: 'pattern' });
        assert.ok(fs.existsSync(path.join(projectRoot, 'logs_pattern.db')));

        // 3. Longest pattern match test
        await db.save('data_2024_01', '1', { type: 'longest' });
        assert.ok(fs.existsSync(path.join(projectRoot, 'data_long.db')));

        // 4. Order-based tie-breaker (same length prefix/suffix)
        // conflict* (length 8) vs *conflict (length 8)
        await db.save('conflict_conflict', '1', { type: 'order' });
        assert.ok(fs.existsSync(path.join(projectRoot, 'conflict_1.db')), 'Should prefer the one defined earlier if lengths are equal');

        // 5. Fallback to Project DB if no match
        await db.save('unmatched_entity', '1', { type: 'fallback' });
        const res = await db.find('unmatched_entity');
        assert.strictEqual(res[0].type, 'fallback');

        await db.close();
    });

    await t.test('should process environment variables in config', async () => {
        process.env.TEST_DB_PATH = path.join(projectRoot, 'env_routed.db');
        const configData = [
            { "target_entity": "env_data", "engine": "sqlite", "option": { "storage": "${TEST_DB_PATH}" } }
        ];

        const pDB = new ProjectDBAdapter({ sqlite3, projectPath: projectRoot });
        await pDB.init();
        await pDB.saveConfig('db', configData);
        await pDB.close();

        await db.init(projectRoot);
        await db.save('env_data', '3', { val: 'env_var' });

        assert.ok(fs.existsSync(path.join(projectRoot, 'env_routed.db')), 'DB path should resolve environment variable');

        await db.close();
        delete process.env.TEST_DB_PATH;
    });

    // Cleanup
    if (fs.existsSync(projectRoot)) fs.rmSync(projectRoot, { recursive: true, force: true });
});
