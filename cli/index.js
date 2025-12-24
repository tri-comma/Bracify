#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { processHTML } = require('@bracify/engine/server/renderer.cjs');

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

// Recursive file walker
function walk(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            walk(filepath, callback);
        } else {
            callback(filepath);
        }
    });
}

walk(inputDir, async (filepath) => {
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
        const html = fs.readFileSync(filepath, 'utf-8');

        // Mock data logic (same as server)
        let data = {};
        const mockPath = path.join(inputDir, 'mock-data.json');
        if (fs.existsSync(mockPath)) {
            try { data = JSON.parse(fs.readFileSync(mockPath, 'utf-8')); } catch (e) { }
        }

        const includeResolver = (includePath) => {
            const target = path.join(inputDir, includePath);
            if (fs.existsSync(target)) {
                return fs.readFileSync(target, 'utf-8');
            }
            return null;
        };

        try {
            // Process WITHOUT data-binding dynamic parts? 
            // The requirement: "Execute includes... so it works on file:///"
            // Ideally we also bake static data if possible.
            const processed = await processHTML(html, data, { includeResolver });
            fs.writeFileSync(dest, processed);
            console.log(`Processed: ${relative}`);
        } catch (e) {
            console.error(`Error processing ${relative}:`, e.message);
        }
    } else {
        // Copy assets
        fs.copyFileSync(filepath, dest);
        console.log(`Copied: ${relative}`);
    }
});
