import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #36: dynamic data-t-include="{...}" paths were resolved via
// path.join(projectRoot, p) without containment / _sys checks (path traversal + system data leak).

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const SECRET_PARENT = 'SECRET-PARENT-DIR-9f31';
const SECRET_TMP = 'SECRET-OS-TMPDIR-77ab';
const SECRET_SYS = 'SECRET-SYS-DATA-c0de';
const OK_A = 'LEGIT-PARTIAL-A';

async function withProject(fn) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-inc-'));
    const dir = path.join(parent, 'proj');
    fs.mkdirSync(path.join(dir, '_sys', 'data'), { recursive: true });
    fs.mkdirSync(path.join(dir, '_parts'), { recursive: true });
    const tmpSecret = path.join(os.tmpdir(), `bracify-inc-outside-${path.basename(parent)}.txt`);
    fs.writeFileSync(path.join(parent, 'secret.txt'), SECRET_PARENT);
    fs.writeFileSync(tmpSecret, SECRET_TMP);
    fs.writeFileSync(path.join(dir, '_sys', 'data', 'x.json'), SECRET_SYS);
    fs.writeFileSync(path.join(dir, '_sys', 'data', 'site.json'), SECRET_SYS);
    fs.writeFileSync(path.join(dir, '_parts', 'header.html'), '<header>STATIC-HEADER</header>');
    fs.writeFileSync(path.join(dir, '_parts', 'a.html'), `<p>${OK_A}</p>`);
    fs.writeFileSync(path.join(dir, '_parts', 'outer.html'), '<div>OUTER-START<div data-t-include="_parts/a.html"></div>OUTER-END</div>');
    fs.writeFileSync(path.join(dir, 'index.html'),
        '<html><body><div data-t-include="_parts/header.html"></div>' +
        '<main><div data-t-include="{_sys.query.p}"></div></main></body></html>');

    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://localhost:${port}`;
    // NOTE: the SSR template cache keys on the request path and (currently) freezes the first
    // request's resolved dynamic include, so each call uses its own page file to stay independent.
    let n = 0;
    const get = async (p, raw = false) => {
        const q = raw ? p : encodeURIComponent(p);
        const page = `page${n++}.html`;
        fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, page));
        const res = await fetch(`${base}/${page}?p=${q}`);
        return { status: res.status, body: await res.text() };
    };
    try {
        await fn({ server, base, dir, parent, tmpSecret, get, port });
    } finally {
        await server.stop();
        try { fs.rmSync(tmpSecret, { force: true }); } catch { }
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(parent, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

const SECRETS = [SECRET_PARENT, SECRET_TMP, SECRET_SYS];
const assertNoLeak = (body, label) => {
    for (const s of SECRETS) assert.ok(!body.includes(s), `${label}: leaked "${s}"`);
};

test('Include traversal: static & legit dynamic includes still work (guards)', async () => {
    await withProject(async ({ get }) => {
        const r = await get('_parts/a.html');
        assert.strictEqual(r.status, 200);
        assert.ok(r.body.includes('STATIC-HEADER'), 'static include broken');
        assert.ok(r.body.includes(OK_A), 'dynamic include of legit file broken');
        const n = await get('_parts/outer.html');
        assert.ok(n.body.includes('OUTER-START') && n.body.includes(OK_A) && n.body.includes('OUTER-END'), 'nested include broken: ' + n.body.slice(-300));
    });
});

test('Include traversal: dynamic ./ path inside project still works (guard)', async () => {
    await withProject(async ({ get }) => {
        const r = await get('./_parts/a.html');
        assert.ok(r.body.includes(OK_A));
    });
});

test('Include traversal: parent / ancestor directory traversal is refused', async () => {
    await withProject(async ({ get, tmpSecret }) => {
        const tmpName = path.basename(tmpSecret);
        const cases = [
            '../secret.txt',
            '../../' + tmpName,
            '../../../' + tmpName,
            '_parts/../../secret.txt',
            './../secret.txt',
            '....//secret.txt',
        ];
        for (const p of cases) assertNoLeak((await get(p)).body, `p=${p}`);
    });
});

test('Include traversal: URL-encoded / double-encoded dot-dot is refused', async () => {
    await withProject(async ({ get }) => {
        for (const raw of ['..%2fsecret.txt', '..%2Fsecret.txt', '%2e%2e%2fsecret.txt', '..%255fsecret.txt', '..%252fsecret.txt']) {
            assertNoLeak((await get(raw, true)).body, `raw p=${raw}`);
        }
    });
});

test('Include traversal: backslash traversal is refused', async () => {
    await withProject(async ({ get }) => {
        for (const p of ['..\\secret.txt', '_parts\\..\\..\\secret.txt', '..\\..\\x']) {
            assertNoLeak((await get(p)).body, `p=${p}`);
        }
    });
});

test('Include traversal: absolute paths are refused', async () => {
    await withProject(async ({ get, parent, tmpSecret }) => {
        const abs = path.join(parent, 'secret.txt');
        const fwd = abs.replace(/\\/g, '/');
        const cases = [abs, fwd, tmpSecret, '/' + fwd, 'file:///' + fwd];
        for (const p of cases) assertNoLeak((await get(p)).body, `p=${p}`);
    });
});

test('Include traversal: _sys directory is refused (all spellings)', async () => {
    await withProject(async ({ get, dir }) => {
        const proj = path.basename(dir);
        const cases = [
            '_sys/data/x.json',
            '_sys/data/site.json',
            '/_sys/data/x.json',
            './_sys/data/x.json',
            '_parts/../_sys/data/x.json',
            '_sys//data/x.json',
            '_sys\\data\\x.json',
            '_SYS/data/x.json',
            '_Sys/DATA/X.JSON',
            '../' + proj + '/_sys/data/x.json',
            '_sys/../_sys/data/x.json',
        ];
        for (const p of cases) assertNoLeak((await get(p)).body, `p=${p}`);
        assertNoLeak((await get('..%2f' + proj + '%2f_sys%2fdata%2fx.json', true)).body, 'encoded ../proj/_sys');
    });
});

test('Include traversal: data-driven (DB / JSON source) include path is also confined', async () => {
    await withProject(async ({ dir, port }) => {
        const db = require('../../server/db/index.cjs');
        const evilPaths = { evil1: '../secret.txt', evil2: '_sys/data/x.json' };
        for (const [k, v] of Object.entries(evilPaths)) await db.put('inctest_' + k, { path: v });
        await db.put('inctest_ok', { path: '_parts/a.html' });
        const pages = {};
        for (const k of ['evil1', 'evil2', 'ok']) {
            fs.writeFileSync(path.join(dir, `d_${k}.html`),
                `<html><body><link data-t-source="inc" href="_sys/data/inctest_${k}.json?_limit=1">` +
                '<div data-t-include="{inc.path}"></div></body></html>');
            pages[k] = await (await fetch(`http://localhost:${port}/d_${k}.html`)).text();
        }
        try {
            assert.ok(pages.ok.includes(OK_A), `data-driven legit include broken: ${pages.ok.slice(0, 300)}`);
            assertNoLeak(pages.evil1, 'db path ../secret.txt');
            assertNoLeak(pages.evil2, 'db path _sys/data/x.json');
        } finally {
            for (const k of [...Object.keys(evilPaths), 'ok']) { try { await db.delete('inctest_' + k); } catch { } }
        }
    });
});

// CSR (File System Access) side: resolvePathHandle must never climb out of the root handle.
// (The `_sys` exclusion for CSR lives in initializeBracify's includeResolver, which is browser-only
// and not unit-testable without refactoring; resolvePathHandle itself must keep serving _sys/data
// for data sources, so it is intentionally not asserted here.)
test('Include traversal (CSR): resolvePathHandle refuses ".." segments', async () => {
    const Bracify = require('../../lib/engine.cjs');
    const file = (name, content) => ({ name, kind: 'file', getFile: async () => ({ text: async () => content }) });
    const dir = (name, children = {}) => ({
        name, kind: 'directory',
        async getDirectoryHandle(n) { const c = children[n]; if (c && c.kind === 'directory') return c; throw new Error('nf'); },
        async getFileHandle(n) { const c = children[n]; if (c && c.kind === 'file') return c; throw new Error('nf'); },
    });
    const root = dir('root', { _parts: dir('_parts', { 'a.html': file('a.html', OK_A) }) });
    assert.ok(await Bracify.resolvePathHandle(root, '_parts/a.html'), 'legit path must resolve');
    for (const p of ['../secret.txt', '_parts/../../secret.txt', '..', '_parts/../..']) {
        assert.strictEqual(await Bracify.resolvePathHandle(root, p), null, `p=${p} must not resolve`);
    }
});

test('Include traversal: ADS / drive / UNC-like spellings are refused', async () => {
    await withProject(async ({ get }) => {
        for (const p of ['_sys::$INDEX_ALLOCATION/data/x.json', '_sys:$I30:$INDEX_ALLOCATION/data/x.json', 'C:secret.txt', '/C:/secret.txt', '\\\\?\\C:\\x', '\\\\server\\share\\x']) {
            assertNoLeak((await get(p)).body, `p=${p}`);
        }
    });
});

test('Include traversal: sibling dir sharing the project prefix (proj vs proj2) and symlink/junction escapes are refused', async () => {
    await withProject(async ({ get, dir, parent }) => {
        fs.mkdirSync(path.join(parent, 'proj2'));
        fs.writeFileSync(path.join(parent, 'proj2', 'o.txt'), SECRET_PARENT);
        assertNoLeak((await get('../proj2/o.txt')).body, 'proj2 prefix');
        let linked = false;
        try { fs.symlinkSync(parent, path.join(dir, 'lnk'), 'junction'); linked = true; } catch { }
        if (linked) assertNoLeak((await get('lnk/secret.txt')).body, 'symlink escape');
    });
});

// Static middleware: Express does not normalize a raw "/../" request target, so path.join(root, reqPath)
// used to serve (and SSR) .html files from the parent directory.
test('Static middleware: raw-socket "GET /../secret.html" does not serve a file outside the project root', async () => {
    const net = require('net');
    await withProject(async ({ parent, port }) => {
        fs.writeFileSync(path.join(parent, 'secret.html'), `<html><body>${SECRET_PARENT}</body></html>`);
        fs.writeFileSync(path.join(parent, 'secret.css'), SECRET_PARENT);
        for (const target of ['/../secret.html', '/../secret.css', '/_parts/../../secret.html', '/..\\secret.html']) {
            const res = await new Promise((resolve, reject) => {
                const sock = net.connect(port, '127.0.0.1');
                let buf = '';
                sock.on('data', d => { buf += d; });
                sock.on('close', () => resolve(buf));
                sock.on('error', reject);
                sock.write(`GET ${target} HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`);
            });
            assert.ok(!res.includes(SECRET_PARENT), `static leak for ${target}: ${res.slice(0, 200)}`);
        }
    });
});
