const { spawn, execFile } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const START_SCRIPT = path.join(__dirname, '..', 'start.cjs');
const DEFAULT_PORT = 3000;
const READY_TIMEOUT_MS = 30000;
const MAX_PORT = 65535;

/**
 * Manages project servers running as separate child processes
 * (`node engine/start.cjs <project-path> <port>`).
 * The DB layer is a per-process singleton, so one process per project is required.
 */
class ProcessManager {
    constructor(logger) {
        this.logger = logger || (() => { });
        this.processes = new Map(); // id -> { id, pid, port, path, startedAt, child }
        this.reservedPorts = new Set(); // ports handed out but not yet listening
    }

    isPortFree(port) {
        return new Promise((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => srv.close(() => resolve(true)));
            srv.listen(port);
        });
    }

    async findFreePort(preferred) {
        let port = parseInt(preferred, 10);
        if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) port = DEFAULT_PORT;
        for (; port <= MAX_PORT; port++) {
            if (this.reservedPorts.has(port)) continue;
            if (this.usedByManaged(port)) continue;
            // Reserve before probing so concurrent starts never pick the same port
            this.reservedPorts.add(port);
            if (await this.isPortFree(port)) return port;
            this.reservedPorts.delete(port);
        }
        throw new Error('No free port available');
    }

    usedByManaged(port) {
        for (const p of this.processes.values()) if (p.port === port) return true;
        return false;
    }

    /**
     * Start a project server. Resolves to { id, pid, port, path, startedAt }.
     */
    async start(projectId, projectPath, port) {
        if (!projectId && projectId !== 0) throw new Error('Project id is required');
        projectId = String(projectId);
        if (this.processes.has(projectId)) {
            throw new Error(`Project "${projectId}" is already running (port ${this.processes.get(projectId).port})`);
        }
        if (!projectPath || typeof projectPath !== 'string') throw new Error('Project path is required');
        const resolved = path.resolve(projectPath);
        let stat;
        try { stat = fs.statSync(resolved); } catch (e) { stat = null; }
        if (!stat || !stat.isDirectory()) throw new Error(`Project directory not found: ${projectPath}`);

        const actualPort = await this.findFreePort(port);
        this.reservedPorts.add(actualPort);
        try {
            return await this.spawnChild(projectId, resolved, actualPort);
        } finally {
            this.reservedPorts.delete(actualPort);
        }
    }

    spawnChild(id, projectPath, port) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [START_SCRIPT, projectPath, String(port)], {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, BRACIFY_CHILD: '1' },
                windowsHide: true
            });
            const info = { id, pid: child.pid, port, path: projectPath, startedAt: new Date().toISOString(), child };
            let settled = false;
            let output = '';

            const finish = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (err) {
                    this.processes.delete(id);
                    this.killTree(child);
                    reject(err);
                } else {
                    resolve({ id, pid: info.pid, port, path: projectPath, startedAt: info.startedAt });
                }
            };
            const timer = setTimeout(() => finish(new Error('Timed out waiting for project server to start')), READY_TIMEOUT_MS);

            const onData = (buf) => {
                const text = buf.toString();
                output += text;
                if (output.length > 8000) output = output.slice(-8000);
                if (this.logger) this.logger(`[Project:${id}] ${text.trimEnd()}`);
                if (output.includes('Server ready at')) finish();
            };
            child.stdout.on('data', onData);
            child.stderr.on('data', onData);

            child.on('error', (e) => finish(new Error(`Failed to spawn project server: ${e.message}`)));
            child.on('exit', (code) => {
                if (this.processes.get(id) && this.processes.get(id).child === child) this.processes.delete(id);
                finish(new Error(`Project server exited (code ${code}): ${output.trim().split('\n').pop() || ''}`));
            });

            this.processes.set(id, info);
        });
    }

    killTree(child) {
        if (!child || child.pid === undefined || child.exitCode !== null) return;
        if (process.platform === 'win32') {
            execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { });
        } else {
            try { child.kill('SIGTERM'); } catch (e) { /* already gone */ }
        }
    }

    /**
     * Stop a project server. Resolves true if it was running, false otherwise.
     */
    stop(id) {
        id = String(id);
        const info = this.processes.get(id);
        if (!info) return Promise.resolve(false);
        return new Promise((resolve) => {
            const child = info.child;
            this.processes.delete(id);
            if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
            const fallback = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) { } }, 5000);
            child.once('exit', () => { clearTimeout(fallback); resolve(true); });
            this.killTree(child);
        });
    }

    get(id) {
        const i = this.processes.get(String(id));
        return i ? { id: i.id, pid: i.pid, port: i.port, path: i.path, startedAt: i.startedAt } : null;
    }

    list() {
        return [...this.processes.values()].map(i => ({ id: i.id, pid: i.pid, port: i.port, path: i.path, startedAt: i.startedAt }));
    }

    async stopAll() {
        await Promise.all([...this.processes.keys()].map(id => this.stop(id)));
    }
}

module.exports = ProcessManager;
