import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';

// Issue #55: the CLI build output must be self-contained on file:// - the engine is emitted next to the built pages
// as bracify.js (always the CLI's own engine version) and the pages keep their relative script tags.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../../cli/index.js');
const ENGINE_SRC = fs.readFileSync(path.resolve(__dirname, '../../lib/engine.cjs'), 'utf-8');

describe('CLI build emits the engine as bracify.js', () => {
    let tmp, outputDir, result;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cli-eng-'));
        const inputDir = path.join(tmp, 'in');
        outputDir = path.join(tmp, 'out');
        fs.mkdirSync(path.join(inputDir, 'posts'), { recursive: true });
        fs.writeFileSync(path.join(inputDir, 'index.html'),
            '<html><head><script src="bracify.js"></script></head><body><h1>Home</h1></body></html>');
        fs.writeFileSync(path.join(inputDir, 'posts', 'index.html'),
            '<html><head><script src="../bracify.js"></script></head><body><h1>Posts</h1></body></html>');
        // A stale copy of the engine in the project must not end up in the build
        fs.writeFileSync(path.join(inputDir, 'bracify.js'), '/* STALE-ENGINE */');
        result = spawnSync(process.execPath, [cliPath, inputDir, outputDir], { encoding: 'utf-8', timeout: 60000 });
    });

    after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

    test('build succeeds', () => {
        assert.strictEqual(result.status, 0, result.stderr);
    });

    test('<output>/bracify.js is the CLI engine, byte for byte', () => {
        const f = path.join(outputDir, 'bracify.js');
        assert.ok(fs.existsSync(f), 'bracify.js must exist in the output root');
        assert.strictEqual(fs.readFileSync(f, 'utf-8'), ENGINE_SRC);
    });

    test('built pages keep a single relative engine script tag', () => {
        const root = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8');
        const sub = fs.readFileSync(path.join(outputDir, 'posts', 'index.html'), 'utf-8');
        assert.strictEqual((root.match(/<script[^>]*\bsrc="bracify\.js"/g) || []).length, 1, root);
        assert.strictEqual((sub.match(/<script[^>]*\bsrc="\.\.\/bracify\.js"/g) || []).length, 1, sub);
    });
});

describe('CLI build without a project engine file', () => {
    test('bracify.js is still emitted', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-cli-eng2-'));
        try {
            const inputDir = path.join(tmp, 'in'), outputDir = path.join(tmp, 'out');
            fs.mkdirSync(inputDir);
            fs.writeFileSync(path.join(inputDir, 'a.html'), '<html><head><script src="bracify.js"></script></head><body></body></html>');
            const r = spawnSync(process.execPath, [cliPath, inputDir, outputDir], { encoding: 'utf-8', timeout: 60000 });
            assert.strictEqual(r.status, 0, r.stderr);
            assert.strictEqual(fs.readFileSync(path.join(outputDir, 'bracify.js'), 'utf-8'), ENGINE_SRC);
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });
});
