import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #42: SQLiteAdapter.init() re-imported every _sys/data/*.json seed on every
// start (INSERT OR IGNORE), so deleted seed records came back, and each record was its own autocommit.
// Seeds must be imported once per entity, inside a single transaction.

const require = createRequire(import.meta.url);
const SQLiteAdapter = require('../../server/db/drivers/sqlite.cjs');
const sqlite3 = require('sqlite3');

function makeProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-seed-'));
    const dataDir = path.join(dir, '_sys', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    return { dir, dataDir };
}

function writeSeed(dataDir, entity, rows) {
    fs.writeFileSync(path.join(dataDir, `${entity}.json`), JSON.stringify(rows));
}

// Runs fn({ dir, dataDir, start }) where start() opens an adapter on the project's data.db; every opened adapter
// is closed afterwards (an open handle would make the temp dir removal fail on Windows).
async function withProject(fn, options = {}) {
    const { dir, dataDir } = makeProject();
    const opened = [];
    const start = async () => {
        const adapter = new SQLiteAdapter({ sqlite3, projectPath: dir, ...options });
        opened.push(adapter);
        await adapter.init();
        return adapter;
    };
    try {
        await fn({ dir, dataDir, start });
    } finally {
        for (const a of opened) { try { await a.close(); } catch (e) { /* ignore */ } }
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const ids = (rows) => rows.map(r => r.id).sort();

test('seed import: first start on an empty DB imports every seed record', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
        writeSeed(dataDir, 'authors', [{ id: 'x', name: 'X' }]);
        const a = await start();
        assert.deepStrictEqual(ids(await a.find('books')), ['1', '2']);
        assert.deepStrictEqual(ids(await a.find('authors')), ['x']);
    });
});

test('seed import: a seed record deleted before restart stays deleted', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]);
        const a = await start();
        await a.remove('books', { id: '1' });
        assert.deepStrictEqual(ids(await a.find('books')), ['2']);
        await a.close();

        const b = await start(); // restart on the same data.db
        assert.deepStrictEqual(ids(await b.find('books')), ['2'], 'deleted seed record must not come back');
    });
});

test('seed import: a fully emptied entity is not re-seeded on restart', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1' }, { id: '2' }]);
        const a = await start();
        await a.remove('books', { id: '1' });
        await a.remove('books', { id: '2' });
        await a.close();

        const b = await start();
        assert.deepStrictEqual(await b.find('books'), []);
    });
});

test('seed import: records added via the API survive a restart', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1', title: 'A' }]);
        const a = await start();
        await a.save('books', '99', { title: 'New' });
        await a.close();

        const b = await start();
        assert.deepStrictEqual(ids(await b.find('books')), ['1', '99']);
    });
});

test('seed import: edits made through the API are not overwritten by the seed on restart', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1', title: 'Seed' }]);
        const a = await start();
        await a.save('books', '1', { title: 'Edited' });
        await a.close();

        const b = await start();
        assert.strictEqual((await b.find('books', { id: '1' }))[0].title, 'Edited');
    });
});

test('seed import: a seed file for a never-imported entity is imported on a later start', async () => {
    await withProject(async ({ dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1' }]);
        const a = await start();
        await a.remove('books', { id: '1' });
        await a.close();

        writeSeed(dataDir, 'authors', [{ id: 'x', name: 'X' }]); // new entity added between restarts
        const b = await start();
        assert.deepStrictEqual(ids(await b.find('authors')), ['x'], 'new entity seed must be imported');
        assert.deepStrictEqual(await b.find('books'), [], 'already-imported entity must stay as it is');
    });
});

test('seed import: object-form seed (non-array) is imported once as well', async () => {
    await withProject(async ({ dataDir, start }) => {
        fs.writeFileSync(path.join(dataDir, 'site.json'), JSON.stringify({ id: 's', name: 'Site' }));
        const a = await start();
        assert.strictEqual((await a.find('site')).length, 1);
        await a.remove('site', { id: 's' });
        await a.close();

        const b = await start();
        assert.deepStrictEqual(await b.find('site'), []);
    });
});

test('seed import: runs inside a single transaction (BEGIN ... COMMIT), not one autocommit per record', async () => {
    const log = [];
    // Records every SQL string issued through run()/prepare()/exec() on the real sqlite3 Database.
    class SpyDatabase extends sqlite3.Database {
        run(sql, ...rest) { log.push(String(sql)); return super.run(sql, ...rest); }
        prepare(sql, ...rest) { log.push(String(sql)); return super.prepare(sql, ...rest); }
        exec(sql, ...rest) { log.push(String(sql)); return super.exec(sql, ...rest); }
    }
    const spied = { Database: SpyDatabase, verbose: () => spied };

    await withProject(async ({ dataDir, start }) => {
        const N = 50;
        writeSeed(dataDir, 'books', Array.from({ length: N }, (_, i) => ({ id: String(i), title: `T${i}` })));
        const a = await start();
        assert.strictEqual((await a.find('books')).length, N);

        const norm = log.map(s => s.trim().toUpperCase());
        const begin = norm.findIndex(s => s.startsWith('BEGIN'));
        const commit = norm.findIndex(s => s.startsWith('COMMIT'));
        assert.ok(begin !== -1 && commit > begin, 'seed import must be wrapped in BEGIN ... COMMIT');
        const isInsert = (s) => s.includes('INTO DATA_RECORDS') && s.includes('VALUES');
        const outside = norm.slice(0, begin).concat(norm.slice(commit + 1)).filter(isInsert);
        assert.strictEqual(outside.length, 0, 'record inserts must happen inside the transaction');
    }, { sqlite3: spied });
});

// The slowness came from one autocommit per record. A wall-clock bound was flaky under parallel test load,
// so assert the cause instead: a large seed is imported with a single BEGIN/COMMIT pair.
test('seed import: 2000 seed records are imported in one transaction, not one commit per record', async () => {
    const log = [];
    class SpyDatabase extends sqlite3.Database {
        run(sql, ...rest) { log.push(String(sql)); return super.run(sql, ...rest); }
        exec(sql, ...rest) { log.push(String(sql)); return super.exec(sql, ...rest); }
    }
    const spied = { Database: SpyDatabase, verbose: () => spied };

    await withProject(async ({ dataDir, start }) => {
        const N = 2000;
        writeSeed(dataDir, 'books', Array.from({ length: N }, (_, i) => ({ id: String(i), title: `T${i}` })));
        const a = await start();
        assert.strictEqual((await a.find('books')).length, N);
        const norm = log.map(s => s.trim().toUpperCase());
        assert.strictEqual(norm.filter(s => s.startsWith('BEGIN')).length, 1, 'one BEGIN for the whole seed');
        assert.strictEqual(norm.filter(s => s.startsWith('COMMIT')).length, 1, 'one COMMIT for the whole seed');
    }, { sqlite3: spied });
});

test('seed import: a pre-existing DB without markers keeps its rows and is not re-seeded', async () => {
    await withProject(async ({ dir, dataDir, start }) => {
        writeSeed(dataDir, 'books', [{ id: '1' }, { id: '2' }]);
        const a = await start();
        await a.remove('books', { id: '1' });
        // Simulate a DB written by the old code: rows present, no seed markers
        await new Promise((res, rej) => a.db.run("DELETE FROM config WHERE name LIKE 'seed_imported:%'", (e) => e ? rej(e) : res()));
        await a.close();

        const b = await start();
        assert.deepStrictEqual(ids(await b.find('books')), ['2'], 'deleted record must stay deleted after marker migration');
        assert.strictEqual(await b.getConfig('seed_imported:books'), true, 'marker is written for the existing entity');
    });
});

test('seed import: a malformed seed file is skipped and its entity is not marked', async () => {
    await withProject(async ({ dataDir, start }) => {
        fs.writeFileSync(path.join(dataDir, 'bad.json'), '{ not json');
        writeSeed(dataDir, 'books', [{ id: '1' }]);
        const a = await start();
        assert.deepStrictEqual(ids(await a.find('books')), ['1']);
        assert.strictEqual(await a.getConfig('seed_imported:bad'), null);
        assert.strictEqual(await a.getConfig('seed_imported:books'), true);
    });
});
