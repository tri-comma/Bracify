/**
 * Bracify Engine - Unified Core (SSR & CSR)
 */

const factory = function () {
    let rootHandle = null;

    // --- Utilities ---
    function isTruthy(val) {
        if (val === undefined || null === val || false === val || 0 === val || "" === val) return false;
        if (Array.isArray(val)) return val.length > 0;
        if (typeof val === 'object') {
            const proto = Object.getPrototypeOf(val);
            if (proto === null || proto === Object.prototype) {
                return Object.keys(val).length > 0;
            }
        }
        return true;
    }

    function sanitizeUrl(url) {
        if (typeof url !== 'string') return url;
        const trimmed = url.trim();
        // Block javascript: and other dangerous schemes that can execute code
        if (/^(javascript:|vbscript:|data:text\/html)/i.test(trimmed)) {
            return 'about:blank';
        }
        return url;
    }

    const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction'];

    function getNestedValue(data, path, noExpand = false) {
        if (!path) return undefined;
        let isNegative = false;
        if (path.startsWith('!')) {
            isNegative = true;
            path = path.substring(1);
        }
        const keys = path.split('.');
        let value = data;

        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];

            // Try to match the longest possible key from current segments (for dotted keys from data-t-list)
            for (let j = keys.length - 1; j > i; j--) {
                const combined = keys.slice(i, j + 1).join('.');
                if (value && typeof value === 'object' && combined in value) {
                    key = combined;
                    i = j;
                    break;
                }
            }

            if (value === undefined || value === null) break;

            // Security: Prevent accessing prototype properties
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                value = undefined;
                break;
            }

            // Handle automatic expansion of single-item arrays for traversal
            // Skip if key starts with '_' (meta properties like _length) or is a number index
            const isNumericKey = !isNaN(parseInt(key));
            if (Array.isArray(value) && !key.startsWith('_') && !isNumericKey && !['map', 'filter', 'forEach', 'reduce', 'slice'].includes(key)) {
                if (value.length === 1) {
                    value = value[0];
                } else if (value.length > 1) {
                    value = undefined;
                    break;
                }
            }

            if (key === '_length') {
                if (value !== undefined && value !== null && typeof value.length === 'number') {
                    value = value.length;
                    continue;
                }
            }

            if (value === undefined || value === null) break;
            value = value[key];
        }

        return isNegative ? !isTruthy(value) : value;
    }

    const pipes = {
        date: (value, format) => {
            if (!value) return '';
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            let str = format || 'yyyy/mm/dd';
            const map = {
                yyyy: date.getFullYear(),
                mm: ('0' + (date.getMonth() + 1)).slice(-2),
                dd: ('0' + date.getDate()).slice(-2),
                HH: ('0' + date.getHours()).slice(-2),
                MM: ('0' + date.getMinutes()).slice(-2),
                SS: ('0' + date.getSeconds()).slice(-2)
            };
            for (const key in map) str = str.replace(key, map[key]);
            return str;
        },
        number: (value) => (value === undefined || value === null) ? '' : Number(value).toLocaleString(),
        json: (value) => { try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); } }
    };

    function resolveValue(expression, data) {
        if (expression === null || expression === undefined) return '';
        const exprStr = String(expression);
        // If it's a simple path (no spaces, no ?, no {), resolve it as is
        if (exprStr.indexOf('{') === -1 && exprStr.indexOf(' ') === -1 && exprStr.indexOf('?') === -1) {
            return getNestedValue(data, exprStr);
        }

        // Security: Block nested placeholders {...{...}...}
        if (/\{[^{}]*\{/.test(exprStr)) {
            return exprStr;
        }

        return exprStr.replace(/(^|[^\\])\{\s*([^{}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}/g, (match, prefix, key, pipeExpr) => {
            let lookupKey = key.trim();
            if (lookupKey.startsWith('?')) lookupKey = '_sys.query.' + lookupKey.substring(1);
            let val = getNestedValue(data, lookupKey);
            if (pipeExpr) {
                const parts = pipeExpr.split(':').map(s => s.trim());
                const pipeName = parts[0];
                const args = parts.slice(1).map(arg => arg.replace(/^['"]|['"]$/g, ''));
                if (pipes[pipeName]) val = pipes[pipeName](val, ...args);
            }
            // If the final value is still an array (and no pipe was used), treat it as undefined
            // to avoid rendering "item1,item2" in the UI.
            if (Array.isArray(val) && !pipeExpr) val = undefined;

            // Return empty string if value is null
            if (val === null) return prefix + '';
            // Return original match if value is undefined (preserves template for SSR/CSR later)
            return val !== undefined ? prefix + val : match;
        });
    }

    // --- Conditional Logic (Data API Style) ---
    function evaluateCondition(conditionStr, data) {
        if (!conditionStr) return false;

        // 1. Resolve variables in the condition string first (e.g., "id={user.id}")
        // Only resolve if braces are present to avoid 'resolveValue' interpreting keys without braces as direct lookups
        let resolvedStr = conditionStr;
        if (conditionStr.indexOf('{') !== -1) {
            resolvedStr = resolveValue(conditionStr, data);
        }

        // Ensure we have a string to parse for multiple conditions
        // If resolveValue returns a non-string (e.g. boolean/number from a direct placeholder like {isActive}), convert to string
        if (typeof resolvedStr !== 'string') {
            resolvedStr = String(resolvedStr);
        }

        // 2. Parse into AND groups (space separated)
        // We need to be careful about spaces inside values, but for now assuming simple space separation
        // 2. Parse into AND groups (space separated)
        // We need to be careful about spaces inside values, but for now assuming simple space separation
        // or we could split by space but recombine if quotes... simplifying to space split for MVP.
        const conditions = resolvedStr.split(/\s+/).filter(c => c.trim() !== '');

        for (const cond of conditions) {
            // Each condition is an AND component. If any fails, the whole thing is false.
            if (!evaluateSingleCondition(cond, data)) return false;
        }

        return true;
    }

    function evaluateSingleCondition(cond, data) {
        // Handle single key (existence check) - e.g. "is_published"
        // Also handle negation - e.g. "!is_published"
        if (cond.indexOf('=') === -1) {
            let key = cond;
            let isNegation = false;
            if (key.startsWith('!')) {
                isNegation = true;
                key = key.substring(1);
            }
            const val = getNestedValue(data, key);
            const truthy = isTruthy(val);
            return isNegation ? !truthy : truthy;
        }

        // Handle logical operators
        // key=val, key:ne=val, key:gt=val, etc.
        let operator = '=';
        let key = '';
        let valueStr = '';

        // Check for longest operators first
        const ops = [':ne=', ':gte=', ':lte=', ':gt=', ':lt=', '='];
        for (const op of ops) {
            const idx = cond.indexOf(op);
            if (idx !== -1) {
                operator = op;
                key = cond.substring(0, idx);
                valueStr = cond.substring(idx + op.length);
                break;
            }
        }

        const dataVal = getNestedValue(data, key);

        // Handle OR values (comma separated)
        const targetValues = valueStr.split(',');

        // For :ne, ALL targets must not match (AND logic for negation)
        // For others, ANY target must match (OR logic)
        if (operator === ':ne=') {
            for (const target of targetValues) {
                if (compareValues(dataVal, target, '=')) return false; // If matches any, then :ne is false
            }
            return true;
        } else {
            for (const target of targetValues) {
                if (compareValues(dataVal, target, operator)) return true;
            }
            return false;
        }
    }

    function compareValues(a, bStr, operator) {
        // Simple type coercion
        let b = bStr;
        if (!isNaN(bStr) && bStr.trim() !== '') {
            b = parseFloat(bStr);
        }

        let aVal = a;
        if (typeof b === 'number' && (typeof a === 'string' || a === null || a === undefined)) {
            // If target is number, try to convert data value
            const parsed = parseFloat(a);
            if (!isNaN(parsed)) aVal = parsed;
        }

        switch (operator) {
            case '=': return String(a) === String(bStr); // Exact string match for equality to be safe
            case ':gt=': return aVal > b;
            case ':lt=': return aVal < b;
            case ':gte=': return aVal >= b;
            case ':lte=': return aVal <= b;
            default: return false;
        }
    }

    // --- Data Fetching (Browser/Local) ---
    function filterLocalData(data, href) {
        if (!Array.isArray(data) || !href || !href.includes('?')) return data;
        try {
            const url = new URL(href, 'http://localhost');
            const params = Object.fromEntries(url.searchParams);
            let result = [...data];
            let limit = null;
            let offset = 0;
            let sort = null;
            let order = 'asc';

            // Filter
            for (const [key, val] of Object.entries(params)) {
                if (val === undefined || val === null || val === '' || val === '{?}') continue;
                // Ignore unresolved placeholders to avoid filtering out everything (e.g. content="{_sys.query.q}" -> val="{_sys.query.q}")
                if (typeof val === 'string' && val.indexOf('{') !== -1 && val.indexOf('}') !== -1) continue;

                if (key === '_limit') limit = parseInt(val, 10);
                else if (key === '_offset') offset = parseInt(val, 10);
                else if (key === '_sort') sort = val;
                else if (key === '_order') order = val.toLowerCase();
                else if (!key.startsWith('_')) {
                    // Exact match only for data fields
                    result = result.filter(item => String(item[key]) === String(val));
                }
            }

            // Sort
            if (sort) {
                result.sort((a, b) => {
                    let va = a[sort];
                    let vb = b[sort];
                    if (typeof va === 'string') va = va.toLowerCase();
                    if (typeof vb === 'string') vb = vb.toLowerCase();

                    if (va < vb) return order === 'asc' ? -1 : 1;
                    if (va > vb) return order === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            // Offset & Limit
            if (offset > 0) result = result.slice(offset);
            if (limit !== null && !isNaN(limit)) result = result.slice(0, limit);

            // If limit=1 and we have exactly 1 result, return the object instead of array
            if (limit === 1 && result.length === 1) return result[0];

            return result;
        } catch (e) { return data; }
    }

    const pendingLoads = {};

    async function browserLocalFetcher(href, name) {
        // Security & Format Validation (CSR)
        const validHrefPattern = /^\/?_sys\/data\/([a-zA-Z0-9_-]+)\.json(\?.*)?$/;
        if (!validHrefPattern.test(href)) return null;

        // Normalize path for File System lookup (remove leading slash)
        const cleanPath = href.split('?')[0].replace(/^\//, '');
        // In browser, check window.__BRACIFY_DATA__
        let globalData = (typeof window !== 'undefined' ? window.__BRACIFY_DATA__ : null) || {};

        // 1. Try File System Access API (Developer Mode) - prioritized for Live Edit
        if (rootHandle) {
            try {
                const h = await resolvePathHandle(rootHandle, cleanPath);
                if (h && h.kind === 'file') {
                    const content = await readFileContent(h);
                    if (content) {
                        const data = JSON.parse(content);
                        return filterLocalData(data, href);
                    }
                }
            } catch (e) { }
        }

        // 2. Try global data (Hydration / Mock / SSR)
        const entityName = cleanPath.split('/').pop().replace(/\.json$/i, '');
        if (globalData[name]) return filterLocalData(globalData[name], href);
        if (globalData[entityName]) return filterLocalData(globalData[entityName], href);

        // 3. Try fetch (Production / Standard HTTP)
        try {
            const res = await fetch(href);
            if (res.ok) return filterLocalData(await res.json(), href);
        } catch (e) { }

        // 4. Fallback to script injection (file:// compatibility for non-FSA browsers)
        return new Promise((resolve) => {
            const jsHref = href.split('?')[0].replace(/\.json$/i, '.js');
            // Check again if data appeared (script might have been in HTML)
            if (globalData[name]) return resolve(filterLocalData(globalData[name], href));
            if (globalData[entityName]) return resolve(filterLocalData(globalData[entityName], href));

            // Hook for both names
            const resolveHandler = () => {
                const data = globalData[name] || globalData[entityName];
                if (data) {
                    delete pendingLoads[name];
                    delete pendingLoads[entityName];
                    resolve(filterLocalData(data, href));
                    return true;
                }
                return false;
            };

            pendingLoads[name] = resolveHandler;
            pendingLoads[entityName] = resolveHandler;

            const script = document.createElement('script');
            script.src = jsHref;
            script.onerror = () => {
                delete pendingLoads[name];
                delete pendingLoads[entityName];
                resolve(null);
            };
            document.head.appendChild(script);
        });
    }

    async function preloadSources() {
        if (typeof document === 'undefined') return {};
        const globalData = (typeof window !== 'undefined' ? window.__BRACIFY_DATA__ : null) || {};
        const links = document.querySelectorAll('link[data-t-source]');
        const sys = (typeof window !== 'undefined' ? window._sys : null) || { query: {}, params: {} };

        const promises = Array.from(links).map(link => {
            const name = link.getAttribute('data-t-source');
            let rawHref = link.getAttribute('href');
            if (!rawHref) return Promise.resolve();
            const href = (rawHref.indexOf('{') !== -1) ? resolveValue(rawHref, { _sys: sys }) : rawHref;
            const fetcher = (typeof window !== 'undefined' && window.BracifyFetcher) || browserLocalFetcher;
            return fetcher(href, name).then(data => { if (data) globalData[name] = data; });
        });
        await Promise.all(promises);
        if (typeof window !== 'undefined') window.__BRACIFY_DATA__ = globalData;
        return globalData;
    }

    function mock(name, data) {
        if (pendingLoads[name]) {
            pendingLoads[name](data);
        } else {
            if (typeof window !== 'undefined') {
                if (!window.__BRACIFY_DATA__) window.__BRACIFY_DATA__ = {};
                window.__BRACIFY_DATA__[name] = data;
            }
        }
    }

    // --- Binding Logic ---
    function updateSelectOptions(el, val) {
        const options = el.querySelectorAll('option');
        options.forEach(opt => {
            if (opt.value == val) opt.setAttribute('selected', '');
            else opt.removeAttribute('selected');
        });
    }

    function applyAttributeBindings(el, data) {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on')) continue;
            if (attr.value && attr.value.indexOf('{') !== -1) {
                let val = resolveValue(attr.value, data);
                if (val !== undefined) {
                    if (URL_ATTRIBUTES.includes(attr.name.toLowerCase())) val = sanitizeUrl(val);
                    el.setAttribute(attr.name, val);
                    if (el.tagName === 'SELECT' && attr.name === 'value') updateSelectOptions(el, val);
                }
            }
        }
    }

    function applyTextBindings(el, data) {
        if (['STYLE', 'SCRIPT'].includes(el.tagName)) return;
        for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3) {
                const content = node.nodeValue;
                if (content && content.indexOf('{') !== -1) {
                    const val = resolveValue(content, data);
                    if (val !== undefined) node.nodeValue = val;
                }
            }
        }
    }

    function applyAutoBindings(el, data, engine, config) {
        const tagName = el.tagName;
        const name = el.getAttribute('name');

        // Debugging for hydration mystery
        if (engine && engine.logger && (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA')) {
            engine.logger(`[Engine] applyAutoBindings: name="${name}" inScope=${config?.inScope} requireScope=${config?.requireScope} currentVal="${el.value}"`);
        }

        if (config && config.requireScope && !config.inScope) return;
        if (!name || !['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) return;

        let val = getNestedValue(data, name);
        // Deep collision prevention: Only fallback to query params if we are in an explicit scope or not in strict mode
        if (val === undefined && data._sys && data._sys.query) {
            if (!config || !config.requireScope || config.inScope) {
                val = data._sys.query[name];
                if (engine && engine.logger) engine.logger(`[Engine] Query Fallback: name="${name}" val="${val}"`);
            }
        }
        if (val !== undefined && val !== null) {
            if (engine && engine.logger) engine.logger(`[Engine] BINDING: name="${name}" val="${val}"`);
            if (tagName === 'SELECT') {
                el.value = val;
                el.setAttribute('value', val);
                updateSelectOptions(el, val);
            } else if (tagName === 'INPUT') {
                if (el.type === 'checkbox') {
                    if (isTruthy(val)) { el.checked = true; el.setAttribute('checked', 'checked'); }
                    else { el.checked = false; el.removeAttribute('checked'); }
                } else if (el.type === 'radio') {
                    if (el.getAttribute('value') == val) { el.checked = true; el.setAttribute('checked', 'checked'); }
                    else { el.checked = false; el.removeAttribute('checked'); }
                } else {
                    el.value = val;
                    el.setAttribute('value', val);
                }
            } else if (tagName === 'TEXTAREA') {
                el.value = val;
                el.innerHTML = val;
            }
        }
    }

    // --- Engine ---
    class Engine {
        constructor(options = {}) {
            this.dataFetcher = options.dataFetcher || null;
            this.includeResolver = options.includeResolver || (async () => null);
            this.logger = options.logger || null;
        }
        log(msg) { if (this.logger) this.logger(msg); }
        async processElement(element, data, options = {}) {
            if (!element) return;
            let localConfig = { processIncludes: options.processIncludes !== false, processBindings: options.processBindings !== false, stripAttributes: options.stripAttributes === true, ...options };
            if (localConfig.processBindings && element.hasAttribute('data-t-source')) {
                await this.processSource(element, data);
            }
            if (localConfig.processBindings && element.hasAttribute('data-t-list')) {
                localConfig = { ...localConfig, inScope: true };
                if (await this.processList(element, data, localConfig)) return;
            }
            if (localConfig.processBindings && element.hasAttribute('data-t-if')) {
                if (!evaluateCondition(element.getAttribute('data-t-if'), data)) { element.remove(); return; }
                if (localConfig.stripAttributes) element.removeAttribute('data-t-if');
            }
            if (localConfig.processIncludes && element.hasAttribute('data-t-include')) {
                const rawPath = element.getAttribute('data-t-include');
                const includePath = (rawPath.indexOf('{') !== -1) ? resolveValue(rawPath, data) : rawPath;
                const templateHtml = await this.includeResolver(includePath);
                if (templateHtml) {
                    if (templateHtml.indexOf('data-t-content') !== -1) {
                        const container = (typeof document !== 'undefined') ? document.createElement('div') : new (require('jsdom').JSDOM)('').window.document.createElement('div');
                        container.innerHTML = templateHtml;
                        const slots = container.querySelectorAll('[data-t-content]');
                        if (slots.length > 0) {
                            const sourceContents = {};
                            element.querySelectorAll(':scope > [data-t-content]').forEach(el => sourceContents[el.getAttribute('data-t-content') || ''] = el.innerHTML);
                            const defaultContent = element.innerHTML;
                            slots.forEach(slot => {
                                const name = slot.getAttribute('data-t-content') || '';
                                if (sourceContents[name] !== undefined) slot.innerHTML = sourceContents[name];
                                else if (name === '' || name === 'default') slot.innerHTML = defaultContent;
                            });
                            element.innerHTML = container.innerHTML;
                        } else { element.innerHTML = templateHtml; }
                    } else { element.innerHTML = templateHtml; }
                }
                element.removeAttribute('data-t-include');
            }
            if (localConfig.processBindings && element.hasAttribute('data-t-scope')) {
                // Create a NEW config object for children to avoid sibling leakage
                localConfig = { ...localConfig, inScope: true };
                const scopeKey = element.getAttribute('data-t-scope');
                let val = getNestedValue(data, scopeKey);
                if (val !== undefined) {
                    if (Array.isArray(val) && val.length === 1) val = val[0];
                    this.log(`[Engine] Scope: ${scopeKey} -> Object(${Object.keys(val || {}).join(',')})`);
                    data = { ...data, [scopeKey]: val };
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) data = { ...data, ...val };
                }
                if (localConfig.stripAttributes) element.removeAttribute('data-t-scope');
            }
            if (localConfig.processBindings) {
                applyAttributeBindings(element, data);
                applyTextBindings(element, data);
                applyAutoBindings(element, data, this, localConfig);
            }
            for (const child of Array.from(element.children || [])) await this.processElement(child, data, localConfig);
        }
        async processSource(element, data) {
            const name = element.getAttribute('data-t-source');
            let rawHref = element.getAttribute('href');
            if (!rawHref) return;
            const href = (rawHref.indexOf('{') !== -1) ? resolveValue(rawHref, data) : rawHref;
            const fetcher = this.dataFetcher || (typeof window !== 'undefined' && window.BracifyFetcher) || browserLocalFetcher;
            try {
                const fetchedData = await fetcher(href, name);
                if (fetchedData) data[name] = fetchedData;
            } catch (e) { console.error(`[Bracify] Fetch failed: ${href}`, e); }
        }
        async processList(element, data, options) {
            const name = element.getAttribute('data-t-list');
            element.removeAttribute('data-t-list');
            const listData = getNestedValue(data, name, true);
            if (!Array.isArray(listData)) { element.remove(); return true; }
            const parent = element.parentNode;
            const nextSibling = element.nextSibling;
            const template = element.cloneNode(true);
            element.remove();

            // List items are always in scope
            const itemOptions = { ...options, inScope: true };

            for (const item of listData) {
                const clone = template.cloneNode(true);
                parent.insertBefore(clone, nextSibling);
                await this.processElement(clone, { ...data, [name]: item }, itemOptions);
            }
            return true;
        }
    }

    async function resolvePathHandle(rootHandle, pathStr) {
        if (!rootHandle || !pathStr) return null;
        let parts = pathStr.split('/').filter(p => p && p !== '.');
        let current = rootHandle;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === '..') return null;
            try {
                if (i === parts.length - 1) {
                    try { return await current.getFileHandle(part); }
                    catch (e) { return await current.getDirectoryHandle(part); }
                } else { current = await current.getDirectoryHandle(part); }
            } catch (e) { return null; }
        }
        return current;
    }

    async function readFileContent(handle) {
        if (!handle) return null;
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            return await file.text();
        }
        return null;
    }

    return {
        Engine, resolveValue, getNestedValue, preloadSources, mock, isTruthy, resolvePathHandle, readFileContent, evaluateCondition, filterLocalData,
        get rootHandle() { return rootHandle; },
        set rootHandle(val) { rootHandle = val; },
        navigate: (typeof window !== 'undefined' ? (path, push = true) => window.Bracify.navigate(path, push) : () => { })
    };
};

const BracifyLib = factory();
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.Bracify = BracifyLib;
    if (!window._sys) {
        try {
            const url = new URL(window.location.href);
            window._sys = { query: Object.fromEntries(url.searchParams), params: {} };
        } catch (e) { window._sys = { query: {}, params: {} }; }
    }

    BracifyLib.requestRootAccess = async function () {
        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'bracify-project-root' // Browser will remember the last used directory for this ID
            });
            BracifyLib.rootHandle = handle;
            return handle;
        } catch (e) {
            console.error('[Bracify] Access denied or failed:', e);
            return null;
        }
    };

    async function initializeBracify(initOptions = {}) {
        const data = await BracifyLib.preloadSources();
        const options = {
            includeResolver: async (path) => {
                // Try FS Access if available
                if (BracifyLib.rootHandle) {
                    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
                    const h = await BracifyLib.resolvePathHandle(BracifyLib.rootHandle, cleanPath);
                    const content = await BracifyLib.readFileContent(h);
                    if (content !== null) return content;
                }
                // Fallback to fetch
                try {
                    const res = await fetch(path);
                    if (res.ok) return await res.text();
                } catch (e) { }
                return null;
            }
        };

        // Enable console logging for hydration debugging
        options.logger = console.log;

        const engine = new BracifyLib.Engine(options);
        await engine.processElement(document.body, { ...data, _sys: window._sys }, { requireScope: true, ...initOptions });

        // Final unescape
        unescapeNodes(document.body);
    }

    function unescapeNodes(node) {
        if (node.nodeType === 3) { // Text node
            node.nodeValue = node.nodeValue.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
        } else if (node.nodeType === 1) { // Element node
            for (const attr of Array.from(node.attributes)) {
                if (attr.value.indexOf('\\{') !== -1 || attr.value.indexOf('\\}') !== -1) {
                    node.setAttribute(attr.name, attr.value.replace(/\\\{/g, '{').replace(/\\\}/g, '}'));
                }
            }
            for (const child of Array.from(node.childNodes)) unescapeNodes(child);
        }
    }
    BracifyLib.initializeBracify = initializeBracify;

    // --- Persistence for Local Folder Access ---
    /*
     * We use IndexedDB to store the directory handle so the user doesn't have to
     * re-select the folder on every reload.
     */
    async function saveHandle(handle) {
        if (typeof window === 'undefined' || !window.indexedDB) return;
        return new Promise((resolve) => {
            const request = window.indexedDB.open('BracifyDB', 2);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles');
                }
            };
            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(['handles'], 'readwrite');
                tx.objectStore('handles').put(handle, 'root');
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async function loadHandle() {
        if (typeof window === 'undefined' || !window.indexedDB) return null;
        return new Promise((resolve) => {
            const request = window.indexedDB.open('BracifyDB', 2);
            request.onerror = () => resolve(null);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
            };
            request.onsuccess = (e) => {
                const db = e.target.result;
                try {
                    const tx = db.transaction(['handles'], 'readonly');
                    const req = tx.objectStore('handles').get('root');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch (err) {
                    resolve(null);
                }
            };
        });
    }

    async function verifyPermission(handle) {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

    // --- Overlay UI ---
    function showInitOverlay(reason = 'init') {
        // Detect support for File System Access API
        const isSupported = (typeof window !== 'undefined' && !!window.showDirectoryPicker);

        const style = document.createElement('style');
        style.id = 'bracify-init-style';
        style.innerHTML = `
            #bracify-init-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(255,255,255,0.7); backdrop-filter: blur(10px);
                display: flex; align-items: center; justify-content: center; z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .bracify-modal {
                background: white; padding: 40px; border-radius: 20px; width: 100%; max-width: 400px;
                text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05);
            }
            .bracify-modal h2 { margin-top: 0; color: #1d1d1f; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
            .bracify-modal p { color: #424245; line-height: 1.5; margin: 15px 0 30px; font-size: 15px; }
            .bracify-btn-primary {
                background: #0071e3; color: white; border: none; padding: 14px 24px;
                border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 16px;
                transition: all 0.2s ease; width: 100%;
            }
            .bracify-btn-primary:hover { background: #0077ed; transform: translateY(-1px); }
            .bracify-btn-secondary {
                background: transparent; color: #86868b; border: none; margin-top: 18px;
                cursor: pointer; font-size: 14px; font-weight: 500;
            }
            .bracify-btn-secondary:hover { color: #1d1d1f; text-decoration: underline; }
            .bracify-status-tag { 
                display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
                margin-bottom: 20px; text-transform: uppercase;
            }
            .status-unsupported { background: #fff1f0; color: #ff4d4f; }
            .status-warning { background: #fffbe6; color: #faad14; }
        `;
        if (!document.getElementById('bracify-init-style')) document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'bracify-init-overlay';

        let content = '';
        if (!isSupported) {
            content = `
                <div class="bracify-modal">
                    <span class="bracify-status-tag status-unsupported">Unsupported Browser</span>
                    <h2>Action Required</h2>
                    <p>Your browser doesn't support <b>Direct Folder Editing</b>. To use Live Preview & Build-free Mode, please use <b>Chrome</b>, <b>Edge</b>, or <b>Opera</b>.</p>
                    <button class="bracify-btn-primary" id="bracify-btn-skip">Continue with limited features</button>
                    <p style="font-size: 12px; color: #86868b; margin-top: 20px;">Or deploy to a server to use standard features.</p>
                </div>
            `;
        } else if (reason === 'denied') {
            content = `
                <div class="bracify-modal">
                    <span class="bracify-status-tag status-warning">Access Required</span>
                    <h2>Permission Denied</h2>
                    <p>Bracify needs access to your project folder to read files directly. Please try again to enable <b>True Zero Server Mode</b>.</p>
                    <button class="bracify-btn-primary" id="bracify-btn-choose">Grant Access Again</button>
                    <button class="bracify-btn-secondary" id="bracify-btn-skip">Skip for now</button>
                </div>
            `;
        } else {
            content = `
                <div class="bracify-modal">
                    <h2>Welcome to Bracify</h2>
                    <p>You are in <b>Developer Mode</b>. Select your project root folder to enable live updates and direct data editing.</p>
                    <button class="bracify-btn-primary" id="bracify-btn-choose">Choose Project Folder</button>
                    <button class="bracify-btn-secondary" id="bracify-btn-skip">Use standard build preview</button>
                </div>
            `;
        }
        overlay.innerHTML = content;
        document.body.appendChild(overlay);

        const btnChoose = document.getElementById('bracify-btn-choose');
        if (btnChoose) {
            btnChoose.onclick = async () => {
                const handle = await BracifyLib.requestRootAccess();
                if (handle) {
                    await saveHandle(handle);
                    overlay.remove();
                    initializeBracify();
                } else {
                    overlay.remove();
                    showInitOverlay('denied');
                }
            };
        }

        document.getElementById('bracify-btn-skip').onclick = () => {
            overlay.remove();
            initializeBracify();
        };
    }

    BracifyLib.navigate = async function (path, push = true) {
        if (!BracifyLib.rootHandle && location.protocol === 'file:') {
            window.location.assign(path);
            return;
        }

        // 1. Fetch Page
        const cleanPath = path.split('?')[0].split('#')[0];
        let html = '';
        if (BracifyLib.rootHandle) {
            const h = await BracifyLib.resolvePathHandle(BracifyLib.rootHandle, cleanPath);
            html = await BracifyLib.readFileContent(h);
        } else {
            // Must use FULL path including query for SSR to work on server
            const res = await fetch(path);
            if (res.ok) html = await res.text();
        }

        if (!html) {
            console.error('[Bracify] Failed to load path:', path);
            return;
        }

        // 2. Parse
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 3. Sync Head
        syncHead(doc);

        // 4. Replace Body
        document.body.innerHTML = doc.body.innerHTML;
        // Copy body attributes
        Array.from(doc.body.attributes).forEach(attr => {
            document.body.setAttribute(attr.name, attr.value);
        });

        // 5. Re-run Bracify & Hydrate Scripts
        try {
            // For form redirects, we might want to use replaceState to avoid "submission page" in history
            // But for simple Bracify apps, pushState is usually fine. 
            // We use the second argument of navigate to control this if needed.
            if (push) history.pushState({ path }, "", path);
        } catch (e) {
            try {
                if (push) history.replaceState({ path }, "", path);
            } catch (e2) {
                if (push) history.replaceState({ path }, "", null);
            }
        }

        // Deep update window._sys from the new URL
        try {
            const url = new URL(path, 'http://bracify-internal.local');
            const newQuery = Object.fromEntries(url.searchParams);
            if (!window._sys) window._sys = { query: {}, params: {} };
            // Replace the query object entirely to ensure all observers see it
            window._sys.query = newQuery;
        } catch (e) { }

        window.scrollTo(0, 0);
        await initializeBracify({ requireScope: true });
        await hydrateScripts(document.body);
    };

    function syncHead(newDoc) {
        // 1. Title
        if (newDoc.title) document.title = newDoc.title;

        // 2. Head Manifest
        const currentHead = document.head;
        const newHead = newDoc.head;

        const getKey = (el) => {
            if (el.tagName === 'META') return el.getAttribute('name') || el.getAttribute('property') || 'no-key';
            if (el.tagName === 'LINK') {
                if (el.rel === 'stylesheet') return 'css:' + el.getAttribute('href');
                if (el.getAttribute('data-t-source')) return 'source:' + el.getAttribute('data-t-source');
            }
            return null;
        };

        const newItems = Array.from(newHead.querySelectorAll('meta, link[rel="stylesheet"], link[data-t-source], style, script'));
        const currentItems = Array.from(currentHead.querySelectorAll('meta, link[rel="stylesheet"], link[data-t-source], style, script'));

        // Identify items to remove (those with keys that exist in current but NOT in new, or just all non-engine scripts)
        const newKeys = new Set(newItems.map(getKey).filter(Boolean));

        currentItems.forEach(el => {
            const key = getKey(el);
            // Always remove old page-specific scripts and styles
            if (el.tagName === 'SCRIPT' && el.src && (el.src.includes('engine.js') || el.src.includes('engine.cjs'))) return; // Keep engine
            if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') {
                el.remove();
                return;
            }
            if (key && !newKeys.has(key)) {
                el.remove();
            }
        });

        // Add/Update new items
        newItems.forEach(el => {
            if (el.tagName === 'SCRIPT' && el.src && (el.src.includes('engine.js') || el.src.includes('engine.cjs'))) return; // Skip engine

            const key = getKey(el);
            if (key) {
                const existing = Array.from(currentHead.querySelectorAll(`${el.tagName}[name="${el.getAttribute('name')}"], ${el.tagName}[property="${el.getAttribute('property')}"], ${el.tagName}[href="${el.getAttribute('href')}"]`))
                    .find(e => e.tagName === el.tagName);
                if (existing) {
                    // Update attributes if changed
                    Array.from(el.attributes).forEach(attr => existing.setAttribute(attr.name, attr.value));
                    return;
                }
            }

            // New item
            const clone = document.importNode(el, true);
            currentHead.appendChild(clone);
        });
    }

    async function hydrateScripts(container) {
        const scripts = Array.from(container.querySelectorAll('script'));
        for (const oldScript of scripts) {
            // Skip engine script
            if (oldScript.src && (oldScript.src.includes('engine.js') || oldScript.src.includes('engine.cjs'))) continue;

            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            if (oldScript.innerHTML) {
                // IIFE Wrapping for scope isolation
                newScript.innerHTML = `(function(){\n${oldScript.innerHTML}\n})();`;
            }

            // Replace to trigger execution
            oldScript.parentNode.replaceChild(newScript, oldScript);
        }
    }

    BracifyLib.initializeBracify = initializeBracify;

    document.addEventListener('DOMContentLoaded', async () => {
        if (location.protocol === 'file:') {
            try {
                const saved = await loadHandle();
                if (saved && await verifyPermission(saved)) {
                    BracifyLib.rootHandle = saved;
                }
            } catch (e) { }
        }

        if (location.protocol === 'file:' && !BracifyLib.rootHandle) {
            showInitOverlay();
        } else {
            initializeBracify();
        }

        // --- SPA Link Interception ---
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            const target = link.getAttribute('target');

            if (!href) return;
            const cleanPath = href.split('?')[0].split('#')[0];

            // Conditions for SPA transition
            if (!href.startsWith('http') && !href.startsWith('#') && target !== '_blank' && cleanPath.endsWith('.html')) {
                if (location.protocol === 'file:' || BracifyLib.rootHandle) {
                    e.preventDefault();
                    BracifyLib.navigate(href);
                }
            }
        });

        // --- History Support ---
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.path) {
                BracifyLib.navigate(e.state.path, false);
            }
        });

        // --- Zero JS Form Interception ---
        document.addEventListener('submit', async (e) => {
            const form = e.target;
            const action = form.getAttribute('action');
            if (!action || !action.includes('/_sys/data/')) return;

            e.preventDefault();
            const formData = new FormData(form);
            let body = {};

            // Unflatten dot-notation keys
            for (const [key, value] of formData.entries()) {
                const parts = key.split('.');
                let current = body;
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    const nextPart = parts[i + 1];
                    const isArrayIndex = !isNaN(nextPart);

                    if (i === parts.length - 1) {
                        current[part] = value;
                    } else {
                        if (!current[part]) {
                            current[part] = isArrayIndex ? [] : {};
                        }
                        current = current[part];
                    }
                }
            }

            const method = (form.getAttribute('method') || 'POST').toUpperCase();
            const redirect = form.getAttribute('data-t-redirect');

            try {
                // For now, on file:// rootHandle mode, we just simulate success if it's data API
                let result = { ok: true };
                if (location.protocol !== 'file:' || !BracifyLib.rootHandle) {
                    const res = await fetch(action, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    result = await res.json();
                } else {
                    console.log('[Bracify] Mock Submit in Developer Mode:', body);
                }

                if (result.ok || result.id) {
                    if (redirect) {
                        if (location.protocol === 'file:' && BracifyLib.rootHandle) {
                            BracifyLib.navigate(redirect);
                        } else {
                            window.location.assign(redirect);
                        }
                    } else {
                        window.location.reload();
                    }
                } else {
                    alert('Error: ' + (result.error || 'Submit failed'));
                }
            } catch (err) {
                console.error('[Bracify] Submit error:', err);
                alert('Submit error: ' + err.message);
            }
        });
    });

}
if (typeof module !== 'undefined' && module.exports) module.exports = BracifyLib;
