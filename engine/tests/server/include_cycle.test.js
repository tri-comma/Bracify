import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fork } from 'child_process';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';

// Regression tests for Issue #34: data-t-include has no depth limit / cycle detection.
// Mutual include a->b->a hangs the server event loop; self-include leaks "Maximum call stack size exceeded".
//
// Safety: the server runs in a child process (killed in finally) and requests use an AbortController
// timeout, so an unfixed (hanging) server makes the test FAIL via timeout instead of hanging the suite.
//
// MAX_INCLUDE_DEPTH: the fix is expected to use a constant around 32 (Engine.processElement). Tests only
// require that nesting of SHALLOW_DEPTH (10) renders fully and a chain of DEEP_DEPTH (60) is cut off.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD = path.join(__dirname, 'include_cycle_child.cjs');
const SHALLOW_DEPTH = 10;
const DEEP_DEPTH = 60;
const REQ_TIMEOUT = 5000;
// Startup (require of jsdom/sqlite3/express) is slow on loaded or cloud-synced disks; the printed PORT is the
// ready signal, so this only bounds a child that never starts. Hang detection uses the per-request budgets.
const START_TIMEOUT = 120000;
const TEST_TIMEOUT = 240000;
const LEAK_RE = /Maximum call stack|RangeError|\bat .*\.cjs:\d+/;

const w = (dir, rel, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
};
const inc = (p) => `<div data-t-include="${p}"></div>`;

async function withServer(setup, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cyc-'));
    w(dir, 'index.html', '<html><body><p>NORMAL-PAGE-OK</p></body></html>');
    w(dir, '_parts/warm.html', '<b>WARM</b>');
    w(dir, 'warm_page.html', `<html><body>${inc('_parts/warm.html')}</body></html>`);
    setup(dir);
    const child = fork(CHILD, ['server', dir], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=256'] });
    try {
        const port = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('child start timeout')), START_TIMEOUT);
            child.stdout.on('data', (d) => { const m = /PORT:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); resolve(+m[1]); } });
            child.on('exit', (c) => { clearTimeout(t); reject(new Error('child exited early ' + c)); });
        });
        const get = async (url, ms = REQ_TIMEOUT) => {
            const ac = new AbortController();
            const t = setTimeout(() => ac.abort(), ms);
            try {
                const res = await fetch(`http://localhost:${port}${url}`, { signal: ac.signal });
                return { status: res.status, body: await res.text() };
            } catch (e) {
                return { timeout: true, error: e.name + ': ' + e.message };
            } finally { clearTimeout(t); }
        };
        // Warm-up (renders a page with an include): lazy module loading / cold disk reads must not count against the hang budgets
        await get('/index.html', 60000);
        await get('/warm_page.html', 60000);
        await fn({ get, dir });
    } finally {
        child.kill('SIGKILL');
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    }
}

// Cyclic page must answer in time, without leaking stack errors, and the server must stay responsive.
async function assertCycleSurvives(get, url, label) {
    const r = await get(url);
    assert.ok(!r.timeout, `${label}: cyclic include hung/never responded (${r.error})`);
    assert.ok(!LEAK_RE.test(r.body), `${label}: leaked stack error: ${r.body.slice(0, 200)}`);
    const n = await get('/index.html', 3000);
    assert.ok(!n.timeout, `${label}: server unresponsive after cyclic request`);
    assert.strictEqual(n.status, 200);
    assert.ok(n.body.includes('NORMAL-PAGE-OK'));
}

test('Include cycle: self-include does not crash/leak', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        w(d, '_parts/self.html', `<b>SELF</b>${inc('_parts/self.html')}`);
        w(d, 'p_self.html', `<html><body>${inc('_parts/self.html')}</body></html>`);
    }, async ({ get }) => assertCycleSurvives(get, '/p_self.html', 'self'));
});

test('Include cycle: mutual a<->b does not hang the server', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        w(d, '_parts/a.html', `<i>A</i>${inc('_parts/b.html')}`);
        w(d, '_parts/b.html', `<i>B</i>${inc('_parts/a.html')}`);
        w(d, 'p_mutual.html', `<html><body>${inc('_parts/a.html')}</body></html>`);
    }, async ({ get }) => assertCycleSurvives(get, '/p_mutual.html', 'mutual'));
});

test('Include cycle: 3-cycle a->b->c->a does not hang the server', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        w(d, '_parts/a.html', `<i>A</i>${inc('_parts/b.html')}`);
        w(d, '_parts/b.html', `<i>B</i>${inc('_parts/c.html')}`);
        w(d, '_parts/c.html', `<i>C</i>${inc('_parts/a.html')}`);
        w(d, 'p_three.html', `<html><body>${inc('_parts/a.html')}</body></html>`);
    }, async ({ get }) => assertCycleSurvives(get, '/p_three.html', '3-cycle'));
});

test('Include cycle: dynamic path cycle via {_sys.query.p} does not hang', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        // dyn.html includes whatever ?p= says; p=_parts/dyn.html makes it include itself
        w(d, '_parts/dyn.html', '<i>DYN</i><div data-t-include="{_sys.query.p}"></div>');
        w(d, 'p_dyn.html', '<html><body><div data-t-include="{_sys.query.p}"></div></body></html>');
    }, async ({ get }) => assertCycleSurvives(get, '/p_dyn.html?p=' + encodeURIComponent('_parts/dyn.html'), 'dynamic'));
});

function chain(d, n, prefix) {
    for (let i = 0; i < n; i++) {
        const next = i < n - 1 ? inc(`_parts/${prefix}${i + 1}.html`) : '';
        w(d, `_parts/${prefix}${i}.html`, `<span>L${i}</span>${next}`);
    }
    w(d, `${prefix}page.html`, `<html><body>${inc(`_parts/${prefix}0.html`)}</body></html>`);
}

test('Include depth: over-deep NON-cyclic chain is cut off (60 levels)', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => chain(d, DEEP_DEPTH, 'deep'), async ({ get }) => {
        const r = await get('/deeppage.html');
        assert.ok(!r.timeout, 'deep chain timed out');
        assert.ok(!LEAK_RE.test(r.body), 'deep chain leaked stack error');
        assert.ok(r.body.includes('>L0<'), 'top of chain should render');
        assert.ok(!r.body.includes(`>L${DEEP_DEPTH - 1}<`), `chain of ${DEEP_DEPTH} must be cut off by a max include depth`);
    });
});

test('Include depth: shallow nesting (10 levels) still renders fully (guard)', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => chain(d, SHALLOW_DEPTH, 'shal'), async ({ get }) => {
        const r = await get('/shalpage.html');
        assert.strictEqual(r.status, 200);
        for (let i = 0; i < SHALLOW_DEPTH; i++) assert.ok(r.body.includes(`>L${i}<`), `level ${i} missing`);
    });
});

test('Include cycle: same partial included several times side-by-side is not a cycle (guard)', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        w(d, '_parts/card.html', '<em>CARD-CONTENT</em>');
        w(d, 'p_twice.html', `<html><body>${inc('_parts/card.html')}${inc('_parts/card.html')}<section>${inc('_parts/card.html')}</section></body></html>`);
    }, async ({ get }) => {
        const r = await get('/p_twice.html');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.split('CARD-CONTENT').length - 1, 3, 'partial must render at every sibling position');
    });
});

// ---- Engine-level (Engine.processElement is shared with CSR), isolated in a terminable worker ----
function runEngine(pages, entry, ms = 5000) {
    return new Promise((resolve) => {
        const wk = new Worker(CHILD, { workerData: { mode: 'engine', pages, entry }, resourceLimits: { maxOldGenerationSizeMb: 128 } });
        let t = null; // hang timer starts only once the worker has finished loading its modules
        const loadTimer = setTimeout(() => { wk.terminate(); resolve({ ok: false, error: 'worker failed to load within ' + START_TIMEOUT + 'ms' }); }, START_TIMEOUT);
        wk.on('message', (m) => {
            if (m && m.ready) {
                clearTimeout(loadTimer);
                t = setTimeout(() => { wk.terminate(); resolve({ timeout: true }); }, ms);
                wk.postMessage('go');
                return;
            }
            clearTimeout(loadTimer); clearTimeout(t); wk.terminate(); resolve(m);
        });
        wk.on('error', (e) => { clearTimeout(loadTimer); clearTimeout(t); resolve({ ok: false, error: String(e.message || e) }); });
    });
}

test('Engine.processElement: cyclic includes terminate with fake resolver (mutual + self)', { timeout: TEST_TIMEOUT }, async () => {
    const mutual = { 'a.html': `<i>A</i>${inc('b.html')}`, 'b.html': `<i>B</i>${inc('a.html')}` };
    const r = await runEngine(mutual, 'a.html');
    assert.ok(!r.timeout, 'mutual cycle did not terminate in Engine');
    assert.ok(!/Maximum call stack|heap/.test(r.error || ''), 'engine blew up on mutual cycle: ' + r.error);
    const self = { 's.html': `<i>S</i>${inc('s.html')}` };
    const r2 = await runEngine(self, 's.html');
    assert.ok(!r2.timeout, 'self cycle did not terminate in Engine');
    assert.ok(!/Maximum call stack|heap/.test(r2.error || ''), 'engine blew up on self cycle: ' + r2.error);
});

test('Engine.processElement: sibling reuse renders every time (guard)', { timeout: TEST_TIMEOUT }, async () => {
    const pages = { 'c.html': '<em>CARD</em>', 'top.html': `${inc('c.html')}${inc('c.html')}` };
    const r = await runEngine(pages, 'top.html');
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.html.split('CARD').length - 1, 2);
});

// Per-include cost of the server's resolveInclude (existsSync + 2x realpathSync + readFileSync) is dominated by
// filesystem speed, which varies by orders of magnitude (Windows + antivirus/cloud sync: ~15ms; Linux: ~0.05ms).
// The bounded fan-out does at most ~2 x MAX_INCLUDES_PER_RENDER (500) resolves on a cold request (render + cache
// pass), so the 10s budget is extended by that many measured resolves. Unbounded fan-out (2^25) still blows it.
function measureResolveMs(dir) {
    const file = path.join(dir, 'index.html');
    const t0 = process.hrtime.bigint();
    const N = 20;
    for (let i = 0; i < N; i++) { fs.existsSync(file); fs.realpathSync(file); fs.realpathSync(dir); fs.readFileSync(file, 'utf-8'); }
    return Number(process.hrtime.bigint() - t0) / 1e6 / N;
}

// ---- Fan-out amplification: non-cyclic, depth-limited, but 2^N renders without a total budget ----
test('Include budget: 2-way fan-out 25 levels deep responds quickly and server stays responsive', { timeout: TEST_TIMEOUT }, async () => {
    await withServer((d) => {
        const N = 25;
        for (let i = 0; i < N; i++) w(d, `_parts/f${i}.html`, `<u>F${i}</u>${inc(`_parts/f${i + 1}.html`)}${inc(`_parts/f${i + 1}.html`)}`);
        w(d, `_parts/f${N}.html`, '<u>LEAF</u>');
        w(d, 'p_fan.html', `<html><body>${inc('_parts/f0.html')}</body></html>`);
    }, async ({ get, dir }) => {
        const budget = 10000 + Math.ceil(1100 * measureResolveMs(dir));
        const r = await get('/p_fan.html', budget); // unbounded would be 2^25 renders
        assert.ok(!r.timeout, `fan-out amplification hung the server (${r.error})`);
        assert.ok(!LEAK_RE.test(r.body), 'fan-out leaked stack error');
        const n = await get('/index.html', 3000);
        assert.ok(!n.timeout && n.status === 200 && n.body.includes('NORMAL-PAGE-OK'), 'server unresponsive after fan-out request');
    });
});

test('Engine include budget: total includes capped per render, and is not shared between renders', { timeout: TEST_TIMEOUT }, async () => {
    const wide = {};
    wide['leaf.html'] = '<em>LEAF</em>';
    wide['top.html'] = Array.from({ length: 1500 }, () => inc('leaf.html')).join('');
    const r1 = await runEngine(wide, 'top.html', 15000);
    assert.ok(r1.ok, r1.error);
    const n1 = r1.html.split('LEAF').length - 1;
    assert.ok(n1 > 0 && n1 <= 500, `expected 1..500 expanded includes, got ${n1}`);
    // a second, independent render must get a fresh budget
    const r2 = await runEngine(wide, 'top.html', 15000);
    assert.strictEqual(r2.html.split('LEAF').length - 1, n1, 'budget leaked between renders');
});
