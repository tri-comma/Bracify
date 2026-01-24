import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, 'cache_repro_project');

test('SSR Cache Destruction Reproduction: data-t-list should persist across multiple requests and after file updates', async (t) => {
    // Setup Test Environment
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

    // 1. Setup DB with 2 items
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(TEST_DIR, '_sys/data.db');
    if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new sqlite3.Database(dbPath);
    await new Promise((resolve) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS data_records (entity TEXT, id TEXT, value TEXT, PRIMARY KEY (entity, id))`);
            db.run("INSERT OR REPLACE INTO data_records (entity, id, value) VALUES (?, ?, ?)", ['projects', 'p1', JSON.stringify({ id: 'p1', name: 'Project 1' })]);
            db.run("INSERT OR REPLACE INTO data_records (entity, id, value) VALUES (?, ?, ?)", ['projects', 'p2', JSON.stringify({ id: 'p2', name: 'Project 2' })], resolve);
        });
    });
    db.close();

    // 2. Create index.html with data-t-list
    const generateHtml = (title) => `
    <!DOCTYPE html>
    <html>
    <head>
        <link data-t-source="projects" href="_sys/data/projects.json">
    </head>
    <body>
        <h1>${title} - Count: {projects._length}</h1>
        <ul>
            <li data-t-list="projects" class="project-item">
                {projects.name}
            </li>
        </ul>
    </body>
    </html>
    `;
    fs.writeFileSync(path.join(TEST_DIR, 'index.html'), generateHtml('Initial'));

    // 3. Initialize Server
    const server = new EngineServer(0, null, { sqlite3 });
    await server.setCurrentProjectPath(TEST_DIR);
    const port = await server.start();

    try {
        // --- SCENARIO 1: Multiple Requests ---
        console.log('--- SCENARIO 1: Multiple Requests ---');

        const res1 = await fetch(`http://localhost:${port}/index.html`);
        const text1 = await res1.text();
        assert.ok(text1.includes('Initial - Count: 2'), 'First request should show count 2');
        assert.strictEqual((text1.match(/class="project-item"/g) || []).length, 2, 'First request should render 2 items');

        const res2 = await fetch(`http://localhost:${port}/index.html`);
        const text2 = await res2.text();
        // This is expected to FAIL in current buggy state
        assert.strictEqual((text2.match(/class="project-item"/g) || []).length, 2, 'Second request should ALSO render 2 items');

        // --- SCENARIO 2: File Update ---
        console.log('--- SCENARIO 2: File Update ---');

        // Update file to trigger cache clear
        fs.writeFileSync(path.join(TEST_DIR, 'index.html'), generateHtml('Updated'));

        // Wait a bit for watcher to trigger (fs.watch can be slightly async)
        await new Promise(r => setTimeout(r, 200));

        // First request after update (should be fine because cache was cleared)
        const res3 = await fetch(`http://localhost:${port}/index.html`);
        const text3 = await res3.text();
        assert.ok(text3.includes('Updated - Count: 2'), 'Request after update should show new content');
        assert.strictEqual((text3.match(/class="project-item"/g) || []).length, 2, 'Request after update should render 2 items');

        // Second request after update (should be CORRUPT again)
        const res4 = await fetch(`http://localhost:${port}/index.html`);
        const text4 = await res4.text();

        // This is also expected to FAIL in current buggy state
        assert.strictEqual((text4.match(/class="project-item"/g) || []).length, 2, 'Third request (second after update) should ALSO render 2 items');

    } finally {
        await server.stop();
        // Cleanup
        for (let i = 0; i < 5; i++) {
            try {
                fs.rmSync(TEST_DIR, { recursive: true, force: true });
                break;
            } catch (e) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
    }
});
