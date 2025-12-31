import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');

// Mock DB module before loading EngineServer?
// Since EngineServer requires ./db/index.cjs relative to itself,
// we can't easily mock it without loader hooks or proxyquire.
// Instead, we'll try to use a real SQLite DB in a temp folder.

const TEST_DIR = path.join(process.cwd(), 'engine/tests/server/ssr_test_project');
const DIST_DIR = path.join(TEST_DIR, '_dist');

test('SSR Data Fetching: Unwrapping array on _limit=1', async (t) => {
    // Setup Test Environment
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

    // Create a dummy HTML that triggers SSR fetch
    // We can't easily test the internal fetch logic without making a request.
    // So we'll put a file in _dist and request it.

    // Create a dummy item in DB
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(TEST_DIR, '_sys/data.db');
    if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new sqlite3.Database(dbPath);
    await new Promise((resolve) => {
        db.serialize(() => {
            // Match schema with engine/server/db/drivers/sqlite.cjs
            db.run(`CREATE TABLE IF NOT EXISTS data_records (
                entity TEXT,
                id TEXT,
                value TEXT,
                PRIMARY KEY (entity, id)
            )`);
            const data = JSON.stringify({ id: 'item1', name: 'Test Item' });
            db.run("INSERT OR REPLACE INTO data_records (entity, id, value) VALUES (?, ?, ?)", ['items', 'item1', data], resolve);
        });
    });
    db.close();

    // Create HTML file in SOURCE directory, as builder cleans dist
    const htmlContent = `
    <html>
        <head>
            <link data-t-source="items" href="/_sys/data/items.json?id={?id}&_limit=1">
        </head>
        <body>
            <div data-t-scope="items">
                <span id="name">{items.name}</span>
                <input type="text" name="name">
            </div>
        </body>
    </html>
    `;
    fs.writeFileSync(path.join(TEST_DIR, 'test.html'), htmlContent);

    // Initialize Server
    const server = new EngineServer(0, console.log, { sqlite3 });
    await server.setCurrentProjectPath(TEST_DIR);
    const port = await server.start();

    try {
        // Request the page
        const res = await fetch(`http://localhost:${port}/test.html?id=item1`);
        const text = await res.text();

        console.log('--- RESPONSE ---');
        console.log(text);
        console.log('----------------');

        // Assertions
        // If unwrapping works, items becomes the object {id:'item1', ...}
        // So {items.name} resolves to 'Test Item'.
        // If unwrapping fails, items is [{...}], so items.name is undefined.

        assert.ok(text.includes('<span id="name">Test Item</span>'), 'SSR should render item name correctly by unwrapping array');
        assert.ok(text.includes('value="Test Item"'), 'SSR should render input value attribute');
        assert.ok(!text.includes('undefined'), 'Should not have undefined in output');

        // Allow time for server to log
        // console.log(text);

    } finally {
        await server.stop();
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
});
