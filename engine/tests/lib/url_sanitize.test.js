import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

// Issue #31: sanitizeUrl() bypasses (control chars inside scheme, data:image/svg+xml)
// and URL-bearing attributes outside URL_ATTRIBUTES.
// sanitizeUrl is private to the factory (not exported), so everything is tested
// through the engine via a data-bound attribute (same code path SSR uses).

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const { Engine } = Bracify;
const engine = new Engine({});

const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel', 'about'];

// Mimic the browser URL parser: strip leading C0/space, remove TAB/LF/CR anywhere.
function browserNormalize(v) {
    return String(v).replace(/^[\u0000- ]+/, '').replace(/[\t\n\r]/g, '');
}
// True if a browser would treat the value as a non-executing URL.
function isSafeUrl(v) {
    if (v === null || v === undefined || v === '') return true;
    const n = browserNormalize(v);
    const m = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(n);
    if (!m) return true; // relative / protocol-relative
    return SAFE_SCHEMES.includes(m[1].toLowerCase());
}

async function render(html, data) {
    const root = document.createElement('div');
    root.innerHTML = html;
    await engine.processElement(root, data);
    return root;
}
async function attrOf(html, selector, attr, data) {
    const root = await render(html, data);
    const el = root.querySelector(selector);
    assert.ok(el, `element ${selector} should exist`);
    return el.getAttribute(attr);
}
function srcsetUrls(v) {
    return String(v || '').split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
}

const BYPASSES = {
    'tab in scheme': 'java\tscript:alert(1)',
    'LF in scheme': 'jav\nascript:alert(1)',
    'CR in scheme': 'java\rscript:alert(1)',
    'leading x01': '\x01javascript:alert(1)',
    'leading x00': '\x00javascript:alert(1)',
    'space + x1f': ' \x1fjavascript:alert(1)',
    'mixed case': 'JaVaScRiPt:alert(1)',
    'tab+nl+cr mixed': 'j\ta\nv\ra\tscript:alert(1)',
    'leading tab + inner tab': '\tjava\tscript:alert(1)',
    'vbscript': 'vbscript:msgbox(1)',
    'vbscript with tab': 'vb\tscript:msgbox(1)',
    'data:text/html': 'data:text/html,<script>alert(1)</script>',
    'data:text/html with tab': 'da\tta:text/html,<script>alert(1)</script>',
    'data:image/svg+xml': 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    'data:image/svg+xml base64': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:application/xhtml+xml': 'data:application/xhtml+xml,<script xmlns="http://www.w3.org/1999/xhtml">alert(1)</script>',
    'nul inside scheme': 'java\u0000script:alert(1)',
};

test('Security: URL sanitization (#31)', async (t) => {

    await t.test('href: bypass vectors are neutralised', async (t2) => {
        for (const [name, payload] of Object.entries(BYPASSES)) {
            await t2.test(name, async () => {
                const v = await attrOf('<a href="{u}">x</a>', 'a', 'href', { u: payload });
                assert.ok(isSafeUrl(v), `href kept executable URL: ${JSON.stringify(v)}`);
            });
        }
    });

    await t.test('src/action/formaction: bypass vectors are neutralised', async (t2) => {
        const cases = [
            ['<img src="{u}">', 'img', 'src'],
            ['<iframe src="{u}"></iframe>', 'iframe', 'src'],
            ['<form action="{u}"></form>', 'form', 'action'],
            ['<form><button formaction="{u}">b</button></form>', 'button', 'formaction'],
        ];
        for (const [html, sel, attr] of cases) {
            for (const key of ['tab in scheme', 'leading x01', 'data:image/svg+xml']) {
                await t2.test(`${sel}[${attr}] ${key}`, async () => {
                    const v = await attrOf(html, sel, attr, { u: BYPASSES[key] });
                    assert.ok(isSafeUrl(v), `${attr} kept executable URL: ${JSON.stringify(v)}`);
                });
            }
        }
    });

    await t.test('HTML entity form (javascript&colon;) is inert: setAttribute does not decode entities', async () => {
        const v = await attrOf('<a href="{u}">x</a>', 'a', 'href', { u: 'javascript&colon;alert(1)' });
        // Stays a literal relative URL; browser would not see a javascript: scheme.
        assert.ok(isSafeUrl(v));
    });

    await t.test('Additional URL-bearing attributes', async (t2) => {
        const direct = [
            ['<object data="{u}"></object>', 'object', 'data'],
            ['<video poster="{u}"></video>', 'video', 'poster'],
            ['<embed src="{u}">', 'embed', 'src'],
            ['<base href="{u}">', 'base', 'href'],
            ['<blockquote cite="{u}">q</blockquote>', 'blockquote', 'cite'],
            ['<table background="{u}"></table>', 'table', 'background'],
            ['<a ping="{u}" href="/x">x</a>', 'a', 'ping'],
            ['<form formaction="{u}"><button>b</button></form>', 'form', 'formaction'],
        ];
        for (const [html, sel, attr] of direct) {
            for (const key of ['tab in scheme', 'data:text/html']) {
                await t2.test(`${sel}[${attr}] ${key}`, async () => {
                    const v = await attrOf(html, sel, attr, { u: BYPASSES[key] });
                    assert.ok(isSafeUrl(v), `${attr} kept executable URL: ${JSON.stringify(v)}`);
                });
            }
            await t2.test(`${sel}[${attr}] plain javascript:`, async () => {
                const v = await attrOf(html, sel, attr, { u: 'javascript:alert(1)' });
                assert.ok(isSafeUrl(v), `${attr} kept executable URL: ${JSON.stringify(v)}`);
            });
        }

        for (const [name, payload] of [['javascript', 'javascript:alert(1)'], ['tab', BYPASSES['tab in scheme']]]) {
            await t2.test(`svg <a xlink:href> ${name}`, async () => {
                const root = await render('<svg><a xlink:href="{u}"><text>x</text></a></svg>', { u: payload });
                const a = root.querySelector('a');
                const vals = Array.from(a.attributes).filter(x => /href$/i.test(x.name)).map(x => x.value);
                assert.ok(vals.length > 0, 'xlink:href attribute should still exist or be inspected');
                for (const v of vals) assert.ok(isSafeUrl(v), `xlink:href kept executable URL: ${JSON.stringify(v)}`);
            });
        }

        await t2.test('img srcset: javascript candidate', async () => {
            const v = await attrOf('<img srcset="{u} 1x, /ok.png 2x">', 'img', 'srcset', { u: 'javascript:alert(1)' });
            for (const u of srcsetUrls(v)) assert.ok(isSafeUrl(u), `srcset candidate unsafe: ${JSON.stringify(u)}`);
        });
        await t2.test('img srcset: tab-obfuscated second candidate', async () => {
            const v = await attrOf('<img srcset="/a.png 1x, {u} 2x">', 'img', 'srcset', { u: 'java\tscript:alert(1)' });
            for (const u of srcsetUrls(v)) assert.ok(isSafeUrl(u), `srcset candidate unsafe: ${JSON.stringify(u)}`);
        });

        await t2.test('iframe srcdoc: bound HTML must not carry markup', async () => {
            const v = await attrOf('<iframe srcdoc="{u}"></iframe>', 'iframe', 'srcdoc', { u: '<script>alert(1)</script>' });
            assert.ok(v === null || v === '' || !v.includes('<'), `srcdoc kept raw markup: ${JSON.stringify(v)}`);
        });

        for (const [name, payload] of [['javascript', 'javascript:alert(1)'], ['tab', 'java\tscript:alert(1)']]) {
            await t2.test(`meta refresh content="0;url={x}" ${name}`, async () => {
                const v = await attrOf('<meta http-equiv="refresh" content="0;url={u}">', 'meta', 'content', { u: payload });
                const m = /url\s*=\s*['"]?(.*)$/i.exec(v || '');
                assert.ok(!m || isSafeUrl(m[1]), `meta refresh kept: ${JSON.stringify(v)}`);
            });
        }
    });

    await t.test('Regression guards: legitimate URLs are preserved', async (t2) => {
        const keep = [
            'http://example.com/a?b=1&c=2',
            'https://example.com/path#frag',
            'HTTPS://EXAMPLE.COM/',
            'mailto:user@example.com?subject=hi',
            'tel:+81-3-1234-5678',
            '/abs/path',
            'rel/path.html',
            'x.html',
            './x',
            '../x',
            '?a=1',
            '#frag',
            '//cdn.example.com/x.js',
            '/a:b',
            '?t=10:00',
            'path/with:colon',
            '/redirect?to=http://example.com',
            '/x?q=javascript:alert(1)',
        ];
        for (const u of keep) {
            await t2.test(`keeps ${JSON.stringify(u)}`, async () => {
                const v = await attrOf('<a href="{u}">x</a>', 'a', 'href', { u });
                assert.strictEqual(v, u);
            });
        }
        await t2.test('placeholders inside a larger URL', async () => {
            const v = await attrOf('<a href="/items?id={id}&q={q}#top">x</a>', 'a', 'href', { id: 5, q: 'ab' });
            assert.strictEqual(v, '/items?id=5&q=ab#top');
        });
        await t2.test('placeholder in path with later colon', async () => {
            const v = await attrOf('<a href="/t/{id}?at=10:00">x</a>', 'a', 'href', { id: 7 });
            assert.strictEqual(v, '/t/7?at=10:00');
        });
        await t2.test('img src http(s) and relative', async () => {
            assert.strictEqual(await attrOf('<img src="{u}">', 'img', 'src', { u: 'https://e.com/a.png' }), 'https://e.com/a.png');
            assert.strictEqual(await attrOf('<img src="{u}">', 'img', 'src', { u: 'img/a.png' }), 'img/a.png');
        });
        await t2.test('img srcset legit candidates preserved', async () => {
            const v = await attrOf('<img srcset="{a} 1x, {b} 2x">', 'img', 'srcset', { a: '/a.png', b: 'https://e.com/b.png' });
            assert.strictEqual(v, '/a.png 1x, https://e.com/b.png 2x');
        });
        await t2.test('meta refresh legit url preserved', async () => {
            const v = await attrOf('<meta http-equiv="refresh" content="0;url={u}">', 'meta', 'content', { u: '/next' });
            assert.strictEqual(v, '0;url=/next');
        });
        await t2.test('non-URL attribute (title) is untouched', async () => {
            const v = await attrOf('<div title="{u}">x</div>', 'div', 'title', { u: 'javascript:is a word' });
            assert.strictEqual(v, 'javascript:is a word');
        });
    });
});

test('Security: URL sanitization extras (#31 review)', async (t) => {
    const refreshPayloads = [
        ['0;javascript:alert(1)', 'missing url='],
        ['0; URL = "javascript:alert(1)"', 'spaced + quoted'],
        ["0;URL='javascript:alert(1)'", 'single quoted uppercase'],
        ['0,url=javascript:alert(1)', 'comma separator'],
        ['0 url=java\tscript:alert(1)', 'space separator + tab'],
        ['0;;url=\x01javascript:alert(1)', 'double separator + control char'],
    ];
    for (const [content, name] of refreshPayloads) {
        await t.test('meta refresh ' + name, async () => {
            const v = await attrOf('<meta http-equiv="refresh" content="{c}">', 'meta', 'content', { c: content });
            assert.ok(!/javascript:/i.test(v.replace(/[\t\n\r\x00-\x1f]/g, '')), 'kept: ' + JSON.stringify(v));
        });
    }
    await t.test('meta refresh with bound http-equiv', async () => {
        const v = await attrOf('<meta http-equiv="{h}" content="0;{u}">', 'meta', 'content', { h: 'refresh', u: 'javascript:alert(1)' });
        assert.ok(!/javascript:/i.test(v), 'kept: ' + v);
    });
    await t.test('meta content of non-refresh meta untouched', async () => {
        assert.strictEqual(await attrOf('<meta name="description" content="{c}">', 'meta', 'content', { c: 'javascript:x' }), 'javascript:x');
    });

    for (const [tag, attr] of [['animate', 'to'], ['set', 'to'], ['animate', 'values'], ['animate', 'from'], ['animate', 'by']]) {
        await t.test('svg <' + tag + ' ' + attr + '> javascript', async () => {
            const html = '<svg><a><' + tag + ' attributeName="href" ' + attr + '="{u}"/><text>x</text></a></svg>';
            for (const u of ['javascript:alert(1)', 'java\tscript:alert(1)']) {
                const v = await attrOf(html, tag, attr, { u: 'a;' + u });
                assert.ok(v.split(';').every(isSafeUrl), 'kept: ' + JSON.stringify(v));
            }
        });
    }
    await t.test('svg <set> bound attributeName href is dropped', async () => {
        const root = await render('<svg><a><set attributeName="{n}" to="javascript:alert(1)"/></a></svg>', { n: 'href' });
        assert.strictEqual(root.querySelector('set').getAttribute('attributeName'), null);
    });
    await t.test('svg <animate> numeric values untouched', async () => {
        assert.strictEqual(await attrOf('<svg><circle><animate attributeName="r" values="{v}"/></circle></svg>', 'animate', 'values', { v: '1;5;10' }), '1;5;10');
    });
    await t.test('svg <use href> and <image href>', async () => {
        for (const tag of ['use', 'image']) {
            const v = await attrOf('<svg><' + tag + ' href="{u}"/></svg>', tag, 'href', { u: 'data:image/svg+xml,<svg onload=alert(1)>' });
            assert.ok(isSafeUrl(v), tag + ' kept: ' + v);
        }
    });
    await t.test('input formaction', async () => {
        const v = await attrOf('<form><input type="submit" formaction="{u}"></form>', 'input', 'formaction', { u: 'java\nscript:alert(1)' });
        assert.ok(isSafeUrl(v));
    });
    await t.test('srcset with comma inside a data: raster URL stays safe', async () => {
        const v = await attrOf('<img srcset="{u} 1x">', 'img', 'srcset', { u: 'data:image/png;base64,AAAA' });
        assert.strictEqual(v, 'data:image/png;base64,AAAA 1x');
        const bad = await attrOf('<img srcset="{u} 1x, /ok.png 2x">', 'img', 'srcset', { u: 'data:image/svg+xml;base64,AAAA' });
        assert.strictEqual(bad, '/ok.png 2x');
    });
    await t.test('srcset candidate without descriptor', async () => {
        const v = await attrOf('<img srcset="/a.png, {u}">', 'img', 'srcset', { u: 'javascript:alert(1)' });
        for (const u of srcsetUrls(v)) assert.ok(isSafeUrl(u), v);
    });
    await t.test('non-ASCII look-alike whitespace is a relative URL (browser agrees)', async () => {
        for (const u of ['\u00a0javascript:alert(1)', 'javascript\u2028:alert(1)', '\u200bjavascript:alert(1)', '/\javascript:alert(1)']) {
            const parsed = new URL(u, 'http://x.test/');
            assert.ok(parsed.protocol === 'http:', 'WHATWG treats as relative: ' + JSON.stringify(u));
        }
    });
    await t.test('serialized output re-parses to the same safe attribute', async () => {
        const root = await render('<a href="{u}">x</a>', { u: '/x?a="b"&c=<d>&javascript:' });
        const re = new JSDOM(root.innerHTML).window.document.querySelector('a');
        assert.strictEqual(re.getAttribute('href'), '/x?a="b"&c=<d>&javascript:');
        const root2 = await render('<a href="{u}">x</a>', { u: 'java\u0000script:alert(1)' });
        const re2 = new JSDOM(root2.innerHTML).window.document.querySelector('a');
        assert.ok(isSafeUrl(re2.getAttribute('href')));
    });
});
