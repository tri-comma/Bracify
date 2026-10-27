import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #41: res.sendFile() (send) applies dotfiles:'ignore' to every segment of
// the absolute path, so a project located under a dot directory (~/.hidden/app, .claude/worktrees/...)
// got 404 for CSS/images while SSR HTML worked. Dotfiles INSIDE the project must stay unserved.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const CSS = 'body { color: #123456; } /* DOT-PARENT-CSS-9a1f */';
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02, 0x03, 0x04]);
const PAGE = 'DOT-PARENT-PAGE-77c0';
const SECRET_ENV = 'SECRET-ENV-4d8e';
const SECRET_SUB = 'SECRET-SUBDOT-b602';
const SECRET_GIT = 'SECRET-GITCFG-e913';

// dotParent=true  -> <tmp>/.hidden/app ; false -> <tmp>/visible/app
async function withProject(dotParent, fn) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-dot-'));
    const dir = path.join(parent, dotParent ? '.hidden' : 'visible', 'app');
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<html><body><p>${PAGE}</p></body></html>`);
    fs.writeFileSync(path.join(dir, 'style.css'), CSS);
    fs.writeFileSync(path.join(dir, 'img', 'a.png'), PNG);
    fs.writeFileSync(path.join(dir, 'img', 'a+b,c@d(1)~x.png'), PNG);
    fs.writeFileSync(path.join(dir, '.env'), SECRET_ENV);
    fs.writeFileSync(path.join(dir, 'sub', '.secret'), SECRET_SUB);
    fs.writeFileSync(path.join(dir, '.git', 'config'), SECRET_GIT);

    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const get = async (p) => {
        const res = await fetch(`http://localhost:${port}${p}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, buf, body: buf.toString('utf-8') };
    };
    try {
        await fn({ get });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(parent, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

for (const dotParent of [true, false]) {
    const label = dotParent ? 'project under a dot directory' : 'project without a dot parent';

    // Dotfiles inside the project are never served (status 403 or 404), whatever the parent is called
    for (const [url, secret] of [['/.env', SECRET_ENV], ['/sub/.secret', SECRET_SUB], ['/.git/config', SECRET_GIT]]) {
        test(`Dotfile guard (${label}): ${url} is not served`, async () => {
            await withProject(dotParent, async ({ get }) => {
                const r = await get(url);
                assert.ok(r.status === 403 || r.status === 404, `expected 403/404, got ${r.status}`);
                assert.ok(!r.body.includes(secret), 'dotfile content leaked');
            });
        });
    }

    test(`SSR HTML is served (${label})`, async () => {
        await withProject(dotParent, async ({ get }) => {
            const r = await get('/index.html');
            assert.strictEqual(r.status, 200);
            assert.ok(r.body.includes(PAGE));
        });
    });

    test(`Static CSS is served (${label})`, async () => {
        await withProject(dotParent, async ({ get }) => {
            const r = await get('/style.css');
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body, CSS);
        });
    });

    test(`Static asset with special characters in its name is served (${label})`, async () => {
        await withProject(dotParent, async ({ get }) => {
            const r = await get('/img/' + 'a+b,c@d(1)~x.png');
            assert.strictEqual(r.status, 200);
            assert.ok(r.buf.equals(PNG), 'image bytes differ');
        });
    });

    test(`Nested static asset is served (${label})`, async () => {
        await withProject(dotParent, async ({ get }) => {
            const r = await get('/img/a.png');
            assert.strictEqual(r.status, 200);
            assert.ok(r.buf.equals(PNG), 'image bytes differ');
        });
    });
}
