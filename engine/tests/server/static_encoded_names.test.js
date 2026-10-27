import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { createRequire } from 'module';

// Regression tests for Issue #86: since #41 the static handler resolved the RAW (still percent-encoded)
// req.path on disk, so any file whose name needs percent-encoding (spaces, multibyte, '%', ...) got 404,
// for static assets, SSR pages and data-t-include partials alike. Decoding must not weaken the guards:
// encoded traversal, encoded dotfiles and double-encoded sequences must stay unserved.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x0A, 0x0B, 0x0C, 0x0D]);
const PNG2 = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x21, 0x22, 0x23, 0x24]);
const TXT_PCT = 'PERCENT-NAME-3c71';
const TXT_PLUS = 'PLUS-NAME-8e02';
const TXT_SUB = 'SPACE-DIR-a5d9';
const PAGE_SPACE = 'SPACE-PAGE-61bb';
const PAGE_JA = 'JA-PAGE-0f4c';
const PART = 'SPACE-PARTIAL-d2e8';
const OUTSIDE = 'OUTSIDE-SECRET-91ac';
const SECRET_ENV = 'SECRET-ENV-77f3';
const TXT_HASH = 'HASH-NAME-2b64';
const TXT_SEMI = 'SEMI-NAME-9d13';
const SECRET_SYS = 'SECRET-SYS-4e8a';
const SECRET_PARTS = 'SECRET-PARTS-1c97';
const SECRET_DOUBLE = 'SECRET-DOUBLE-be15';
const DOT_CSS = 'body { color: #654321; } /* ENC-DOT-PARENT-c7d0 */';

// Layout: <tmp>/outside.txt (outside the project), <tmp>/[.hidden/]app = the project
async function withProject(fn, { dotParent = false } = {}) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-enc-'));
    const dir = path.join(parent, dotParent ? '.hidden' : 'plain', 'app');
    fs.mkdirSync(path.join(dir, 'my dir'), { recursive: true });
    fs.mkdirSync(path.join(dir, '_parts'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'outside.txt'), OUTSIDE);
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>INDEX</body></html>');
    fs.writeFileSync(path.join(dir, 'my photo.png'), PNG);
    fs.writeFileSync(path.join(dir, '写真.png'), PNG2);
    fs.writeFileSync(path.join(dir, '100%.txt'), TXT_PCT);
    fs.writeFileSync(path.join(dir, 'a+b.txt'), TXT_PLUS);
    fs.writeFileSync(path.join(dir, 'my dir', 'note file.txt'), TXT_SUB);
    fs.writeFileSync(path.join(dir, 'my page.html'), `<html><body><p>${PAGE_SPACE}</p></body></html>`);
    fs.writeFileSync(path.join(dir, '日本語.html'), `<html><body><p>${PAGE_JA}</p></body></html>`);
    fs.writeFileSync(path.join(dir, 'inc.html'), '<html><body><div data-t-include="_parts/my partial.html"></div></body></html>');
    fs.writeFileSync(path.join(dir, '_parts', 'my partial.html'), `<p>${PART}</p>`);
    fs.writeFileSync(path.join(dir, 'a#b.txt'), TXT_HASH);
    fs.writeFileSync(path.join(dir, 'a;b.txt'), TXT_SEMI);
    fs.mkdirSync(path.join(dir, '_sys'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, '_sys', 'secret.txt'), SECRET_SYS);
    fs.writeFileSync(path.join(dir, '_parts', 'p.html'), `<p>${SECRET_PARTS}</p>`);
    fs.writeFileSync(path.join(dir, '.env'), SECRET_ENV);
    fs.writeFileSync(path.join(dir, 'style.css'), DOT_CSS);
    // A file literally named "%2e%2e" must not be reachable by double-encoded requests
    fs.mkdirSync(path.join(dir, '%2e%2e'), { recursive: true });
    fs.writeFileSync(path.join(dir, '%2e%2e', 'x.txt'), SECRET_DOUBLE);

    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    // Raw request: fetch()/URL would normalize "%2e%2e" segments before sending
    const get = (rawPath) => new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve({ status: res.statusCode, buf, body: buf.toString('utf-8') });
            });
        });
        req.on('error', reject);
        req.end();
    });
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

const blocked = (r, ...secrets) => {
    assert.ok(r.status === 403 || r.status === 404, `expected 403/404, got ${r.status}`);
    for (const s of secrets) assert.ok(!r.body.includes(s), `leaked ${s}`);
};

// --- Files with encoded names must be served ---

test('Static asset with a space (%20) is served', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/my%20photo.png');
        assert.strictEqual(r.status, 200);
        assert.ok(r.buf.equals(PNG), 'image bytes differ');
    });
});

test('Static asset with a UTF-8 name (percent-encoded) is served', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/' + encodeURIComponent('写真.png'));
        assert.strictEqual(r.status, 200);
        assert.ok(r.buf.equals(PNG2), 'image bytes differ');
    });
});

test('Static asset whose name contains a literal % (requested as %25) is served', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/100%25.txt');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body, TXT_PCT);
    });
});

test('Static asset with a literal + in its name is served (+ is not a space in a path)', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/a+b.txt');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body, TXT_PLUS);
        const enc = await get('/a%2Bb.txt');
        assert.strictEqual(enc.status, 200);
        assert.strictEqual(enc.body, TXT_PLUS);
    });
});

test('Static asset inside a directory with a space is served', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/my%20dir/note%20file.txt');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body, TXT_SUB);
    });
});

test('SSR page with a space in its name is rendered', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/my%20page.html');
        assert.strictEqual(r.status, 200);
        assert.ok(r.body.includes(PAGE_SPACE));
    });
});

test('SSR page with a UTF-8 name is rendered', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/' + encodeURIComponent('日本語.html'));
        assert.strictEqual(r.status, 200);
        assert.ok(r.body.includes(PAGE_JA));
    });
});

test('data-t-include partial with a space in its name is inlined during SSR', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/inc.html');
        assert.strictEqual(r.status, 200);
        assert.ok(r.body.includes(PART), 'partial was not included');
    });
});

test('Encoded names are served from a project under a dot directory (#41 kept working)', async () => {
    await withProject(async ({ get }) => {
        const css = await get('/style.css');
        assert.strictEqual(css.status, 200);
        assert.strictEqual(css.body, DOT_CSS);
        const img = await get('/my%20photo.png');
        assert.strictEqual(img.status, 200);
        assert.ok(img.buf.equals(PNG), 'image bytes differ');
        const pct = await get('/100%25.txt');
        assert.strictEqual(pct.status, 200);
        assert.strictEqual(pct.body, TXT_PCT);
    }, { dotParent: true });
});

// --- Guards that must stay blocked (never the file content) ---

for (const p of ['/%2e%2e/outside.txt', '/..%2foutside.txt', '/%2e%2e%2foutside.txt', '/my%20dir/%2e%2e/%2e%2e/outside.txt', '/..%5coutside.txt']) {
    test(`Encoded traversal ${p} does not reach a file outside the project`, async () => {
        await withProject(async ({ get }) => {
            blocked(await get(p), OUTSIDE);
        });
    });
}

test('Encoded dotfile %2eenv is not served', async () => {
    await withProject(async ({ get }) => {
        blocked(await get('/%2eenv'), SECRET_ENV);
        blocked(await get('/.env'), SECRET_ENV);
    });
});

test('Double-encoded %252e%252e is decoded only once (no traversal, no match on a literal "%2e%2e" dir)', async () => {
    await withProject(async ({ get }) => {
        blocked(await get('/%252e%252e/outside.txt'), OUTSIDE);
        // %252e%252e decodes once to the literal directory name "%2e%2e", which exists: serving it is fine,
        // but it must never be treated as ".." (the outside file stays unreachable)
        const r = await get('/%252e%252e/x.txt');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body, SECRET_DOUBLE);
        assert.ok(!r.body.includes(OUTSIDE));
    });
});

test('Static assets with # and ; in their names are served (requested encoded)', async () => {
    await withProject(async ({ get }) => {
        const h = await get('/a%23b.txt');
        assert.strictEqual(h.status, 200);
        assert.strictEqual(h.body, TXT_HASH);
        const sc = await get('/a%3Bb.txt');
        assert.strictEqual(sc.status, 200);
        assert.strictEqual(sc.body, TXT_SEMI);
    });
});

test('Encoded underscore paths stay blocked after decoding', async () => {
    await withProject(async ({ get }) => {
        blocked(await get('/%5fsys/secret.txt'), SECRET_SYS);
        blocked(await get('/%5Fsys%2Fsecret.txt'), SECRET_SYS);
        blocked(await get('/%5fparts/p.html'), SECRET_PARTS);
        blocked(await get('/sub%2f..%2f_sys%2fsecret.txt'), SECRET_SYS);
    });
});

test('Malformed percent escape does not serve anything or crash the server', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/%E0%A4%A.txt');
        assert.ok(r.status === 400 || r.status === 404, `expected 400/404, got ${r.status}`);
        const ok = await get('/my%20photo.png');
        assert.strictEqual(ok.status, 200);
    });
});
