import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { createRequire } from 'module';

// Regression tests for Issue #95: only paths ending in ".html" go to SSR, so on Windows (NTFS)
// "/page.html::$DATA" (the default data stream), its percent-encoded form and a case-variant name
// fell into the static branch and res.sendFile served the raw, un-rendered template.
// An alias of a page must either be refused (400/404) or SSR-rendered, never the raw source.
// The requests are sent raw because fetch()/URL would normalize some of these paths.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const RAW_MARK = 'RAW-TEMPLATE-MARK-5d2a';
const SECRET_PARTS = 'SECRET-PARTS-6b0e';
const SECRET_ENV = 'SECRET-ENV-0c93';
const CSS = 'body { color: #123456; } /* NTFS-ALIAS-CSS-a41f */';
const HIDDEN_MARK = 'HIDDEN-COND-MARK-7e41';
const TEMPLATE = `<html><body><p data-t-if="false">${HIDDEN_MARK}</p><p data-t-source="/_sys/data/items.json">{{name}} ${RAW_MARK}</p></body></html>`;

async function withProject(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-ntfs-'));
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, '_parts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>INDEX</body></html>');
    fs.writeFileSync(path.join(dir, 'page.html'), TEMPLATE);
    fs.writeFileSync(path.join(dir, 'sub', 'page.html'), TEMPLATE);
    fs.writeFileSync(path.join(dir, '_parts', 'p.html'), `<p>${SECRET_PARTS}</p>`);
    fs.writeFileSync(path.join(dir, '.env'), SECRET_ENV);
    fs.writeFileSync(path.join(dir, 'style.css'), CSS);

    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const get = (rawPath) => new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
        });
        req.on('error', reject);
        req.end();
    });
    try {
        await fn({ get });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

// Refused outright: no body that looks like the template source
const refused = (r, p) => {
    assert.ok(r.status === 400 || r.status === 404, `${p}: expected 400/404, got ${r.status}`);
    assert.ok(!r.body.includes(RAW_MARK), `${p}: leaked raw template`);
    assert.ok(!r.body.includes('data-t-source'), `${p}: leaked template markup`);
};

// Refused or rendered by SSR (the SSR response carries the injected state script), never the raw file
const notRaw = (r, p) => {
    if (r.status === 200) {
        assert.ok(r.body.includes('window.__BRACIFY_SSR__'), `${p}: served the raw template without SSR`);
    } else {
        refused(r, p);
    }
};

// --- Guards: normal behavior is unchanged ---

test('Normal /page.html is still SSR-rendered', async () => {
    await withProject(async ({ get }) => {
        for (const p of ['/page.html', '/sub/page.html']) {
            const r = await get(p);
            assert.strictEqual(r.status, 200);
            assert.ok(r.body.includes('window.__BRACIFY_SSR__'), `${p}: not SSR-rendered`);
        }
    });
});

test('Static assets are still served', async () => {
    await withProject(async ({ get }) => {
        const r = await get('/style.css');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body, CSS);
    });
});

// --- Aliases of a page must not return the raw template ---

for (const p of [
    '/page.html::$DATA',
    '/page.html::$data',
    '/page.html%3A%3A%24DATA',
    '/page.html%3a%3a%24data',
    '/page.html::$DATA/',
    '/sub/page.html::$DATA',
    '/sub/page.html%3A%3A%24DATA',
]) {
    test(`NTFS default data stream alias ${p} is not served as raw source`, async () => {
        await withProject(async ({ get }) => {
            refused(await get(p), p);
        });
    });
}

for (const p of ['/PAGE.HTML', '/Page.Html', '/SUB/PAGE.HTML', '/sub/Page.HTML']) {
    test(`Case variant ${p} never returns the raw template`, async () => {
        await withProject(async ({ get }) => {
            notRaw(await get(p), p);
        });
    });
}

// On NTFS a case variant resolves to the canonical file: it is rendered (not 404), sharing one template cache entry
test('Case variant /PAGE.HTML is SSR-rendered and shares the cache with /page.html', { skip: process.platform !== 'win32' }, async () => {
    const check = (r, p) => {
        assert.strictEqual(r.status, 200, p);
        assert.ok(r.body.includes('window.__BRACIFY_SSR__'), `${p}: not SSR-rendered`);
        assert.ok(!r.body.includes(HIDDEN_MARK), `${p}: data-t-if="false" content was not removed`);
    };
    for (const order of [['/PAGE.HTML', '/page.html', '/PAGE.HTML'], ['/page.html', '/PAGE.HTML', '/page.html']]) {
        await withProject(async ({ get }) => {
            for (const p of order) check(await get(p), p);
        });
    }
});

for (const p of ['/page.html.', '/page.html%20', '/page.html%2e', '/page.html::$DATA.', '/page.html:stream', '/page.html%00.txt']) {
    test(`Trailing dot/space/stream alias ${p} never returns the raw template`, async () => {
        await withProject(async ({ get }) => {
            notRaw(await get(p), p);
        });
    });
}

test('Directory stream alias ::$INDEX_ALLOCATION never returns the raw template', async () => {
    await withProject(async ({ get }) => {
        for (const p of ['/sub::$INDEX_ALLOCATION/page.html', '/sub:$I30:$INDEX_ALLOCATION/page.html', '/sub::$INDEX_ALLOCATION']) {
            notRaw(await get(p), p);
        }
    });
});

// --- Private/dotfile guards hold for stream aliases ---

test('Stream aliases do not bypass the underscore and dotfile guards', async () => {
    await withProject(async ({ get }) => {
        for (const p of ['/_parts/p.html::$DATA', '/_parts::$INDEX_ALLOCATION/p.html', '/_PARTS/p.html']) {
            const r = await get(p);
            assert.ok(r.status === 403 || r.status === 404, `${p}: expected 403/404, got ${r.status}`);
            assert.ok(!r.body.includes(SECRET_PARTS), `${p}: leaked partial`);
        }
        for (const p of ['/.env::$DATA', '/.env:$DATA', '/%2eenv::$DATA', '/.ENV', '/.env.']) {
            const r = await get(p);
            assert.ok(r.status === 403 || r.status === 404, `${p}: expected 403/404, got ${r.status}`);
            assert.ok(!r.body.includes(SECRET_ENV), `${p}: leaked .env`);
        }
    });
});
