#!/usr/bin/env node
const path = require('path');
const EngineServer = require('./server/index.cjs');

// Try to load sqlite3 (optional dependency for Engine library, required for standalone)
let sqlite3;
try {
    sqlite3 = require('sqlite3');
} catch (e) {
    console.error('Error: "sqlite3" module not found.');
    console.error('To run engine standalone with DB features, please install sqlite3:');
    console.error('  npm install sqlite3');
    // Fallback or exit?
    // EngineServer injection is optional but DB methods will fail.
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node engine/start.js <project-path> [port]');
    process.exit(1);
}

const projectPath = path.resolve(args[0]);
const port = args[1] || 3000;

console.log(`Starting Engine Server...`);
console.log(`  Project: ${projectPath}`);
console.log(`  Port:    ${port}`);

const server = new EngineServer(port, console.log, { sqlite3 });

(async () => {
    try {
        await server.start();
        // Immediately load the project
        await server.setCurrentProjectPath(projectPath);
        console.log(`\nServer ready at http://localhost:${port}/`);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
})();
