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

    // Allow-list URL sanitizer. Normalizes like the browser URL parser (strip leading/trailing
    // C0 controls + space, drop TAB/LF/CR anywhere) before reading the scheme. Values without a
    // scheme (relative URLs) are returned unchanged.
    const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel'];
    // Raster images cannot execute script (unlike svg+xml / html), so data: URIs of these are allowed.
    const SAFE_DATA_IMAGE = /^data:image\/(png|gif|jpe?g|webp|avif|bmp);/i;
    function sanitizeUrl(url) {
        if (typeof url !== 'string') return url;
        const normalized = url.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '');
        const m = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
        if (m && !SAFE_SCHEMES.includes(m[1].toLowerCase()) && !SAFE_DATA_IMAGE.test(normalized)) return 'about:blank';
        return url;
    }

    // srcset / imagesrcset: sanitize the URL of each candidate, drop unsafe candidates.
    function sanitizeSrcset(val) {
        // Candidate = URL (non-whitespace run, so commas inside data: URLs survive) + optional descriptors up to the next comma.
        const out = [];
        const re = /[\s,]*([^\s]+)([^,]*)/g;
        let m;
        while ((m = re.exec(String(val)))) {
            let url = m[1], desc = m[2].trim();
            const trail = /,+$/.exec(url);
            if (trail) { url = url.slice(0, -trail[0].length); desc = ''; }
            if (!url || sanitizeUrl(url) !== url) continue;
            out.push(desc ? url + ' ' + desc : url);
        }
        return out.join(', ');
    }

    // <meta http-equiv=refresh content="0;url=...">: mirror the browser's refresh parser
    // (time, separators [\s;,], optional "url=", optional quote) and sanitize the URL part.
    function sanitizeMetaRefresh(val) {
        return String(val).replace(/^(\s*[\d.]*[\s;,]*(?:url\s*=\s*)?['"]?)([\s\S]*)$/i, (_, p, u) => p + sanitizeUrl(u));
    }

    const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'cite', 'background',
        'codebase', 'longdesc', 'manifest', 'icon', 'dynsrc', 'lowsrc'];

    const SVG_ANIMATION = ['animate', 'set', 'animatetransform', 'animatemotion'];

    // Returns the safe value for a data-bound attribute, or null to drop the attribute.
    function sanitizeAttributeValue(el, name, val) {
        name = name.toLowerCase();
        if (name === 'srcdoc') return null; // bound srcdoc must not carry markup
        if (URL_ATTRIBUTES.includes(name)) return sanitizeUrl(val);
        if (name === 'data' && el.tagName.toLowerCase() === 'object') return sanitizeUrl(val);
        if (name === 'ping') return String(val).split(/\s+/).filter(Boolean).map(sanitizeUrl).join(' ');
        if (name === 'srcset' || name === 'imagesrcset') return sanitizeSrcset(val);
        if (name === 'content' && el.tagName.toLowerCase() === 'meta') {
            const he = el.getAttribute('http-equiv') || '';
            if (/^refresh$/i.test(he) || he.indexOf('{') !== -1) return sanitizeMetaRefresh(val);
        }
        // SVG animation can write any attribute (incl. href) from to/from/by/values
        if (SVG_ANIMATION.includes(el.tagName.toLowerCase())) {
            if (name === 'attributename') {
                const target = String(val).trim().toLowerCase();
                if (URL_ATTRIBUTES.includes(target) || /(^|:)(href|src|srcdoc|data|on.*)$/.test(target)) return null;
            }
            if (['to', 'from', 'by', 'values'].includes(name)) return String(val).split(';').map(sanitizeUrl).join(';');
        }
        return val;
    }

    // Automatic data relation: `obj.X` resolves through `X_id` / `XId` to the record
    // (matched by `id`) in the root data source named after the plural of X.
    const NO_RELATION = {};
    // Per-array id index (first record wins), built on first use.
    const relationIndexes = new WeakMap();
    function relationIndex(arr) {
        let idx = relationIndexes.get(arr);
        if (!idx) {
            idx = new Map();
            for (const r of arr) {
                if (r && typeof r === 'object' && r.id !== undefined && r.id !== null && !idx.has(String(r.id))) idx.set(String(r.id), r);
            }
            relationIndexes.set(arr, idx);
        }
        return idx;
    }
    function lookupRelated(root, obj, key) {
        if (!root || typeof root !== 'object' || !key) return NO_RELATION;
        let fk = obj[key + '_id'];
        if (fk === undefined) fk = obj[key + 'Id'];
        if (fk === undefined || fk === null) return NO_RELATION;
        const names = [key + 's', key + 'es'];
        if (key.endsWith('y')) names.push(key.slice(0, -1) + 'ies');
        names.push(key);
        const has = (n) => Object.prototype.hasOwnProperty.call(root, n);
        for (const n of names) {
            if (!has(n) || root[n] === undefined || root[n] === null || typeof root[n] !== 'object') continue;
            const src = root[n];
            const rec = Array.isArray(src) ? relationIndex(src).get(String(fk))
                : (String(src.id) === String(fk) ? src : undefined);
            return rec;
        }
        return NO_RELATION;
    }

    function getNestedValue(data, path, noExpand = false, noRelation = false) {
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
            if (!noRelation && typeof value === 'object' && !Array.isArray(value) && !(key in value)) {
                const related = lookupRelated(data, value, key);
                if (related !== NO_RELATION) { value = related; continue; }
            }
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
        currency: (value, currencyCode) => {
            if (value === undefined || value === null || value === '') return '';
            const num = Number(value);
            if (isNaN(num)) return value;
            try {
                return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode || 'JPY' }).format(num);
            } catch (e) {
                return num.toLocaleString();
            }
        },
        uppercase: (value) => (value === undefined || value === null) ? '' : String(value).toUpperCase(),
        lowercase: (value) => (value === undefined || value === null) ? '' : String(value).toLowerCase(),
        truncate: (value, lengthArg) => {
            if (value === undefined || value === null) return '';
            const str = String(value);
            const length = parseInt(lengthArg, 10);
            if (!lengthArg || isNaN(length) || length < 0) return str;
            const chars = Array.from(str);
            if (chars.length <= length) return str;
            if (length <= 3) return chars.slice(0, length).join('');
            return chars.slice(0, length - 3).join('') + '...';
        },
        default: (value, fallback) => {
            const isEmpty = value === undefined || value === null || value === '';
            return isEmpty ? (fallback !== undefined ? fallback : '') : value;
        },
        ternary: (value, trueVal, falseVal) => {
            const result = isTruthy(value) ? trueVal : falseVal;
            return result !== undefined ? result : '';
        },
        json: (value) => { try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); } }
    };

    // --- Pipe expression parsing ("filter1: 'a', 'b' | filter2: arg") ---
    // Splits on `delimiter` at the top level only, leaving quoted sections ('...'/"...") intact.
    // An unterminated quote simply runs to the end of the string as a single segment.
    function splitTopLevel(str, delimiter) {
        const result = [];
        let start = 0;
        let quoteChar = null;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (quoteChar) {
                if (ch === quoteChar) quoteChar = null;
            } else if (ch === "'" || ch === '"') {
                quoteChar = ch;
            } else if (ch === delimiter) {
                result.push(str.slice(start, i));
                start = i + 1;
            }
        }
        result.push(str.slice(start));
        return result;
    }

    function indexOfTopLevel(str, char) {
        let quoteChar = null;
        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (quoteChar) {
                if (ch === quoteChar) quoteChar = null;
            } else if (ch === "'" || ch === '"') {
                quoteChar = ch;
            } else if (ch === char) {
                return i;
            }
        }
        return -1;
    }

    function stripQuotes(str) {
        const trimmed = str.trim();
        if (trimmed.length >= 2) {
            const first = trimmed[0];
            const last = trimmed[trimmed.length - 1];
            if ((first === "'" || first === '"') && first === last) {
                return trimmed.slice(1, -1);
            }
        }
        return trimmed;
    }

    // "truncate: 20 | uppercase" -> [{ name: 'truncate', args: ['20'] }, { name: 'uppercase', args: [] }]
    function parsePipes(pipeExpr) {
        if (!pipeExpr) return [];
        return splitTopLevel(pipeExpr, '|').map(part => {
            const trimmed = part.trim();
            const colonIdx = indexOfTopLevel(trimmed, ':');
            let name, argsStr;
            if (colonIdx === -1) { name = trimmed; argsStr = ''; }
            else { name = trimmed.slice(0, colonIdx).trim(); argsStr = trimmed.slice(colonIdx + 1); }
            const args = argsStr.trim() ? splitTopLevel(argsStr, ',').map(stripQuotes) : [];
            return { name, args };
        });
    }

    // Whether the reference path's top-level key is present in the current data
    // (i.e. "loaded", as opposed to not-yet-fetched). Used to decide whether an
    // undefined value should leave the placeholder intact for later evaluation.
    function isTopLevelLoaded(lookupKey, data) {
        let key = lookupKey.startsWith('!') ? lookupKey.substring(1) : lookupKey;
        const topKey = key.split('.')[0];
        return !!(data && typeof data === 'object' && topKey in data);
    }

    // --- Arithmetic Expression Evaluation (placeholders like {price * 1.1}) ---
    // Detect whether a placeholder body contains an arithmetic expression.
    // +, *, /, % and parentheses are unambiguous operators. A '-' is treated as an
    // operator only when not glued to a path segment (e.g. "price - 5", "-5"),
    // so hyphenated data keys like "first-name" keep working as plain lookups.
    function isArithmeticExpression(str) {
        if (typeof str !== 'string') return false;
        if (/[+*/%()]/.test(str)) return true;
        return /(^|[\s(])-/.test(str);
    }

    // Tokenize an arithmetic expression into numbers, variable paths and operators.
    // Returns null when an unexpected character is encountered (safe non-expression).
    function tokenizeArithmetic(expr) {
        const tokens = [];
        let i = 0;
        const n = expr.length;
        while (i < n) {
            const ch = expr[i];
            if (/\s/.test(ch)) { i++; continue; }
            // Number literal (integer or decimal)
            if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] || ''))) {
                let j = i;
                while (j < n && /[0-9.]/.test(expr[j])) j++;
                tokens.push({ type: 'number', value: parseFloat(expr.slice(i, j)) });
                i = j;
                continue;
            }
            // Variable path (e.g. _sys.query._offset, item.price, projects._index)
            if (/[A-Za-z_$]/.test(ch)) {
                let j = i;
                while (j < n && /[A-Za-z0-9_$.]/.test(expr[j])) j++;
                tokens.push({ type: 'ident', value: expr.slice(i, j) });
                i = j;
                continue;
            }
            if ('+-*/%'.indexOf(ch) !== -1) { tokens.push({ type: 'op', value: ch }); i++; continue; }
            if (ch === '(') { tokens.push({ type: 'paren', value: '(' }); i++; continue; }
            if (ch === ')') { tokens.push({ type: 'paren', value: ')' }); i++; continue; }
            return null; // Unexpected character -> not evaluable as arithmetic
        }
        return tokens;
    }

    // Convert a resolved variable value to a number, falling back to 0 for
    // undefined/null/non-numeric values (safe evaluation, no interruption).
    function toNumber(val) {
        if (val === undefined || val === null) return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
    }

    // Clean up floating point artifacts (e.g. 0.1 * 3 -> 0.30000000000000004).
    function cleanFloat(n) {
        if (!isFinite(n)) return 0;
        return Math.round(n * 1e12) / 1e12;
    }

    // Safe arithmetic evaluator (no eval/Function) supporting +, -, *, /, %,
    // parentheses, and variable paths resolved from the data context.
    function evaluateExpression(expr, data) {
        const tokens = tokenizeArithmetic(String(expr));
        if (!tokens || tokens.length === 0) return 0;
        let pos = 0;
        const peek = () => tokens[pos];
        const next = () => tokens[pos++];

        function parsePrimary() {
            const tok = peek();
            if (!tok) return 0;
            if (tok.type === 'number') { next(); return tok.value; }
            if (tok.type === 'ident') {
                next();
                return toNumber(getNestedValue(data, tok.value));
            }
            if (tok.type === 'paren' && tok.value === '(') {
                next();
                const v = parseAddSub();
                if (peek() && peek().type === 'paren' && peek().value === ')') next();
                return v;
            }
            if (tok.type === 'op' && (tok.value === '-' || tok.value === '+')) {
                next();
                const v = parsePrimary();
                return tok.value === '-' ? -v : v;
            }
            return 0;
        }

        function parseMulDiv() {
            let left = parsePrimary();
            while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                const op = next().value;
                const right = parsePrimary();
                if (op === '*') left = left * right;
                else if (op === '/') left = right === 0 ? 0 : left / right; // Guard division by zero
                else left = right === 0 ? 0 : left % right;
            }
            return left;
        }

        function parseAddSub() {
            let left = parseMulDiv();
            while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
                const op = next().value;
                const right = parseMulDiv();
                left = op === '+' ? left + right : left - right;
            }
            return left;
        }

        return cleanFloat(parseAddSub());
    }

    // Issue #37: data-derived values written into the DOM are escaped so a later hydration/re-bind pass
    // cannot treat them as placeholders; unescapeNodes() (end of initializeBracify) reverses this once.
    function escapeBound(val) {
        return String(val).replace(/[\\{}]/g, '\\$&');
    }
    const UNESCAPE_RE = /\\([\\{}])/g;
    // Nodes/attributes already unescaped by the client (their braces are literal data now). A second
    // initializeBracify() pass on the same DOM must neither re-evaluate nor re-unescape them.
    const hydratedText = new WeakSet();
    const hydratedAttrs = new WeakMap(); // Element -> Set<attribute name>

    // Undefined can mean either "not loaded yet" (keep the placeholder for a later pass) or
    // "loaded, but this property is missing" (resolve now). Only the data's top-level key tells
    // them apart; scope/list contexts (ctx.inScope) count as loaded since their
    // properties are flattened, unless the scope's root itself is not loaded (ctx.scopeMissing).
    function isLoadedContext(lookupKey, data, ctx) {
        return !!((ctx && ctx.inScope && !ctx.scopeMissing) || isTopLevelLoaded(lookupKey, data));
    }

    // escapeOutput: escape substituted data values (not the template's own text) for DOM output.
    function resolveValue(expression, data, ctx, escapeOutput) {
        if (expression === null || expression === undefined) return '';
        const exprStr = String(expression);
        // If it's a simple path (no spaces, no ?, no {), resolve it as is
        if (exprStr.indexOf('{') === -1 && exprStr.indexOf(' ') === -1 && exprStr.indexOf('?') === -1) {
            return getNestedValue(data, exprStr);
        }

        // Security: Block nested placeholders {...{...}...}
        if (/\{[^{}]*\{/.test(exprStr.replace(/\\[\\{}]/g, ''))) {
            return exprStr;
        }

        return exprStr.replace(/(^|[^\\])((?:\\\\)*)\{\s*([^{}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}/g, (match, prefix0, bs, key, pipeExpr) => {
            // An even run of backslashes before '{' is escaped backslashes, not an escaped brace.
            const prefix = prefix0 + bs;
            let lookupKey = key.trim();
            if (lookupKey.startsWith('?')) lookupKey = '_sys.query.' + lookupKey.substring(1);
            // Arithmetic expressions (e.g. "{price * 1.1}") are evaluated safely,
            // otherwise the placeholder body is treated as a plain data path.
            let val = isArithmeticExpression(lookupKey) ? evaluateExpression(lookupKey, data) : getNestedValue(data, lookupKey);

            if (pipeExpr) {
                if (val === undefined && !isLoadedContext(lookupKey, data, ctx)) {
                    return match;
                }
                for (const { name, args } of parsePipes(pipeExpr)) {
                    if (!Object.prototype.hasOwnProperty.call(pipes, name)) continue; // unknown pipe: pass through
                    if ((val === undefined || val === null) && name !== 'default' && name !== 'ternary') {
                        val = '';
                        continue;
                    }
                    val = pipes[name](val, ...args);
                }
            }
            // If the final value is still an array (and no pipe was used), treat it as undefined
            // to avoid rendering "item1,item2" in the UI.
            const wasArray = Array.isArray(val) && !pipeExpr;
            if (wasArray) val = undefined;

            // Return empty string if value is null
            if (val === null) return prefix + '';
            // Rendered output only (ctx.renderOutput): a missing field of loaded data becomes empty,
            // like the piped form. Other callers rely on the literal to detect "unresolved".
            if (val === undefined && !wasArray && !pipeExpr && ctx && ctx.renderOutput && isLoadedContext(lookupKey, data, ctx)) return prefix + '';
            // Return original match if value is undefined (preserves template for SSR/CSR later)
            if (val === undefined) return match;
            // ctx.encodeOutput: the value lands inside a URL query, so it must stay a single parameter value.
            if (ctx && ctx.encodeOutput) return prefix + encodeURIComponent(String(val));
            return prefix + (escapeOutput ? escapeBound(val) : val);
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
    // True when an `id` filter value is empty or an unresolved placeholder like "{?}" / "{_sys.query.id}".
    function isBlankIdFilter(val) {
        return val === undefined || val === null || val === '' ||
            (typeof val === 'string' && val.indexOf('{') !== -1 && val.indexOf('}') !== -1);
    }

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
                // An empty/unresolved `id` filter matches nothing (never "ignored", which would return the first record).
                if (key === 'id' && isBlankIdFilter(val)) return [];
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
        // Skip fetch on file:// protocol as it triggers CORS errors for local files
        if (typeof window !== 'undefined' && window.location.protocol !== 'file:') {
            try {
                const res = await fetch(href);
                if (res.ok) return filterLocalData(await res.json(), href);
            } catch (e) { }
        }

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

    // README `key={?}` auto-bind: a query value that is exactly `{?}` means `key={?key}`. Plain keys only
    // (operator keys such as `price:gt` and mixed values such as `pre{?}` are left unchanged).
    function expandAutoBind(href) {
        return String(href).replace(/([?&])([^?&#=:{}%]+)=\{\?\}(?=[&#]|$)/g, (m, sep, key) => sep + key + '={?' + key + '}');
    }

    // Issue #85: resolves a data-t-source href. Values substituted into the query part (after `?`, before `#`) are
    // encodeURIComponent-ed so `x&id=1` stays one parameter value; the path and fragment keep their raw substitution.
    function resolveSourceHref(rawHref, data, escapeOutput) {
        const resolve = (str, ctx) => str.indexOf('{') !== -1 ? resolveValue(str, data, ctx, escapeOutput) : str;
        const href = String(rawHref);
        // `?` / `#` inside a {...} placeholder (e.g. `{?a}`) are not URL delimiters; `\{` is an escaped literal brace.
        let q = -1, h = href.length, depth = 0;
        for (let i = 0; i < href.length; i++) {
            const c = href[i];
            if (c === '\\') i++;
            else if (c === '{') depth++;
            else if (c === '}') { if (depth > 0) depth--; }
            else if (depth === 0) {
                if (c === '#') { h = i; break; }
                if (c === '?' && q === -1) q = i;
            }
        }
        if (q === -1) return resolve(href.slice(0, h)) + resolve(href.slice(h));
        return resolve(href.slice(0, q + 1)) + resolve(href.slice(q + 1, h), { encodeOutput: true }) + resolve(href.slice(h));
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
            // The href may come from SSR (data values already escaped as \{ \} \\) or from a raw template: resolve with
            // escaping and unescape once so the URL is the literal text the server used, without re-evaluating it.
            rawHref = expandAutoBind(rawHref);
            const href = resolveSourceHref(rawHref, { _sys: sys }, true).replace(UNESCAPE_RE, '$1');
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

    function applyAttributeBindings(el, data, ctx) {
        const doneAttrs = hydratedAttrs.get(el);
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on')) continue;
            if (doneAttrs && doneAttrs.has(attr.name)) continue;
            if (attr.value && attr.value.indexOf('{') !== -1) {
                let val = resolveValue(attr.value, data, { ...ctx, renderOutput: true }, true);
                if (val !== undefined) {
                    val = sanitizeAttributeValue(el, attr.name, val);
                    if (val === null) { el.removeAttribute(attr.name); continue; }
                    if (attr.namespaceURI) el.setAttributeNS(attr.namespaceURI, attr.name, val);
                    else el.setAttribute(attr.name, val);
                    if (el.tagName === 'SELECT' && attr.name === 'value') updateSelectOptions(el, String(val).replace(UNESCAPE_RE, '$1'));
                }
            }
        }
    }

    function applyTextBindings(el, data, ctx) {
        if (['STYLE', 'SCRIPT'].includes(el.tagName)) return;
        for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3) {
                if (hydratedText.has(node)) continue;
                const content = node.nodeValue;
                if (content && content.indexOf('{') !== -1) {
                    const val = resolveValue(content, data, { ...ctx, renderOutput: true }, true);
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

        if (!name || !['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) return;

        // Deep collision prevention: in strict (hydration) mode a control outside any data-t-scope never binds from the
        // data context (global data could collide with its name).
        const strictOutOfScope = !!(config && config.requireScope && !config.inScope);
        let fromQuery = false;
        let val = strictOutOfScope ? undefined : getNestedValue(data, name, false, true); // form auto-binding never follows relations
        // _sys.query fallback (Issue #47): SSR fills scope-less controls from it, so CSR/local rendering does too.
        // Not when hydrating SSR output (window.__BRACIFY_SSR__, set by the server's state script): the server already
        // applied it, and data-t-scope is stripped from SSR output, so a scoped control would look scope-less here and
        // a colliding query param would clobber its server-rendered value.
        const hydratingSsr = strictOutOfScope && typeof window !== 'undefined' && window.__BRACIFY_SSR__ === true;
        // data-t-bound: set by the CLI build via the markBound option on controls bound from data; like SSR output, they skip the query fallback.
        const builtBound = el.hasAttribute('data-t-bound');
        if (val === undefined && !hydratingSsr && !builtBound && data._sys && data._sys.query) {
            if (Object.prototype.hasOwnProperty.call(data._sys.query, name)) { val = data._sys.query[name]; fromQuery = true; }
            if (engine && engine.logger) engine.logger(`[Engine] Query Fallback: name="${name}" val="${val}"`);
        }
        // Mark data-bound controls (null included, as SSR hydration keeps them). fromQuery only guards a build that carries a query.
        if (config && config.markBound && val !== undefined && !fromQuery) el.setAttribute('data-t-bound', '');
        if (val !== undefined && val !== null) {
            if (engine && engine.logger) engine.logger(`[Engine] BINDING: name="${name}" val="${val}"`);
            // Property gets the raw value; the attribute gets the escaped form (unescaped by unescapeNodes on the client).
            const escVal = escapeBound(val);
            const doneAttrs = hydratedAttrs.get(el);
            if (doneAttrs) doneAttrs.delete('value'); // re-escaped below, so the next unescape pass must handle it again
            if (tagName === 'SELECT') {
                el.value = val;
                el.setAttribute('value', escVal);
                updateSelectOptions(el, val);
                return { select: val };
            } else if (tagName === 'INPUT') {
                if (el.type === 'checkbox') {
                    if (isTruthy(val)) { el.checked = true; el.setAttribute('checked', 'checked'); }
                    else { el.checked = false; el.removeAttribute('checked'); }
                } else if (el.type === 'radio') {
                    if (el.getAttribute('value') == val) { el.checked = true; el.setAttribute('checked', 'checked'); }
                    else { el.checked = false; el.removeAttribute('checked'); }
                } else {
                    el.value = val;
                    el.setAttribute('value', escVal);
                }
            } else if (tagName === 'TEXTAREA') {
                el.value = val;
                el.innerHTML = escVal;
            }
        }
    }

    // --- Engine ---
    // Maximum nesting of data-t-include (guards against runaway/cyclic includes, Issue #34)
    const MAX_INCLUDE_DEPTH = 32;
    // Maximum number of includes expanded in ONE render (whole tree, not per subtree). Stops
    // exponential fan-out (a includes b twice, b includes c twice, ...) that depth/cycle checks allow.
    const MAX_INCLUDES_PER_RENDER = 500;

    function normalizeIncludePath(p) {
        let n = String(p).trim().replace(/\\/g, '/');
        const parts = [];
        for (const seg of n.split('/')) {
            if (seg === '' || seg === '.') continue;
            if (seg === '..') parts.pop(); else parts.push(seg);
        }
        n = parts.join('/');
        const isWin = (typeof process !== 'undefined' && process.platform === 'win32');
        return isWin ? n.toLowerCase() : n;
    }

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
            if (localConfig.processIncludes && !localConfig.includeBudget) {
                // Per-render counter, shared by reference with every descendant call (never stored on the Engine instance)
                localConfig = { ...localConfig, includeBudget: { count: 0 } };
            }
            // Include-only pass without bindings (SSR template cache build, Issue #67): there is no real data to
            // resolve a dynamic path ({?p}, {_sys.query.p}, ...) against, so leave it for the per-request render.
            if (localConfig.processIncludes && element.hasAttribute('data-t-include')
                && !(localConfig.processBindings === false && element.getAttribute('data-t-include').indexOf('{') !== -1)) {
                const rawPath = element.getAttribute('data-t-include');
                const includePath = (rawPath.indexOf('{') !== -1) ? resolveValue(rawPath, data) : rawPath;
                const includeStack = localConfig.includeStack || [];
                const includeKey = normalizeIncludePath(includePath);
                let templateHtml = null;
                if (includeStack.includes(includeKey) || includeStack.length >= MAX_INCLUDE_DEPTH) {
                    console.warn(`[Bracify] Skipped data-t-include "${includePath}": ${includeStack.includes(includeKey) ? 'circular include' : 'max include depth (' + MAX_INCLUDE_DEPTH + ') exceeded'}`);
                } else if (localConfig.includeBudget.count >= MAX_INCLUDES_PER_RENDER) {
                    if (localConfig.includeBudget.count === MAX_INCLUDES_PER_RENDER) console.warn(`[Bracify] Skipped data-t-include "${includePath}": max includes per render (${MAX_INCLUDES_PER_RENDER}) exceeded`);
                    localConfig.includeBudget.count++;
                } else {
                    localConfig.includeBudget.count++;
                    templateHtml = await this.includeResolver(includePath);
                    // New array per subtree so siblings never share include state
                    localConfig = { ...localConfig, includeStack: [...includeStack, includeKey] };
                }
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
                const scopeKey = element.getAttribute('data-t-scope');
                let val = getNestedValue(data, scopeKey);
                localConfig = { ...localConfig, inScope: true };
                if (val === undefined) {
                    // Root loaded but the path is missing (e.g. a deleted relation): an empty scope, inner
                    // placeholders render empty. Unknown root: "not loaded", they stay literal.
                    localConfig.scopeMissing = !isTopLevelLoaded(scopeKey, data);
                } else {
                    localConfig.scopeMissing = false;
                    if (Array.isArray(val) && val.length === 1) val = val[0];
                    this.log(`[Engine] Scope: ${scopeKey} -> Object(${Object.keys(val || {}).join(',')})`);
                    data = { ...data, [scopeKey]: val };
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) data = { ...data, ...val };
                }
                if (localConfig.stripAttributes) element.removeAttribute('data-t-scope');
            }
            let selectBound = null;
            if (localConfig.processBindings) {
                applyAttributeBindings(element, data, localConfig);
                applyTextBindings(element, data, localConfig);
                selectBound = applyAutoBindings(element, data, this, localConfig);
            }
            for (const child of Array.from(element.children || [])) await this.processElement(child, data, localConfig);
            // A <select>'s options (e.g. generated by data-t-list) only exist after its children are processed, so
            // re-apply the auto-bound value now. Idempotent: updateSelectOptions resets every option's selected state.
            // Without a matching option the value is left alone, so CSR shows the first option like the SSR output does.
            if (selectBound) {
                updateSelectOptions(element, selectBound.select);
                if (element.querySelector('option[selected]')) element.value = selectBound.select;
            }
            // <form data-t-redirect="X"> -> hidden field, so the browser actually submits it (the server validates it).
            // Runs after the children are processed and is skipped when the field already exists, so re-hydration never duplicates it.
            if (element.tagName === 'FORM' && element.hasAttribute('data-t-redirect') && element.ownerDocument) {
                const exists = Array.from(element.querySelectorAll('input')).some(i => i.getAttribute('name') === 'data-t-redirect');
                if (!exists) {
                    const hidden = element.ownerDocument.createElement('input');
                    hidden.setAttribute('type', 'hidden');
                    hidden.setAttribute('name', 'data-t-redirect');
                    hidden.setAttribute('value', element.getAttribute('data-t-redirect'));
                    element.appendChild(hidden);
                }
            }
        }
        async processSource(element, data) {
            const name = element.getAttribute('data-t-source');
            let rawHref = element.getAttribute('href');
            if (!rawHref) return;
            rawHref = expandAutoBind(rawHref);
            const href = resolveSourceHref(rawHref, data);
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

            // Inject a 0-based "_index" meta property into each item's scope so
            // placeholders like "{projects._index + 1}" can render a 1-based index.
            for (let i = 0; i < listData.length; i++) {
                const item = listData[i];
                const clone = template.cloneNode(true);
                parent.insertBefore(clone, nextSibling);
                let itemData = item;
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    itemData = { ...item, _index: i };
                }
                await this.processElement(clone, { ...data, [name]: itemData }, itemOptions);
            }
            return true;
        }
    }

    // Validates a (possibly dynamic) include path. Leading '/' stays project-relative; anything that could
    // leave the project root or reach the system directory (_sys) is refused.
    function isSafeIncludePath(p) {
        if (typeof p !== 'string' || !p || p.indexOf('\0') !== -1) return false;
        if (p.charAt(0) === '\\') return false; // UNC / absolute backslash
        const rel = p.replace(/^\/+/, '');
        if (rel.indexOf(':') !== -1) return false; // drive letter, scheme (file:, http:), NTFS alternate data stream / ::$INDEX_ALLOCATION
        return !rel.split(/[\/\\]/).some(seg => seg === '..' || seg.toLowerCase() === '_sys');
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
        Engine, resolveValue, resolveSourceHref, expandAutoBind, _hydrated: { text: hydratedText, attrs: hydratedAttrs }, getNestedValue, preloadSources, mock, isTruthy, isSafeIncludePath, resolvePathHandle, readFileContent, evaluateCondition, evaluateExpression, filterLocalData,
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
        // navigate() re-creates every script of the swapped-in body itself (hydrateScripts); the initial load only
        // re-creates the scripts the engine inserted (includes/slots), since the page's own ones already ran at parse.
        const { skipScriptHydration, ...processOptions } = initOptions;
        const existingScripts = skipScriptHydration ? null : new Set(document.querySelectorAll('body script'));
        const data = await BracifyLib.preloadSources();
        const options = {
            includeResolver: async (path) => {
                if (!BracifyLib.isSafeIncludePath(path)) {
                    console.warn('[Bracify] Blocked unsafe include path:', path);
                    return null;
                }
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
        await engine.processElement(document.body, { ...data, _sys: window._sys }, { requireScope: true, ...processOptions });

        // Final unescape
        unescapeNodes(document.body);
        // SSR also binds <head> (title, meta, link) with escaped data values; the client never re-binds it, only unescapes.
        if (document.head) unescapeNodes(document.head);

        // innerHTML-inserted scripts never execute: run those that were not part of the loaded document
        if (existingScripts) {
            await hydrateScripts(Array.from(document.querySelectorAll('body script')).filter(s => !existingScripts.has(s)));
        }

        ensureDisconnectButton();
    }

    // Reverses escapeBound() and template-author \{ \} \\ escapes in a single pass (never re-run on the same DOM).
    const UNESC = /\\([\\{}])/g;
    const hydrated = BracifyLib._hydrated;
    function unescapeNodes(node) {
        if (node.nodeType === 3) { // Text node
            if (node.parentNode && ['SCRIPT', 'STYLE'].includes(node.parentNode.tagName)) return;
            if (hydrated.text.has(node)) return; // already unescaped by an earlier pass: never unescape twice
            if (node.nodeValue.indexOf('\\') !== -1) {
                const v = node.nodeValue.replace(UNESC, '$1');
                if (v !== node.nodeValue) { node.nodeValue = v; hydrated.text.add(node); }
            }
        } else if (node.nodeType === 1) { // Element node
            let done = hydrated.attrs.get(node);
            for (const attr of Array.from(node.attributes)) {
                if (attr.name.startsWith('on')) continue;
                if (done && done.has(attr.name)) continue;
                if (attr.value.indexOf('\\') !== -1) {
                    const v = attr.value.replace(UNESC, '$1');
                    if (v !== attr.value) {
                        node.setAttribute(attr.name, v);
                        if (!done) { done = new Set(); hydrated.attrs.set(node, done); }
                        done.add(attr.name);
                    }
                }
            }
            if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
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

    async function deleteHandle() {
        if (typeof window === 'undefined' || !window.indexedDB) return;
        return new Promise((resolve) => {
            const request = window.indexedDB.open('BracifyDB', 2);
            request.onerror = () => resolve();
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
            };
            request.onsuccess = (e) => {
                try {
                    const db = e.target.result;
                    const tx = db.transaction(['handles'], 'readwrite');
                    tx.objectStore('handles').delete('root');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                    tx.onabort = () => resolve();
                } catch (err) {
                    resolve();
                }
            };
        });
    }

    /**
     * Discards the cached project folder handle (IndexedDB + memory) and
     * shows the folder selection overlay again.
     */
    let resetGeneration = 0; // bumped on reset so a pending restore can abort
    BracifyLib.resetRootAccess = async function () {
        resetGeneration++;
        await deleteHandle();
        BracifyLib.rootHandle = null;
        const btn = document.getElementById('bracify-disconnect-btn');
        if (btn) btn.remove();
        const old = document.getElementById('bracify-init-overlay');
        if (old) old.remove();
        showInitOverlay();
    };

    // Small "Disconnect Folder" button (local file:// mode with a connected folder only)
    function ensureDisconnectButton() {
        if (location.protocol !== 'file:' || !BracifyLib.rootHandle) return;
        if (document.getElementById('bracify-disconnect-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'bracify-disconnect-btn';
        btn.type = 'button';
        btn.textContent = 'Disconnect Folder';
        btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999998;padding:4px 10px;' +
            'font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#86868b;' +
            'background:rgba(255,255,255,0.85);border:1px solid rgba(0,0,0,0.1);border-radius:12px;cursor:pointer;opacity:0.6;';
        btn.onclick = () => BracifyLib.resetRootAccess();
        document.body.appendChild(btn);
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

    // Last navigation wins: a newer navigate() (or a popstate that keeps the rendered page) invalidates the older one
    let navGeneration = 0;
    let navController = null;
    let navCommitted = false; // the in-flight navigation has already swapped the DOM (past the point of no return)
    function cancelNavigation() {
        navGeneration++;
        if (navController) {
            navController.abort();
            navController = null;
        }
    }

    BracifyLib.navigate = async function (path, push = true) {
        if (!BracifyLib.rootHandle && location.protocol === 'file:') {
            window.location.assign(path);
            return;
        }

        cancelNavigation();
        navCommitted = false;
        const token = navGeneration;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        navController = controller;
        const isStale = () => token !== navGeneration;

        try {
            await runNavigation(path, push, controller, isStale);
        } catch (e) {
            // An aborted (superseded) navigation ends quietly
            if (isStale() || (e && e.name === 'AbortError')) return;
            throw e;
        } finally {
            if (navController === controller) navController = null;
        }
    };

    async function runNavigation(path, push, controller, isStale) {
        // 1. Fetch Page
        const cleanPath = path.split('?')[0].split('#')[0];
        let html = '';
        if (BracifyLib.rootHandle) {
            const h = await BracifyLib.resolvePathHandle(BracifyLib.rootHandle, cleanPath);
            if (isStale()) return;
            html = await BracifyLib.readFileContent(h);
        } else {
            // Must use FULL path including query for SSR to work on server
            const res = await (controller ? fetch(path, { signal: controller.signal }) : fetch(path));
            if (isStale()) return;
            if (res.ok) html = await res.text();
        }
        if (isStale()) return;

        if (!html) {
            console.error('[Bracify] Failed to load path:', path);
            return;
        }

        // 2. Parse
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Commit point: from here to pushState and `_renderedPath` there is no await, so nothing can interleave
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

        // The DOM now shows this URL: record it before the awaits below, so a failure or a Back during them cannot leave it stale
        BracifyLib._renderedPath = location.pathname + location.search;
        BracifyLib._renderedProjectPath = path.split('#')[0];
        navCommitted = true; // a popstate skip no longer cancels this navigation; only a newer navigate() does

        // Deep update window._sys from the new URL
        try {
            const url = new URL(path, 'http://bracify-internal.local');
            const newQuery = Object.fromEntries(url.searchParams);
            if (!window._sys) window._sys = { query: {}, params: {} };
            // Replace the query object entirely to ensure all observers see it
            window._sys.query = newQuery;
        } catch (e) { }

        window.scrollTo(0, 0);
        await initializeBracify({ requireScope: true, skipScriptHydration: true });
        if (isStale()) return;
        await hydrateScripts(document.body);
    }

    // The engine's own <script>: bracify.js (the single engine URL, Issue #55) or the legacy engine.js / engine.cjs.
    // Matched on the last path segment, so mybracify.js.map or not-engine.js are page scripts.
    function isEngineScriptUrl(src) {
        const last = String(src || '').split(/[?#]/)[0].split('/').pop();
        return last === 'bracify.js' || last === 'engine.js' || last === 'engine.cjs';
    }

    function syncHead(newDoc) {
        // 1. Title
        if (newDoc.title) document.title = newDoc.title;

        // 2. Head Manifest
        const currentHead = document.head;
        const newHead = newDoc.head;

        const getKey = (el) => {
            if (el.tagName === 'META') {
                const named = el.getAttribute('name') || el.getAttribute('property');
                if (named) return named;
                if (el.hasAttribute('charset')) return 'meta:charset'; // singleton
                // http-equiv is matched ASCII case-insensitively (HTML spec)
                if (el.hasAttribute('http-equiv')) return 'meta:http-equiv:' + el.getAttribute('http-equiv').toLowerCase();
                // Other metas (e.g. itemprop) have no identity: match only an identical element
                return 'meta:html:' + el.outerHTML;
            }
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
            if (el.tagName === 'SCRIPT' && el.src && isEngineScriptUrl(el.src)) return; // Keep engine
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
            if (el.tagName === 'SCRIPT' && el.src && isEngineScriptUrl(el.src)) return; // Skip engine

            const key = getKey(el);
            if (key) {
                // Same key as getKey, so a same-name data-t-source link is updated in place, never duplicated
                const existing = Array.from(currentHead.querySelectorAll('meta, link'))
                    .find(e => e.tagName === el.tagName && getKey(e) === key);
                if (existing) {
                    // Update attributes if changed
                    Array.from(el.attributes).forEach(attr => {
                        existing.setAttribute(attr.name, attr.value);
                        const done = BracifyLib._hydrated.attrs.get(existing);
                        if (done) done.delete(attr.name); // fresh (still escaped) value: the next unescape pass must handle it
                    });
                    return;
                }
            }

            // New item
            const clone = document.importNode(el, true);
            currentHead.appendChild(clone);
        });
    }

    const CLASSIC_SCRIPT_TYPES = ['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'];

    // Known limitation: a page script inside a data-t-list template runs at parse plus once per cloned row (CSR).
    // `target` is a container element (all its scripts) or an array of <script> elements.
    async function hydrateScripts(target) {
        const scripts = Array.isArray(target) ? target : Array.from(target.querySelectorAll('script'));
        for (const oldScript of scripts) {
            // Skip engine script
            if (oldScript.src && isEngineScriptUrl(oldScript.src)) continue;

            // Only executable scripts are re-created; data blocks (application/json, text/template, ...) stay untouched
            const type = (oldScript.getAttribute('type') || '').split(';')[0].trim().toLowerCase();
            const isModule = type === 'module';
            if (!isModule && type !== '' && !CLASSIC_SCRIPT_TYPES.includes(type)) continue;

            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            if (isModule) {
                // Modules are already scoped, and import/export cannot live inside a function: keep the text as is
                newScript.textContent = oldScript.textContent;
            } else if (oldScript.innerHTML) {
                // IIFE Wrapping for scope isolation
                newScript.innerHTML = `(function(){\n${oldScript.innerHTML}\n})();`;
            }

            // Replace to trigger execution
            oldScript.parentNode.replaceChild(newScript, oldScript);
        }
    }

    BracifyLib.initializeBracify = initializeBracify;

    // file:// + rootHandle: navigate() reads project-relative paths from the folder handle, but the initial history
    // entry has no state and a filesystem location. Give it { path } (project-relative, like navigate's pushState)
    // so Back to it re-renders. The folder's position inside the location is discovered by probing the handle with
    // every suffix of the URL path, longest first (a failed lookup stops at the first missing directory).
    async function seedInitialHistoryState(rootHandle) {
        if (!rootHandle) return;
        const st = history.state;
        if (st && (typeof st !== 'object' || Array.isArray(st) || st.path)) return; // foreign non-object state / already set
        const href = location.href;
        const segs = location.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
        for (let i = 0; i < segs.length; i++) {
            const rel = segs.slice(i).join('/');
            const h = await BracifyLib.resolvePathHandle(rootHandle, rel);
            if (h && h.kind === 'file') {
                // Still the untouched initial entry? (a quick navigate() may have pushed its own state meanwhile)
                const cur = history.state;
                if (location.href !== href || (cur && (typeof cur !== 'object' || Array.isArray(cur) || cur.path))) return;
                const path = rel + location.search;
                // Merge into an existing plain-object state (re-read, a page script may have changed it) instead of replacing it
                try { history.replaceState({ ...(cur || {}), path }, ''); } catch (e) { return; }
                BracifyLib._renderedProjectPath = path;
                return;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        BracifyLib._renderedPath = location.pathname + location.search; // path+search currently rendered (hash excluded)
        let forceReset = false;
        if (location.protocol === 'file:') {
            try {
                const url = new URL(location.href);
                if (url.searchParams.get('bracify_reset') === '1') {
                    forceReset = true;
                    await deleteHandle();
                    url.searchParams.delete('bracify_reset');
                    try { history.replaceState(history.state, '', url.pathname + url.search + url.hash); } catch (e) { }
                    if (window._sys && window._sys.query) delete window._sys.query.bracify_reset;
                }
            } catch (e) { }
        }

        const gen = resetGeneration;
        if (location.protocol === 'file:' && !forceReset) {
            try {
                const saved = await loadHandle();
                if (saved && await verifyPermission(saved) && gen === resetGeneration) {
                    BracifyLib.rootHandle = saved;
                }
            } catch (e) { }
        }

        if (gen !== resetGeneration) {
            // resetRootAccess() ran while restoring: it already showed the overlay
        } else if (location.protocol === 'file:' && !BracifyLib.rootHandle) {
            showInitOverlay();
        } else {
            if (location.protocol === 'file:') seedInitialHistoryState(BracifyLib.rootHandle).catch(() => { });
            initializeBracify();
        }

        // --- SPA Link Interception ---
        document.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            const link = e.target.closest('a');
            if (!link) return;
            if (link.hasAttribute('download')) return;
            if ((link.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('external')) return;

            const href = link.getAttribute('href');
            const target = link.getAttribute('target');

            if (!href) return;
            const cleanPath = href.split('?')[0].split('#')[0];

            // Conditions for SPA transition
            if (!href.startsWith('http') && !href.startsWith('#') && target !== '_blank' && cleanPath.endsWith('.html')) {
                e.preventDefault();
                BracifyLib.navigate(href);
            }
        });

        // --- SPA Form Interception (GET) ---
        document.addEventListener('submit', (e) => {
            const form = e.target.closest('form');
            if (!form || form.method.toUpperCase() !== 'GET') return;

            const action = form.getAttribute('action') || (typeof window !== 'undefined' ? window.location.pathname : '/');
            const target = form.getAttribute('target');

            const cleanAction = action.split('?')[0].split('#')[0];
            if (!action.startsWith('http') && target !== '_blank' && cleanAction.endsWith('.html')) {
                e.preventDefault();
                // Serialize form data to query string
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const [key, value] of formData.entries()) {
                    if (value) params.append(key, value);
                }
                const qs = params.toString();
                const separator = action.includes('?') ? '&' : '?';
                const href = action + (qs ? separator + qs : '');
                BracifyLib.navigate(href);
            }
        });

        // --- History Support ---
        // Entries without state.path (the initial entry, browser-made or foreign pushState entries) follow the URL.
        window.addEventListener('popstate', (e) => {
            let target = e.state && e.state.path;
            if (!target) {
                // file:// paths are filesystem paths, not project-relative: only a foreign state-less entry is left
                // here (the initial entry gets state.path in seedInitialHistoryState), so there is nothing to render.
                if (location.protocol === 'file:') return;
                target = location.pathname + location.search;
            }
            if (BracifyLib.rootHandle && location.protocol === 'file:' && e.state && e.state.path) {
                // The URL is a filesystem location and can collide with another project file: state.path is authoritative
                if (target.split('#')[0] === BracifyLib._renderedProjectPath) {
                    if (!navCommitted) cancelNavigation();
                    return;
                }
                BracifyLib.navigate(target, false);
                return;
            }
            // A hash-only history change keeps the rendered page
            try {
                const u = new URL(target, location.href);
                if (u.pathname + u.search === BracifyLib._renderedPath) {
                    if (!navCommitted) cancelNavigation(); // the user went back to the rendered page: an in-flight navigation must not land later
                    return;
                }
            } catch (err) { /* unparsable target: let navigate handle it */ }
            BracifyLib.navigate(target, false);
        });

    });
}
if (typeof module !== 'undefined' && module.exports) module.exports = BracifyLib;
