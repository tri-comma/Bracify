const path = require('path');
const fs = require('fs');

let db = null;
let sqlite3 = null;

const setDriver = (driver) => {
    sqlite3 = driver;
    if (sqlite3 && sqlite3.verbose) sqlite3 = sqlite3.verbose();
};

const init = async (projectPath) => {
    if (db) await close();

    const sysDir = path.join(projectPath, '_sys');
    if (!fs.existsSync(sysDir)) fs.mkdirSync(sysDir, { recursive: true });

    const dbPath = path.join(sysDir, 'data.db');

    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);

            db.serialize(() => {
                // Main Table: supports entities (collections) and individual records
                db.run(`CREATE TABLE IF NOT EXISTS data_records (
                    entity TEXT,
                    id TEXT,
                    value TEXT,
                    PRIMARY KEY (entity, id)
                )`);

                // Migrate from legacy kv_store if exists
                db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'", (err, table) => {
                    if (table) {
                        db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) 
                                SELECT name, '__default__', data FROM kv_store`);
                    }
                });

                // Auto-migrate from JSON files in _sys/data/
                const dataDir = path.join(sysDir, 'data');
                if (fs.existsSync(dataDir)) {
                    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
                    for (const file of files) {
                        const entity = file.replace('.json', '');
                        try {
                            const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
                            const data = JSON.parse(content);
                            if (Array.isArray(data)) {
                                for (const item of data) {
                                    const id = item.id || Math.random().toString(36).substring(2, 15);
                                    db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) VALUES (?, ?, ?)`, [entity, id, JSON.stringify(item)]);
                                }
                            } else if (data && typeof data === 'object') {
                                const id = data.id || '__default__';
                                db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) VALUES (?, ?, ?)`, [entity, id, content]);
                            }
                        } catch (e) {
                            console.error(`[DB] Failed to migrate ${file}: ${e.message}`);
                        }
                    }
                }

                console.log(`[DB] Connected to ${dbPath}`);
                resolve();
            });
        });
    });
};

const close = () => {
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        db.close((err) => {
            if (err) reject(err);
            else { db = null; console.log('[DB] Closed'); resolve(); }
        });
    });
};

const list = () => {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        db.all("SELECT DISTINCT entity FROM data_records", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => ({ name: r.entity })));
        });
    });
};

const find = (entity, filters = {}) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('No DB connected'));

        let sql = "SELECT id, value FROM data_records WHERE entity = ?";
        let params = [entity];

        // Extract control parameters
        // Extract control parameters
        let limit = null;
        let offset = null;
        let sort = null;
        let order = 'ASC';

        const dataFilters = {};
        for (const [key, val] of Object.entries(filters)) {
            if (val === undefined || val === null || val === '' || val === '{?}') continue;

            if (key === '_limit') limit = parseInt(val, 10);
            else if (key === '_offset') offset = parseInt(val, 10);
            else if (key === '_sort') sort = val;
            else if (key === '_order') order = (val && val.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
            else dataFilters[key] = val;
        }

        for (const [key, val] of Object.entries(dataFilters)) {
            if (key === 'id') {
                sql += " AND id = ?";
                params.push(val);
            } else {
                // Check for wildcard '*' usage for partial match
                if (typeof val === 'string' && val.includes('*')) {
                    sql += " AND json_extract(value, ?) LIKE ?";
                    params.push(`$.${key}`);
                    params.push(val.replace(/\*/g, '%'));
                } else {
                    sql += " AND json_extract(value, ?) = ?";
                    params.push(`$.${key}`);
                    params.push(val);
                }
            }
        }

        // Apply Ordering
        if (sort) {
            // Check if sort key is a top-level column (id, entity) or inside json
            if (sort === 'id' || sort === 'entity') {
                sql += ` ORDER BY ${sort} ${order}`;
            } else {
                // Sort by JSON field
                sql += ` ORDER BY json_extract(value, ?) ${order}`;
                params.push(`$.${sort}`);
            }
        }

        // Apply Limit/Offset
        if (limit !== null && !isNaN(limit)) {
            sql += " LIMIT ?";
            params.push(limit);
            if (offset !== null && !isNaN(offset)) {
                sql += " OFFSET ?";
                params.push(offset);
            }
        }

        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => ({ ...JSON.parse(r.value), id: r.id })));
        });
    });
};

const save = (entity, id, data) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('No DB connected'));
        const body = data || {};
        const recordId = id || body.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
        const json = JSON.stringify(body);

        db.run("INSERT OR REPLACE INTO data_records (entity, id, value) VALUES (?, ?, ?)", [entity, recordId, json], (err) => {
            if (err) reject(err);
            else resolve(recordId);
        });
    });
};

const remove = (entity, filters = {}) => {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('No DB connected'));
        let sql = "DELETE FROM data_records WHERE entity = ?";
        let params = [entity];
        for (const [key, val] of Object.entries(filters)) {
            if (key === 'id') {
                sql += " AND id = ?";
                params.push(val);
            } else {
                sql += " AND json_extract(value, ?) = ?";
                params.push(`$.${key}`);
                params.push(val);
            }
        }
        db.run(sql, params, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Compatibility wrappers for existing singleton usage
const get = async (name) => {
    const res = await find(name, { id: '__default__' });
    if (res.length > 0) return res[0];
    const all = await find(name);
    return all.length > 0 ? all[0] : null;
};
const put = (name, data) => save(name, '__default__', data);

module.exports = { setDriver, init, close, list, get, put, find, save, remove };
