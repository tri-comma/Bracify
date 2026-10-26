/**
 * Issue #13 - Template engine attributes:
 * data-t-include / data-t-list / data-t-if / data-t-scope.
 *
 * Every scenario runs through BOTH engines (see helpers.cjs#render):
 *   - SSR: server/renderer.cjs (jsdom) on top of lib/engine.cjs
 *   - CSR: lib/engine.cjs bootstrapped via initializeBracify() in a jsdom window
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanupAll } from './helpers.cjs';

afterEach(cleanupAll);

for (const mode of ['ssr', 'csr']) {
    describe(`[${mode.toUpperCase()}] data-t-include`, () => {
        test('snippet mode: replaces the children of the tag, keeps the tag, drops the attribute', async () => {
            const doc = await render(mode, '<header data-t-include="_parts/header.html">OLD</header><p>after</p>', {
                files: { '_parts/header.html': '<nav id="nav">Menu</nav>' }
            });
            const header = doc.querySelector('header');
            assert.ok(header, 'host element must be preserved');
            assert.ok(!header.hasAttribute('data-t-include'));
            assert.strictEqual(header.querySelector('#nav').textContent, 'Menu');
            assert.ok(!header.textContent.includes('OLD'));
            assert.strictEqual(doc.querySelector('p').textContent, 'after');
        });

        test('snippet mode: placeholders inside the included file are resolved', async () => {
            const doc = await render(mode, '<div data-t-include="_parts/greet.html"></div>', {
                head: '<link data-t-source="user" href="_sys/data/user.json">',
                sources: { user: { name: 'Hanako' } },
                files: { '_parts/greet.html': '<span id="g">Hi {user.name}</span>' }
            });
            assert.strictEqual(doc.querySelector('#g').textContent, 'Hi Hanako');
        });

        test('snippet mode: a missing include file leaves the existing content untouched', async () => {
            const doc = await render(mode, '<footer data-t-include="_parts/nope.html"><i>fallback</i></footer>');
            assert.strictEqual(doc.querySelector('footer i').textContent, 'fallback');
        });

        test('snippet mode: the include path may contain a placeholder', async () => {
            const doc = await render(mode, '<div data-t-include="_parts/{_sys.query.part}.html"></div>', {
                query: { part: 'foot' },
                files: { '_parts/foot.html': '<b id="f">foot</b>' }
            });
            assert.strictEqual(doc.querySelector('#f').textContent, 'foot');
        });

        const layout = '<div class="container"><h1 data-t-content="page-title">Default title</h1>'
            + '<main data-t-content="main-body"></main><aside data-t-content="side">Default side</aside></div>';

        test('layout mode: named data-t-content slots are filled with the page content', async () => {
            const doc = await render(mode,
                '<span data-t-content="page-title">My profile</span><div data-t-content="main-body"><p id="p">Body</p></div>',
                { bodyAttrs: 'data-t-include="_parts/layout.html"', files: { '_parts/layout.html': layout } });
            assert.strictEqual(doc.querySelector('h1').textContent, 'My profile');
            assert.strictEqual(doc.querySelector('main #p').textContent, 'Body');
            assert.ok(doc.querySelector('.container'), 'layout wrapper must be present');
        });

        test('layout mode: slots without matching page content keep the layout default', async () => {
            const doc = await render(mode,
                '<span data-t-content="page-title">Only title</span>',
                { bodyAttrs: 'data-t-include="_parts/layout.html"', files: { '_parts/layout.html': layout } });
            assert.strictEqual(doc.querySelector('h1').textContent, 'Only title');
            assert.strictEqual(doc.querySelector('aside').textContent, 'Default side');
        });

        test('layout mode: an unnamed slot receives the whole page content (default slot)', async () => {
            const doc = await render(mode, '<p id="x">whole page</p>', {
                bodyAttrs: 'data-t-include="_parts/def.html"',
                files: { '_parts/def.html': '<section data-t-content>placeholder</section>' }
            });
            assert.strictEqual(doc.querySelector('section #x').textContent, 'whole page');
            assert.ok(!doc.body.textContent.includes('placeholder'));
        });

        test('layout mode: bindings in the page content inside a slot are resolved', async () => {
            const doc = await render(mode,
                '<div data-t-content="main-body"><p id="p">{user.name}</p></div>',
                {
                    head: '<link data-t-source="user" href="_sys/data/user.json">',
                    sources: { user: { name: 'Taro' } },
                    bodyAttrs: 'data-t-include="_parts/layout.html"',
                    files: { '_parts/layout.html': layout }
                });
            assert.strictEqual(doc.querySelector('main #p').textContent, 'Taro');
        });
    });

    describe(`[${mode.toUpperCase()}] data-t-list`, () => {
        const head = '<link data-t-source="articles" href="_sys/data/articles.json">';

        test('expands one clone per array element, in order', async () => {
            const doc = await render(mode, '<ul><li data-t-list="articles">{articles.title}</li></ul>', {
                head, sources: { articles: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }
            });
            const items = [...doc.querySelectorAll('ul > li')].map(li => li.textContent);
            assert.deepStrictEqual(items, ['A', 'B', 'C']);
            assert.strictEqual(doc.querySelectorAll('[data-t-list]').length, 0);
        });

        test('empty array renders no items, removes the template element and keeps siblings', async () => {
            const doc = await render(mode, '<ul id="l"><li data-t-list="articles">{articles.title}</li></ul><p id="after">x</p>', {
                head, sources: { articles: [] }
            });
            assert.strictEqual(doc.querySelectorAll('#l li').length, 0);
            assert.ok(doc.querySelector('#after'));
        });

        test('missing / non-array source removes the template element (no leftover placeholders)', async () => {
            const doc = await render(mode, '<ul id="l"><li data-t-list="ghost">{ghost.title}</li></ul>');
            assert.strictEqual(doc.querySelectorAll('#l li').length, 0);
            assert.ok(!doc.body.textContent.includes('{ghost'));
        });

        test('_index is 0-based and usable with arithmetic', async () => {
            const doc = await render(mode, '<ol><li data-t-list="articles">No.{articles._index + 1} {articles.title}</li></ol>', {
                head, sources: { articles: [{ title: 'A' }, { title: 'B' }] }
            });
            assert.deepStrictEqual([...doc.querySelectorAll('li')].map(li => li.textContent), ['No.1 A', 'No.2 B']);
        });

        test('_length reports the item count', async () => {
            const doc = await render(mode, '<p id="n">{articles._length} items</p>', {
                head, sources: { articles: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }
            });
            assert.strictEqual(doc.querySelector('#n').textContent, '3 items');
        });

        test('item attributes are bound per element', async () => {
            const doc = await render(mode, '<a data-t-list="articles" href="/post/{articles.id}" class="btn {articles.cat}">{articles.title}</a>', {
                head, sources: { articles: [{ id: 1, cat: 'x', title: 'A' }, { id: 2, cat: 'y', title: 'B' }] }
            });
            const links = [...doc.querySelectorAll('a')];
            assert.deepStrictEqual(links.map(a => a.getAttribute('href')), ['/post/1', '/post/2']);
            assert.deepStrictEqual(links.map(a => a.className), ['btn x', 'btn y']);
        });

        test('data-t-if inside a list item is evaluated per item', async () => {
            const doc = await render(mode, '<ul><li data-t-list="articles">{articles.title}<b data-t-if="articles.hot">!</b></li></ul>', {
                head, sources: { articles: [{ title: 'A', hot: true }, { title: 'B', hot: false }] }
            });
            assert.deepStrictEqual([...doc.querySelectorAll('li')].map(li => li.textContent), ['A!', 'B']);
        });

        test('nested lists iterate the inner array of every outer item', async () => {
            const doc = await render(mode,
                '<div data-t-list="cats"><h2>{cats.name}</h2><span data-t-list="cats.tags">{cats.tags.label}</span></div>',
                {
                    head: '<link data-t-source="cats" href="_sys/data/cats.json">',
                    sources: { cats: [{ name: 'N1', tags: [{ label: 'a' }, { label: 'b' }] }, { name: 'N2', tags: [{ label: 'c' }] }] }
                });
            const blocks = [...doc.querySelectorAll('div')];
            assert.strictEqual(blocks.length, 2);
            assert.deepStrictEqual(blocks.map(b => [...b.querySelectorAll('span')].map(s => s.textContent)), [['a', 'b'], ['c']]);
        });
    });

    describe(`[${mode.toUpperCase()}] data-t-if`, () => {
        const head = '<link data-t-source="user" href="_sys/data/user.json">';
        const has = (doc, id) => !!doc.getElementById(id);

        test('truthy values render; false/0/""/null/[]/{} remove the element', async () => {
            const keys = { t: 'yes', n: 'num', f: 'no', z: 'zero', e: 'empty', nl: 'nul', ar: 'arr', ob: 'obj' };
            const body = Object.entries(keys).map(([id, key]) => `<i id="${id}" data-t-if="user.${key}">x</i>`).join('');
            const doc = await render(mode, body, {
                head, sources: { user: { yes: true, num: 5, no: false, zero: 0, empty: '', nul: null, arr: [], obj: {} } }
            });
            assert.ok(has(doc, 't') && has(doc, 'n'));
            for (const id of ['f', 'z', 'e', 'nl', 'ar', 'ob']) assert.ok(!has(doc, id), `#${id} should be removed`);
        });

        test('existence check: a missing property removes the element, a non-empty string keeps it', async () => {
            const doc = await render(mode, '<i id="a" data-t-if="user.name">x</i><i id="b" data-t-if="user.ghost">y</i>', {
                head, sources: { user: { name: 'Taro' } }
            });
            assert.ok(has(doc, 'a'));
            assert.ok(!has(doc, 'b'));
        });

        test('negation with "!" inverts the check (including for missing values)', async () => {
            const doc = await render(mode,
                '<i id="in" data-t-if="user.login">in</i><i id="out" data-t-if="!user.login">out</i><i id="m" data-t-if="!user.missing">m</i>',
                { head, sources: { user: { login: false } } });
            assert.ok(!has(doc, 'in'));
            assert.ok(has(doc, 'out'));
            assert.ok(has(doc, 'm'));
        });

        test('children of a removed element are not rendered', async () => {
            const doc = await render(mode, '<div data-t-if="user.login"><b id="c">{user.name}</b></div>', {
                head, sources: { user: { login: false, name: 'Taro' } }
            });
            assert.ok(!has(doc, 'c'));
            assert.ok(!doc.body.textContent.includes('Taro'));
        });

        test('comparison / AND / OR / variable operands', async () => {
            const doc = await render(mode, [
                '<i id="eq" data-t-if="user.status=published">1</i>',
                '<i id="ne" data-t-if="user.status:ne=published">2</i>',
                '<i id="and" data-t-if="user.price:gte=1000 user.stock:gt=0">3</i>',
                '<i id="and2" data-t-if="user.price:gte=1000 user.stock:gt=5">4</i>',
                '<i id="or" data-t-if="user.role=admin,editor">5</i>',
                '<i id="var" data-t-if="user.id={user.owner}">6</i>'
            ].join(''), {
                head, sources: { user: { status: 'published', price: 1500, stock: 3, role: 'editor', id: 7, owner: 7 } }
            });
            assert.deepStrictEqual(
                ['eq', 'ne', 'and', 'and2', 'or', 'var'].filter(id => has(doc, id)),
                ['eq', 'and', 'or', 'var']);
        });

        test('can be driven by a URL parameter (present)', async () => {
            const doc = await render(mode, '<i id="s" data-t-if="_sys.query.debug">debug</i><i id="h" data-t-if="!_sys.query.debug">normal</i>', { query: { debug: '1' } });
            assert.ok(has(doc, 's') && !has(doc, 'h'));
        });

        test('can be driven by a URL parameter (absent)', async () => {
            const doc = await render(mode, '<i id="s" data-t-if="_sys.query.debug">debug</i><i id="h" data-t-if="!_sys.query.debug">normal</i>');
            assert.ok(!has(doc, 's') && has(doc, 'h'));
        });

        test('SSR strips the data-t-if attribute from kept elements', async () => {
            const doc = await render(mode, '<i id="a" data-t-if="user.ok">x</i>', { head, sources: { user: { ok: true } } });
            assert.ok(has(doc, 'a'));
            if (mode === 'ssr') assert.ok(!doc.getElementById('a').hasAttribute('data-t-if'));
        });
    });

    describe(`[${mode.toUpperCase()}] data-t-scope`, () => {
        const head = '<link data-t-source="article" href="_sys/data/article.json">'
            + '<link data-t-source="user" href="_sys/data/user.json">';
        const sources = {
            article: { title: 'T', author: { name: 'Ann', address: { city: 'Tokyo' } } },
            user: { name: 'Bob', city: 'Osaka' }
        };

        test('properties of the scope object resolve directly inside the element', async () => {
            const doc = await render(mode, '<div data-t-scope="article"><h1>{title}</h1></div>', { head, sources });
            assert.strictEqual(doc.querySelector('h1').textContent, 'T');
        });

        test('the full path still works inside a scope', async () => {
            const doc = await render(mode, '<div data-t-scope="article"><h1>{article.title}</h1></div>', { head, sources });
            assert.strictEqual(doc.querySelector('h1').textContent, 'T');
        });

        test('nested scopes: the inner scope wins, outer values stay reachable', async () => {
            const doc = await render(mode,
                '<div data-t-scope="article"><p id="o">{title}</p><section data-t-scope="article.author"><p id="i">{name}</p><p id="c">{address.city}</p><p id="t">{title}</p></section></div>',
                { head, sources });
            assert.strictEqual(doc.querySelector('#o').textContent, 'T');
            assert.strictEqual(doc.querySelector('#i').textContent, 'Ann');
            assert.strictEqual(doc.querySelector('#c').textContent, 'Tokyo');
            assert.strictEqual(doc.querySelector('#t').textContent, 'T');
        });

        test('a scope does not leak to sibling elements', async () => {
            const doc = await render(mode,
                '<div data-t-scope="user"><i id="a">{name}</i></div><div data-t-scope="article"><i id="b">{title}</i></div><p id="out">{name}</p>',
                { head, sources });
            assert.strictEqual(doc.querySelector('#a').textContent, 'Bob');
            assert.strictEqual(doc.querySelector('#b').textContent, 'T');
            assert.strictEqual(doc.querySelector('#out').textContent, '{name}');
        });

        test('a single-element array is treated as the object itself', async () => {
            const doc = await render(mode, '<div data-t-scope="rows"><i id="v">{v}</i></div>', {
                head: '<link data-t-source="rows" href="_sys/data/rows.json">', sources: { rows: [{ v: 'only' }] }
            });
            assert.strictEqual(doc.querySelector('#v').textContent, 'only');
        });

        test('an unknown scope key leaves inner placeholders untouched and does not throw', async () => {
            const doc = await render(mode, '<div data-t-scope="nothing"><i id="v">{x}</i></div>');
            assert.strictEqual(doc.querySelector('#v').textContent, '{x}');
        });
    });
}
