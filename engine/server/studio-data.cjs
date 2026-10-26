const fs = require('fs');
const path = require('path');
const db = require('./db/index.cjs');
const scanner = require('./schema-scanner.cjs');

// Studio Data Manager server side (Issue #9).
// Enabled only on the system server (manageProjects). Operates on a *target project's* DB through
// a separate DB manager instance (db.openProject) so Studio's own DB is never touched.

const STUDIO_HREF = /^\/?_sys\/studio\/(entities|records|schema)\.json(?:\?(.*))?$/;

const getPath = (obj, name) => name.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);

// Derived properties so Studio pages can render generic forms with plain data-t-if
const decorateField = (f) => ({
    ...f,
    isEnum: f.type === 'enum',
    isCheckbox: f.type === 'checkbox' || f.type === 'boolean',
    isTextarea: f.type === 'text' && f.maxlength !== null && f.maxlength > 200,
    isPlain: !(f.type === 'enum' || f.type === 'checkbox' || f.type === 'boolean' || (f.type === 'text' && f.maxlength !== null && f.maxlength > 200)),
    inputType: ({ string: 'text', unknown: 'text', object: 'text', text: 'text', enum: 'text', boolean: 'checkbox' })[f.type] || f.type
});

const displayValue = (v) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

const toCell = (field, record) => {
    const raw = getPath(record, field.name);
    const value = displayValue(raw);
    const d = decorateField(field);
    return {
        ...d,
        value,
        isChecked: d.isCheckbox && (raw === true || value === 'on' || value === 'true'),
        isUnchecked: d.isCheckbox && !(raw === true || value === 'on' || value === 'true'),
        options: Array.isArray(field.options) ? field.options.map(o => ({ value: o, isSelected: o === value })) : []
    };
};

class StudioData {
    constructor(server) {
        this.server = server;
        this.logger = server.logger;
    }

    // { id -> project path } via Studio's own 'projects' entity
    async resolveProjectPath(id) {
        if (!id || typeof id !== 'string') throw new Error('Project id is required');
        const records = await db.find('projects', { id });
        const record = records && records[0];
        if (!record) throw new Error(`Project not found: ${id}`);
        if (!record.path) throw new Error(`Project has no path: ${id}`);
        const p = path.resolve(record.path);
        if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new Error(`Project path not found: ${record.path}`);
        return p;
    }

    checkEntity(entity) {
        if (!scanner.isValidEntityName(entity)) throw new Error('Invalid entity name');
    }

    async withProjectDb(projectId, fn) {
        const projectPath = await this.resolveProjectPath(projectId);
        const dbm = await db.openProject(projectPath);
        try {
            return await fn(dbm, projectPath);
        } finally {
            await dbm.close();
        }
    }

    // Scan HTML + existing DB data
    async loadSchemas(dbm, projectPath) {
        const first = scanner.scan(projectPath);
        const names = new Set(first.map(e => e.entity));
        try {
            for (const row of await dbm.list()) if (scanner.isValidEntityName(row.name)) names.add(row.name);
        } catch (e) { /* ignore */ }
        const records = {};
        for (const name of names) {
            try { records[name] = await dbm.find(name, {}); } catch (e) { records[name] = []; }
        }
        return scanner.scan(projectPath, { records });
    }

    async schemaFor(dbm, projectPath, entity) {
        const schemas = await this.loadSchemas(dbm, projectPath);
        return schemas.find(s => s.entity === entity) || null;
    }

    // SSR data fetcher for virtual hrefs (returns undefined when href is not a studio href)
    async fetch(href) {
        const m = String(href).match(STUDIO_HREF);
        if (!m) return undefined;
        const kind = m[1];
        const q = Object.fromEntries(new URLSearchParams(m[2] || ''));
        try {
            return await this.withProjectDb(q.project, async (dbm, projectPath) => {
                if (kind === 'entities') {
                    return (await this.loadSchemas(dbm, projectPath)).map(e => ({
                        ...e,
                        fieldCount: e.fields.length,
                        fileCount: e.files.length
                    }));
                }
                this.checkEntity(q.entity);
                const schema = await this.schemaFor(dbm, projectPath, q.entity);
                const fields = schema ? schema.fields : [];
                if (kind === 'schema') {
                    return schema ? { ...schema, fields: fields.map(decorateField), fieldCount: fields.length } : null;
                }
                const { project, entity, ...filters } = q;
                const records = await dbm.find(q.entity, filters);
                const rows = records.map(r => ({ ...r, cells: fields.filter(f => f.name !== 'id').map(f => toCell(f, r)) }));
                if (filters._limit === '1' && rows.length === 1) return rows[0];
                return rows;
            });
        } catch (e) {
            this.logger(`[Studio] Fetch error: ${href}: ${e.message}`);
            return null;
        }
    }

    register(app) {
        const handler = (action) => async (req, res) => {
            if (!this.server.checkOrigin(req, res)) return;
            const q = req.query || {};
            const body = req.body || {};
            const fail = (e) => {
                this.logger(`[Studio] ${action} error: ${e.message}`);
                this.server.redirectBack(req, res, e.message);
            };
            try {
                this.checkEntity(q.entity);
                await this.withProjectDb(q.project, async (dbm, projectPath) => {
                    const schema = await this.schemaFor(dbm, projectPath, q.entity);
                    if (!schema) throw new Error(`Unknown entity: ${q.entity}`);

                    if (action === 'scaffold') {
                        const files = scanner.scaffoldFiles(schema);
                        const targets = Object.keys(files).map(rel => path.join(projectPath, rel));
                        for (const t of targets) {
                            if (fs.existsSync(t)) throw new Error(`File already exists: ${path.relative(projectPath, t).split(path.sep).join('/')}`);
                        }
                        fs.mkdirSync(path.join(projectPath, q.entity), { recursive: true });
                        for (const [rel, content] of Object.entries(files)) {
                            fs.writeFileSync(path.join(projectPath, rel), content, { encoding: 'utf-8', flag: 'wx' });
                        }
                        return;
                    }

                    if (action === 'delete') {
                        if (!q.id) throw new Error('Record id is required');
                        await dbm.remove(q.entity, { id: q.id });
                        return;
                    }

                    const data = this.server.unflatten(body);
                    delete data.id;
                    const errors = scanner.validateRecord(schema, data);
                    if (errors.length) throw new Error(errors.join('; '));

                    if (action === 'create') {
                        await dbm.save(q.entity, null, data);
                    } else {
                        if (!q.id) throw new Error('Record id is required');
                        const existing = (await dbm.find(q.entity, { id: q.id }))[0];
                        if (!existing) throw new Error(`Record not found: ${q.id}`);
                        const next = { ...existing };
                        delete next.id;
                        // Fields in the schema are replaced by the form (unchecked checkboxes are absent)
                        for (const f of schema.fields) delete next[f.name.split('.')[0]];
                        await dbm.save(q.entity, q.id, { ...next, ...data });
                    }
                });
                this.server.redirectBack(req, res, null);
            } catch (e) {
                fail(e);
            }
        };
        app.post('/_sys/studio/records', handler('create'));
        app.post('/_sys/studio/records/update', handler('update'));
        app.post('/_sys/studio/records/delete', handler('delete'));
        app.post('/_sys/studio/scaffold', handler('scaffold'));
    }
}

module.exports = StudioData;
