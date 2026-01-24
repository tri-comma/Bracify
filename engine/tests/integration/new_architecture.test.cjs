const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3');

// Utility to make requests
function makeRequest(port, method, url, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: url,
            method: method,
            headers: {
                ...headers,
                ...(body ? {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body)
                } : {})
            }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

test('New Architecture Integration Tests', async (t) => {
    const projectPath = path.resolve('../todo');

    // Inject sqlite3 driver for testing
    const server = new EngineServer(0, (msg) => {
        // console.log('[ServerLog]', msg);
    }, { sqlite3 });

    const port = await server.start();
    await server.setCurrentProjectPath(projectPath);

    await t.test('Test A: Underscore Guard (Security)', async () => {
        // GET to _sys/data.db should be 403
        const res1 = await makeRequest(port, 'GET', '/_sys/data.db');
        assert.strictEqual(res1.statusCode, 403, 'GET /_sys/data.db should be Forbidden');

        // GET to /_sys/data/tasks.json should be 403 (No direct JSON GET)
        const res3 = await makeRequest(port, 'GET', '/_sys/data/tasks.json');
        assert.strictEqual(res3.statusCode, 403, 'GET /_sys/data/*.json should be Forbidden');

        // POST to /_sys/data/tasks.json should be 302 (Redirect)
        const postData = 'content=TestTask&status=inbox';
        const res4 = await makeRequest(port, 'POST', '/_sys/data/tasks.json', postData);
        assert.strictEqual([302, 303].includes(res4.statusCode), true, 'POST to data handler should redirect');
    });

    await t.test('Test B: Postback Behavior Verification', async () => {
        const engineScript = fs.readFileSync(path.join(__dirname, '../../lib/engine.cjs'), 'utf-8');
        // Verify that 'submit' event listener does NOT contain fetch interception
        const hasFormInterception = engineScript.includes("document.addEventListener('submit'") && engineScript.includes("fetch(");
        assert.strictEqual(hasFormInterception, false, 'engine.cjs should not intercept form submissions with fetch');
    });

    await t.test('Test C: Absence of _dist reference', async () => {
        const serverScript = fs.readFileSync(path.join(__dirname, '../../server/index.cjs'), 'utf-8');
        const hasDistPath = serverScript.includes("'_dist'") || serverScript.includes('"_dist"');
        assert.strictEqual(hasDistPath, false, 'server/index.cjs should not reference _dist anymore');

        const builderExists = fs.existsSync(path.join(__dirname, '../../server/builder.cjs'));
        assert.strictEqual(builderExists, false, 'builder.cjs should be deleted');
    });

    await t.test('Test D: On-memory SSI Merging', async (t) => {
        const tempProject = path.join(__dirname, 'ssi_temp_project');
        if (!fs.existsSync(tempProject)) fs.mkdirSync(tempProject, { recursive: true });

        fs.writeFileSync(path.join(tempProject, 'header.html'), '<h1>Header</h1>');
        fs.writeFileSync(path.join(tempProject, 'index.html'), '<html><body><div data-t-include="header.html"></div></body></html>');

        const tempServer = new EngineServer(0, () => { }, { sqlite3 });
        const tempPort = await tempServer.start();
        await tempServer.setCurrentProjectPath(tempProject);

        try {
            const res = await makeRequest(tempPort, 'GET', '/index.html');
            assert.ok(res.body.includes('<h1>Header</h1>'), 'SSI should be merged in response');
            assert.strictEqual(fs.existsSync(path.join(tempProject, '_dist')), false, '_dist should not be created');
        } finally {
            await tempServer.stop();
            // Retry removal on Windows if needed
            for (let i = 0; i < 5; i++) {
                try {
                    fs.rmSync(tempProject, { recursive: true, force: true });
                    break;
                } catch (e) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }
    });

    await t.test('Test E: Redirect Control (data-t-redirect)', async () => {
        await server.setCurrentProjectPath(projectPath);
        const postData = 'content=Test&data-t-redirect=/success.html';
        const res = await makeRequest(port, 'POST', '/_sys/data/tasks.json', postData);
        if (res.statusCode !== 302) console.log('Test E Failed. Body:', res.body);
        assert.strictEqual(res.statusCode, 302);
        assert.ok(res.headers.location.endsWith('/success.html'), 'Should redirect to specified path');
    });

    await t.test('Test F: Data Nesting (Dot-notation parse)', async () => {
        // Re-init project connection because previous temp tests likely closed the singleton DB
        await server.setCurrentProjectPath(projectPath);

        const postData = 'user.name=Alice&user.age=25&id=user1';
        await makeRequest(port, 'POST', '/_sys/data/users.json', postData);

        // Since we can't GET directly, we check the DB or use an SSR page to verify.
        // For simplicity, let's use the db module directly if possible, or create an SSR page.
        const db = require('../../server/db/index.cjs');
        const users = await db.find('users', { id: 'user1' });
        const user = users[0];

        // This is expected to FAIL if logic is not implemented
        assert.strictEqual(typeof user.user, 'object', 'user property should be an object');
        assert.strictEqual(user.user.name, 'Alice', 'nested name should be Alice');
    });

    await t.test('Test G: File Watching (Hot Reload Simulation)', async () => {
        const tempProject = path.join(__dirname, 'watch_temp_project');
        if (!fs.existsSync(tempProject)) fs.mkdirSync(tempProject, { recursive: true });

        fs.writeFileSync(path.join(tempProject, 'index.html'), '<h1>Version 1</h1>');

        const tempServer = new EngineServer(0, () => { }, { sqlite3 });
        const tempPort = await tempServer.start();
        await tempServer.setCurrentProjectPath(tempProject);

        try {
            const res1 = await makeRequest(tempPort, 'GET', '/index.html');
            assert.ok(res1.body.includes('Version 1'));

            // Update file
            fs.writeFileSync(path.join(tempProject, 'index.html'), '<h1>Version 2</h1>');

            // Wait for watch event (if implemented)
            await new Promise(resolve => setTimeout(resolve, 500));

            const res2 = await makeRequest(tempPort, 'GET', '/index.html');
            assert.ok(res2.body.includes('Version 2'), 'Should reflect file changes without restart');
        } finally {
            await tempServer.stop();
            // Retry removal on Windows if needed
            for (let i = 0; i < 5; i++) {
                try {
                    fs.rmSync(tempProject, { recursive: true, force: true });
                    break;
                } catch (e) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }
    });

    await server.stop();
});
