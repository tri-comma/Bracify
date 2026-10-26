import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #45: data-t-redirect must work from the form attribute,
// resolve relative paths against the page, and never produce an open redirect.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const SECRET = 'SQLITE_ERROR boom';

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-redir-'));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>HELLO</body></html>');
    fs.writeFileSync(path.join(dir, 'sub', 'form.html'),
        '<html><body><form method="post" action="/_sys/data/x.json" data-t-redirect="done.html">' +
        '<input name="title" value="t1"><button>go</button></form></body></html>');
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    try {
        await fn({ base, dir, origin: new URL(base).origin });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

async function withPatched(obj, key, impl, fn) {
    const orig = obj[key];
    obj[key] = impl;
    try { await fn(); } finally { obj[key] = orig; }
}

const post = (base, fields, headers = {}, p = '/_sys/data/x.json') => fetch(`${base}${p}`, {
    method: 'POST', redirect: 'manual',
    headers: { ...FORM_H, ...headers },
    body: new URLSearchParams(fields).toString()
});

function assertSameOrigin(res, base, origin, label) {
    assert.ok(res.status >= 300 && res.status < 400, `${label}: expected redirect, got ${res.status}`);
    const loc = res.headers.get('location');
    assert.ok(loc, `${label}: missing Location`);
    // Browsers strip tab/newline and treat backslash as slash; mirror that via WHATWG URL
    const u = new URL(loc, base);
    assert.strictEqual(u.origin, origin, `${label}: Location "${loc}" leaves origin (-> ${u.href})`);
    return loc;
}

const EVIL = [
    'https://evil.example/', 'http://evil.example', '//evil.example', '//evil.example/x',
    '/\\evil.example', '\\/evil.example', '\\\\evil.example', 'https:evil.example', 'http:evil.example',
    '/\t/evil.example', '/\n/evil.example', '\t//evil.example', ' //evil.example', '/\r/evil.example',
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'vbscript:x', 'ftp://evil.example/', '///evil.example', '/%09/evil.example',
];

// ---------- (a) open redirect via hidden field ----------

for (const v of EVIL) {
    test(`hidden data-t-redirect ${JSON.stringify(v)} stays same-origin`, async () => {
        await withServer(async ({ base, origin }) => {
            const res = await post(base, { title: 'a', 'data-t-redirect': v });
            assertSameOrigin(res, base, origin, v);
        });
    });
}

test('hidden data-t-redirect external + same-origin Referer: no external Location', async () => {
    await withServer(async ({ base, origin }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': 'https://evil.example/' },
            { Referer: `${base}/sub/form.html`, Origin: base });
        assertSameOrigin(res, base, origin, 'ext+referer');
    });
});

// ---------- (b) foreign Referer ----------

test('foreign Referer without data-t-redirect falls back to same-origin', async () => {
    await withServer(async ({ base, origin }) => {
        for (const ref of ['https://evil.example/page', 'http://evil.example:80/', '//evil.example/', 'javascript:alert(1)']) {
            const res = await post(base, { title: 'a' }, { Referer: ref });
            assertSameOrigin(res, base, origin, `Referer ${ref}`);
        }
    });
});

test('foreign Referer falls back to "/"', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a' }, { Referer: 'https://evil.example/page' });
        assert.strictEqual(new URL(res.headers.get('location'), base).pathname, '/');
    });
});

// ---------- (c) relative resolution ----------

test('relative books.html with Referer /sub/form.html -> /sub/books.html', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': 'books.html' }, { Referer: `${base}/sub/form.html` });
        assert.strictEqual(res.headers.get('location'), '/sub/books.html');
    });
});

test('relative ../x.html with Referer /sub/form.html -> /x.html', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': '../x.html' }, { Referer: `${base}/sub/form.html` });
        assert.strictEqual(res.headers.get('location'), '/x.html');
    });
});

test('relative ?ok=1 with Referer /sub/form.html -> /sub/form.html?ok=1', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': '?ok=1' }, { Referer: `${base}/sub/form.html` });
        assert.strictEqual(res.headers.get('location'), '/sub/form.html?ok=1');
    });
});

test('relative #frag with Referer /sub/form.html -> /sub/form.html#frag', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': '#frag' }, { Referer: `${base}/sub/form.html` });
        assert.strictEqual(res.headers.get('location'), '/sub/form.html#frag');
    });
});

test('relative path never resolves against /_sys/data/ (no Referer)', async () => {
    await withServer(async ({ base, origin }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': 'books.html' });
        const loc = assertSameOrigin(res, base, origin, 'no referer');
        assert.ok(loc.startsWith('/'), `Location must be an absolute path, got "${loc}"`);
        assert.ok(!loc.startsWith('/_sys/'), `Location resolved under /_sys/: ${loc}`);
    });
});

// ---------- (d) error PRG path ----------

for (const v of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
    test(`error PRG with redirect ${JSON.stringify(v)} stays same-origin`, async () => {
        await withServer(async ({ base, origin }) => {
            await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
                const res = await post(base, { title: 'a', 'data-t-redirect': v });
                assertSameOrigin(res, base, origin, v);
            });
        });
    });
}

test('error PRG with foreign Referer never redirects externally', async () => {
    await withServer(async ({ base, origin }) => {
        await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
            const res = await post(base, { title: 'a' }, { Referer: 'https://evil.example/p?x=1' });
            if (res.status >= 300 && res.status < 400) assertSameOrigin(res, base, origin, 'foreign referer error');
            else assert.ok(!(res.headers.get('location') || '').includes('evil.example'));
        });
    });
});

test('error PRG with relative target resolves against Referer and appends ?error=', async () => {
    await withServer(async ({ base }) => {
        await withPatched(db, 'save', async () => { throw new Error(SECRET); }, async () => {
            const res = await post(base, { title: 'a', 'data-t-redirect': 'retry.html' }, { Referer: `${base}/sub/form.html` });
            const loc = res.headers.get('location');
            assert.ok(loc && loc.startsWith('/sub/retry.html?error='), String(loc));
        });
    });
});

// ---------- (e) SSR of the form attribute ----------

test('SSR emits a hidden data-t-redirect input for the form attribute', async () => {
    await withServer(async ({ base }) => {
        const html = await (await fetch(`${base}/sub/form.html`)).text();
        const inputs = html.match(/<input\b[^>]*>/gi) || [];
        const hidden = inputs.find(t => /name=["']data-t-redirect["']/i.test(t));
        assert.ok(hidden, `no hidden data-t-redirect input in:\n${html.slice(0, 800)}`);
        assert.ok(/type=["']hidden["']/i.test(hidden), hidden);
        assert.ok(/value=["']done\.html["']/i.test(hidden), hidden);
    });
});

test('end-to-end: submit SSR form as a browser would -> /sub/done.html', async () => {
    await withServer(async ({ base }) => {
        const pageUrl = `${base}/sub/form.html`;
        const html = await (await fetch(pageUrl)).text();
        const form = (html.match(/<form\b[\s\S]*?<\/form>/i) || [''])[0];
        const fields = new URLSearchParams();
        for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
            const name = (tag.match(/name=["']([^"']*)["']/i) || [])[1];
            const value = (tag.match(/value=["']([^"']*)["']/i) || [])[1] || '';
            if (name) fields.append(name, value);
        }
        const res = await fetch(`${base}/_sys/data/x.json`, {
            method: 'POST', redirect: 'manual',
            headers: { ...FORM_H, Referer: pageUrl, Origin: base },
            body: fields.toString()
        });
        assert.ok(res.status >= 300 && res.status < 400, `status ${res.status}`);
        assert.strictEqual(res.headers.get('location'), '/sub/done.html');
    });
});

// ---------- (f) guards ----------

test('guard: same-origin absolute path /books.html is honored', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': '/books.html' });
        assert.strictEqual(res.headers.get('location'), '/books.html');
    });
});

test('guard: full same-origin URL is honored', async () => {
    await withServer(async ({ base, origin }) => {
        const res = await post(base, { title: 'a', 'data-t-redirect': `${base}/x` }, { Referer: `${base}/sub/form.html` });
        const loc = assertSameOrigin(res, base, origin, 'same-origin url');
        assert.strictEqual(new URL(loc, base).pathname, '/x');
    });
});

test('guard: same-origin Referer without data-t-redirect is used', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a' }, { Referer: `${base}/sub/form.html?q=1` });
        assert.strictEqual(new URL(res.headers.get('location'), base).pathname, '/sub/form.html');
    });
});

test('guard: no redirect info -> "/"', async () => {
    await withServer(async ({ base }) => {
        const res = await post(base, { title: 'a' });
        assert.strictEqual(new URL(res.headers.get('location'), base).pathname, '/');
    });
});

// ---------- (g) Host header variants / path normalization (review) ----------

import http from 'node:http';
function rawPost(port, headers, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/_sys/data/x.json', method: 'POST', headers: { ...FORM_H, 'Content-Length': Buffer.byteLength(body), ...headers } },
            (res) => { res.resume(); res.on('end', () => resolve(res)); });
        req.on('error', reject); req.end(body);
    });
}

test('uppercase / default-port / IPv6-style Host header and Referer still resolve same-origin', async () => {
    await withServer(async ({ base }) => {
        const port = new URL(base).port;
        const hostForms = [`LOCALHOST:${port}`, `localhost:${port}`];
        for (const h of hostForms) {
            const res = await rawPost(port, { Host: h, Referer: `http://localhost:${port}/sub/form.html` }, 'title=a&data-t-redirect=' + encodeURIComponent('done.html'));
            assert.strictEqual(res.headers.location, '/sub/done.html', h);
        }
        // https Referer behind a TLS-terminating proxy (req.protocol is http): still honored, path only
        const res = await rawPost(port, { Host: `localhost:${port}`, Referer: `https://localhost:${port}/sub/form.html` }, 'title=a&data-t-redirect=' + encodeURIComponent('done.html'));
        assert.strictEqual(res.headers.location, '/sub/done.html');
        // Malformed Host header never throws a 500 and never leaves the origin
        const bad = await rawPost(port, { Host: 'a b', Referer: 'http://evil.example/' }, 'title=a&data-t-redirect=' + encodeURIComponent('https://evil.example/'));
        assert.ok(bad.statusCode < 500, String(bad.statusCode));
        if (bad.headers.location) assert.ok(bad.headers.location.startsWith('/') && !bad.headers.location.startsWith('//'));
    });
});

for (const v of ['/..//evil.example', '/.//evil.example', '/a/../..//evil.example', '/%2F%2Fevil.example', '/%5Cevil.example', 'http://user@evil.example/', 'http://localhost@evil.example/', '?x=//evil.example', '#//evil.example', '/' + 'a'.repeat(8000)]) {
    test(`normalization ${JSON.stringify(v.slice(0, 40))} never yields an off-origin or protocol-relative Location`, async () => {
        await withServer(async ({ base, origin }) => {
            const res = await post(base, { title: 'a', 'data-t-redirect': v }, { Referer: `${base}/sub/form.html` });
            if (res.status >= 400) return; // header too large etc. is a safe refusal
            const loc = assertSameOrigin(res, base, origin, v);
            assert.ok(loc.startsWith('/') && !loc.startsWith('//'), loc);
            assert.ok(!/[\r\n]/.test(loc));
        });
    });
}
