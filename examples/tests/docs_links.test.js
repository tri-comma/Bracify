/**
 * Documentation links: every relative Markdown link in the READMEs, docs/ and CONTRIBUTING.md
 * points to an existing file, and a #fragment into a .md file matches a heading (GitHub-style slug).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function walkMd(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return walkMd(p);
        return e.name.endsWith('.md') ? [p] : [];
    });
}

function targetFiles() {
    const top = fs.readdirSync(ROOT).filter((n) => /^README(\..+)?\.md$/.test(n)).map((n) => path.join(ROOT, n));
    const extra = ['examples/README.md', 'CONTRIBUTING.md'].map((n) => path.join(ROOT, n)).filter((p) => fs.existsSync(p));
    return [...top, ...walkMd(path.join(ROOT, 'docs')), ...extra];
}

/** Blank out fenced code blocks (keeps line structure) so their content is never parsed. */
function stripFences(src) {
    let fence = null;
    return src.split(/\r?\n/).map((line) => {
        const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (fence) {
            if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
            return '';
        }
        if (m) { fence = m[1]; return ''; }
        return line;
    }).join('\n');
}

/** GitHub-style heading slug: lowercase, drop punctuation except - and _, spaces to -, keep Unicode letters/digits. */
function slug(heading) {
    return heading
        .replace(/`/g, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[*~]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
        .replace(/\s/g, '-');
}

const slugCache = new Map();
function slugsOf(file) {
    if (slugCache.has(file)) return slugCache.get(file);
    const seen = new Map();
    const out = new Set();
    for (const line of stripFences(fs.readFileSync(file, 'utf8')).split('\n')) {
        const m = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
        if (!m) continue;
        const base = slug(m[1]);
        const n = seen.get(base) || 0;
        seen.set(base, n + 1);
        out.add(n === 0 ? base : `${base}-${n}`);
    }
    slugCache.set(file, out);
    return out;
}

function linksOf(file) {
    const text = stripFences(fs.readFileSync(file, 'utf8')).replace(/(`+)[^`\n]*?\1/g, '');
    const links = [];
    const re = /\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
    let m;
    while ((m = re.exec(text))) links.push(m[1]);
    return links;
}

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

function check(file, href) {
    if (/^(https?:|mailto:)/i.test(href)) return null;
    const hash = href.indexOf('#');
    const rawPath = hash === -1 ? href : href.slice(0, hash);
    const fragment = hash === -1 ? '' : decode(href.slice(hash + 1));
    const target = rawPath === ''
        ? file
        : rawPath.startsWith('/') ? path.join(ROOT, decode(rawPath)) : path.resolve(path.dirname(file), decode(rawPath));
    if (!fs.existsSync(target)) return `target does not exist: ${href}`;
    if (fragment && fs.statSync(target).isFile() && target.endsWith('.md') && !slugsOf(target).has(fragment.toLowerCase())) {
        return `no heading for #${fragment} in ${path.relative(ROOT, target)}: ${href}`;
    }
    return null;
}

describe('documentation links', () => {
    const files = targetFiles();

    test('the checked file set is not empty', () => {
        assert.ok(files.length >= 8, `found only ${files.length} Markdown files`);
    });

    for (const file of files) {
        test(path.relative(ROOT, file).replace(/\\/g, '/'), () => {
            const problems = linksOf(file).map((h) => check(file, h)).filter(Boolean);
            assert.deepStrictEqual(problems, []);
        });
    }
});
