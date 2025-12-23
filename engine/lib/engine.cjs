/**
 * Bracify Engine - Unified Core (SSR & CSR)
 */

const factory = function () {
    // --- Utilities ---
    function isTruthy(val) {
        if (val === undefined || val === null || val === false || val === 0 || val === "") return false;
        if (Array.isArray(val)) return val.length > 0;
        if (typeof val === 'object') {
            const proto = Object.getPrototypeOf(val);
            if (proto === null || proto === Object.prototype) {
                return Object.keys(val).length > 0;
            }
        }
        return true;
    }

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
            const key = keys[i];
            if (value === undefined || value === null) break;

            // Handle automatic expansion of single-item arrays
            // Skip if key starts with '_' (meta properties like _length) or is a number index
            if (Array.isArray(value) && !noExpand && !key.startsWith('_') && isNaN(parseInt(key)) && !['map', 'filter', 'forEach', 'reduce', 'slice'].includes(key)) {
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

        return exprStr.replace(/\{\s*([^}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}/g, (match, key, pipeExpr) => {
            let lookupKey = key.trim();
            if (lookupKey.startsWith('?')) lookupKey = '_sys.query.' + lookupKey.substring(1);
            let val = getNestedValue(data, lookupKey);
            if (pipeExpr) {
                const parts = pipeExpr.split(':').map(s => s.trim());
                const pipeName = parts[0];
                const args = parts.slice(1).map(arg => arg.replace(/^['"]|['"]$/g, ''));
                if (pipes[pipeName]) val = pipes[pipeName](val, ...args);
            }
            // Return original match if value is undefined (preserves template for SSR/CSR later)
            return val !== undefined ? val : match;
        });
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

            return result;
        } catch (e) { return data; }
    }

    const pendingLoads = {};
    async function browserLocalFetcher(href, name) {
        const globalData = (typeof window !== 'undefined' ? window.__BRACIFY_DATA__ : null) || {};
        const entityName = href.split('?')[0].split('/').pop().replace(/\.json$/i, '');

        // 1. Try global data first (Hydration / Mock) - check both source name and entity name
        if (globalData[name]) return filterLocalData(globalData[name], href);
        if (globalData[entityName]) return filterLocalData(globalData[entityName], href);

        // 2. Try fetch (works on http/https, might fail on file://)
        try {
            const res = await fetch(href);
            if (res.ok) return filterLocalData(await res.json(), href);
        } catch (e) {
            // Fetch failed, likely file:// or network error
        }

        // 3. Fallback to script injection for file:// support
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
            rawHref = rawHref.replace(/([\w_-]+)=\{\?\}/g, (match, key) => `${key}={_sys.query.${key}}`);
            const href = (rawHref.indexOf('{') !== -1) ? resolveValue(rawHref, { _sys: sys }) : rawHref;
            const fetcher = (typeof window !== 'undefined' && window.BracifyFetcher) || browserLocalFetcher;
            return fetcher(href, name).then(data => { if (data) globalData[name] = data; });
        });
        await Promise.all(promises);
        if (typeof window !== 'undefined') window.__BRACIFY_DATA__ = globalData;
        return globalData;
    }

    function mock(name, data) {
        if (pendingLoads[name]) pendingLoads[name](data);
        else {
            const globalData = (typeof window !== 'undefined' ? window.__BRACIFY_DATA__ : null) || {};
            globalData[name] = data;
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
            // Skip event handlers and other risky attributes
            if (attr.name.startsWith('on')) continue;

            if (attr.value && attr.value.indexOf('{') !== -1) {
                const val = resolveValue(attr.value, data);
                if (val !== undefined) {
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

    function applyAutoBindings(el, data, engine) {
        const tagName = el.tagName;
        const name = el.getAttribute('name');
        if (!name || !['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) return;

        let val = getNestedValue(data, name);
        // Fallback to query param if not in data (useful for "Create New" with initial params)
        if (val === undefined && data._sys && data._sys.query) {
            val = data._sys.query[name];
        }

        if (val !== undefined && val !== null) {
            if (engine && engine.logger) engine.logger(`[Engine] Bind: name="${name}" val="${val}" tag=${tagName}`);
            if (tagName === 'SELECT') {
                el.value = val;
                el.setAttribute('value', val);
                updateSelectOptions(el, val);
            } else if (tagName === 'INPUT') {
                if (el.type === 'checkbox') {
                    if (isTruthy(val)) {
                        el.checked = true;
                        el.setAttribute('checked', 'checked');
                    } else {
                        el.checked = false;
                        el.removeAttribute('checked');
                    }
                } else if (el.type === 'radio') {
                    if (el.getAttribute('value') == val) {
                        el.checked = true;
                        el.setAttribute('checked', 'checked');
                    } else {
                        el.checked = false;
                        el.removeAttribute('checked');
                    }
                } else {
                    el.value = val;
                    el.setAttribute('value', val); // Essential for SSR output
                }
            } else if (tagName === 'TEXTAREA') {
                el.value = val;
                el.innerHTML = val; // Essential for SSR/JSDOM
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
            const config = { processIncludes: options.processIncludes !== false, processBindings: options.processBindings !== false, stripAttributes: options.stripAttributes === true, ...options };

            if (config.processBindings && element.hasAttribute('data-t-source')) {
                await this.processSource(element, data);
            }
            if (config.processBindings && element.hasAttribute('data-t-list')) {
                if (await this.processList(element, data, config)) return;
            }
            if (config.processBindings && element.hasAttribute('data-t-if')) {
                if (!isTruthy(resolveValue(element.getAttribute('data-t-if'), data))) { element.remove(); return; }
                if (config.stripAttributes) element.removeAttribute('data-t-if');
            }
            if (config.processIncludes && element.hasAttribute('data-t-include')) {
                const templateHtml = await this.includeResolver(element.getAttribute('data-t-include'));
                if (templateHtml) {
                    // Check if we are doing Layout or Snippet
                    // We look for data-t-content in the template
                    if (templateHtml.indexOf('data-t-content') !== -1) {
                        // Layout Mode
                        const container = (typeof document !== 'undefined')
                            ? document.createElement('div')
                            : new (require('jsdom').JSDOM)('').window.document.createElement('div');
                        container.innerHTML = templateHtml;

                        const slots = container.querySelectorAll('[data-t-content]');
                        if (slots.length > 0) {
                            // Map existing contents by name
                            const sourceContents = {};
                            const sourceElements = element.querySelectorAll(':scope > [data-t-content]');
                            sourceElements.forEach(el => {
                                sourceContents[el.getAttribute('data-t-content') || ''] = el.innerHTML;
                            });

                            // If no named data-t-content in source, but exists in template, 
                            // maybe the whole innerHTML is the default content?
                            // For simplicity, let's stick to matching names or empty name
                            const defaultContent = element.innerHTML;

                            slots.forEach(slot => {
                                const name = slot.getAttribute('data-t-content') || '';
                                if (sourceContents[name] !== undefined) {
                                    slot.innerHTML = sourceContents[name];
                                } else if (name === '' || name === 'default') {
                                    // If no specific match, use everything as default if it's the only slot
                                    // or explicitly marked
                                    slot.innerHTML = defaultContent;
                                }
                            });
                            element.innerHTML = container.innerHTML;
                        } else {
                            element.innerHTML = templateHtml;
                        }
                    } else {
                        // Snippet Mode
                        element.innerHTML = templateHtml;
                    }
                }
                element.removeAttribute('data-t-include');
            }

            // Apply Scope BEFORE bindings
            if (config.processBindings && element.hasAttribute('data-t-scope')) {
                const scopeKey = element.getAttribute('data-t-scope');
                let val = getNestedValue(data, scopeKey);
                if (val !== undefined) {
                    // Auto-expand single item array (common result of ?id=... search)
                    if (Array.isArray(val) && val.length === 1) {
                        val = val[0];
                    }
                    this.log(`[Engine] Scope: ${scopeKey} -> Object(${Object.keys(val || {}).join(',')})`);
                    data = { ...data, [scopeKey]: val };
                    // If it's an object, spread its properties into the context for auto-binding
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                        data = { ...data, ...val };
                    }
                }
                if (config.stripAttributes) element.removeAttribute('data-t-scope');
            }

            if (config.processBindings) {
                applyAttributeBindings(element, data);
                applyTextBindings(element, data);
                applyAutoBindings(element, data, this);
            }

            for (const child of Array.from(element.children || [])) await this.processElement(child, data, config);
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
            // List data shouldn't use auto-expansion for the list itself
            const listData = getNestedValue(data, name, true);
            if (!Array.isArray(listData)) { element.remove(); return true; }
            const parent = element.parentNode;
            const nextSibling = element.nextSibling;
            const template = element.cloneNode(true);
            element.remove();
            for (const item of listData) {
                const clone = template.cloneNode(true);
                parent.insertBefore(clone, nextSibling);
                await this.processElement(clone, { ...data, [name]: item }, options);
            }
            return true;
        }
    }

    return { Engine, resolveValue, getNestedValue, preloadSources, mock, isTruthy };
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
    document.addEventListener('DOMContentLoaded', async () => {
        const data = await BracifyLib.preloadSources();
        await (new BracifyLib.Engine()).processElement(document.body, { ...data, _sys: window._sys });

        // --- Zero JS Form Interception ---
        document.addEventListener('submit', async (e) => {
            const form = e.target;
            const action = form.getAttribute('action');
            if (!action || !action.includes('/_sys/data/')) return;

            e.preventDefault();
            const formData = new FormData(form);
            const body = Object.fromEntries(formData.entries());
            const method = (form.getAttribute('method') || 'POST').toUpperCase();
            const redirect = form.getAttribute('data-t-redirect');

            try {
                const res = await fetch(action, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await res.json();

                if (res.ok && (result.ok || result.id)) {
                    if (redirect) {
                        // Use relative or absolute path safely
                        window.location.assign(redirect);
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
