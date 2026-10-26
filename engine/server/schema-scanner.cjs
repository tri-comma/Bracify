const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Studio Data Manager: collect entities / schema info from a project's HTML (Issue #9)

const ENTITY_RE = /^[a-zA-Z0-9_-]+$/;
const isValidEntityName = (name) => typeof name === 'string' && ENTITY_RE.test(name) && !name.startsWith('_');

const FIELD_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)[+*{]/;
const MAX_PATTERN_INPUT = 1000;
const SKIP_DIRS = new Set(['node_modules', '_sys']);

const walkHtml = (dir, out = []) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
            walkHtml(full, out);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
            out.push(full);
        }
    }
    return out;
};

// "_sys/data/foo.json?x=1" -> "foo" (null when not a data href)
const entityFromHref = (href) => {
    if (!href) return null;
    const m = String(href).match(/_sys[\/\\]data[\/\\]([a-zA-Z0-9_-]+)\.json(?:\?.*)?$/);
    return m && isValidEntityName(m[1]) ? m[1] : null;
};

const baseField = (name) => ({
    name, type: 'unknown', required: false,
    maxlength: null, minlength: null, min: null, max: null, pattern: null, options: null, patternSkipped: false
});

const numAttr = (el, attr) => {
    if (!el.hasAttribute(attr)) return null;
    const n = Number(el.getAttribute(attr));
    return Number.isFinite(n) ? n : null;
};

const fieldFromControl = (el) => {
    const tag = el.tagName.toLowerCase();
    const f = baseField(el.getAttribute('name'));
    if (tag === 'textarea') f.type = 'text';
    else if (tag === 'select') {
        f.type = 'enum';
        f.options = Array.from(el.querySelectorAll('option'))
            .map(o => o.hasAttribute('value') ? o.getAttribute('value') : o.textContent.trim())
            .filter(v => v !== '');
    } else {
        f.type = (el.getAttribute('type') || 'text').toLowerCase();
    }
    f.required = el.hasAttribute('required');
    f.maxlength = numAttr(el, 'maxlength');
    f.minlength = numAttr(el, 'minlength');
    f.min = numAttr(el, 'min');
    f.max = numAttr(el, 'max');
    f.pattern = el.getAttribute('pattern') || null;
    f.patternSkipped = !!(f.pattern && NESTED_QUANTIFIER_RE.test(f.pattern));
    return f;
};

// Merge b into a (a wins; only fill missing properties)
const mergeField = (a, b) => {
    if (a.type === 'unknown' && b.type !== 'unknown') { a.type = b.type; if (b.options) a.options = b.options; }
    if (b.required) a.required = true;
    for (const k of ['maxlength', 'minlength', 'min', 'max', 'pattern', 'options']) {
        if (a[k] === null || a[k] === undefined) a[k] = b[k];
    }
    return a;
};

const inferType = (v) => {
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'string') return 'string';
    if (v !== null && typeof v === 'object') return 'object';
    return null;
};

/**
 * Scan a project directory.
 * @param {string} projectPath
 * @param {{records?: Object<string, Array>}} [opts] existing DB records per entity (used for type inference/count)
 * @returns {Array<{entity, files, fields, count}>}
 */
const scan = (projectPath, opts = {}) => {
    const recordsByEntity = opts.records || {};
    const entities = new Map(); // name -> { files:Set, fields:Map }
    const ensure = (name) => {
        if (!entities.has(name)) entities.set(name, { files: new Set(), fields: new Map() });
        return entities.get(name);
    };
    const addField = (ent, field) => {
        if (!field.name || field.name === 'data-t-redirect' || !FIELD_NAME_RE.test(field.name)) return;
        const existing = ent.fields.get(field.name);
        if (existing) mergeField(existing, field); else ent.fields.set(field.name, field);
    };

    const root = path.resolve(projectPath);
    const placeholders = []; // {file, source, field}
    const sourcesByFile = new Map(); // file -> Map(sourceName -> entity)

    for (const file of walkHtml(root)) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        let html;
        try { html = fs.readFileSync(file, 'utf-8'); } catch (e) { continue; }
        let document;
        try { document = new JSDOM(html).window.document; } catch (e) { continue; }

        const fileSources = new Map();
        sourcesByFile.set(rel, fileSources);

        document.querySelectorAll('[data-t-source]').forEach(el => {
            const entity = entityFromHref(el.getAttribute('href'));
            if (!entity) return;
            ensure(entity).files.add(rel);
            const name = el.getAttribute('data-t-source');
            if (name) fileSources.set(name, entity);
        });

        document.querySelectorAll('form').forEach(form => {
            const entity = entityFromHref(form.getAttribute('action'));
            if (!entity) return;
            const ent = ensure(entity);
            ent.files.add(rel);
            form.querySelectorAll('input, select, textarea').forEach(el => {
                const name = el.getAttribute('name');
                if (!name || name === 'data-t-redirect') return;
                const type = (el.getAttribute('type') || '').toLowerCase();
                if (['submit', 'button', 'reset', 'image'].includes(type)) return;
                addField(ent, fieldFromControl(el));
            });
        });

        // Placeholders {source.field} (resolved after all sources of the file are known)
        const re = /\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_][a-zA-Z0-9_.-]*)/g;
        let m;
        while ((m = re.exec(html)) !== null) placeholders.push({ file: rel, source: m[1], field: m[2] });
    }

    for (const p of placeholders) {
        const entity = sourcesByFile.get(p.file).get(p.source);
        if (!entity) continue;
        const parts = p.field.split('.').filter(Boolean);
        // Skip meta properties (_length, _index ...) and relation traversal beyond the first segment
        if (!parts.length || parts[0].startsWith('_')) continue;
        const ent = entities.get(entity);
        // Dotted placeholders may be nested fields or relations; only register the first segment
        const name = parts[0];
        if (!ent.fields.has(name)) addField(ent, baseField(name));
    }

    // Merge DB-only entities and record-based inference
    for (const name of Object.keys(recordsByEntity)) {
        if (isValidEntityName(name)) ensure(name);
    }
    const result = [];
    for (const [entity, ent] of entities) {
        const records = recordsByEntity[entity] || [];
        for (const rec of records) {
            if (!rec || typeof rec !== 'object') continue;
            for (const [k, v] of Object.entries(rec)) {
                if (k === 'id') continue;
                // Skip when a dotted form field covers this nested object
                const hasDotted = Array.from(ent.fields.keys()).some(n => n.startsWith(k + '.'));
                const t = inferType(v);
                if (!t) continue;
                const f = ent.fields.get(k);
                if (!f) { if (!hasDotted) addField(ent, { ...baseField(k), type: t }); }
                else if (f.type === 'unknown') f.type = t;
            }
        }
        result.push({
            entity,
            files: Array.from(ent.files).sort(),
            fields: Array.from(ent.fields.values()),
            count: records.length
        });
    }
    result.sort((a, b) => a.entity.localeCompare(b.entity));
    return result;
};

// ---- Server-side validation against a scanned entity schema ----

const NUMERIC = new Set(['number', 'range']);

const validateRecord = (schema, data) => {
    const errors = [];
    const get = (obj, name) => name.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
    for (const f of (schema && schema.fields) || []) {
        if (f.name === 'id') continue;
        const v = get(data, f.name);
        const empty = v === undefined || v === null || v === '';
        if (empty) {
            if (f.required && f.type !== 'checkbox') errors.push(`${f.name} is required`);
            continue;
        }
        const s = String(v);
        if (f.maxlength !== null && f.maxlength !== undefined && s.length > f.maxlength) errors.push(`${f.name} must be at most ${f.maxlength} characters`);
        if (f.minlength !== null && f.minlength !== undefined && s.length < f.minlength) errors.push(`${f.name} must be at least ${f.minlength} characters`);
        if (NUMERIC.has(f.type) || f.type === 'number') {
            const n = Number(s);
            if (s.trim() === '' || !Number.isFinite(n)) { errors.push(`${f.name} must be a number`); }
            else {
                if (f.min !== null && f.min !== undefined && n < f.min) errors.push(`${f.name} must be at least ${f.min}`);
                if (f.max !== null && f.max !== undefined && n > f.max) errors.push(`${f.name} must be at most ${f.max}`);
            }
        } else if (f.type === 'email') {
            if (!/^[^\s@]+@[^\s@]+$/.test(s)) errors.push(`${f.name} must be a valid email address`);
        } else if (f.type === 'date') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) errors.push(`${f.name} must be a valid date (YYYY-MM-DD)`);
        } else if (f.type === 'enum' && Array.isArray(f.options) && f.options.length) {
            if (!f.options.includes(s)) errors.push(`${f.name} must be one of: ${f.options.join(', ')}`);
        }
        if (f.pattern && !(f.patternSkipped || NESTED_QUANTIFIER_RE.test(f.pattern))) {
            if (s.length > MAX_PATTERN_INPUT) { errors.push(`${f.name} is too long to validate (max ${MAX_PATTERN_INPUT} characters)`); continue; }
            let re = null;
            try { re = new RegExp('^(?:' + f.pattern + ')$'); } catch (e) { /* invalid pattern: ignore */ }
            if (re && !re.test(s)) errors.push(`${f.name} does not match the required pattern`);
        }
    }
    return errors;
};

// ---- Scaffold ----

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inputFor = (f) => {
    const attrs = [`name="${esc(f.name)}"`];
    if (f.required) attrs.push('required');
    if (f.maxlength !== null && f.maxlength !== undefined) attrs.push(`maxlength="${f.maxlength}"`);
    if (f.minlength !== null && f.minlength !== undefined) attrs.push(`minlength="${f.minlength}"`);
    if (f.min !== null && f.min !== undefined) attrs.push(`min="${f.min}"`);
    if (f.max !== null && f.max !== undefined) attrs.push(`max="${f.max}"`);
    if (f.pattern) attrs.push(`pattern="${esc(f.pattern)}"`);
    if (f.type === 'enum') {
        const opts = (f.options || []).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
        return `<select ${attrs.join(' ')}>${opts}</select>`;
    }
    if (f.type === 'checkbox' || f.type === 'boolean') return `<input type="checkbox" ${attrs.filter(a => a.startsWith('name=')).join(' ')}>`;
    const typeMap = { string: 'text', unknown: 'text', object: 'text' };
    const type = typeMap[f.type] || f.type;
    if (f.type === 'text' && f.maxlength !== null && f.maxlength > 200) return `<textarea ${attrs.join(' ')}></textarea>`;
    return `<input type="${esc(type)}" ${attrs.join(' ')}>`;
};

// Generates {'<entity>/index.html': ..., '<entity>/edit.html': ...} using only documented Bracify attributes
const scaffoldFiles = (schema) => {
    const e = schema.entity;
    const fields = schema.fields.filter(f => f.name !== 'id' && f.type !== 'object');
    const nameOf = (f) => f.name;
    const head = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <link data-t-source="${e}" href="_sys/data/${e}.json">
    <script src="/engine/lib/engine.cjs"></script>
</head>`;
    const index = `${head(e + ' list')}
<body>
    <h1>${esc(e)}</h1>
    <p><a href="edit.html">+ New</a></p>
    <table>
        <thead>
            <tr>${fields.map(f => `<th>${esc(f.name)}</th>`).join('')}<th></th></tr>
        </thead>
        <tbody>
            <tr data-t-list="${e}">
                ${fields.map(f => `<td>{${e}.${f.name}}</td>`).join('\n                ')}
                <td>
                    <a href="edit.html?id={${e}.id}">Edit</a>
                    <form method="POST" action="_sys/data/${e}.json?id={${e}.id}&_method=DELETE" style="display:inline">
                        <input type="hidden" name="data-t-redirect" value="index.html">
                        <button type="submit">Delete</button>
                    </form>
                </td>
            </tr>
        </tbody>
    </table>
</body>
</html>
`;
    const rows = fields.map(f => `        <div><label>${esc(nameOf(f))}</label> ${inputFor(f)}</div>`).join('\n');
    const edit = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(e)} edit</title>
    <link data-t-source="${e}" href="_sys/data/${e}.json?id={?id}&_limit=1">
    <script src="/engine/lib/engine.cjs"></script>
</head>
<body>
    <h1>${esc(e)}</h1>
    <!-- Edit: bound to the record given by ?id= -->
    <form data-t-if="_sys.query.id" data-t-scope="${e}" method="POST" action="_sys/data/${e}.json" data-t-redirect="index.html">
        <input type="hidden" name="id">
${rows}
        <button type="submit">Save</button>
        <a href="index.html">Cancel</a>
    </form>
    <!-- Create: empty form (no ?id=) -->
    <form data-t-if="!_sys.query.id" method="POST" action="_sys/data/${e}.json" data-t-redirect="index.html">
${rows}
        <button type="submit">Save</button>
        <a href="index.html">Cancel</a>
    </form>
</body>
</html>
`;
    return { [`${e}/index.html`]: index, [`${e}/edit.html`]: edit };
};

module.exports = { scan, validateRecord, scaffoldFiles, isValidEntityName, entityFromHref };
