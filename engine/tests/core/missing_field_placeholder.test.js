/**
 * Issue #49 - A placeholder whose ROOT key exists in the data (source loaded, scope or list item defined)
 * but whose later path segment (a field or a relation) is missing renders as an empty string, in text and in
 * attributes. It must never leak as `{book.author.name}` / `class="s-{book.status}"`.
 * A placeholder whose root is not in the data at all (not evaluated / not loaded) keeps its `{...}`.
 * Covered in SSR (renderer) and CSR (jsdom), through the same helpers.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, csr, cleanupAll, text } from './helpers.cjs';

const pending_cleanup = [];
afterEach(() => { cleanupAll(); while (pending_cleanup.length) pending_cleanup.pop()(); });

const link = (name, href) => `<link data-t-source="${name}" href="_sys/data/${href}">`;
const BOOK_HEAD = link('book', 'book.json') + link('authors', 'authors.json');
// Book 1 points at author 99, which was deleted (authors still has other records).
const SOURCES = {
    book: [{ id: 1, title: 'Atlas', author_id: 99, price: 10, zero: 0, no: false, nil: null }],
    authors: [{ id: 2, name: 'Bob' }]
};
const LIST_HEAD = link('books', 'books.json');
const LIST_SOURCES = { books: [{ id: 1, title: 'Atlas', status: 'new' }, { id: 2, title: 'Beacon' }] };

const MODES = ['ssr', 'csr'];
for (const mode of MODES) {
    const r = (body, o = {}) => render(mode, body, { head: BOOK_HEAD, sources: SOURCES, ...o });
    const t = (doc, sel) => text(doc.querySelector(sel));

    describe(`${mode.toUpperCase()}: missing field / relation placeholder (#49)`, () => {
        test('(1) deleted related record: text -> empty', async () => {
            const doc = await r('<p id="a">by [{book.author.name}]</p>');
            assert.strictEqual(t(doc, '#a'), 'by []');
        });
        test('(1) deleted related record: href attribute -> empty', async () => {
            const doc = await r('<a id="l" href="author.html?id={book.author.id}">x</a>');
            assert.strictEqual(doc.querySelector('#l').getAttribute('href'), 'author.html?id=');
        });
        test('(1) relation source not loaded at all (book has author_id) -> empty', async () => {
            const doc = await render(mode, '<p id="a">by [{book.author.name}]</p>', { head: link('book', 'book.json'), sources: { book: SOURCES.book } });
            assert.strictEqual(t(doc, '#a'), 'by []');
        });
        test('(2) missing field on an existing record: attribute -> "s-"', async () => {
            const doc = await r('<div id="c" class="s-{book.status}">x</div>');
            assert.strictEqual(doc.querySelector('#c').getAttribute('class'), 's-');
        });
        test('(2) missing field on an existing record: text -> empty', async () => {
            const doc = await r('<p id="a">[{book.subtitle}]</p>');
            assert.strictEqual(t(doc, '#a'), '[]');
        });
        test('(3) data-t-list item missing a field -> empty (text and attribute)', async () => {
            const doc = await render(mode, '<ul><li data-t-list="books" class="s-{books.status}">[{books.status}]</li></ul>', { head: LIST_HEAD, sources: LIST_SOURCES });
            const lis = [...doc.querySelectorAll('li')];
            assert.deepStrictEqual(lis.map(li => li.textContent), ['[new]', '[]']);
            assert.deepStrictEqual(lis.map(li => li.getAttribute('class')), ['s-new', 's-']);
        });
        test('(4) root not in data keeps the literal placeholder', async () => {
            const doc = await r('<p id="a">[{nosuch.x}]</p><a id="l" title="t-{nosuch.x}">z</a>');
            assert.strictEqual(t(doc, '#a'), '[{nosuch.x}]');
            assert.strictEqual(doc.querySelector('#l').getAttribute('title'), 't-{nosuch.x}');
        });
        test('(5) escaped braces stay literal', async () => {
            const doc = await r('<p id="a">\\{book.title}</p><a id="l" title="\\{book.title}">z</a>');
            // SSR keeps the escaping backslash for the client to remove on hydration; CSR has already removed it
            const lit = (s) => s.replace(/^\\/, '');
            assert.strictEqual(lit(t(doc, '#a')), '{book.title}');
            assert.strictEqual(lit(doc.querySelector('#l').getAttribute('title')), '{book.title}');
        });
        test('(6) present values: 0 -> "0", false -> "false", null -> ""', async () => {
            const doc = await r('<p id="z">[{book.zero}]</p><p id="f">[{book.no}]</p><p id="n">[{book.nil}]</p>');
            assert.strictEqual(t(doc, '#z'), '[0]');
            assert.strictEqual(t(doc, '#f'), '[false]');
            assert.strictEqual(t(doc, '#n'), '[]');
        });
        test('(7) data-t-if on a missing field is falsy', async () => {
            const doc = await r('<p id="a" data-t-if="book.status">has</p><p id="b" data-t-if="!book.status">none</p><p id="c" data-t-if="book.author.name">rel</p>');
            assert.strictEqual(doc.querySelector('#a'), null);
            assert.strictEqual(t(doc, '#b'), 'none');
            assert.strictEqual(doc.querySelector('#c'), null);
        });
        test('(8) absent URL param in an attribute -> empty ({?x} and {_sys.query.x})', async () => {
            const doc = await r('<a id="a" href="p.html?q={?x}">a</a><a id="b" href="p.html?q={_sys.query.x}">b</a><p id="c" title="[{?x}]">c</p>');
            assert.strictEqual(doc.querySelector('#a').getAttribute('href'), 'p.html?q=');
            assert.strictEqual(doc.querySelector('#b').getAttribute('href'), 'p.html?q=');
            assert.strictEqual(doc.querySelector('#c').getAttribute('title'), '[]');
        });
        test('(9) href / src becoming empty does not break the sanitizer', async () => {
            const doc = await r('<a id="a" href="{book.nolink}">a</a><img id="i" src="{book.noimg}"><p id="p">ok</p>');
            assert.strictEqual(doc.querySelector('#a').getAttribute('href') || '', '');
            assert.strictEqual(doc.querySelector('#i').getAttribute('src') || '', '');
            assert.strictEqual(t(doc, '#p'), 'ok');
        });
        test('(10) scope on a missing relation renders inner placeholders empty', async () => {
            const doc = await r('<div data-t-scope="book.author"><p id="a">[{name}]</p><i id="b" class="c-{name}">x</i></div>');
            assert.strictEqual(t(doc, '#a'), '[]');
            assert.strictEqual(doc.querySelector('#b').getAttribute('class'), 'c-');
        });
        test('(11) falsy scope values count as defined', async () => {
            for (const v of [0, '', false, null]) {
                const doc = await render(mode, '<div data-t-scope="v"><p id="a">[{name}]</p></div>', { head: link('v', 'v.json'), sources: { v: { id: 1, x: v } } });
                assert.strictEqual(t(doc, '#a'), '[]');
            }
            const doc = await render(mode, '<div data-t-scope="book.zero"><p id="a">[{name}]</p></div>', { head: BOOK_HEAD, sources: SOURCES });
            assert.strictEqual(t(doc, '#a'), '[]');
        });
        test('(12) scope with an unknown root keeps inner placeholders literal', async () => {
            const doc = await r('<div data-t-scope="nope"><p id="a">[{name}]</p></div>');
            assert.strictEqual(t(doc, '#a'), '[{name}]');
        });
        test('(13) SSR/CSR parity: unknown scope does not change form auto-binding', async () => {
            const doc = await render(mode, '<form data-t-scope="nope"><input id="t" name="site.title"></form>', { head: link('site', 'site.json'), sources: { site: { title: 'GLOBAL' } } });
            // An unknown scope still counts as "in scope" for auto-binding (global data binds in SSR and CSR alike)
            assert.strictEqual(doc.querySelector('#t').getAttribute('value'), 'GLOBAL');
        });
    });
}

describe('missing field placeholder: SSR output re-booted in CSR (hydration, #49)', () => {
    test('blanked values stay blank and escapes are not double-unescaped', async () => {
        const body = '<p id="a">[{book.subtitle}]</p><a id="l" href="p.html?q={?x}" title="t-{book.status}">z</a><p id="e">\{keep}</p><p id="s">{book.title}</p>';
        const sources = { book: [{ id: 1, title: 'A \{x\} b' }] };
        const opts = { head: link('book', 'book.json'), sources };
        const ssrDoc = await render('ssr', body, opts);
        const html = '<!DOCTYPE html>' + ssrDoc.documentElement.outerHTML;
        const files = { '_sys/data/book.json': sources.book };
        const c = await csr(html, { url: 'http://localhost/page.html', files });
        pending_cleanup.push(c.cleanup);
        const d = c.document;
        assert.strictEqual(text(d.querySelector('#a')), '[]');
        assert.strictEqual(d.querySelector('#l').getAttribute('href'), 'p.html?q=');
        assert.strictEqual(d.querySelector('#l').getAttribute('title'), 't-');
        assert.strictEqual(text(d.querySelector('#e')), '{keep}');
        assert.strictEqual(text(d.querySelector('#s')), 'A {x} b');
    });
});
