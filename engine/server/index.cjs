const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const db = require('./db/index.cjs');
const ProcessManager = require('./process-manager.cjs');
const StudioData = require('./studio-data.cjs');

class EngineServer {
    constructor(port, logger, options = {}) {
        this.port = (port !== undefined && port !== null) ? port : 8080;
        this.logger = logger || console.log;

        // Inject dependencies
        if (options.sqlite3) {
            db.setDriver(options.sqlite3);
        }

        this.app = express();
        this.server = null;
        this.currentProjectPath = null;

        // Child-process manager for multi-project execution (Issue #14)
        // Only the system (Studio) server enables it: options.manageProjects
        this.manageProjects = !!options.manageProjects;
        this.processManager = new ProcessManager(this.logger, {
            onUnexpectedExit: (id) => this.markProjectStopped(id)
        });
        if (this.manageProjects) {
            this.studioData = new StudioData(this);
            // Never leave orphaned children if the parent dies
            process.on('exit', () => this.processManager.killAllSync());
        }

        // Cache loaded renderer
        this.renderer = null;

        // On-memory template cache (resolved SSI)
        this.templateCache = new Map();
        this.watcher = null;

        this.setup();
    }

    async getRenderer() {
        if (!this.renderer) {
            // dynamic import for ESM
            this.renderer = await import('./renderer.cjs');
        }
        return this.renderer;
    }

    setup() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));


        // Logger middleware
        this.app.use((req, res, next) => {
            if (this.logger) this.logger(`[Engine] ${req.method} ${req.url}`);
            next();
        });

        // Serve Engine Libs
        this.app.use('/engine', express.static(path.join(__dirname, '../lib')));

        // --- Underscore Guard (Security Issue #7) ---
        this.app.use((req, res, next) => {
            if (req.method === 'GET' && req.path.split('/').some(p => p.startsWith('_'))) {
                this.logger(`[Security] Blocked direct GET access to system resource: ${req.url}`);
                return res.status(403).send('Access Denied');
            }
            next();
        });

        // --- Data API (Collection Support) ---
        // Route: /_sys/data/:entity.json
        // Supports GET (Find), POST (Create), PUT (Update), DELETE (Remove)

        this.app.all('/_sys/data/:entity.json', async (req, res) => {
            const entity = req.params.entity;
            const { _method, ...filters } = req.query || {};
            // HTML forms can only send GET/POST: allow POST ... ?_method=PUT|DELETE
            const override = String(_method || '').toUpperCase();
            const method = (req.method === 'POST' && (override === 'PUT' || override === 'DELETE')) ? override : req.method;

            // Security Check
            if (!/^[a-zA-Z0-9_-]+$/.test(entity) || entity.startsWith('_')) {
                this.logger(`[Security] Blocked invalid or system entity: ${entity}`);
                return res.status(400).send('Invalid entity name');
            }

            // CSRF: reject cross-origin writes (incl. POST ?_method=PUT|DELETE)
            if (method !== 'GET' && !this.checkOrigin(req, res)) return;

            if (method === 'GET') {
                this.logger(`[Security] Blocked direct GET access to data entity: ${entity}`);
                return res.status(403).send('Access Denied');
            }

            try {
                const redirect = req.body['data-t-redirect'] || req.header('Referer') || '/';
                const unflattenedBody = this.unflatten(req.body);

                switch (method) {
                    case 'POST':
                        await db.save(entity, null, unflattenedBody);
                        res.redirect(redirect);
                        break;
                    case 'PUT':
                        // Own properties only: never pick up an inherited `id`
                        const ownId = (o) => (o && Object.prototype.hasOwnProperty.call(o, 'id')) ? o.id : undefined;
                        const updateId = ownId(filters) || ownId(req.body);
                        if (!updateId) {
                            return res.status(400).send('ID required for update');
                        }
                        await db.save(entity, updateId, unflattenedBody);
                        res.redirect(redirect);
                        break;
                    case 'DELETE':
                        await db.remove(entity, filters);
                        res.redirect(redirect);
                        break;
                    default:
                        res.status(405).end();
                }
            } catch (e) {
                this.logger(`[Engine] Data Error: ${e.message}`);
                res.status(500).send(e.message);
            }
        });

        // Helper to unflatten dot-notation keys from form-urlencoded body
        // Keys with a __proto__/constructor/prototype segment are dropped (prototype pollution, #32)
        this.unflatten = (data) => {
            const result = {};
            const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
            for (const [key, value] of Object.entries(data)) {
                if (key === 'data-t-redirect') continue;
                const parts = key.split('.');
                if (parts.some(p => p === '__proto__' || p === 'constructor' || p === 'prototype')) continue;
                let current = result;
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (i === parts.length - 1) {
                        current[part] = value;
                    } else {
                        if (!has(current, part) || !current[part]) {
                            const nextPart = parts[i + 1];
                            current[part] = !isNaN(nextPart) ? [] : {};
                        }
                        current = current[part];
                    }
                }
            }
            return result;
        };

        // Legacy API routes (for compatibility if needed, though they map to same DB logic)
        this.app.get('/_sys/api/data/list', async (req, res) => {
            try { res.json({ files: await db.list() }); } catch (e) { res.status(500).json({ error: e.message }); }
        });
        this.app.get('/_sys/api/data/read', async (req, res) => {
            try { res.json(await db.get(req.query.name)); } catch (e) { res.status(500).json({ error: e.message }); }
        });
        this.app.post('/_sys/api/data/write', async (req, res) => {
            try { await db.put(req.body.name, req.body.data); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
        });

        // --- Project Server Control (SSR forms, Issue #14) ---
        // POST /_sys/server/start|stop  (urlencoded: id, data-t-redirect)
        const serverControl = (action) => async (req, res, next) => {
            if (!this.manageProjects) return next();
            if (!this.checkOrigin(req, res)) return;
            const body = req.body || {};
            const back = (error) => this.redirectBack(req, res, error);
            try {
                const id = body.id;
                if (!id) throw new Error('Project id is required');
                const records = await db.find('projects', { id });
                const record = records && records[0];
                if (!record) throw new Error(`Project not found: ${id}`);
                if (action === 'start') {
                    const projectPath = record.path ? path.resolve(record.path) : '';
                    const info = await this.processManager.start(id, projectPath, record.port);
                    await db.save('projects', id, { ...record, id, status: 'running', pid: info.pid, port: info.port });
                } else {
                    await this.processManager.stop(id);
                    await db.save('projects', id, { ...record, id, status: 'stopped', pid: '' });
                }
                back(null);
            } catch (e) {
                this.logger(`[Engine] Server control error: ${e.message}`);
                back(e.message);
            }
        };
        this.app.post('/_sys/server/start', serverControl('start'));
        this.app.post('/_sys/server/stop', serverControl('stop'));

        // --- Studio Data Manager (SSR forms, Issue #9) ---
        if (this.manageProjects) this.studioData.register(this.app);

        // --- System API ---
        this.app.post('/_sys/api/open-project', (req, res) => {
            if (this.openProjectHandler) this.openProjectHandler(req, res);
            else res.status(501).json({ error: 'Handler not configured' });
        });

        this.app.post('/_sys/api/close-project', async (req, res) => {
            await this.setCurrentProjectPath(null);
            res.json({ ok: true });
        });

        // --- Project Static & SSR ---
        this.app.use(async (req, res, next) => {
            if (!this.currentProjectPath) return next();

            // Handle root
            const reqPath = req.path === '/' ? '/index.html' : req.path;
            const filePath = path.join(this.currentProjectPath, reqPath);

            if (!fs.existsSync(filePath)) return next();

            // If HTML, Perform SSR
            if (filePath.endsWith('.html')) {
                try {
                    let htmlContent;
                    const cacheKey = reqPath;

                    if (this.templateCache.has(cacheKey)) {
                        htmlContent = this.templateCache.get(cacheKey);
                    } else {
                        // Load and resolve SSI for the first time
                        htmlContent = fs.readFileSync(filePath, 'utf-8');
                        this.logger(`[Bracify] SSR Cache Miss: ${reqPath}`);
                    }

                    const renderer = await this.getRenderer();

                    // Prepare Data
                    const _sysData = {
                        query: req.query,
                        params: req.params
                    };

                    // Prepare full data context for SSR
                    const data = { _sys: _sysData };
                    this.logger(`[Bracify] SSR Start: ${req.url}`);

                    let processed = await renderer.processHTML(htmlContent, data, async (includePath) => {
                        // Built files already have includes resolved, but just in case
                        const incFile = path.join(this.currentProjectPath, includePath);
                        if (fs.existsSync(incFile)) return fs.readFileSync(incFile, 'utf-8');
                        return null;
                    }, async (href) => {
                        // Data fetcher for SSR
                        // Studio Data Manager virtual sources (system server only)
                        if (this.manageProjects) {
                            const studioResult = await this.studioData.fetch(href);
                            if (studioResult !== undefined) return studioResult;
                        }

                        // Security Validation
                        const validHrefPattern = /^(\/|\\)?_sys(\/|\\)data(\/|\\)([a-zA-Z0-9_-]+)\.json(\?.*)?$/;
                        const match = href.match(validHrefPattern);
                        if (!match || match[4].startsWith('_')) {
                            this.logger(`[Security] SSR blocked invalid or system href: ${href}`);
                            return null;
                        }

                        if (href.includes('_sys/data/')) {
                            try {
                                const urlStr = href.startsWith('http') ? href : `http://localhost/${href.replace(/^\//, '')}`;
                                const url = new URL(urlStr);
                                let entity = url.pathname.split('/').pop().replace('.json', '');
                                const filters = Object.fromEntries(url.searchParams);

                                // Handle cases where entity might be projects.json in URL
                                if (entity.endsWith('.json')) entity = entity.replace('.json', '');

                                const results = await db.find(entity, filters);
                                this.logger(`[Bracify] SSR Fetch: ${href} -> ${results ? (Array.isArray(results) ? results.length : 1) : 0} items`);
                                if (results && results.length > 0) {
                                    this.logger(`[Bracify] SSR Data Sample: ${JSON.stringify(results[0]).substring(0, 100)}...`);
                                }

                                // Unwrap single item if limit=1
                                if (filters._limit === '1' && results && Array.isArray(results) && results.length === 1) {
                                    return results[0];
                                }

                                return results;
                            } catch (e) {
                                this.logger(`[Bracify] SSR Fetch Error: ${e.message}`);
                            }
                        }
                        return null;
                    }, this.logger);

                    // Inject Client State Script
                    // window._sys provides context (query/params)
                    // window.__BRACIFY_DATA__ provides pre-fetched sources to avoid double-fetching
                    // Security: Escape < to \u003c to prevent XSS (script breakout like </script>)
                    const safeSys = JSON.stringify(_sysData).replace(/</g, '\\u003c');
                    const safeData = JSON.stringify(data).replace(/</g, '\\u003c');
                    const stateScript = `<script>
                        window._sys = ${safeSys};
                        window.__BRACIFY_DATA__ = ${safeData};
                    </script>`;

                    if (processed.includes('</head>')) {
                        processed = processed.replace('</head>', `${stateScript}</head>`);
                    } else {
                        processed = stateScript + processed;
                    }

                    // Cache the resolved template if not already cached (avoid binding current data into cache)
                    if (!this.templateCache.has(cacheKey)) {
                        try {
                            const rawHtml = fs.readFileSync(filePath, 'utf-8');
                            // Resolve SSI only phase (with empty data context)
                            const resolvedSSI = await renderer.processHTML(rawHtml, { _sys: { query: {}, params: {} } }, async (includePath) => {
                                const incFile = path.join(this.currentProjectPath, includePath);
                                if (fs.existsSync(incFile)) return fs.readFileSync(incFile, 'utf-8');
                                return null;
                            }, async () => null, null, { processBindings: false });
                            this.templateCache.set(cacheKey, resolvedSSI);
                        } catch (e) {
                            this.logger(`[Bracify] Cache Warning Error: ${e.message}`);
                        }
                    }

                    this.logger(`[Bracify] SSR Done: ${req.url} (Data keys: ${Object.keys(data).filter(k => k !== '_sys')})`);
                    res.send(processed);
                } catch (e) {
                    this.logger(`[Bracify] SSR Error: ${e.message}`);
                    res.status(500).send(`SSR Error: ${e.message}`);
                }
            } else {
                // Static file (images, css, etc.)
                res.sendFile(filePath);
            }
        });
    }

    // CSRF: reject cross-origin form posts. Returns false (and responds 403) when rejected.
    checkOrigin(req, res) {
        const origin = req.header('Origin');
        if (origin) {
            let originHost = null;
            try { originHost = new URL(origin).host; } catch (e) { /* invalid */ }
            if (!originHost || originHost !== req.header('Host')) {
                this.logger(`[Security] Blocked cross-origin request: ${origin}`);
                res.status(403).send('Forbidden');
                return false;
            }
        }
        return true;
    }

    // 303 back to data-t-redirect / Referer (with ?error=... on failure)
    redirectBack(req, res, error) {
        const body = req.body || {};
        const base = body['data-t-redirect'] || req.header('Referer') || null;
        if (!base) {
            return error ? res.status(400).send(error) : res.redirect(303, '/');
        }
        if (!error) return res.redirect(303, base);
        const hashIdx = base.indexOf('#');
        let url = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
        const hash = hashIdx >= 0 ? base.slice(hashIdx) : '';
        url = url.replace(/([?&])error=[^&]*&?/, '$1').replace(/[?&]$/, '');
        url += (url.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(error);
        res.redirect(303, url + hash);
    }

    setOpenProjectHandler(handler) {
        this.openProjectHandler = handler;
    }

    async markProjectStopped(id) {
        try {
            const records = await db.find('projects', { id });
            if (records && records[0]) {
                await db.save('projects', id, { ...records[0], id, status: 'stopped', pid: '' });
            }
        } catch (e) {
            this.logger(`[Engine] Failed to mark project stopped: ${e.message}`);
        }
    }

    // Mark 'running' project records not managed by this process as 'stopped'
    async reconcileProjects() {
        if (!this.manageProjects) return;
        try {
            const running = await db.find('projects', { status: 'running' });
            for (const rec of (running || [])) {
                if (!this.processManager.get(rec.id)) {
                    await db.save('projects', rec.id, { ...rec, status: 'stopped', pid: '' });
                }
            }
        } catch (e) {
            // No 'projects' entity in this project: nothing to reconcile
        }
    }

    async setCurrentProjectPath(projectPath) {
        this.currentProjectPath = projectPath;
        this.logger(`[Bracify] Setting project: ${projectPath}`);

        // Stop previous watcher
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }

        // Clear cache
        this.templateCache.clear();

        // Re-init DB
        if (projectPath) {
            await db.init(projectPath);
            await this.reconcileProjects();

            // Start watcher for hot-reload of cache (Windows-friendly recursive watch)
            try {
                this.watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
                    if (filename && (filename.endsWith('.html') || filename.includes('_parts'))) {
                        // this.logger(`[Bracify] File changed: ${filename}. Clearing cache.`);
                        this.templateCache.clear();
                    }
                });
            } catch (e) {
                this.logger(`[Bracify] Watch error: ${e.message}`);
            }
        } else {
            await db.close();
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this.server) return resolve(this.port);

            this.server = this.app.listen(this.port, (err) => {
                // Express 5 passes listen errors (e.g. EADDRINUSE) to the callback
                if (err) { this.server = null; return reject(err); }
                const actualPort = this.server.address().port;
                this.port = actualPort;
                this.logger(`[Bracify] Server started at http://localhost:${this.port}`);
                resolve(this.port);
            }).on('error', (e) => reject(e));
        });
    }

    async stop() {
        await this.processManager.stopAll();
        return new Promise((resolve, reject) => {
            if (this.watcher) {
                this.watcher.close();
                this.watcher = null;
            }

            if (!this.server) return resolve();
            this.server.close(async (err) => {
                if (err) return reject(err);
                this.server = null;
                await db.close();
                this.logger('[Bracify] Server stopped');
                resolve();
            });
        });
    }
}

module.exports = EngineServer;
