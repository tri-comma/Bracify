import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../../cli/index.js');

describe('CLI build (cli/index.js)', () => {
    let tmp, inputDir, outputDir, result;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cli-'));
        inputDir = path.join(tmp, 'in');
        outputDir = path.join(tmp, 'out');
        fs.mkdirSync(path.join(inputDir, '_parts'), { recursive: true });
        fs.mkdirSync(path.join(inputDir, 'css'), { recursive: true });
        fs.writeFileSync(path.join(inputDir, '_parts', 'p.html'), '<p>PART</p>');
        fs.writeFileSync(path.join(inputDir, 'css', 'a.css'), 'body{color:red}');
        fs.writeFileSync(
            path.join(inputDir, 'i.html'),
            '<html><body><div data-t-include="_parts/p.html"></div></body></html>'
        );
        result = spawnSync(process.execPath, [cliPath, inputDir, outputDir], { encoding: 'utf-8', timeout: 60000 });
    });

    after(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('exits with code 0', () => {
        assert.strictEqual(result.status, 0, result.stderr);
    });

    test('reports no processing errors', () => {
        assert.ok(!/Error processing/.test(result.stdout + result.stderr), result.stderr);
    });

    test('resolves data-t-include into the output HTML', () => {
        const outFile = path.join(outputDir, 'i.html');
        assert.ok(fs.existsSync(outFile), 'output i.html should exist');
        const out = fs.readFileSync(outFile, 'utf-8');
        assert.ok(out.includes('<p>PART</p>'), out);
        assert.ok(!out.includes('data-t-include'), out);
    });

    test('copies non-HTML assets unchanged', () => {
        const copied = path.join(outputDir, 'css', 'a.css');
        assert.ok(fs.existsSync(copied));
        assert.strictEqual(fs.readFileSync(copied, 'utf-8'), 'body{color:red}');
    });
});

describe('CLI build: hardening', () => {
    let tmp;
    const run = (inDir, outDir) =>
        spawnSync(process.execPath, [cliPath, inDir, outDir], { encoding: 'utf-8', timeout: 60000 });

    before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cli-h-')); });
    after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

    test('does not emit _-prefixed paths as standalone output', () => {
        const inDir = path.join(tmp, 'u-in');
        const outDir = path.join(tmp, 'u-out');
        fs.mkdirSync(path.join(inDir, '_parts'), { recursive: true });
        fs.writeFileSync(path.join(inDir, '_parts', 'p.html'), '<p>PART</p>');
        fs.writeFileSync(path.join(inDir, '_parts', 'note.txt'), 'private');
        fs.writeFileSync(path.join(inDir, '_hidden.html'), '<p>H</p>');
        fs.writeFileSync(path.join(inDir, 'i.html'), '<html><body><div data-t-include="_parts/p.html"></div></body></html>');
        const r = run(inDir, outDir);
        assert.strictEqual(r.status, 0, r.stderr);
        assert.ok(!fs.existsSync(path.join(outDir, '_parts')), '_parts must not be emitted');
        assert.ok(!fs.existsSync(path.join(outDir, '_hidden.html')), '_hidden.html must not be emitted');
        assert.ok(fs.readFileSync(path.join(outDir, 'i.html'), 'utf-8').includes('<p>PART</p>'));
    });

    test('does not resolve includes outside the input dir', () => {
        const base = path.join(tmp, 'c');
        const inDir = path.join(base, 'in');
        fs.mkdirSync(inDir, { recursive: true });
        fs.writeFileSync(path.join(base, 'secret.html'), '<p>TOPSECRET</p>');
        fs.writeFileSync(path.join(inDir, 'i.html'), '<html><body><div data-t-include="../secret.html"></div></body></html>');
        const r = run(inDir, path.join(base, 'out'));
        assert.strictEqual(r.status, 0, r.stderr);
        const out = fs.readFileSync(path.join(base, 'out', 'i.html'), 'utf-8');
        assert.ok(!out.includes('TOPSECRET'), out);
        assert.ok(!out.includes('data-t-include'), out);
    });

    test('page with data-t-source does not hit the browser fetcher', () => {
        const inDir = path.join(tmp, 's-in');
        fs.mkdirSync(inDir, { recursive: true });
        fs.writeFileSync(path.join(inDir, 's.html'), '<html><head><link data-t-source href="_sys/data/items.json"></head><body><p>x</p></body></html>');
        const r = run(inDir, path.join(tmp, 's-out'));
        assert.strictEqual(r.status, 0, r.stderr);
        assert.ok(!/ReferenceError/.test(r.stdout + r.stderr), r.stderr);
    });

    test('exits non-zero when processing a page fails', () => {
        const inDir = path.join(tmp, 'f-in');
        fs.mkdirSync(path.join(inDir, 'dir.html'), { recursive: true });
        fs.writeFileSync(path.join(inDir, 'ok.html'), '<p>ok</p>');
        // The include points at a directory: reading it fails with EISDIR, a genuine processing error
        fs.writeFileSync(path.join(inDir, 'bad.html'), '<html><body><div data-t-include="dir.html"></div></body></html>');
        const r = run(inDir, path.join(tmp, 'f-out'));
        assert.notStrictEqual(r.status, 0, r.stdout);
        assert.ok(/Error processing bad\.html/.test(r.stderr), r.stderr);
    });
});
