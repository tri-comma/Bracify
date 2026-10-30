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
            const checkboxes = new Set();
            form.querySelectorAll('input, select, textarea').forEach(el => {
                const name = el.getAttribute('name');
                if (!name || name === 'data-t-redirect') return;
                const type = (el.getAttribute('type') || '').toLowerCase();
                if (['submit', 'button', 'reset', 'image'].includes(type)) return;
                // Several checkboxes with one name in a form are a group (submitted as an array)
                if (type === 'checkbox') {
                    if (checkboxes.has(name) && ent.fields.has(name)) ent.fields.get(name).group = true;
                    checkboxes.add(name);
                }
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

// Own properties only: a field named "constructor" must not read the inherited function
const getPath = (obj, name) => name.split('.').reduce((o, k) => (o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)) ? o[k] : undefined, obj);
const isBlank = (x) => x === undefined || x === null || x === '';
// The non-blank values submitted for a field (an array of blanks is "empty")
const submittedItems = (v) => Array.isArray(v) ? v.filter(x => !isBlank(x)) : (isBlank(v) ? [] : [v]);

// Per-value checks (one element for multi-value fields)
const checkValue = (f, s, errors) => {
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
        // `multiple` email inputs take a comma-separated list
        const parts = f.multiple ? s.split(',').map(x => x.trim()) : [s];
        if (!parts.every(x => /^[^\s@]+@[^\s@]+$/.test(x))) errors.push(`${f.name} must be a valid email address`);
    } else if (f.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) errors.push(`${f.name} must be a valid date (YYYY-MM-DD)`);
    } else if (f.type === 'enum' && Array.isArray(f.options) && f.options.length) {
        if (!f.options.includes(s)) errors.push(`${f.name} must be one of: ${f.options.join(', ')}`);
    }
    if (f.pattern && !(f.patternSkipped || NESTED_QUANTIFIER_RE.test(f.pattern))) {
        if (s.length > MAX_PATTERN_INPUT) { errors.push(`${f.name} is too long to validate (max ${MAX_PATTERN_INPUT} characters)`); return; }
        let re = null;
        try { re = new RegExp('^(?:' + f.pattern + ')$'); } catch (e) { /* invalid pattern: ignore */ }
        if (re && !re.test(s)) errors.push(`${f.name} does not match the required pattern`);
    }
};

const validateRecord = (schema, data) => {
    const errors = [];
    for (const f of (schema && schema.fields) || []) {
        if (f.name === 'id') continue;
        const v = getPath(data, f.name);
        // A whitespace-only number counts as empty (it is omitted when stored)
        const items = submittedItems(v).filter(x => !(NUMERIC.has(f.type) && typeof x === 'string' && x.trim() === ''));
        if (!items.length) {
            // Required checkboxes are only enforced when the schema opts in (strictRequired: a single checkbox of a write form)
            if (f.required && (f.type !== 'checkbox' || f.strictRequired)) errors.push(`${f.name} is required`);
            continue;
        }
        if (f.type !== 'object') {
            // A scalar field takes one scalar; arrays only for multi-value controls (select[multiple], checkbox groups)
            if (items.some(x => typeof x === 'object') || (Array.isArray(v) && !(f.multiple || f.group))) {
                errors.push(`${f.name} must be a single value`);
                continue;
            }
        }
        const before = errors.length;
        for (const item of items) {
            // Newlines count as one character (like the browser's maxlength on a textarea)
            checkValue(f, String(item).replace(/\r\n/g, '\n'), errors);
            if (errors.length > before) break;
        }
    }
    return errors;
};

// ---- Write-form schema for the public Data API (Issue #53) ----
// The Data API trusts the project's own forms as the contract: every WRITE form (method POST/PUT whose action is
// the entity's data href, excluding `_method=DELETE` forms) contributes one field list. Studio keeps using scan().

const isWriteForm = (form) => {
    const method = (form.getAttribute('method') || '').toLowerCase();
    if (method !== 'post' && method !== 'put') return false;
    return !/[?&]_method=delete(?:[&#]|$)/i.test(form.getAttribute('action') || '');
};

// Options that are templated (e.g. value="{authors.id}") are only known at render time: no enum check then
const staticOptions = (values) => values.some(v => v.indexOf('{') !== -1) ? null : values;

// Replace every `data-t-include` element inside `root` with its partial's markup (nested includes too)
const expandIncludes = (root, resolve, depth = 0) => {
    if (depth >= 10) return;
    root.querySelectorAll('[data-t-include]').forEach(el => {
        const includePath = el.getAttribute('data-t-include');
        if (!includePath || includePath.indexOf('{') !== -1) return; // dynamic path: unknown until render time
        const partial = resolve(includePath);
        if (!partial) return;
        el.innerHTML = partial;
        el.removeAttribute('data-t-include');
        expandIncludes(el, resolve, depth + 1);
    });
};

/**
 * Per-form field lists of an HTML document.
 * @param {string} html
 * @param {(includePath: string) => (string|null)} [resolveInclude] expands data-t-include inside the forms
 * @returns {Array<{entity: string, fields: Map<string, object>}>} one entry per write form
 */
const scanWriteForms = (html, resolveInclude) => {
    let document;
    try { document = new JSDOM(html).window.document; } catch (e) { return []; }
    const out = [];
    document.querySelectorAll('form').forEach(form => {
        const entity = entityFromHref(form.getAttribute('action'));
        if (!entity || !isWriteForm(form)) return;
        if (resolveInclude) expandIncludes(form, resolveInclude);
        const fields = new Map();
        const radios = new Map(); // name -> { field, values }
        form.querySelectorAll('input, select, textarea').forEach(el => {
            const name = el.getAttribute('name');
            if (!name || name === 'data-t-redirect' || !FIELD_NAME_RE.test(name)) return;
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (['submit', 'button', 'reset', 'image'].includes(type)) return;
            // Disabled controls are never submitted
            if (el.hasAttribute('disabled') || el.closest('fieldset[disabled]')) return;
            const field = fieldFromControl(el);
            if (type === 'checkbox') field.checkValue = el.hasAttribute('value') ? el.getAttribute('value') : 'on';
            if (type === 'hidden') Object.assign(field, { required: false, maxlength: null, minlength: null, min: null, max: null, pattern: null, patternSkipped: false, options: null });
            if (el.tagName.toLowerCase() === 'select' || type === 'email') field.multiple = el.hasAttribute('multiple');
            // Controls under a data-t-if inside the form may not be rendered: never require them. The same holds for
            // controls repeated by data-t-list, except radios (a data-t-list radio group is still one required choice).
            const cond = el.closest(type === 'radio' ? '[data-t-if]' : '[data-t-if],[data-t-list]');
            if (cond && cond !== form && form.contains(cond)) field.required = false;
            if (field.type === 'enum' && field.options) field.options = staticOptions(field.options);
            if (type === 'checkbox') {
                const prev = fields.get(name);
                if (prev && prev.type === 'checkbox') { prev.group = true; prev.required = false; prev.strictRequired = false; return; }
                field.strictRequired = field.required;
            }
            if (type === 'radio') {
                // A radio group is one enum field: required if any radio of the group is, options are the radio values
                const group = radios.get(name) || { field: { ...field, type: 'enum', required: false }, values: [] };
                group.field.required = group.field.required || field.required;
                group.values.push(el.hasAttribute('value') ? el.getAttribute('value') : 'on');
                radios.set(name, group);
                fields.set(name, group.field);
                group.field.options = staticOptions(group.values);
                return;
            }
            const existing = fields.get(name);
            if (existing) mergeField(existing, field); else fields.set(name, field);
        });
        out.push({ entity, fields });
    });
    return out;
};

/**
 * Validate a record against ALL write forms of one entity so that forms sharing an entity never reject each
 * other's legitimate submissions (the loosest declaration wins):
 *  - a field is required only if every form contains it and marks it required;
 *  - any other constraint rejects a value only if it is violated in every form that declares the field;
 *  - fields declared by no form are not validated.
 * @param {Array<{fields: Map<string, object>}>} forms write forms of one entity (from scanWriteForms)
 * @param {object} data unflattened record
 * @returns {string[]} error messages (empty = valid); [] when there are no write forms
 */
const validateWriteForms = (forms, data) => {
    if (!forms || !forms.length) return [];
    const names = new Set();
    for (const f of forms) for (const n of f.fields.keys()) names.add(n);
    const errors = [];
    for (const name of names) {
        const declaring = forms.filter(f => f.fields.has(name));
        // Fast path: when the first declaring form accepts the value, the loosest-wins result is "accepted"
        // whatever the other forms say, so skip validating against all of them.
        const probe = validateRecord({ fields: [declaring[0].fields.get(name)] }, data);
        if (!probe.length) continue;
        const perForm = declaring.map(f => validateRecord({ fields: [f.fields.get(name)] }, data));
        const empty = submittedItems(getPath(data, name)).length === 0;
        // An empty value is only an error when every form requires it (a form without the field never does)
        if (empty && declaring.length < forms.length) continue;
        if (perForm.every(e => e.length)) errors.push(...perForm[0]);
    }
    return errors;
};

// ---- Value typing (Issue #52) ----
// Form values arrive as strings. Typing them by the declaring controls keeps `_sort`, comparisons and `data-t-if`
// consistent with JSON seeds: number/range -> number, a single checkbox -> boolean, checkbox group / select[multiple]
// -> array of strings. A field is typed only when every form declaring it agrees on the kind.

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Integers beyond this lose precision as a JS number: refuse them instead of silently rounding
const tooLarge = (n) => Number.isInteger(n) && Math.abs(n) > Number.MAX_SAFE_INTEGER;

const kindOf = (f) => {
    if (NUMERIC.has(f.type)) return 'number';
    if (f.type === 'checkbox' || f.type === 'boolean') return f.group ? 'multi' : 'checkbox';
    if (f.type === 'enum' && f.multiple) return 'multi';
    if (f.type === 'unknown' || f.type === 'object') return null;
    return 'text';
};

/**
 * @param {Array<{fields: Map<string, object>}>} forms the write forms of one entity
 * @returns {Map<string, {kind: ('number'|'checkbox'|'multi'|'text'|null), absentFalse: boolean, required: boolean,
 *   values: string[], allowNumber: boolean}>} one entry per declared field (`id` excepted); kind is null when the forms
 *   disagree. absentFalse: a checkbox that every form contains. required: a checkbox every form requires. values: the
 *   declared `value` attributes of a checkbox. allowNumber: radio/select/hidden fields may carry JSON numbers (ids).
 */
const buildTypePlan = (forms) => {
    const plan = new Map();
    if (!forms || !forms.length) return plan;
    const names = new Set();
    for (const f of forms) for (const n of f.fields.keys()) names.add(n);
    for (const name of names) {
        // Never plan (so never read or write) a path through a prototype-polluting segment
        if (name === 'id' || name.split('.').some(p => PROTO_KEYS.has(p))) continue;
        const declaring = forms.filter(f => f.fields.has(name));
        const kinds = new Set(declaring.map(f => kindOf(f.fields.get(name))));
        const kind = kinds.size === 1 ? Array.from(kinds)[0] : null;
        const all = declaring.length === forms.length;
        const defs = declaring.map(f => f.fields.get(name));
        plan.set(name, {
            kind,
            absentFalse: kind === 'checkbox' && all,
            required: kind === 'checkbox' && all && defs.every(d => d.strictRequired),
            values: kind === 'checkbox' ? defs.map(d => d.checkValue).filter(v => v !== undefined) : [],
            allowNumber: kind === 'text' && defs.every(d => d.type === 'enum' || d.type === 'hidden')
        });
    }
    return plan;
};

/**
 * Type violations of an unflattened record: a declared dotted child whose parent is not an object, and values that
 * cannot become the field's type. Run BEFORE the constraint validation (Number('0x10') would pass it).
 * @param {boolean} [opts.json] the body was JSON (booleans/numbers can occur; a form only submits strings)
 * @returns {string[]}
 */
const typeErrors = (plan, data, opts = {}) => {
    const errors = new Set();
    for (const [name, { kind, required, values, allowNumber }] of plan) {
        if (name.indexOf('.') !== -1) {
            const segs = name.split('.');
            let cur = data;
            for (let i = 0; i < segs.length - 1; i++) {
                if (!hasOwn(cur, segs[i])) break;
                const v = cur[segs[i]];
                if (v === null || typeof v !== 'object' || (Array.isArray(v) && isNaN(segs[i + 1]))) {
                    errors.add(`${segs.slice(0, i + 1).join('.')} must be an object`);
                    break;
                }
                cur = v;
            }
        }
        const v = getPath(data, name);
        if (v === undefined || v === null || !kind) continue;
        if (kind === 'number') {
            const ok = typeof v === 'number' ? Number.isFinite(v)
                : typeof v === 'string' && (v.trim() === '' || (NUMBER_RE.test(v.trim()) && Number.isFinite(Number(v))));
            if (!ok) errors.add(`${name} must be a number`);
            else if (tooLarge(typeof v === 'number' ? v : Number(v.trim()))) errors.add(`${name} is too large`);
        } else if (kind === 'checkbox') {
            if (opts.json) {
                const t = typeof v === 'string' ? v.toLowerCase() : v;
                const known = typeof v === 'boolean' || t === '' || t === 'true' || t === 'false' || t === 'on' || (typeof v === 'string' && values.includes(v));
                if (!known) errors.add(`${name} must be true or false`);
                // false means "not checked": it does not satisfy a required checkbox
                else if (required && (t === false || t === 'false')) errors.add(`${name} is required`);
            }
        } else if (kind === 'multi') {
            if (!(typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string')))) errors.add(`${name} must be a list of strings`);
        } else if (typeof v === 'boolean' || (typeof v === 'number' && !(allowNumber && Number.isFinite(v)))) {
            errors.add(`${name} must be a string`);
        }
    }
    return Array.from(errors);
};

const setPath = (obj, name, value) => {
    const segs = name.split('.');
    let cur = obj;
    for (let i = 0; i < segs.length - 1; i++) {
        if (!hasOwn(cur, segs[i])) cur[segs[i]] = isNaN(segs[i + 1]) ? {} : [];
        cur = cur[segs[i]];
        if (cur === null || typeof cur !== 'object') return;
    }
    cur[segs[segs.length - 1]] = value;
};
const deletePath = (obj, name) => {
    const segs = name.split('.');
    let cur = obj;
    for (let i = 0; i < segs.length - 1; i++) {
        if (!hasOwn(cur, segs[i]) || cur[segs[i]] === null || typeof cur[segs[i]] !== 'object') return;
        cur = cur[segs[i]];
    }
    delete cur[segs[segs.length - 1]];
};

/**
 * Convert the values of a record (one that passed typeErrors and the validation) to the planned types, in place.
 * Number: numeric string -> number, empty -> omitted. Checkbox: a submitted form value is true (JSON: booleans kept,
 * "false" -> false, "true"/"on"/the declared value -> true, "" counts as absent), absent -> false where absentFalse. Multi: a single value becomes [value].
 */
const coerceRecord = (plan, data, opts = {}) => {
    for (const [name, { kind, absentFalse }] of plan) {
        if (!kind || kind === 'text') continue;
        const v = getPath(data, name);
        if (kind === 'number') {
            if (v === undefined) continue;
            if (v === null || (typeof v === 'string' && v.trim() === '')) deletePath(data, name);
            else if (typeof v === 'string') { const n = Number(v.trim()); setPath(data, name, n === 0 ? 0 : n); }
        } else if (kind === 'checkbox') {
            if (v === undefined || v === null) { if (absentFalse) setPath(data, name, false); }
            else if (!opts.json) setPath(data, name, true);
            else if (v === '') { if (absentFalse) setPath(data, name, false); else deletePath(data, name); }
            else if (typeof v === 'string') setPath(data, name, v.toLowerCase() !== 'false');
        } else if (kind === 'multi') {
            if (typeof v === 'string') { if (v === '') deletePath(data, name); else setPath(data, name, [v]); }
        }
    }
    return data;
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
    <!-- Edit: bound to the record given by ?id= (POST never overwrites; PUT replaces the record with the hidden id) -->
    <form data-t-if="_sys.query.id" data-t-scope="${e}" method="POST" action="_sys/data/${e}.json?_method=PUT" data-t-redirect="index.html">
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

module.exports = { scan, validateRecord, scanWriteForms, validateWriteForms, buildTypePlan, typeErrors, coerceRecord, walkHtml, scaffoldFiles, isValidEntityName, entityFromHref };
