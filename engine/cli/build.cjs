#!/usr/bin/env node

const path = require('path');
const Builder = require('../server/builder.cjs');

const projectPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const distPath = path.join(projectPath, '_dist');

console.log(`Building project...`);
console.log(`Source: ${projectPath}`);
console.log(`Output: ${distPath}`);

const builder = new Builder(console.log);

builder.build(projectPath, distPath)
    .then(() => {
        console.log('Build successful!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Build failed:', err);
        process.exit(1);
    });
