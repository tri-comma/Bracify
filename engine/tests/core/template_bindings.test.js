/**
 * Issue #13 - Data binding & placeholders, URL parameter binding, pipes and forms.
 * Every scenario runs through BOTH engines (SSR renderer and CSR bootstrap).
 *
 * Note on `data-t-bind`: the issue checklist mentions it, but it exists neither in the
 * README spec nor in the code. The documented way to bind a whole object to a form is
 * `data-t-scope` + name-based auto binding, which is what the "forms" tests cover.
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, cleanupAll } from './helpers.cjs';

afterEach(cleanupAll);

for (const mode of ['ssr', 'csr']) {
    describe(`[${mode.toUpperCase()}] placeholders, escaping and attribute binding`, () => {
        const head = '<link data-t-source="item" href="_sys/data/item.json">';

        test('{variable} text expansion with nested paths and numbers', async () => {
            const doc = await render(mode, '<p id="p">{item.name} / {item.meta.code} / {item.qty}</p>', {
                head, sources: { item: { name: 'Pen', meta: { code: 'A-1' }, qty: 3 } }
            });
            assert.strictEqual(doc.querySelector('#p').textContent, 'Pen / A-1 / 3');
        });

        test('HTML in data is escaped (no element injection)', async () => {
            const doc = await render(mode, '<p id="p">{item.html}</p>', {
                head, sources: { item: { html: '<script>alert(1)</script><b>x</b>' } }
            });
            const p = doc.querySelector('#p');
            assert.strictEqual(p.children.length, 0, 'no child elements may be created from data');
            assert.strictEqual(p.textContent, '<script>alert(1)</script><b>x</b>');
        });

        test('quotes in data cannot break out of an attribute', async () => {
            const payload = '"><img id="pwn" src=x onerror=alert(1)>';
            const doc = await render(mode, '<div id="d" title="{item.t}">x</div>', { head, sources: { item: { t: payload } } });
            assert.strictEqual(doc.querySelector('#pwn'), null);
            assert.strictEqual(doc.querySelector('#d').getAttribute('title'), payload);
        });

        test('missing field of a loaded source renders empty (null too); an unloaded root keeps the placeholder', async () => {
            const doc = await render(mode, '<p id="a">[{item.ghost}]</p><p id="b">[{item.nul}]</p><p id="c">[{nosuch.x}]</p>', {
                head, sources: { item: { nul: null } }
            });
            assert.strictEqual(doc.querySelector('#a').textContent, '[]');
            assert.strictEqual(doc.querySelector('#b').textContent, '[]');
            assert.strictEqual(doc.querySelector('#c').textContent, '[{nosuch.x}]');
        });

        test('backslash-escaped placeholders are not evaluated', async () => {
            const doc = await render(mode, '<code id="c">\\{item.name}</code>', { head, sources: { item: { name: 'X' } } });
            assert.ok(doc.querySelector('#c').textContent.includes('{item.name}'));
            assert.ok(!doc.querySelector('#c').textContent.includes('X'));
        });

        test('placeholders are not expanded inside <script>, <style> and on* handlers', async () => {
            const doc = await render(mode,
                '<script id="s">var a = "{item.name}";</script><style id="st">.a{content:"{item.name}"}</style>'
                + '<button id="b" onclick="x(\'{item.name}\')" data-id="{item.name}">b</button>',
                { head, sources: { item: { name: 'X' } } });
            assert.ok(doc.querySelector('#s').textContent.includes('{item.name}'));
            assert.ok(doc.querySelector('#st').textContent.includes('{item.name}'));
            assert.strictEqual(doc.querySelector('#b').getAttribute('onclick'), "x('{item.name}')");
            assert.strictEqual(doc.querySelector('#b').getAttribute('data-id'), 'X');
        });

        test('attribute binding: href, src, class, value, style and mixed static text', async () => {
            const doc = await render(mode,
                '<a id="a" href="/post/{item.id}" class="btn {item.cat}">l</a><img id="i" src="{item.img}" alt="{item.name}">'
                + '<div id="d" style="width: {item.pct}%"></div><input id="v" type="text" value="{item.name}">',
                { head, sources: { item: { id: 42, cat: 'primary', img: '/img/a.png', name: 'Pen', pct: 80 } } });
            assert.strictEqual(doc.querySelector('#a').getAttribute('href'), '/post/42');
            assert.strictEqual(doc.querySelector('#a').getAttribute('class'), 'btn primary');
            assert.strictEqual(doc.querySelector('#i').getAttribute('src'), '/img/a.png');
            assert.strictEqual(doc.querySelector('#i').getAttribute('alt'), 'Pen');
            assert.strictEqual(doc.querySelector('#d').getAttribute('style'), 'width: 80%');
            assert.strictEqual(doc.querySelector('#v').getAttribute('value'), 'Pen');
        });

        test('javascript: URLs in href/src are neutralised', async () => {
            const doc = await render(mode, '<a id="a" href="{item.u}">l</a><img id="i" src="{item.u}">', {
                head, sources: { item: { u: 'javascript:alert(1)' } }
            });
            assert.strictEqual(doc.querySelector('#a').getAttribute('href'), 'about:blank');
            assert.strictEqual(doc.querySelector('#i').getAttribute('src'), 'about:blank');
        });

        test('arithmetic inside placeholders', async () => {
            const doc = await render(mode, '<p id="p">{item.price * 2 + 1}</p>', { head, sources: { item: { price: 10 } } });
            assert.strictEqual(doc.querySelector('#p').textContent, '21');
        });
    });

    describe(`[${mode.toUpperCase()}] _sys.query / {?} URL parameter binding`, () => {
        test('{_sys.query.x} in text and attributes', async () => {
            const doc = await render(mode, '<p id="p">Hello {_sys.query.name}</p><a id="a" href="/s?q={_sys.query.q}">s</a>', {
                query: { name: 'Taro', q: 'web' }
            });
            assert.strictEqual(doc.querySelector('#p').textContent, 'Hello Taro');
            assert.strictEqual(doc.querySelector('#a').getAttribute('href'), '/s?q=web');
        });

        test('URL-decoded values are inserted and HTML-escaped', async () => {
            const doc = await render(mode, '<p id="p">{_sys.query.q}</p>', { query: { q: '<b>bold</b> & more' } });
            assert.strictEqual(doc.querySelector('#p').children.length, 0);
            assert.strictEqual(doc.querySelector('#p').textContent, '<b>bold</b> & more');
        });

        test('an absent parameter renders empty (_sys is loaded, same as the piped form)', async () => {
            const doc = await render(mode, '<p id="p">{_sys.query.nothing}</p>');
            assert.strictEqual(doc.querySelector('#p').textContent, '');
        });

        test('arithmetic on a query parameter (pagination link)', async () => {
            const doc = await render(mode, '<a id="n" href="?_offset={_sys.query._offset + 10}">next</a>', { query: { _offset: '20' } });
            assert.strictEqual(doc.querySelector('#n').getAttribute('href'), '?_offset=30');
        });
    });

    describe(`[${mode.toUpperCase()}] pipes`, () => {
        const head = '<link data-t-source="a" href="_sys/data/a.json">';
        const base = { when: '2025-12-10T14:05:09', n: 1234567.891, name: 'bracify is simple', nil: null, zero: 0, flag: true, list: [1, 2] };
        const p = async (expr, extra = {}) => {
            const doc = await render(mode, `<p id="p">${expr}</p>`, { head, sources: { a: { ...base, ...extra } } });
            return doc.querySelector('#p').textContent;
        };

        test('date: default and custom formats', async () => {
            assert.strictEqual(await p('{a.when | date}'), '2025/12/10');
            assert.strictEqual(await p("{a.when | date: 'yyyy/mm/dd HH:MM'}"), '2025/12/10 14:05');
            assert.strictEqual(await p("{ a.when | date: 'yyyy-mm-dd HH:MM:SS' }"), '2025-12-10 14:05:09');
            assert.strictEqual(await p("{a.when | date: 'dd.mm.yyyy'}"), '10.12.2025');
        });

        test('date: empty value gives empty text, an unparsable date is passed through', async () => {
            assert.strictEqual(await p('[{a.nil | date}]'), '[]');
            assert.strictEqual(await p('[{a.name | date}]'), '[bracify is simple]');
        });

        test('number: thousands separators, zero and empty', async () => {
            assert.strictEqual(await p('{a.n | number}', { n: 1234567 }), '1,234,567');
            assert.strictEqual(await p('{a.zero | number}'), '0');
            assert.strictEqual(await p('{a.n | number}', { n: 999 }), '999');
            assert.strictEqual(await p('[{a.nil | number}]'), '[]');
        });

        test('pipe chaining is applied left to right', async () => {
            assert.strictEqual(await p('{a.name | truncate: 10 | uppercase}'), 'BRACIFY...');
            assert.strictEqual(await p('{a.name | uppercase | truncate: 10}'), 'BRACIFY...');
            assert.strictEqual(await p("{a.nil | default: 'none' | uppercase}"), 'NONE');
            assert.strictEqual(await p('{a.name | uppercase | lowercase | truncate: 6}'), 'bra...');
        });

        test('chaining with arithmetic, and quoted arguments containing separators', async () => {
            assert.strictEqual(await p('{a.n * 2 | number}', { n: 1000 }), '2,000');
            assert.strictEqual(await p("{a.flag | ternary: 'a|b', 'c:d'}"), 'a|b');
            assert.strictEqual(await p("{a.zero | ternary: 'yes', 'no'}"), 'no');
        });

        test('unknown pipe names are ignored (value passes through)', async () => {
            assert.strictEqual(await p('{a.name | doesnotexist}'), 'bracify is simple');
            assert.strictEqual(await p('{a.name | doesnotexist | uppercase}'), 'BRACIFY IS SIMPLE');
        });

        test('a missing property on a loaded source renders empty (or the default)', async () => {
            assert.strictEqual(await p('[{a.ghost | uppercase}]'), '[]');
            assert.strictEqual(await p("{a.ghost | default: 'x'}"), 'x');
        });

        test('pipes on a source that is not loaded keep the placeholder for a later pass', async () => {
            const doc = await render(mode, '<p id="p">{zzz.v | uppercase}</p>');
            assert.strictEqual(doc.querySelector('#p').textContent, '{zzz.v | uppercase}');
        });

        test('json pipe serialises values; piped output is still HTML-escaped', async () => {
            assert.strictEqual(JSON.parse(await p('{a.list | json}')).length, 2);
            const doc = await render(mode, '<p id="p">{a.name | uppercase}</p>', { head, sources: { a: { name: '<i>x</i>' } } });
            assert.strictEqual(doc.querySelector('#p').children.length, 0);
            assert.strictEqual(doc.querySelector('#p').textContent, '<I>X</I>');
        });
    });

    describe(`[${mode.toUpperCase()}] forms: auto binding by name attribute`, () => {
        const head = '<link data-t-source="article" href="_sys/data/article.json">';
        const sources = { article: { title: 'Hello', content: 'Body text', kind: 'news', pub: true, draft: false, level: 'b' } };

        test('inputs inside data-t-scope get their value from the scope object', async () => {
            const doc = await render(mode,
                '<form data-t-scope="article"><input id="t" type="text" name="title"><textarea id="c" name="content"></textarea></form>',
                { head, sources });
            assert.strictEqual(doc.querySelector('#t').value, 'Hello');
            assert.strictEqual(doc.querySelector('#c').value, 'Body text');
        });

        test('select: the matching option is selected', async () => {
            const doc = await render(mode,
                '<div data-t-scope="article"><select id="s" name="kind"><option value="blog">Blog</option><option value="news">News</option></select></div>',
                { head, sources });
            assert.deepStrictEqual([...doc.querySelectorAll('#s option')].map(o => o.hasAttribute('selected')), [false, true]);
        });

        test('checkbox follows truthiness, radio follows value equality', async () => {
            const doc = await render(mode,
                '<div data-t-scope="article"><input id="a" type="checkbox" name="pub"><input id="b" type="checkbox" name="draft">'
                + '<input id="r1" type="radio" name="level" value="a"><input id="r2" type="radio" name="level" value="b"></div>',
                { head, sources });
            assert.strictEqual(doc.querySelector('#a').checked, true);
            assert.strictEqual(doc.querySelector('#b').checked, false);
            assert.strictEqual(doc.querySelector('#r1').checked, false);
            assert.strictEqual(doc.querySelector('#r2').checked, true);
        });

        test('URL query parameters fill a search form inside a scope', async () => {
            const doc = await render(mode, '<form data-t-scope="article"><input id="q" type="text" name="q"></form>', {
                head, sources, query: { q: 'Web' }
            });
            assert.strictEqual(doc.querySelector('#q').value, 'Web');
        });

        test('scope data wins over a URL parameter with the same name', async () => {
            const doc = await render(mode, '<form data-t-scope="article"><input id="t" type="text" name="title"></form>', {
                head, sources, query: { title: 'FromURL' }
            });
            assert.strictEqual(doc.querySelector('#t').value, 'Hello');
        });

        test('a field without matching data keeps its static value', async () => {
            const doc = await render(mode, '<form data-t-scope="article"><input id="x" type="text" name="nothing" value="keep"></form>', { head, sources });
            assert.strictEqual(doc.querySelector('#x').value, 'keep');
        });

        test('values are never parsed as HTML', async () => {
            const doc = await render(mode, '<form data-t-scope="a"><input id="t" name="t"><textarea id="x" name="x"></textarea></form>', {
                head: '<link data-t-source="a" href="_sys/data/a.json">',
                sources: { a: { t: '"><b id="pwn">', x: '</textarea><b id="pwn2">' } }
            });
            assert.strictEqual(doc.querySelector('#pwn'), null);
            assert.strictEqual(doc.querySelector('#pwn2'), null);
            assert.strictEqual(doc.querySelector('#t').value, '"><b id="pwn">');
            assert.strictEqual(doc.querySelector('#x').value, '</textarea><b id="pwn2">');
        });
    });
}

describe('data-t-bind (checklist item without a counterpart in spec/code)', () => {
    test('is neither documented in README.md nor implemented in engine.cjs', () => {
        const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
        const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8');
        const engine = fs.readFileSync(path.join(root, 'engine', 'lib', 'engine.cjs'), 'utf-8');
        assert.ok(!readme.includes('data-t-bind'));
        assert.ok(!engine.includes('data-t-bind'));
    });
});
