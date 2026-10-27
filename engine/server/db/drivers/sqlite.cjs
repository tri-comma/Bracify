const path = require('path');
const fs = require('fs');
const BaseAdapter = require('./base.cjs');

// --- Filter building (Data API: `key=val`, `key:ne|gt|gte|lt|lte=val`) ---
const OPERATORS = { ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

// Text form of a JSON field, comparable with a query-string value: numbers become
// '2' / '1.5', booleans 'true' / 'false' (same as String(item[key]) in the CSR filter).
const TEXT_EXPR = "CASE json_type(value, ?) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST(json_extract(value, ?) AS TEXT) END";

// True when an `id` filter value is empty or an unresolved placeholder like "{?}" / "{_sys.query.id}".
function isBlankIdFilter(val) {
    return val === undefined || val === null || val === '' ||
        (typeof val === 'string' && val.indexOf('{') !== -1 && val.indexOf('}') !== -1);
}

// Returns the SQL fragment (starting with " AND ") for one filter and pushes its parameters.
function buildFilter(rawKey, val, params, allowWildcard = true) {
    let key = rawKey;
    let op = '=';
    const m = /^(.*):(ne|gt|gte|lt|lte)$/.exec(rawKey);
    if (m && m[1]) { key = m[1]; op = m[2]; }
    val = String(val);

    if (key === 'id') {
        if (op === '=') { params.push(val); return ' AND id = ?'; }
        if (op === 'ne') { params.push(val); return ' AND id != ?'; }
        const num = val.trim() !== '' && isFinite(Number(val));
        params.push(num ? Number(val) : val);
        return ` AND ${num ? 'CAST(id AS REAL)' : 'id'} ${OPERATORS[op]} ?`;
    }

    const path = `$.${key}`;
    if (op === '=') {
        if (allowWildcard && val.includes("*")) {
            params.push(path, path, val.replace(/\*/g, '%'));
            return ` AND ${TEXT_EXPR} LIKE ?`;
        }
        params.push(path, path, val);
        return ` AND ${TEXT_EXPR} = ?`;
    }
    if (op === 'ne') {
        params.push(path, path, val);
        return ` AND ${TEXT_EXPR} IS NOT ?`;
    }
    // Ordered comparison: numeric when the value is a number (numeric strings from form posts included), otherwise text.
    if (val.trim() !== '' && isFinite(Number(val))) {
        params.push(path, path, path, path, Number(val));
        return ` AND (json_type(value, ?) IN ('integer', 'real') OR (json_type(value, ?) = 'text' AND trim(json_extract(value, ?)) GLOB '[-0-9.]*')) AND CAST(json_extract(value, ?) AS REAL) ${OPERATORS[op]} ?`;
    }
    params.push(path, path, val);
    return ` AND ${TEXT_EXPR} ${OPERATORS[op]} ?`;
}

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

        await new Promise((resolve, reject) => {
            this.db = new this.sqlite3.Database(dbPath, (err) => err ? reject(err) : resolve());
        });

        const db = this.db;
        const run = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (e) => e ? rej(e) : res()));
        const get = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));

        // Main Table
        await run(`CREATE TABLE IF NOT EXISTS data_records (
            entity TEXT,
            id TEXT,
            value TEXT,
            PRIMARY KEY (entity, id)
        )`);

        // System Config Table
        await run(`CREATE TABLE IF NOT EXISTS config (
            name TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Migrate from legacy kv_store if exists
        const legacy = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'");
        if (legacy) {
            await run(`INSERT OR IGNORE INTO data_records (entity, id, value)
                    SELECT name, '__default__', data FROM kv_store`);
        }

        await this._importSeeds(run, get);

        console.log(`[DB-SQLite] Connected and initialized: ${dbPath}`);
    }

    // Import _sys/data/*.json seeds once per entity. A `seed_imported:<entity>` marker in the config table is
    // written in the same transaction as the entity's inserts, so records deleted later (even all of them) are
    // never re-seeded, and edits to the seed files after the first import are ignored. A DB that predates the
    // marker and already holds rows for the entity just gets the marker; an entity without rows is imported.
    async _importSeeds(run, get) {
        const dataDir = path.join(this.projectPath, '_sys', 'data');
        if (!fs.existsSync(dataDir)) return;

        const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const entity = file.replace('.json', '');
            const marker = `seed_imported:${entity}`;
            let inTransaction = false;
            let stmt = null;
            try {
                if (await get("SELECT 1 AS x FROM config WHERE name = ?", [marker])) continue;

                const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
                const data = JSON.parse(content);
                const hasRows = await get("SELECT 1 AS x FROM data_records WHERE entity = ? LIMIT 1", [entity]);

                await run("BEGIN");
                inTransaction = true;
                if (!hasRows) {
                    stmt = await new Promise((res, rej) => {
                        const st = this.db.prepare(`INSERT OR IGNORE INTO data_records (entity, id, value) VALUES (?, ?, ?)`, (e) => e ? rej(e) : res(st));
                    });
                    const insert = (id, json) => new Promise((res, rej) => stmt.run([entity, id, json], (e) => e ? rej(e) : res()));
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            const id = item.id || Math.random().toString(36).substring(2, 15);
                            await insert(id, JSON.stringify(item));
                        }
                    } else if (data && typeof data === 'object') {
                        await insert(data.id || '__default__', content);
                    }
                    await new Promise((res, rej) => stmt.finalize((e) => e ? rej(e) : res()));
                    stmt = null;
                }
                await run("INSERT OR REPLACE INTO config (name, value) VALUES (?, ?)", [marker, JSON.stringify(true)]);
                await run("COMMIT");
                inTransaction = false;
            } catch (e) {
                console.error(`[DB-SQLite] Failed to migrate ${file}: ${e.message}`);
                if (stmt) await new Promise(res => stmt.finalize(() => res()));
                if (inTransaction) await run("ROLLBACK").catch(() => {});
            }
        }
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
                // An empty/unresolved `id` filter matches nothing (never "ignored", which would return the first record).
                if (key === 'id' && isBlankIdFilter(val)) return resolve([]);
                if (val === undefined || val === null || val === '' || val === '{?}') continue;
                // Ignore unresolved placeholders (e.g. "{_sys.query.q}" when the URL parameter is absent),
                // consistent with the CSR filterLocalData(); otherwise they would filter out every record.
                if (typeof val === 'string' && val.indexOf('{') !== -1 && val.indexOf('}') !== -1) continue;

                if (key === '_limit') limit = parseInt(val, 10);
                else if (key === '_offset') offset = parseInt(val, 10);
                else if (key === '_sort') sort = val;
                else if (key === '_order') order = (val && val.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
                else dataFilters[key] = val;
            }

            for (const [key, val] of Object.entries(dataFilters)) {
                sql += buildFilter(key, val, params);
            }

            if (sort) {
                if (sort === 'id' || sort === 'entity') {
                    sql += ` ORDER BY ${sort} ${order}`;
                } else {
                    sql += ` ORDER BY json_extract(value, ?) ${order}`;
                    params.push(`$.${sort}`);
                }
            }

            const hasLimit = limit !== null && !isNaN(limit);
            const hasOffset = offset !== null && !isNaN(offset);
            if (hasLimit || hasOffset) {
                // SQLite requires LIMIT for OFFSET; -1 means "no limit" so _offset works on its own.
                sql += " LIMIT ?";
                params.push(hasLimit ? limit : -1);
                if (hasOffset) {
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
            // Skip reserved query params (as find does) and refuse to wipe the whole entity without a data filter
            const dataFilters = Object.entries(filters || {}).filter(([key]) => !['_limit', '_offset', '_sort', '_order'].includes(key));
            if (dataFilters.length === 0) return reject(new Error('remove requires at least one filter'));
            for (const [key, val] of dataFilters) {
                sql += buildFilter(key, val, params, false);
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
