import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_SRC = path.resolve(__dirname, '../../../studio');

const TIMEOUT = 120000;

let tmpRoot, studioDir, projA, projB;
let server, base;
const allPids = new Set();

const getFreePort = () => new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
});

const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const portResponds = async (port) => {
    try { await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) }); return true; } catch (e) { return false; }
};

const post = (url, fields) => fetch(base + url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString()
});

const page = async (p) => (await fetch(base + p)).text();

const records = async () => {
    // Read records through the SSR-rendered studio page's embedded pre-fetched data
    const html = await page('/index.html');
    return JSON.parse(html.match(/<script type="application\/json" id="__bracify_state__">(.*?)<\/script>/s)[1]).data.projects;
};

const getRecord = async (id) => (await records()).find(r => r.id === id);

// fs.cpSync is unstable on some Node builds (segfault on Windows); copy manually
const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
};

const mkProject = (name, text) => {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html><body><h1>${text}</h1></body></html>`);
    return dir;
};

before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-pm-'));
    studioDir = path.join(tmpRoot, 'studio-like');
    copyDir(STUDIO_SRC, studioDir);
    fs.rmSync(path.join(studioDir, '_sys'), { recursive: true, force: true });
    projA = mkProject('proj-a', 'Hello from A');
    projB = mkProject('proj-b', 'Hello from B');

    server = new EngineServer(0, () => { }, { sqlite3, manageProjects: true });
    await server.start();
    await server.setCurrentProjectPath(studioDir);
    base = `http://localhost:${server.port}`;

    const startPort = await getFreePort();
    // Both projects ask for the same port to force auto-increment
    await post('/_sys/data/projects.json', { id: 'a', name: 'Project A', path: projA, port: String(startPort), status: 'stopped' });
    await post('/_sys/data/projects.json', { id: 'b', name: 'Project B', path: projB, port: String(startPort), status: 'stopped' });
    await post('/_sys/data/projects.json', { id: 'bad', name: 'Bad', path: path.join(tmpRoot, 'nope'), port: '', status: 'stopped' });
});

after(async () => {
    // Kill every recorded child first, so nothing holds files in the temp dirs
    for (const pid of allPids) {
        if (isAlive(pid)) {
            try { process.kill(pid, 'SIGKILL'); } catch (e) { console.error('cleanup kill failed:', pid, e.message); }
        }
    }
    try { if (server) await server.stop(); } catch (e) { console.error('cleanup server.stop failed:', e.message); }
    for (let i = 0; i < 10; i++) {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); break; } catch (e) {
            console.error(`cleanup rm attempt ${i + 1} failed: ${e.message}`);
            await sleep(500);
        }
    }
});

test('multi-project start/stop via SSR forms', { timeout: TIMEOUT * 3 }, async (t) => {
    let recA, recB;

    await t.test('start two projects concurrently on different ports', { timeout: TIMEOUT }, async () => {
        const [ra, rb] = await Promise.all([
            post('/_sys/server/start', { id: 'a', 'data-t-redirect': '/index.html' }),
            post('/_sys/server/start', { id: 'b', 'data-t-redirect': '/index.html' })
        ]);
        assert.strictEqual(ra.status, 303);
        assert.strictEqual(rb.status, 303);
        assert.strictEqual(ra.headers.get('location'), '/index.html', `A redirected to ${ra.headers.get('location')}`);
        assert.strictEqual(rb.headers.get('location'), '/index.html', `B redirected to ${rb.headers.get('location')}`);

        recA = await getRecord('a');
        recB = await getRecord('b');
        for (const r of [recA, recB]) {
            assert.strictEqual(r.status, 'running');
            assert.ok(r.pid > 0);
            allPids.add(r.pid);
        }
        assert.notStrictEqual(recA.port, recB.port, 'projects must use different ports');
        assert.notStrictEqual(recA.pid, recB.pid);
        // Same requested port => one was auto-incremented
        assert.ok(Math.abs(Number(recA.port) - Number(recB.port)) >= 1);

        const htmlA = await (await fetch(`http://localhost:${recA.port}/`)).text();
        const htmlB = await (await fetch(`http://localhost:${recB.port}/`)).text();
        assert.ok(htmlA.includes('Hello from A'));
        assert.ok(htmlB.includes('Hello from B'));
        assert.strictEqual(server.processManager.list().length, 2);
    });

    await t.test('studio pages render running state (Port, PID, link, Stop form)', async () => {
        const html = await page('/index.html');
        assert.ok(html.includes('action="/_sys/server/stop"'), 'stop form shown for running project');
        assert.ok(html.includes(`http://localhost:${recA.port}/`));
        assert.ok(html.includes(`PID: ${recA.pid}`));

        const detail = await page('/project.html?id=a');
        assert.ok(detail.includes('action="/_sys/server/stop"'));
        assert.ok(!detail.includes('action="/_sys/server/start"'));
        assert.ok(detail.includes(`Port: ${recA.port}`));
    });

    await t.test('starting an already running project redirects back with ?error', async () => {
        const r = await post('/_sys/server/start', { id: 'a', 'data-t-redirect': '/index.html' });
        assert.strictEqual(r.status, 303);
        const loc = r.headers.get('location');
        assert.ok(loc.startsWith('/index.html?error='), loc);
        assert.ok(decodeURIComponent(loc).includes('already running'));
        const html = await page(loc);
        assert.ok(html.includes('already running'), 'error shown via {?error}');
    });

    await t.test('missing project directory / unknown id / no referer errors', async () => {
        let r = await post('/_sys/server/start', { id: 'bad', 'data-t-redirect': '/index.html' });
        assert.strictEqual(r.status, 303);
        assert.ok(decodeURIComponent(r.headers.get('location')).includes('Project directory not found'));

        r = await post('/_sys/server/start', { id: 'zzz', 'data-t-redirect': '/index.html?x=1' });
        const loc = r.headers.get('location');
        assert.ok(loc.startsWith('/index.html?x=1&error='), loc);

        r = await post('/_sys/server/start', { id: 'zzz' });
        assert.strictEqual(r.status, 400);

        const g = await fetch(base + '/_sys/server/start');
        assert.strictEqual(g.status, 403, 'GET stays blocked');
    });

    await t.test('stop one project; the other keeps running', { timeout: TIMEOUT }, async () => {
        const r = await post('/_sys/server/stop', { id: 'a', 'data-t-redirect': '/index.html' });
        assert.strictEqual(r.status, 303);
        const a = await getRecord('a');
        assert.strictEqual(a.status, 'stopped');
        assert.ok(!a.pid);

        let down = false;
        for (let i = 0; i < 40 && !down; i++) { down = !(await portResponds(recA.port)); if (!down) await sleep(250); }
        assert.ok(down, 'stopped project no longer responds');
        assert.ok(!isAlive(recA.pid));
        assert.ok(await portResponds(recB.port), 'other project still running');
        assert.strictEqual((await getRecord('b')).status, 'running');
    });

    await t.test('server.stop() kills all children', { timeout: TIMEOUT }, async () => {
        await server.stop();
        let down = false;
        for (let i = 0; i < 40 && !down; i++) { down = !(await portResponds(recB.port)); if (!down) await sleep(250); }
        assert.ok(down);
        assert.ok(!isAlive(recB.pid), 'no orphan process');
        assert.strictEqual(server.processManager.list().length, 0);
    });
});

test('reconcile marks unmanaged running records as stopped', { timeout: TIMEOUT }, async () => {
    const s2 = new EngineServer(0, () => { }, { sqlite3, manageProjects: true });
    try {
        await s2.start();
        await s2.setCurrentProjectPath(studioDir);
        const b2 = `http://localhost:${s2.port}`;
        await fetch(b2 + '/_sys/data/projects.json', {
            method: 'POST', redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id: 'ghost', name: 'Ghost', path: projA, port: String(await getFreePort()), status: 'running', pid: '99999' }).toString()
        });
        await s2.setCurrentProjectPath(studioDir); // re-open => reconcile
        const html = await (await fetch(b2 + '/index.html')).text();
        const data = JSON.parse(html.match(/<script type="application\/json" id="__bracify_state__">(.*?)<\/script>/s)[1]).data;
        assert.strictEqual(data.projects.find(r => r.id === 'ghost').status, 'stopped');
    } finally {
        await s2.stop();
    }
});

test('same-id concurrent starts, CSRF, gating, unexpected exit', { timeout: TIMEOUT * 2 }, async (t) => {
    const s3 = new EngineServer(0, () => { }, { sqlite3, manageProjects: true });
    await s3.start();
    await s3.setCurrentProjectPath(studioDir);
    const b3 = `http://localhost:${s3.port}`;
    const post3 = (url, fields, headers = {}) => fetch(b3 + url, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(fields).toString()
    });
    const rec3 = async (id) => {
        const html = await (await fetch(b3 + '/index.html')).text();
        const d = JSON.parse(html.match(/<script type="application\/json" id="__bracify_state__">(.*?)<\/script>/s)[1]).data;
        return d.projects.find(r => r.id === id);
    };
    try {
        await post3('/_sys/data/projects.json', { id: 'c', name: 'C', path: projA, port: String(await getFreePort()), status: 'stopped' });

        await t.test('concurrent starts of the same id: only one child', async () => {
            const rs = await Promise.all([
                post3('/_sys/server/start', { id: 'c', 'data-t-redirect': '/index.html' }),
                post3('/_sys/server/start', { id: 'c', 'data-t-redirect': '/index.html' })
            ]);
            for (const p of s3.processManager.list()) allPids.add(p.pid);
            const locs = rs.map(r => r.headers.get('location'));
            assert.strictEqual(locs.filter(l => l.includes('error=')).length, 1, JSON.stringify(locs));
            assert.strictEqual(s3.processManager.list().length, 1);
        });

        await t.test('unexpected child exit marks the record stopped', async () => {
            const r = await rec3('c');
            assert.strictEqual(r.status, 'running');
            process.kill(r.pid, 'SIGKILL');
            let st;
            for (let i = 0; i < 40; i++) { st = (await rec3('c')).status; if (st === 'stopped') break; await sleep(250); }
            assert.strictEqual(st, 'stopped');
            assert.strictEqual(s3.processManager.list().length, 0);
        });

        await t.test('cross-origin POST is rejected, same-origin allowed', async () => {
            let r = await post3('/_sys/server/start', { id: 'c' }, { Origin: 'http://evil.example.com' });
            assert.strictEqual(r.status, 403);
            assert.strictEqual(s3.processManager.list().length, 0);
            r = await post3('/_sys/server/start', { id: 'c', 'data-t-redirect': '/index.html' }, { Origin: b3 });
            assert.strictEqual(r.status, 303);
            assert.strictEqual(r.headers.get('location'), '/index.html');
            for (const p of s3.processManager.list()) allPids.add(p.pid);
            assert.strictEqual(s3.processManager.list().length, 1);
        });
    } finally {
        await s3.stop();
    }
    assert.strictEqual(s3.processManager.list().length, 0, 'stopAll leaves none');
});

test('server control endpoints are disabled without manageProjects', { timeout: TIMEOUT }, async () => {
    const s4 = new EngineServer(0, () => { }, { sqlite3 });
    try {
        await s4.start();
        await s4.setCurrentProjectPath(studioDir);
        const r = await fetch(`http://localhost:${s4.port}/_sys/server/start`, {
            method: 'POST', redirect: 'manual',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'id=a'
        });
        assert.strictEqual(r.status, 404);
    } finally {
        await s4.stop();
    }
});
