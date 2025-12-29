const path = require('path');
const fs = require('fs');
const BaseAdapter = require('./base.cjs');

class SQLiteAdapter extends BaseAdapter {
    constructor(options = {}) {
        super(options);
        this.db = null;
        this.sqlite3 = options.sqlite3;
        if (this.sqlite3 && this.sqlite3.verbose) this.sqlite3 = this.sqlite3.verbose();
        this.projectPath = options.projectPath;
    }

    async init() {
        if (this.db) await this.close();
        if (!this.sqlite3) throw new Error('sqlite3 driver not provided to SQLiteAdapter');

        const dbPath = this.options.storage || path.join(this.projectPath, '_sys', 'data.db');
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

        return new Promise((resolve, reject) => {
            this.db = new this.sqlite3.Database(dbPath, (err) => {
                if (err) return reject(err);

                this.db.serialize(() => {
                    // Main Table
                    this.db.run(`CREATE TABLE IF NOT EXISTS data_records (
                        entity TEXT,
                        id TEXT,
                        value TEXT,
                        PRIMARY KEY (entity, id)
                    )`);

                    // System Config Table
                    this.db.run(`CREATE TABLE IF NOT EXISTS config (
                        name TEXT PRIMARY KEY,
                        value TEXT
                    )`);

                    // Migrate from legacy kv_store if exists
                    this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'", (err, table) => {
                        if (table) {
                            this.db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) 
                                    SELECT name, '__default__', data FROM kv_store`);
                        }
                    });

                    // Auto-migrate from JSON files in _sys/data/
                    // Only do this for the "main" data.db, usually.
                    // For now, keep original logic.
                    const dataDir = path.join(this.projectPath, '_sys', 'data');
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
                                        this.db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) VALUES (?, ?, ?)`, [entity, id, JSON.stringify(item)]);
                                    }
                                } else if (data && typeof data === 'object') {
                                    const id = data.id || '__default__';
                                    this.db.run(`INSERT OR IGNORE INTO data_records (entity, id, value) VALUES (?, ?, ?)`, [entity, id, content]);
                                }
                            } catch (e) {
                                console.error(`[DB-SQLite] Failed to migrate ${file}: ${e.message}`);
                            }
                        }
                    }

                    this.db.run("SELECT 1", (err) => {
                        if (err) reject(err);
                        else {
                            console.log(`[DB-SQLite] Connected and initialized: ${dbPath}`);
                            resolve();
                        }
                    });
                });
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve();
            this.db.close((err) => {
                if (err) reject(err);
                else { this.db = null; resolve(); }
            });
        });
    }

    async list() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve([]);
            this.db.all("SELECT DISTINCT entity FROM data_records", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => ({ name: r.entity })));
            });
        });
    }

    async find(entity, filters = {}) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('No DB connected'));

            let sql = "SELECT id, value FROM data_records WHERE entity = ?";
            let params = [entity];

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

            if (sort) {
                if (sort === 'id' || sort === 'entity') {
                    sql += ` ORDER BY ${sort} ${order}`;
                } else {
                    sql += ` ORDER BY json_extract(value, ?) ${order}`;
                    params.push(`$.${sort}`);
                }
            }

            if (limit !== null && !isNaN(limit)) {
                sql += " LIMIT ?";
                params.push(limit);
                if (offset !== null && !isNaN(offset)) {
                    sql += " OFFSET ?";
                    params.push(offset);
                }
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map(r => ({ ...JSON.parse(r.value), id: r.id })));
            });
        });
    }

    async save(entity, id, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('No DB connected'));
            const body = data || {};
            const recordId = id || body.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            const json = JSON.stringify(body);

            this.db.run("INSERT OR REPLACE INTO data_records (entity, id, value) VALUES (?, ?, ?)", [entity, recordId, json], (err) => {
                if (err) reject(err);
                else resolve(recordId);
            });
        });
    }

    async remove(entity, filters = {}) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('No DB connected'));
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
            this.db.run(sql, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // System Config Methods
    async getConfig(name) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve(null);
            this.db.get("SELECT value FROM config WHERE name = ?", [name], (err, row) => {
                if (err) reject(err);
                else resolve(row ? JSON.parse(row.value) : null);
            });
        });
    }

    async saveConfig(name, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('No DB connected'));
            this.db.run("INSERT OR REPLACE INTO config (name, value) VALUES (?, ?)", [name, JSON.stringify(value)], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = SQLiteAdapter;
