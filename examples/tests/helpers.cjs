/**
 * Shared helpers for the Bracify Books example tests (not a test file itself).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(REPO_ROOT, 'examples', 'bracify-books');
const ENGINE_LIB = path.join(REPO_ROOT, 'engine', 'lib', 'engine.cjs');
const START = path.join(REPO_ROOT, 'engine', 'start.cjs');

// fs.cpSync crashes on some Node/Windows builds: copy manually.
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.name === 'data.db') continue; // never copy a generated DB: each run starts from the JSON seeds
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

/** Fresh temp copy of the example app (the repo files are never touched). */
function makeAppCopy() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-books-'));
    copyDir(APP_DIR, dir);
    return dir;
}

async function removeDir(dir) {
    for (let i = 0; i < 10; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); return; }
        catch (e) { await new Promise(r => setTimeout(r, 150)); }
    }
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/**
 * Start `node engine/start.cjs <appDir> <port>` as a child process (the documented way to run an app).
 * Resolves { port, base, stop, logs } once the server prints "Server ready".
 */
async function startServer(appDir) {
    const port = await freePort();
    const child = spawn(process.execPath, [START, appDir, String(port)], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not start:\n' + logs)), 20000);
        const check = setInterval(() => {
            if (logs.includes('Server ready')) { clearTimeout(timer); clearInterval(check); resolve(); }
        }, 50);
        child.on('exit', (code) => { clearTimeout(timer); clearInterval(check); reject(new Error('server exited early (' + code + '):\n' + logs)); });
    });
    return {
        port,
        base: `http://127.0.0.1:${port}`,
        get logs() { return logs; },
        stop() {
            return new Promise((resolve) => {
                if (child.exitCode !== null) return resolve();
                child.once('exit', () => resolve());
                child.kill();
            });
        }
    };
}

module.exports = { REPO_ROOT, APP_DIR, ENGINE_LIB, makeAppCopy, removeDir, copyDir, startServer };
