import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #68: static serving (sendFile) and SSR (readFileSync) followed
// symlinks/junctions placed inside the project to files outside it, or into _sys.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const SECRET_TXT = 'SECRET-OUTSIDE-TXT-5e21';
const SECRET_HTML = 'SECRET-OUTSIDE-HTML-a7c4';
const SECRET_SYS = 'SECRET-SYS-DATA-3b9d';
const OK_ASSET = 'LEGIT-ASSET-c11f';
const OK_PAGE = 'LEGIT-PAGE-d2e0';

async function withProject(fn) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-lnk-'));
    const dir = path.join(parent, 'proj');
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(path.join(dir, '_sys', 'data'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), SECRET_TXT);
    fs.writeFileSync(path.join(outside, 'leak.html'), `<p>${SECRET_HTML}</p>`);
    fs.writeFileSync(path.join(dir, '_sys', 'secret.txt'), SECRET_SYS);
    fs.writeFileSync(path.join(dir, 'assets', 'a.txt'), OK_ASSET);
    fs.writeFileSync(path.join(dir, 'assets', 'page.html'), `<html><body><p>${OK_PAGE}</p></body></html>`);

    // Directory junctions need no admin rights on Windows; the type is ignored on POSIX.
    const link = (target, name) => {
        try { fs.symlinkSync(target, path.join(dir, name), 'junction'); return true; } catch { return false; }
    };
    const linked = link(outside, 'ext') && link(path.join(dir, '_sys'), 'alias') && link(path.join(dir, 'assets'), 'assets2');

    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const get = async (p) => {
        const res = await fetch(`http://localhost:${port}${p}`);
        return { status: res.status, body: await res.text() };
    };
    try {
        await fn({ get, linked });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(parent, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

test('Static serving: a link to a directory outside the project does not serve its files', async (t) => {
    await withProject(async ({ get, linked }) => {
        if (!linked) return t.skip('symlink/junction creation not permitted');
        const r = await get('/ext/secret.txt');
        assert.strictEqual(r.status, 404);
        assert.ok(!r.body.includes(SECRET_TXT), 'outside file leaked via static serving');
    });
});

test('SSR: a link to a directory outside the project does not render its HTML', async (t) => {
    await withProject(async ({ get, linked }) => {
        if (!linked) return t.skip('symlink/junction creation not permitted');
        const r = await get('/ext/leak.html');
        assert.strictEqual(r.status, 404);
        assert.ok(!r.body.includes(SECRET_HTML), 'outside HTML leaked via SSR');
    });
});

test('Static serving: a link into _sys is refused after resolving the real path', async (t) => {
    await withProject(async ({ get, linked }) => {
        if (!linked) return t.skip('symlink/junction creation not permitted');
        const r = await get('/alias/secret.txt');
        assert.strictEqual(r.status, 404);
        assert.ok(!r.body.includes(SECRET_SYS), '_sys data leaked via link');
    });
});

test('Static serving: links that stay inside the project and plain files still work', async (t) => {
    await withProject(async ({ get, linked }) => {
        const plain = await get('/assets/a.txt');
        assert.strictEqual(plain.status, 200);
        assert.ok(plain.body.includes(OK_ASSET));
        const page = await get('/assets/page.html');
        assert.strictEqual(page.status, 200);
        assert.ok(page.body.includes(OK_PAGE));
        if (!linked) return t.skip('symlink/junction creation not permitted');
        const viaLink = await get('/assets2/a.txt');
        assert.strictEqual(viaLink.status, 200);
        assert.ok(viaLink.body.includes(OK_ASSET));
        const pageViaLink = await get('/assets2/page.html');
        assert.strictEqual(pageViaLink.status, 200);
        assert.ok(pageViaLink.body.includes(OK_PAGE));
    });
});
