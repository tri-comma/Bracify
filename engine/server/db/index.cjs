const path = require('path');
const fs = require('fs');
const SQLiteAdapter = require('./drivers/sqlite.cjs');

let sqlite3Driver = null;

const setDriver = (driver) => {
    sqlite3Driver = driver;
};

/**
 * A DB manager bound to one project (project DB + routing config + routed adapters).
 * The module-level exports operate on a default singleton (the server's current project).
 * openProject() creates an independent instance for another project (Studio data manager).
 */
class DbManager {
    constructor() {
        this.projectDB = null;
        this.adapters = {}; // Cache of initialized adapters
        this.config = []; // Config entries: { target_entity, engine, option }
    }

    async loadConfig() {
        this.config = [];

        // 1. Try DB config table ('db')
        try {
            const dbConfig = await this.projectDB.getConfig('db');
            if (dbConfig && Array.isArray(dbConfig)) {
                console.log('[DB-Manager] Loading config from DB (config table)');
                this.config = dbConfig;
            }
        } catch (e) {
            // Table/Record might not exist
        }

        // Process env vars in config
        const processOption = (opt) => {
            if (!opt || typeof opt !== 'object') return opt;
            const newOpt = { ...opt };
            for (const [k, v] of Object.entries(newOpt)) {
                if (typeof v === 'string') {
                    newOpt[k] = v.replace(/\$\{(.+?)\}/g, (match, name) => process.env[name] || match);
                } else if (typeof v === 'object') {
                    newOpt[k] = processOption(v);
                }
            }
            return newOpt;
        };

        this.config = this.config.map(c => ({
            ...c,
            option: processOption(c.option)
        }));
    }

    async getAdapterForEntity(entity) {
        const projectDB = this.projectDB;
        if (!projectDB) throw new Error('DB not initialized');

        // Security: Block invalid entity names
        if (!/^[a-zA-Z0-9_-]+$/.test(entity)) {
            throw new Error(`Invalid entity name: ${entity}`);
        }

        // Resolve route based on priority:
        // 1. Exact match
        // 2. Longest pattern match (wildcard *)
        // 3. Definition order (priority)

        let bestRoute = null;
        let maxPatternLength = -1;

        for (let i = 0; i < this.config.length; i++) {
            const route = this.config[i];
            const pattern = route.target_entity;

            if (pattern === entity) {
                // Exact match - highest priority
                bestRoute = route;
                break;
            }

            if (pattern.includes('*')) {
                const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
                const regex = new RegExp(regexStr);
                if (regex.test(entity)) {
                    const patternLength = pattern.replace(/\*/g, '').length;
                    // Ties: the route defined earlier wins (we iterate forward)
                    if (patternLength > maxPatternLength) {
                        maxPatternLength = patternLength;
                        bestRoute = route;
                    }
                }
            }
        }

        const route = bestRoute;

        // Default to projectDB if no route or if route is sqlite with no custom storage
        if (!route || (route.engine === 'sqlite' && !route.option?.storage)) {
            return projectDB;
        }

        // Handle routed engines (MySQL, PostgreSQL, or different SQLite files)
        const key = JSON.stringify(route);
        if (!this.adapters[key]) {
            try {
                let DriverClass;
                if (route.engine === 'sqlite') {
                    DriverClass = SQLiteAdapter;
                } else {
                    DriverClass = require(`./drivers/${route.engine}.cjs`);
                }

                const adapterOpts = {
                    sqlite3: sqlite3Driver,
                    projectPath: projectDB.projectPath,
                    ...route.option
                };
                const adapter = new DriverClass(adapterOpts);
                await adapter.init();
                this.adapters[key] = adapter;
            } catch (e) {
                console.error(`[DB-Manager] Failed to load driver for ${route.engine}:`, e.message);
                return projectDB;
            }
        }
        return this.adapters[key];
    }

    async init(projectPath) {
        await this.close();

        // Initialize Project DB (Permanent SQLite anchor)
        this.projectDB = new SQLiteAdapter({ sqlite3: sqlite3Driver, projectPath });
        await this.projectDB.init();

        // Load dynamic configuration
        await this.loadConfig();
    }

    async close() {
        if (this.projectDB) await this.projectDB.close();
        this.projectDB = null;
        for (const adapter of Object.values(this.adapters)) {
            await adapter.close();
        }
        // Clear cache
        for (const k of Object.keys(this.adapters)) delete this.adapters[k];
    }

    async list() {
        return this.projectDB.list();
    }

    async find(entity, filters) {
        const adapter = await this.getAdapterForEntity(entity);
        return adapter.find(entity, filters);
    }

    async save(entity, id, data) {
        const adapter = await this.getAdapterForEntity(entity);
        return adapter.save(entity, id, data);
    }

    async exists(entity, id) {
        const adapter = await this.getAdapterForEntity(entity);
        return adapter.exists(entity, id);
    }

    async remove(entity, filters) {
        const adapter = await this.getAdapterForEntity(entity);
        return adapter.remove(entity, filters);
    }

    async get(name) {
        const adapter = await this.getAdapterForEntity(name);
        return adapter.get(name);
    }

    async put(name, data) {
        const adapter = await this.getAdapterForEntity(name);
        return adapter.put(name, data);
    }
}

const current = new DbManager();

// Open a separate, independent DB for another project (does not touch the singleton).
// The caller must close() it after use.
const openProject = async (projectPath) => {
    if (!projectPath || !fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
        throw new Error(`Project path not found: ${projectPath}`);
    }
    const manager = new DbManager();
    await manager.init(path.resolve(projectPath));
    return manager;
};

const init = (projectPath) => current.init(projectPath);
const close = () => current.close();
const list = () => current.list();
const find = (entity, filters) => current.find(entity, filters);
const save = (entity, id, data) => current.save(entity, id, data);
const exists = (entity, id) => current.exists(entity, id);
const remove = (entity, filters) => current.remove(entity, filters);
const get = (name) => current.get(name);
const put = (name, data) => current.put(name, data);

module.exports = { setDriver, init, close, list, get, put, find, save, exists, remove, openProject };
