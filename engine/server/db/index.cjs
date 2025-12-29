const path = require('path');
const fs = require('fs');
const SQLiteAdapter = require('./drivers/sqlite.cjs');

let sqlite3Driver = null;
let projectDB = null;
const adapters = {}; // Cache of initialized adapters
let config = []; // Config entries: { target_entity, engine, option }

const setDriver = (driver) => {
    sqlite3Driver = driver;
};

const loadConfig = async () => {
    config = [];

    // 1. Try DB config table ('db')
    try {
        const dbConfig = await projectDB.getConfig('db');
        if (dbConfig && Array.isArray(dbConfig)) {
            console.log('[DB-Manager] Loading config from DB (config table)');
            config = dbConfig;
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

    config = config.map(c => ({
        ...c,
        option: processOption(c.option)
    }));
};

const getAdapterForEntity = async (entity) => {
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
    let bestRouteIndex = -1;

    for (let i = 0; i < config.length; i++) {
        const route = config[i];
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
                if (patternLength > maxPatternLength) {
                    maxPatternLength = patternLength;
                    bestRoute = route;
                    bestRouteIndex = i;
                } else if (patternLength === maxPatternLength) {
                    // Tie-breaker: already found route is better because it appeared earlier (lower index)
                    // if (bestRouteIndex === -1 || i < bestRouteIndex) ... 
                    // Since we iterate forward, we don't need to update if lengths are equal.
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
    if (!adapters[key]) {
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
            adapters[key] = adapter;
        } catch (e) {
            console.error(`[DB-Manager] Failed to load driver for ${route.engine}:`, e.message);
            return projectDB;
        }
    }
    return adapters[key];
};

const init = async (projectPath) => {
    await close();

    // Initialize Project DB (Permanent SQLite anchor)
    projectDB = new SQLiteAdapter({ sqlite3: sqlite3Driver, projectPath });
    await projectDB.init();

    // Load dynamic configuration
    await loadConfig();
};

const close = async () => {
    if (projectDB) await projectDB.close();
    projectDB = null;
    for (const adapter of Object.values(adapters)) {
        await adapter.close();
    }
    // Clear cache
    for (const k of Object.keys(adapters)) delete adapters[k];
};

const list = async () => {
    return projectDB.list();
};

const find = async (entity, filters) => {
    const adapter = await getAdapterForEntity(entity);
    return adapter.find(entity, filters);
};

const save = async (entity, id, data) => {
    const adapter = await getAdapterForEntity(entity);
    return adapter.save(entity, id, data);
};

const remove = async (entity, filters) => {
    const adapter = await getAdapterForEntity(entity);
    return adapter.remove(entity, filters);
};

const get = async (name) => {
    const adapter = await getAdapterForEntity(name);
    return adapter.get(name);
};

const put = async (name, data) => {
    const adapter = await getAdapterForEntity(name);
    return adapter.put(name, data);
};

module.exports = { setDriver, init, close, list, get, put, find, save, remove };
