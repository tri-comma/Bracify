const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./db/index.cjs');
const ProcessManager = require('./process-manager.cjs');
const StudioData = require('./studio-data.cjs');
const Bracify = require('../lib/engine.cjs');
const ENGINE_FILE = path.join(__dirname, '../lib/engine.cjs');
const UserError = require('./user-error.cjs');
const schemaScanner = require('./schema-scanner.cjs');

// _sys.query for SSR, built from the raw URL exactly like the client (Object.fromEntries(url.searchParams)):
// a repeated param resolves to its LAST value, and `a[b]=1` stays a flat key instead of Express/qs nesting (Issue #47).
function buildSysQuery(req) {
    try { return Object.fromEntries(new URL(req.originalUrl || req.url, "http://bracify-internal.local").searchParams); }
    catch (e) { return {}; }
}

class EngineServer {
    constructor(port, logger, options = {}) {
        this.port = (port !== undefined && port !== null) ? port : 8080;
        this.logger = logger || console.log;

        // Inject dependencies
        if (options.sqlite3) {
            db.setDriver(options.sqlite3);
        }

        // Request body size limit for JSON / urlencoded parsers (Issue #44)
        this.bodyLimit = options.bodyLimit || '100kb';

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
        // Write-form schema per entity for Data API validation (Issue #53); dropped together with the template cache
        this.writeSchemaCache = null;
        // Client engine bytes + ETag served at /bracify.js, reloaded when the file's mtime changes (Issue #55)
        this.engineCache = null;
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

    // Write forms of the project grouped by entity: Map(entity -> [{ fields }]), cached until an HTML file changes.
    // Partials included inside a form (data-t-include) are expanded so their fields are seen.
    // A failed scan is logged and NOT cached; callers then skip validation (fail open) rather than block every write.
    async getWriteSchema() {
        if (!this.currentProjectPath) return new Map();
        if (!this.writeSchemaCache) {
            const root = this.currentProjectPath;
            const build = (async () => {
                const byEntity = new Map();
                // Includes are resolved only inside the forms (each partial is read once per scan); files without a
                // <form> are never parsed. This is far cheaper than a full include/layout render per page.
                const partials = new Map();
                const resolve = (includePath) => {
                    if (!partials.has(includePath)) partials.set(includePath, this.resolveInclude(includePath));
                    return partials.get(includePath);
                };
                for (const file of schemaScanner.walkHtml(path.resolve(root))) {
                    let html;
                    try { html = fs.readFileSync(file, 'utf-8'); } catch (e) { continue; }
                    if (!/<form[\s>]/i.test(html)) continue;
                    for (const form of schemaScanner.scanWriteForms(html, resolve)) {
                        if (!byEntity.has(form.entity)) byEntity.set(form.entity, []);
                        byEntity.get(form.entity).push(form);
                    }
                    // Yield between files so a large project does not stall request handling
                    await new Promise(r => setImmediate(r));
                }
                return byEntity;
            })();
            this.writeSchemaCache = build;
            build.catch(() => { if (this.writeSchemaCache === build) this.writeSchemaCache = null; });
        }
        return this.writeSchemaCache;
    }

    // Drop the cached write schema and rebuild it in the background (debounced), so writes rarely wait for a scan
    invalidateWriteSchema() {
        this.writeSchemaCache = null;
        clearTimeout(this.writeSchemaTimer);
        this.writeSchemaTimer = setTimeout(() => this.warmWriteSchema(), 300);
        if (this.writeSchemaTimer.unref) this.writeSchemaTimer.unref();
    }

    warmWriteSchema() {
        if (!this.currentProjectPath) return;
        this.getWriteSchema().catch(() => { /* surfaced (once) on the first write that needs it */ });
    }

    // Locates a project-relative path on disk, confined to the project both lexically and after
    // following symlinks/junctions (Issues #36, #68).
    // Returns { file, segments, root } (canonical path, its segments relative to the real project root, and that root),
    // false when the path escapes the project, null when it does not exist.
    locateProjectFile(relPath) {
        const root = path.resolve(this.currentProjectPath);
        const norm = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
        const within = (p, base) => norm(p).startsWith(norm(base + path.sep));
        // A ":" never occurs in a legitimate project path; on Windows it opens NTFS alternate data streams
        // ("page.html::$DATA" would serve the raw template), so refuse it on every platform
        if (relPath.includes(':')) return null;
        const file = path.resolve(root, relPath.replace(/^[\/\\]+/, ''));
        if (!within(file, root)) return false;
        if (!fs.existsSync(file)) return null;
        try {
            // .native yields the true on-disk case, so case variants of a request resolve to one canonical file
            const real = fs.realpathSync.native(file);
            const realRoot = fs.realpathSync.native(root);
            if (!within(real, realRoot)) return false;
            // Canonical path (8.3 names, trailing dots/spaces, ADS resolved) for segment checks
            return { file: real, segments: path.relative(realRoot, real).split(path.sep), root: realRoot };
        } catch (e) { return null; }
    }

    // Sends the client engine (the /bracify.js response). Bytes and ETag are cached by mtime.
    serveEngine(req, res, next) {
        let entry;
        try {
            const mtime = fs.statSync(ENGINE_FILE).mtimeMs;
            if (!this.engineCache || this.engineCache.mtime !== mtime) {
                const src = fs.readFileSync(ENGINE_FILE);
                this.engineCache = { mtime, src, etag: '"' + crypto.createHash('sha1').update(src).digest('base64') + '"' };
            }
            entry = this.engineCache;
        } catch (e) { return next(); }
        res.type('text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('ETag', entry.etag);
        // Conditional GET is answered here: Express's req.fresh also honours a request Cache-Control: no-cache,
        // which fetch() adds to every conditional request, so it would never reply 304.
        const inm = String(req.headers['if-none-match'] || '');
        if (inm.split(',').some(t => t.trim().replace(/^W\//, '') === entry.etag) || inm.trim() === '*') return res.status(304).end();
        res.send(entry.src);
    }

    // Reads an include file confined to the project (no traversal, no _sys, no symlink escape).
    // Returns '' (empty include) for rejected paths, null when the file does not exist.
    resolveInclude(includePath) {
        const reject = () => {
            console.warn(`[Bracify] Blocked unsafe include path: ${includePath}`);
            return '';
        };
        if (!Bracify.isSafeIncludePath(includePath)) return reject();
        const loc = this.locateProjectFile(includePath);
        if (loc === false) return reject();
        if (!loc) return null;
        if (loc.segments.some(seg => seg.toLowerCase() === '_sys')) return reject();
        try {
            return fs.readFileSync(loc.file, 'utf-8');
        } catch (e) { return null; }
    }

    setup() {
        this.app.use(bodyParser.json({ limit: this.bodyLimit }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: this.bodyLimit }));

        // Body parser failures: generic responses, real error only in the log (Issue #44)
        this.app.use((err, req, res, next) => {
            this.logger(`[Engine] Request error: ${err && err.message}`);
            if (res.headersSent) return next(err);
            const status = (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) ? err.status : 500;
            if (err && err.type === 'entity.too.large') return res.status(413).send('Payload Too Large');
            if (status === 500) return res.status(500).send('Internal Server Error');
            res.status(status === 413 ? 413 : 400).send('Bad Request');
        });

        // Requests without a parsed body (e.g. empty POST/DELETE) get an empty object
        this.app.use((req, res, next) => {
            if (!req.body || typeof req.body !== 'object') req.body = {};
            next();
        });


        // Logger middleware
        this.app.use((req, res, next) => {
            if (this.logger) this.logger(`[Engine] ${req.method} ${req.url}`);
            next();
        });

        // The client engine at one URL for every mode (Issue #55). Always the server's own copy (a same-named project file
        // never replaces it), so SSR and the browser run the same version. Root only; Express adds ETag / HEAD / 304.
        this.app.get('/bracify.js', (req, res, next) => this.serveEngine(req, res, next));

        // Serve Engine Libs (legacy /engine/engine.cjs; .cjs must be sent as JavaScript, not application/node)
        this.app.use('/engine', express.static(path.join(__dirname, '../lib'), {
            setHeaders: (res, file) => { if (/\.c?js$/i.test(file)) res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); }
        }));

        // --- Underscore Guard (Security Issue #7) ---
        this.app.use((req, res, next) => {
            if (req.method === 'GET' && req.path.split('/').some(p => p.startsWith('_'))) {
                this.logger(`[Security] Blocked direct GET access to system resource: ${req.url}`);
                return res.status(403).send('Access Denied');
            }
            next();
        });

        // --- CSRF Guard (Issue #33) ---
        // Every state-changing request under /_sys/ must be same-origin (Origin absent or matching Host).
        // No CORS headers are sent, so cross-origin pages cannot read responses either.
        this.app.use('/_sys', (req, res, next) => {
            if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
            if (!this.checkOrigin(req, res)) return;
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

            // CSRF is enforced by the /_sys middleware above (incl. POST ?_method=PUT|DELETE)

            if (method === 'GET') {
                this.logger(`[Security] Blocked direct GET access to data entity: ${entity}`);
                return res.status(403).send('Access Denied');
            }

            const wantsHtml = () => {
                const ct = String(req.header('Content-Type') || '');
                return /^application\/x-www-form-urlencoded/i.test(ct) || req.accepts(['json', 'html']) === 'html';
            };
            // Own properties only: never pick up an inherited `id`
            const ownId = (o) => (o && Object.prototype.hasOwnProperty.call(o, 'id')) ? o.id : undefined;
            // Refuse a write: form submissions go back with ?error=, API clients get JSON (Issue #53)
            const refuseJson = (status, message) => res.status(status).json({ error: message });
            const refuse = (status, message) => {
                // Form submissions go back with ?error=; without a data-t-redirect / Referer to go back to, answer as JSON
                if (wantsHtml()) return this.redirectBack(req, res, message, () => refuseJson(status, message));
                return refuseJson(status, message);
            };
            // An id is a string or a finite number (a boolean/array/object would be coerced by the DB and could hit another record)
            const badId = (...ids) => ids.some(x => x !== undefined && !(typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))));
            // The form attributes of the entity's write forms are the trust boundary (required, maxlength, min/max, pattern ...).
            // Returns { error } or { body }: the record typed by the same forms (number, checkbox ...; Issue #52).
            const validateWrite = async (body) => {
                let forms;
                try { forms = (await this.getWriteSchema()).get(entity); this.schemaWarned = false; }
                catch (e) {
                    // Fail open: a broken scan must not block every write. Warn once until a scan succeeds again.
                    if (!this.schemaWarned) { this.schemaWarned = true; this.logger(`[Engine] WARNING: form schema scan failed, Data API writes are NOT validated: ${e.message}`); }
                    return { body };
                }
                if (!forms) return { body };
                const plan = schemaScanner.buildTypePlan(forms);
                const typing = { json: !!req.is('json') };
                const errors = schemaScanner.typeErrors(plan, body, typing);
                if (!errors.length) errors.push(...schemaScanner.validateWriteForms(forms, body));
                if (errors.length) return { error: errors.join('; ') };
                return { body: schemaScanner.coerceRecord(plan, body, typing) };
            };
            try {
                const redirect = this.safeRedirectTarget(req, req.body['data-t-redirect']) || '/';
                let unflattenedBody = this.unflatten(req.body);

                switch (method) {
                    case 'POST': {
                        const bodyId = ownId(unflattenedBody), queryId = ownId(filters);
                        if (badId(bodyId, queryId)) return refuse(400, 'id must be a string or a number');
                        const checked = await validateWrite(unflattenedBody);
                        if (checked.error) return refuse(400, checked.error);
                        unflattenedBody = checked.body;
                        // POST only creates: refuse an id that exists (the body id is what db.save writes; ?id= is checked too)
                        for (const candidate of [bodyId, queryId]) {
                            if (candidate === undefined || candidate === '') continue;
                            if (await db.exists(entity, candidate)) return refuse(409, 'A record with this id already exists (use PUT to overwrite)');
                        }
                        await db.save(entity, null, unflattenedBody);
                        res.redirect(redirect);
                        break;
                    }
                    case 'PUT': {
                        if (badId(ownId(filters), ownId(req.body))) return refuse(400, 'id must be a string or a number');
                        const updateId = ownId(filters) || ownId(req.body);
                        if (!updateId) {
                            if (wantsHtml()) return this.redirectBack(req, res, 'ID required for update');
                            return res.status(400).send('ID required for update');
                        }
                        const checked = await validateWrite(unflattenedBody);
                        if (checked.error) return refuse(400, checked.error);
                        unflattenedBody = checked.body;
                        await db.save(entity, updateId, unflattenedBody);
                        res.redirect(redirect);
                        break;
                    }
                    case 'DELETE': {
                        // Refuse an unfiltered delete (it would wipe the whole entity); pagination/sort params are not filters.
                        const reserved = ['_limit', '_offset', '_sort', '_order'];
                        const deleteFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => !reserved.includes(k)));
                        if (Object.keys(deleteFilters).length === 0) {
                            if (wantsHtml()) return this.redirectBack(req, res, 'Filter required for delete');
                            return res.status(400).send('Filter required for delete');
                        }
                        await db.remove(entity, deleteFilters);
                        res.redirect(redirect);
                        break;
                    }
                    default:
                        res.status(405).end();
                }
            } catch (e) {
                this.logger(`[Engine] Data Error: ${e.message}`);
                if (wantsHtml()) return this.redirectBack(req, res, 'Internal Server Error');
                res.status(500).json({ error: 'Internal Server Error' });
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
                        // A scalar parent (meta=str&meta.isbn=x) stays and the child is dropped: the schema check then
                        // reports the non-object parent instead of this throwing a TypeError
                        if (typeof current[part] !== 'object') break;
                        current = current[part];
                    }
                }
            }
            return result;
        };

        // --- Project Server Control (SSR forms, Issue #14) ---
        // POST /_sys/server/start|stop  (urlencoded: id, data-t-redirect)
        const serverControl = (action) => async (req, res, next) => {
            if (!this.manageProjects) return next();
            const body = req.body || {};
            const back = (error) => this.redirectBack(req, res, error);
            try {
                const id = body.id;
                if (!id) throw new UserError('Project id is required');
                const records = await db.find('projects', { id });
                const record = records && records[0];
                if (!record) throw new UserError(`Project not found: ${id}`);
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
                back(e.userSafe ? e.message : 'Internal Server Error');
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

            // Handle root; decode the percent-encoded URL path exactly once (Issue #86), a malformed escape is a 400
            let reqPath;
            try {
                reqPath = decodeURIComponent(req.path === '/' ? '/index.html' : req.path);
            } catch (e) {
                return res.status(400).send('Bad Request');
            }

            // A raw "/../" request target is not normalized by Express, and links inside the project
            // may point outside it or into _ directories: serve only the canonical in-project file
            const loc = this.locateProjectFile(reqPath);
            if (!loc) return next();
            if (loc.segments.some(seg => seg.startsWith('_'))) {
                this.logger(`[Security] Blocked link to system resource: ${req.url}`);
                return next();
            }
            // Every alias of the root bracify.js (/./, //, %62..., case) is the engine, never a project file (Issue #55)
            if (loc.segments.length === 1 && loc.segments[0].toLowerCase() === 'bracify.js') return this.serveEngine(req, res, next);
            const filePath = loc.file;

            // If HTML, Perform SSR
            if (filePath.toLowerCase().endsWith('.html')) {
                try {
                    let htmlContent;
                    const cacheKey = filePath;

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
                        query: buildSysQuery(req),
                        params: req.params
                    };

                    // Prepare full data context for SSR
                    const data = { _sys: _sysData };
                    this.logger(`[Bracify] SSR Start: ${req.url}`);

                    let processed = await renderer.processHTML(htmlContent, data, async (includePath) => {
                        // Built files already have includes resolved, but just in case
                        return this.resolveInclude(includePath);
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
                        window.__BRACIFY_SSR__ = true;
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
                            const resolvedSSI = await renderer.processHTML(rawHtml, { _sys: { query: {}, params: {} } }, async (includePath) => this.resolveInclude(includePath), async () => null, null, { processBindings: false });
                            this.templateCache.set(cacheKey, resolvedSSI);
                        } catch (e) {
                            this.logger(`[Bracify] Cache Warning Error: ${e.message}`);
                        }
                    }

                    this.logger(`[Bracify] SSR Done: ${req.url} (Data keys: ${Object.keys(data).filter(k => k !== '_sys')})`);
                    res.send(processed);
                } catch (e) {
                    this.logger(`[Bracify] SSR Error: ${e.message}`);
                    res.status(500).send('Internal Server Error');
                }
            } else {
                // Static file (images, css, etc.)
                // Relative to the real root so dotfile checks ignore dot-directories above the project (Issue #41)
                // Express's sendFile encodes the path itself, so the decoded names are passed as-is (Issue #86)
                res.sendFile(loc.segments.join('/'), { root: loc.root });
            }
        });

        // Final error handler: never fall through to Express's default HTML error page (Issue #44)
        this.app.use((err, req, res, next) => {
            this.logger(`[Engine] Unhandled error: ${err && err.message}`);
            if (res.headersSent) return next(err);
            // Honour 4xx from static/sendFile/URI decoding (e.g. 404 for a directory, 400 for bad %-escapes)
            const st = (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) ? err.status : 500;
            if (st === 404) return res.status(404).send('Not Found');
            if (st === 500) return res.status(500).send('Internal Server Error');
            res.status(st === 413 ? 413 : (st === 403 ? 403 : 400)).send(st === 413 ? 'Payload Too Large' : (st === 403 ? 'Forbidden' : 'Bad Request'));
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

    // Resolve a user-supplied redirect target to a same-origin root-relative path (never an open redirect).
    // Relative values resolve against the same-origin Referer (the page holding the form), else the site root.
    // Invalid / foreign values fall back to the same-origin Referer, then null.
    safeRedirectTarget(req, value) {
        // Compare host[:port] in URL-normalized form (case, default ports, IPv6 brackets). The scheme is deliberately not
        // compared: only a root-relative path is ever returned, and behind a TLS-terminating proxy req.protocol is 'http'
        // while the browser's Referer / absolute target is 'https'.
        let origin, host;
        try { const o = new URL(`${req.protocol}://${req.get('host')}`); origin = o.origin; host = o.host; } catch { origin = 'http://localhost'; host = null; }
        const toPath = (u) => {
            if (!host || u.host !== host || (u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
            // Collapse leading slashes so the result can never be read as a protocol-relative URL
            return (u.pathname + u.search + u.hash).replace(/^\/{2,}/, '/');
        };
        const parse = (v, b) => { try { return new URL(v, b); } catch { return null; } };
        const referer = req.header('Referer');
        const refUrl = typeof referer === 'string' && referer ? parse(referer, origin) : null;
        const refPath = refUrl ? toPath(refUrl) : null;
        if (typeof value === 'string' && value && !/[\x00-\x1f\x7f\\]/.test(value)) {
            const u = parse(value, refUrl && refPath ? refUrl : origin + '/');
            const p = u && toPath(u);
            if (p) return p;
        }
        return refPath;
    }

    // 303 back to data-t-redirect / Referer (with ?error=... on failure)
    // onNoTarget (optional): called instead of the bare 400 when there is nowhere to redirect to
    redirectBack(req, res, error, onNoTarget) {
        const body = req.body || {};
        const base = this.safeRedirectTarget(req, body['data-t-redirect']) || (body['data-t-redirect'] ? '/' : null);
        if (!base) {
            if (error && onNoTarget) return onNoTarget();
            return error ? res.status(400).send('Bad Request') : res.redirect(303, '/');
        }
        if (!error) return res.redirect(303, base);
        const hashIdx = base.indexOf('#');
        let url = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
        const hash = hashIdx >= 0 ? base.slice(hashIdx) : '';
        url = url.replace(/([?&])error=[^&]*&?/, '$1').replace(/[?&]$/, '');
        url += (url.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(String(error).slice(0, 300));
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
        clearTimeout(this.writeSchemaTimer);
        this.writeSchemaCache = null;

        // Re-init DB
        if (projectPath) {
            await db.init(projectPath);
            await this.reconcileProjects();

            // Start watcher for hot-reload of cache (Windows-friendly recursive watch)
            try {
                this.watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
                    if (filename && (/\.html$/i.test(filename) || filename.includes('_parts'))) {
                        // this.logger(`[Bracify] File changed: ${filename}. Clearing cache.`);
                        this.templateCache.clear();
                        this.invalidateWriteSchema();
                    }
                });
            } catch (e) {
                this.logger(`[Bracify] Watch error: ${e.message}`);
            }
            this.warmWriteSchema();
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
        clearTimeout(this.writeSchemaTimer);
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
