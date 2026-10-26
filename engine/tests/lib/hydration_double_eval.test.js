// Issue #37: SSR output must not let the browser engine re-evaluate (or un-escape)
// data-derived text/attribute values when it re-binds the DOM during hydration.
import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('../../lib/engine.cjs');
// Load the server renderer first (server-mode engine, no window globals yet).
const renderer = require('../../server/renderer.cjs');

// Literal the user stored: {site.name} {books._length} \{x\} \\ {
const TRICKY = '{site.name} {books._length} \\{x\\} \\\\ {';
const TRICKY2 = 'a } b \\ c {site.name}';

const TEMPLATE = `<!DOCTYPE html><html><head>
<link data-t-source="site" href="/_sys/data/site.json">
<link data-t-source="book" href="/_sys/data/book.json">
<link data-t-source="books" href="/_sys/data/books.json">
</head><body>
<p id="t">{book.summary}</p>
<input id="i" value="{book.summary}">
<a id="a" title="{book.summary}" href="/x">link</a>
<ul><li data-t-list="books" class="item"><span class="s">{books.summary}</span></li></ul>
<p id="site">{site.name}</p>
<p id="esc">\\{literal\\}</p>
<a id="aesc" title="\\{literal\\}">z</a>
<p id="plain">{book.title}</p>
</body></html>`;

function makeData(summary, extraBooks) {
    return {
        site: { name: 'SECRET' },
        book: { id: 900, title: 'Plain Title', summary },
        books: extraBooks || [{ id: 900, summary }, { id: 901, summary: 'no braces here' }],
    };
}

async function ssr(summary, extraBooks) {
    const src = makeData(summary, extraBooks);
    const data = { _sys: { query: {}, params: {} } };
    const html = await renderer.processHTML(TEMPLATE, data, async () => null, async (href) => {
        const name = href.split('/').pop().replace('.json', '');
        return JSON.parse(JSON.stringify(src[name]));
    }, null);
    return { html, data };
}

let dom;
// Resolves once the JSDOM document finished loading, so the engine auto-init (DOMContentLoaded) cannot fire a
// second, uncontrolled hydration pass on top of the single explicit initializeBracify() each test performs.
async function setupClient(html, ssrData) {
    dom = new JSDOM(html, { url: 'http://localhost/book.html?id=900' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    global.Node = dom.window.Node;
    global.DOMParser = dom.window.DOMParser;
    try {
        Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, enumerable: true, writable: true });
    } catch (e) { }
    // Same as the server's injected state script
    window._sys = { query: { id: '900' }, params: {} };
    window.__BRACIFY_DATA__ = JSON.parse(JSON.stringify(ssrData));
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    await new Promise(r => setTimeout(r, 0));
    delete require.cache[enginePath];
    return require('../../lib/engine.cjs');
}
function snapshot() {
    const d = document;
    return {
        text: d.getElementById('t').textContent,
        inputAttr: d.getElementById('i').getAttribute('value'),
        inputProp: d.getElementById('i').value,
        title: d.getElementById('a').getAttribute('title'),
        items: Array.from(d.querySelectorAll('.s')).map(e => e.textContent),
        site: d.getElementById('site').textContent,
        esc: d.getElementById('esc').textContent,
        aesc: d.getElementById('aesc').getAttribute('title'),
        plain: d.getElementById('plain').textContent,
    };
}
// What a browser sees for the SSR HTML itself (no engine run).
function ssrView(html) {
    const d = new JSDOM(html).window.document;
    return {
        text: d.getElementById('t').textContent,
        inputAttr: d.getElementById('i').getAttribute('value'),
        title: d.getElementById('a').getAttribute('title'),
    };
}

describe('Issue #37: SSR -> hydration must not re-evaluate data values', () => {
    after(() => {
        for (const k of ['window', 'document', 'location', 'Node', 'DOMParser']) delete global[k];
    });

    for (const [label, value] of [['tricky', TRICKY], ['lone-brace/backslash', TRICKY2], ['only {site.name}', '{site.name}']]) {
        test(`hydration keeps data literal (${label})`, async () => {
            const { html, data } = await ssr(value);
            const Bracify = await setupClient(html, data);
            await Bracify.initializeBracify();
            const s = snapshot();
            assert.strictEqual(s.text, value, 'text');
            assert.strictEqual(s.inputAttr, value, 'input value attribute');
            assert.strictEqual(s.inputProp, value, 'input value property');
            assert.strictEqual(s.title, value, 'title attribute');
            assert.strictEqual(s.items[0], value, 'list item text');
            assert.ok(!s.text.includes('SECRET') && !s.title.includes('SECRET') && !s.inputAttr.includes('SECRET'), 'no leaked SECRET');
            // unaffected bindings
            assert.strictEqual(s.items[1], 'no braces here');
            assert.strictEqual(s.site, 'SECRET');
            assert.strictEqual(s.plain, 'Plain Title');
        });
    }

    test('SSR HTML text and post-hydration text agree on the literal value', async () => {
        const { html, data } = await ssr(TRICKY);
        const raw = ssrView(html);
        assert.ok(!raw.text.includes('SECRET'));
        const Bracify = await setupClient(html, data);
        await Bracify.initializeBracify();
        const s = snapshot();
        assert.strictEqual(s.text, TRICKY);
        // The SSR text is either the literal itself or its single-escaped form (\{ \} \\), never anything else.
        const unescapeOnce = (v) => v.replace(/\\([{}\\])/g, '$1');
        assert.ok(raw.text === TRICKY || unescapeOnce(raw.text) === TRICKY,
            `SSR text ${JSON.stringify(raw.text)} must equal the literal or be its single-escaped form`);
    });

    test('CSR-only (local mode, no SSR) renders the same data literally', async () => {
        const Bracify = await setupClient(TEMPLATE, makeData(TRICKY));
        await Bracify.initializeBracify();
        const s = snapshot();
        assert.strictEqual(s.text, TRICKY, 'text (CSR)');
        assert.strictEqual(s.inputAttr, TRICKY, 'input value attr (CSR)');
        assert.strictEqual(s.title, TRICKY, 'title (CSR)');
        assert.strictEqual(s.items[0], TRICKY, 'list item (CSR)');
        assert.strictEqual(s.site, 'SECRET');
    });

    test('SSR page hydrated equals CSR-only render (no SSR/CSR divergence)', async () => {
        const { html, data } = await ssr(TRICKY);
        let Bracify = await setupClient(html, data);
        await Bracify.initializeBracify();
        const a = snapshot();
        Bracify = await setupClient(TEMPLATE, makeData(TRICKY));
        await Bracify.initializeBracify();
        const b = snapshot();
        assert.deepStrictEqual(a, b);
    });

    describe('other paths (head, query values, repeat init, SPA navigate)', () => {
        const PAGE = `<!DOCTYPE html><html><head>
<link data-t-source="site" href="/_sys/data/site.json">
<link data-t-source="book" href="/_sys/data/book.json?id={?q}">
<title>{book.summary}</title><meta name="description" content="{book.summary}">
</head><body>
<p id="t">{book.summary}</p><p id="q">{?q}</p><a id="l" href="/p?q={?q}">l</a>
</body></html>`;
        async function ssrPage(summary, query) {
            const src = { site: { name: 'SECRET' }, book: { id: 1, summary } };
            const data = { _sys: { query, params: {} } };
            const html = await renderer.processHTML(PAGE, data, async () => null,
                async (href) => JSON.parse(JSON.stringify(src[href.split('?')[0].split('/').pop().replace('.json', '')])), null);
            return { html, data };
        }
        const headOf = () => ({
            title: document.title,
            meta: document.querySelector('meta[name=description]').getAttribute('content'),
            link: document.querySelector('link[data-t-source=book]').getAttribute('href'),
        });

        test('<head> (title/meta) data values are unescaped too, and a {?query} value stays literal', async () => {
            const { html, data } = await ssrPage(TRICKY, { q: '{site.name}' });
            const Bracify = await setupClient(html, data);
            window._sys = { query: { q: '{site.name}' }, params: {} };
            await Bracify.initializeBracify();
            assert.strictEqual(document.title, TRICKY);
            assert.strictEqual(headOf().meta, TRICKY);
            assert.strictEqual(document.getElementById('q').textContent, '{site.name}');
            assert.strictEqual(document.getElementById('l').getAttribute('href'), '/p?q={site.name}');
        });

        test('a second initializeBracify() on the already-unescaped DOM neither re-evaluates nor re-unescapes', async () => {
            for (const mode of ['ssr', 'csr']) {
                let Bracify;
                // CSR: the book source href is filtered by ?id=, so keep that query value matching the record (id 1).
                const q = mode === 'ssr' ? '{site.name}' : '1';
                if (mode === 'ssr') {
                    const { html, data } = await ssrPage(TRICKY, { q: '{site.name}' });
                    Bracify = await setupClient(html, data);
                } else {
                    Bracify = await setupClient(PAGE, { site: { name: 'SECRET' }, book: { id: 1, summary: TRICKY } });
                }
                window._sys = { query: { q }, params: {} };
                await Bracify.initializeBracify();
                await Bracify.initializeBracify();
                await Bracify.initializeBracify();
                assert.strictEqual(document.getElementById('t').textContent, TRICKY, mode + ' text');
                assert.strictEqual(document.getElementById('q').textContent, q, mode + ' query');
                if (mode === 'ssr') assert.strictEqual(document.title, TRICKY, 'title'); // the client never binds <head>
                assert.ok(!document.documentElement.outerHTML.includes('SECRET'), mode + ' leaked SECRET');
            }
        });

        test('SPA navigate() to an SSR page keeps data literal (fresh HTML, single unescape)', async () => {
            const first = await ssrPage('first', { q: 'a' });
            const Bracify = await setupClient(first.html, first.data);
            window._sys = { query: { q: 'a' }, params: {} };
            await Bracify.initializeBracify();
            const second = await ssrPage(TRICKY, { q: '{site.name}' });
            global.history = dom.window.history;
            global.fetch = async () => ({ ok: true, text: async () => second.html });
            window.scrollTo = () => { };
            window.__BRACIFY_DATA__ = JSON.parse(JSON.stringify(second.data));
            await Bracify.navigate('/book.html?q=%7Bsite.name%7D');
            assert.strictEqual(document.getElementById('t').textContent, TRICKY);
            assert.strictEqual(document.getElementById('q').textContent, '{site.name}');
            assert.strictEqual(document.title, TRICKY);
            assert.strictEqual(headOf().meta, TRICKY);
            assert.ok(!document.documentElement.outerHTML.includes('SECRET'));
            delete global.history; delete global.fetch;
        });
    });

    describe('regression guards', () => {
        test('template-author \\{literal\\} renders as {literal} after SSR+hydration', async () => {
            const { html, data } = await ssr('plain value');
            const Bracify = await setupClient(html, data);
            await Bracify.initializeBracify();
            const s = snapshot();
            assert.strictEqual(s.esc, '{literal}');
            assert.strictEqual(s.aesc, '{literal}');
        });

        test('template-author \\{literal\\} renders as {literal} in CSR-only', async () => {
            const Bracify = await setupClient(TEMPLATE, makeData('plain value'));
            await Bracify.initializeBracify();
            const s = snapshot();
            assert.strictEqual(s.esc, '{literal}');
            assert.strictEqual(s.aesc, '{literal}');
        });

        test('normal placeholders and brace-free data bind unchanged through SSR+hydration', async () => {
            const { html, data } = await ssr('just text', [{ id: 1, summary: 'one' }, { id: 2, summary: 'two' }]);
            const raw = ssrView(html);
            assert.strictEqual(raw.text, 'just text');
            assert.strictEqual(raw.inputAttr, 'just text');
            assert.strictEqual(raw.title, 'just text');
            const Bracify = await setupClient(html, data);
            await Bracify.initializeBracify();
            const s = snapshot();
            assert.strictEqual(s.text, 'just text');
            assert.strictEqual(s.inputAttr, 'just text');
            assert.strictEqual(s.title, 'just text');
            assert.deepStrictEqual(s.items, ['one', 'two']);
            assert.strictEqual(s.site, 'SECRET');
            assert.strictEqual(s.plain, 'Plain Title');
        });

        test('SSR itself does not evaluate data (#4 behaviour kept)', async () => {
            const { html } = await ssr(TRICKY);
            assert.ok(!ssrView(html).text.includes('SECRET'));
            assert.ok(!ssrView(html).inputAttr.includes('SECRET'));
        });
    });
});
