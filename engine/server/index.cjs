const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const db = require('./db/index.cjs');

class EngineServer {
    constructor(port, logger, options = {}) {
        this.port = port || 8080;
        this.logger = logger || console.log;

        // Inject dependencies
        if (options.sqlite3) {
            db.setDriver(options.sqlite3);
        }

        this.app = express();
        this.server = null;
        this.currentProjectPath = null;

        // Cache loaded renderer
        this.renderer = null;

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

        // --- Data API (Collection Support) ---
        // Route: /_sys/data/:entity.json
        // Supports GET (Find), POST (Create), PUT (Update), DELETE (Remove)

        this.app.all('/_sys/data/:entity.json', async (req, res) => {
            const entity = req.params.entity;
            const filters = req.query || {};
            this.logger(`[Engine] Data API: ${req.method} ${entity} filters=${JSON.stringify(filters)}`);

            // Security Check
            if (!/^[a-zA-Z0-9_-]+$/.test(entity) || entity.startsWith('_')) {
                this.logger(`[Security] Blocked invalid or system entity: ${entity}`);
                return res.status(400).json({ error: 'Invalid entity name' });
            }

            try {
                switch (req.method) {
                    case 'GET':
                        const records = await db.find(entity, filters);
                        // Compatibility: if specific ID requested, return object?
                        // Or if exactly one result with id='__default__', return object (legacy file mode)
                        // Or if _limit=1 is specified (Consistent with SSR)
                        if (filters._limit === '1' && records.length === 1) {
                            res.json(records[0]);
                        } else if (filters.id && records.length > 0) {
                            res.json(records[0]);
                        } else if (records.length === 1 && records[0].id === '__default__') {
                            res.json(records[0]);
                        } else {
                            res.json(records);
                        }
                        break;
                    case 'POST':
                        const newId = await db.save(entity, null, req.body);
                        res.json({ ok: true, id: newId });
                        break;
                    case 'PUT':
                        // Update needs an ID usually, or filter
                        // If ?id=... is present, update that.
                        if (!filters.id) {
                            // If no ID in query, check body? 
                            // But usually PUT /:entity.json?id=123
                            return res.status(400).json({ error: 'ID required for PUT (in query ?id=...)' });
                        }
                        await db.save(entity, filters.id, req.body);
                        res.json({ ok: true });
                        break;
                    case 'DELETE':
                        await db.remove(entity, filters);
                        res.json({ ok: true });
                        break;
                    default:
                        res.status(405).end();
                }
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });

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

            // Serve from _dist folder
            const distPath = path.join(this.currentProjectPath, '_dist');
            if (!fs.existsSync(distPath)) {
                this.logger('[Bracify] Warning: _dist folder not found. Run build first.');
                return next();
            }

            // Security: Block access to hidden folders (starting with _)
            // Note: API routes (e.g. /_sys/api) are handled before this middleware.
            if (req.path.startsWith('/_') && !req.path.startsWith('/_sys/')) {
                return res.status(403).send('Access Denied');
            }

            // Check if file exists in _dist path
            // Handle root
            const reqPath = req.path === '/' ? '/index.html' : req.path;
            const filePath = path.join(distPath, reqPath);

            if (!fs.existsSync(filePath)) return next();

            // If HTML, Perform SSR
            if (filePath.endsWith('.html')) {
                try {
                    const htmlContent = fs.readFileSync(filePath, 'utf-8');
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

    setOpenProjectHandler(handler) {
        this.openProjectHandler = handler;
    }

    async setCurrentProjectPath(projectPath) {
        this.currentProjectPath = projectPath;
        this.logger(`[Bracify] Setting project: ${projectPath}`);

        // Auto-build before serving
        if (projectPath) {
            try {
                this.logger('[Bracify] Building project...');
                const Builder = require('./builder.cjs');
                const builder = new Builder(this.logger);
                const distPath = path.join(projectPath, '_dist');
                await builder.build(projectPath, distPath);
                this.logger('[Bracify] Build complete.');
            } catch (e) {
                this.logger(`[Bracify] Build failed: ${e.message}`);
                throw e;
            }
        }

        // Re-init DB
        if (projectPath) {
            await db.init(projectPath);
        } else {
            await db.close();
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this.server) return resolve(this.port);

            this.server = this.app.listen(this.port, () => {
                this.logger(`[Bracify] Server started at http://localhost:${this.port}`);
                resolve(this.port);
            }).on('error', (e) => reject(e));
        });
    }

    stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) return resolve();
            this.server.close((err) => {
                if (err) return reject(err);
                this.server = null;
                this.logger('[Bracify] Server stopped');
                resolve();
            });
        });
    }
}

module.exports = EngineServer;
