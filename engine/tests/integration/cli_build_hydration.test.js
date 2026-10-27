/**
 * Issue #88 - a CLI-built page (cli/index.js) that also loads the client engine must hydrate like the
 * server's SSR output for the same page and URL. The build bakes data-t-scope values into the HTML and
 * strips data-t-scope (exactly like SSR), so without the SSR marker (window.__BRACIFY_SSR__, #47) the client
 * would see an in-scope field as scope-less and overwrite it with a same-named query parameter.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { csr } = require('../core/helpers.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../../cli/index.js');

const PAGE = `<!DOCTYPE html><html><head><title>t</title></head><body>
<div data-t-scope="project"><input id="in" name="title" value=""></div>
<input id="out" name="title" value="">
<p id="t">{project.title}</p>
</body></html>`;

const PAGE2 = `<!DOCTYPE html><html><head><title>t</title></head><body>
<div data-t-scope="project">
<input id="cbOn" type="checkbox" name="on">
<input id="cbOff" type="checkbox" name="off" checked>
<input id="r1" type="radio" name="color" value="red"><input id="r2" type="radio" name="color" value="blue">
<select id="sel" name="sel"><option data-t-list="opts" value="{opts.v}">{opts.v}</option></select>
<textarea id="ta" name="note"></textarea>
<input id="nul" name="nul" value="keep">
<input id="miss" name="nokey" value="orig">
</div>
<div data-t-list="rows"><input id="row" name="rows.n" value=""></div>
</body></html>`;

describe('CLI build + client engine hydrates like SSR (#88)', () => {
    let tmp, built, builtMore;
    const cleanups = [];

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cli-hyd-'));
        const inDir = path.join(tmp, 'in');
        fs.mkdirSync(inDir, { recursive: true });
        fs.writeFileSync(path.join(inDir, 'mock-data.json'), JSON.stringify({ project: { title: 'Data Title', on: true, off: false, color: 'blue', sel: 'b', note: 'Data Note', nul: null }, opts: [{ v: 'a' }, { v: 'b' }], rows: [{ n: 'r1' }] }));
        fs.writeFileSync(path.join(inDir, 'page.html'), PAGE);
        fs.writeFileSync(path.join(inDir, 'more.html'), PAGE2);
        const r = spawnSync(process.execPath, [cliPath, inDir, path.join(tmp, 'out')], { encoding: 'utf-8', timeout: 60000 });
        assert.strictEqual(r.status, 0, r.stderr);
        built = fs.readFileSync(path.join(tmp, 'out', 'page.html'), 'utf-8');
        builtMore = fs.readFileSync(path.join(tmp, 'out', 'more.html'), 'utf-8');
    });

    after(() => {
        while (cleanups.length) cleanups.pop()();
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    // Boots the built page in jsdom with the client engine at page.html?<qs>
    async function boot(qs) {
        const r = await csr(built, { url: 'http://localhost/page.html' + (qs ? '?' + qs : '') });
        cleanups.push(r.cleanup);
        return r.document;
    }

    test('build bakes the scope value into the field and strips data-t-scope', () => {
        const doc = new JSDOM(built).window.document;
        assert.strictEqual(doc.getElementById('in').value, 'Data Title');
        assert.ok(!built.includes('data-t-scope'), built);
    });

    test('in-scope field keeps its data value when the page is opened with a same-named query param', async () => {
        const doc = await boot('title=xxx');
        assert.strictEqual(doc.getElementById('in').value, 'Data Title');
    });

    test('the build marks only the data-bound control with data-t-bound (no global SSR marker, so scope-less controls still take the query)', () => {
        const doc = new JSDOM(built).window.document;
        assert.ok(doc.getElementById('in').hasAttribute('data-t-bound'), built);
        assert.ok(!doc.getElementById('out').hasAttribute('data-t-bound'), built);
        assert.ok(!built.includes('__BRACIFY_SSR__'), built);
    });

    test('without a query param the in-scope field keeps its data value', async () => {
        const doc = await boot('');
        assert.strictEqual(doc.getElementById('in').value, 'Data Title');
    });

    test('baked text binding is untouched by the client engine', async () => {
        const doc = await boot('title=xxx');
        assert.strictEqual(doc.getElementById('t').textContent, 'Data Title');
    });

    test('data-bound checkbox, radio, select, textarea, list row and null keep their data under a colliding query', async () => {
        const qs = 'on=0&off=1&color=red&sel=a&note=Q&nul=Q&nokey=Q&rows.n=Q';
        const r = await csr(builtMore, { url: 'http://localhost/more.html?' + qs });
        cleanups.push(r.cleanup);
        const doc = r.document;
        assert.strictEqual(doc.getElementById('cbOn').checked, true);
        assert.strictEqual(doc.getElementById('cbOff').checked, false);
        assert.strictEqual(doc.getElementById('r2').checked, true);
        assert.strictEqual(doc.getElementById('r1').checked, false);
        assert.strictEqual(doc.getElementById('sel').value, 'b');
        assert.strictEqual(doc.getElementById('ta').value, 'Data Note');
        assert.strictEqual(doc.getElementById('row').value, 'r1');
        assert.strictEqual(doc.getElementById('nul').value, 'keep');
    });

    test('null-bound control is marked, in-scope control with a missing key is not', () => {
        const doc = new JSDOM(builtMore).window.document;
        assert.ok(doc.getElementById('nul').hasAttribute('data-t-bound'), builtMore);
        assert.ok(!doc.getElementById('miss').hasAttribute('data-t-bound'), builtMore);
    });

    test('scope-less input is still filled from the query by the client engine (guard for #47 / SSR rule)', async () => {
        const doc = await boot('title=xxx');
        assert.strictEqual(doc.getElementById('out').value, 'xxx');
    });
});
