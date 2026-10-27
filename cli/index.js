#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { processHTML } = require('@bracify/engine/server/renderer.cjs');
const Bracify = require('@bracify/engine/lib/engine.cjs');

// Simple args parsing: node index.js <input-dir> <output-dir>
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Usage: bracify-cli <input-dir> <output-dir>");
    process.exit(1);
}

const inputDir = path.resolve(args[0]);
const outputDir = path.resolve(args[1]);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Building from ${inputDir} to ${outputDir}...`);

// Reads an include file confined to the input dir (no traversal, no _sys, no symlink escape),
// like the server's resolveInclude (engine/server/index.cjs; keep in sync). An unreadable include
// (e.g. a directory) throws on purpose so the page fails and the build exits non-zero. Returns '' for rejected paths, null when the file does not exist.
function resolveInclude(includePath) {
    const reject = () => {
        console.warn(`[Bracify] Blocked unsafe include path: ${includePath}`);
        return '';
    };
    if (!Bracify.isSafeIncludePath(includePath)) return reject();
    const norm = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
    const within = (p, base) => norm(p).startsWith(norm(base + path.sep));
    const target = path.resolve(inputDir, String(includePath).replace(/^[\/\\]+/, ''));
    if (!within(target, inputDir)) return reject();
    if (!fs.existsSync(target)) return null;
    const real = fs.realpathSync(target);
    const realRoot = fs.realpathSync(inputDir);
    if (!within(real, realRoot)) return reject();
    if (path.relative(realRoot, real).split(path.sep).some(seg => seg.toLowerCase() === '_sys')) return reject();
    return fs.readFileSync(real, 'utf-8');
}

// Mock data logic (same as server)
let data = {};
const mockPath = path.join(inputDir, 'mock-data.json');
if (fs.existsSync(mockPath)) {
    try { data = JSON.parse(fs.readFileSync(mockPath, 'utf-8')); } catch (e) { }
}

// Recursive file walker. Like the server, "_"-prefixed segments (_parts, _sys) are not public:
// they are not emitted (partials stay usable via data-t-include).
async function walk(dir, callback) {
    const files = fs.readdirSync(dir).sort();
    for (const file of files) {
        if (file.startsWith('_')) continue;
        const filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            await walk(filepath, callback);
        } else {
            await callback(filepath);
        }
    }
}

async function build() {
    await walk(inputDir, async (filepath) => {
        // Relative path for output
        const relative = path.relative(inputDir, filepath);
        const dest = path.join(outputDir, relative);

        // Create struct
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        if (filepath.endsWith('.html')) {
            // Process HTML
            try {
                const html = fs.readFileSync(filepath, 'utf-8');
                // Execute includes (and bind mock data) so the output works on file:///
                const processed = await processHTML(html, structuredClone(data), async (includePath) => resolveInclude(includePath), async () => null, null, { stripAttributes: true });
                fs.writeFileSync(dest, processed);
                console.log(`Processed: ${relative}`);
            } catch (e) {
                console.error(`Error processing ${relative}:`, e.message);
                process.exitCode = 1;
            }
        } else {
            // Copy assets
            fs.copyFileSync(filepath, dest);
            console.log(`Copied: ${relative}`);
        }
    });
}

build().catch((e) => {
    console.error('Build failed:', e.message);
    process.exitCode = 1;
});
