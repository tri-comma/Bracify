/**
 * Server execution environment: `node engine/start.cjs <app> <port>` (SSR + Data API + SQLite)
 * driven over real HTTP against a temp copy of examples/bracify-books.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const h = require('./helpers.cjs');

let appDir;
let server;
const url = (p) => server.base + '/' + p.replace(/^\//, '');

async function get(p, opts = {}) {
    const res = await fetch(url(p), { redirect: 'manual', ...opts });
    return { status: res.status, headers: res.headers, text: await res.text() };
}
async function page(p) {
    const r = await get(p);
    assert.strictEqual(r.status, 200, `GET ${p} -> ${r.status}`);
    return new JSDOM(r.text).window.document;
}
// SSR escapes bound data (\{ \} \\) and the client engine unescapes it once at the end of hydration;
// apply the same step so assertions compare what the user sees.
const unescape = (s) => s.replace(/\\([\\{}])/g, '$1');
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const facts = (doc) => Array.from(doc.querySelector('dl.facts').children).map(text).join(' ');
const texts = (doc, sel) => Array.from(doc.querySelectorAll(sel)).map(text);
const titles = (doc) => texts(doc, 'tbody tr td:nth-child(2) a');

/** POST a form like a browser would: take the rendered <form>, apply field values, submit urlencoded. */
async function submitForm(doc, formSel, values = {}, headers = {}) {
    const form = doc.querySelector(formSel);
    assert.ok(form, `form ${formSel} not found`);
    for (const [name, value] of Object.entries(values)) {
        const fields = form.querySelectorAll(`[name="${name}"]`);
        assert.ok(fields.length, `field ${name} not found`);
        for (const f of fields) {
            if (f.type === 'radio') f.checked = f.value === value;
            else if (f.type === 'checkbox') f.checked = !!value;
            else f.value = value;
        }
    }
    const params = new URLSearchParams();
    for (const [k, v] of new doc.defaultView.FormData(form).entries()) params.append(k, v);
    const res = await fetch(url(form.getAttribute('action')), {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
        body: params.toString()
    });
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}
/** Follow a redirect target of a form POST (always root-relative in this app). */
const follow = (r) => page(r.location);

describe('Bracify Books: server mode (SSR + SQLite over HTTP)', () => {
    before(async () => {
        appDir = h.makeAppCopy();
        server = await h.startServer(appDir);
    });
    after(async () => {
        await server.stop();
        await h.removeDir(appDir);
    });

    describe('rendering', () => {
        test('every page renders (200) without leftover placeholders', async () => {
            const pages = ['index.html', 'books.html', 'book.html?id=1', 'book-new.html', 'book-edit.html?id=1', 'authors.html',
                'author.html?id=1', 'author-new.html', 'author-edit.html?id=1', 'about.html', 'pipes.html', '/'];
            for (const p of pages) {
                const r = await get(p);
                assert.strictEqual(r.status, 200, p);
                const body = new JSDOM(r.text).window.document;
                body.querySelectorAll('pre, script, style').forEach(e => e.remove());
                // Remove comments, then look for any {placeholder}. (about.html shows an *escaped* one on purpose.)
                const visible = body.body.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\\\{[^}]*\\\}/g, '');
                assert.ok(!/\{[?A-Za-z_][^{}]*\}/.test(visible), `${p} still contains a placeholder: ${(visible.match(/\{[?A-Za-z_][^{}]*\}/) || [])[0]}`);
                const markup = r.text.replace(/<!--[\s\S]*?-->/g, '');
                assert.ok(!/data-t-(list|include|scope|if)=/.test(markup), `${p} still contains unprocessed template attributes`);
            }
        });

        test('includes: layout (data-t-content) + header/footer snippets, engine scripts and state injection', async () => {
            const r = await get('index.html');
            const doc = new JSDOM(r.text).window.document;
            assert.strictEqual(text(doc.querySelector('h1')), 'Dashboard');
            assert.ok(doc.querySelector('header.site-header a.brand'));
            assert.strictEqual(text(doc.querySelector('a.brand')), 'Bracify Books');
            assert.match(text(doc.querySelector('footer')), /© 2026 Bracify Examples/);
            assert.strictEqual(doc.querySelectorAll('[data-t-include]').length, 0, 'data-t-include attributes are consumed');
            assert.ok(doc.querySelector('script[src="/engine/engine.cjs"]'));
            assert.match(r.text, /window\.__BRACIFY_DATA__/);
            assert.match(r.text, /window\._sys/);
        });

        test('static assets and the engine are served; _parts/_sys are not', async () => {
            assert.strictEqual((await get('style.css')).status, 200);
            const eng = await get('engine/engine.cjs');
            assert.strictEqual(eng.status, 200);
            assert.match(eng.text, /Bracify Engine/);
            // The second (local mode) script path must NOT resolve in server mode, otherwise the engine would load twice.
            assert.strictEqual((await get('engine/lib/engine.cjs')).status, 404);
            for (const p of ['_parts/layout.html', '_parts/header.html', '_sys/data/books.json', '_sys/data.db', '_sys/data/site.json']) {
                assert.strictEqual((await get(p)).status, 403, p);
            }
        });

        test('dashboard: counts (_length), arithmetic, conditionals, relations, pipes', async () => {
            const doc = await page('index.html');
            assert.deepStrictEqual(texts(doc, '.stat b'), ['8', '4', '8', '20']);
            const banners = texts(doc, '.notice');
            assert.ok(banners.some(t => /Big library/.test(t)), 'books._length:gt=5');
            assert.ok(banners.some(t => /1 draft\(s\)/.test(t)), 'drafts._length truthy');
            assert.ok(!banners.some(t => /empty/.test(t)), '!books._length is false');
            assert.ok(!banners.some(t => /Welcome/.test(t)), 'no ?welcome');
            const latest = texts(doc, '.cards li');
            assert.strictEqual(latest.length, 3, '_limit=3');
            assert.match(latest[0], /No\. 1 Small Software by Ken Tanaka · Technology \$1,800\.00 2024\/04\/18/);
            assert.match(latest[1], /Plain HTML/);
            assert.match(latest[2], /Tides and Letters/);
            assert.deepStrictEqual(texts(doc, 'section:nth-of-type(3) li').map(t => t.replace(/ (Low stock|Sold out)/, '')),
                ["The Lighthouse Keeper's Atlas", 'Kitchen Physics', 'Plain HTML']);
            const featured = texts(doc, 'section:nth-of-type(3) li');
            assert.match(featured[0], /Low stock/, 'stock:lte=3 AND stock:gt=0');
            assert.match(featured[1], /Sold out/, 'stock=0');
            // top reviews: rating=5 filter, relation review.book.title, default pipe
            const reviews = texts(doc, 'section:nth-of-type(4) li');
            assert.strictEqual(reviews.length, 4);
            assert.match(reviews[0], /Carol on Small Software: Read it in one evening\./);
        });

        test('dashboard banners react to the query string', async () => {
            const doc = await page('index.html?welcome=1');
            assert.ok(texts(doc, '.notice').some(t => /Welcome/.test(t)));
        });
    });

    describe('books list: filters, sort, pagination', () => {
        test('default: 3 rows, total from the unpaged source, Next only', async () => {
            const doc = await page('books.html');
            assert.deepStrictEqual(titles(doc), ["The Lighthouse Keeper's Atlas", 'Kitchen Physics', 'Salt Roads']);
            assert.match(text(doc.querySelector('p.muted')), /Showing 3 of 8 book\(s\)/);
            const pager = texts(doc, '.pager a');
            assert.deepStrictEqual(pager, ['Next →']);
            assert.strictEqual(doc.querySelector('.pager a').getAttribute('href').startsWith('books.html?_offset=3&'), true);
        });

        test('rows: relation lookups, arithmetic and pipes', async () => {
            const doc = await page('books.html');
            const first = Array.from(doc.querySelectorAll('tbody tr')[0].querySelectorAll('td')).map(text);
            assert.strictEqual(first[0], '1');
            assert.match(first[1], /The Lighthouse Keeper's Atlas Featured/);
            assert.strictEqual(first[2], 'Hana Mori'); // author_id -> authors
            assert.strictEqual(first[3], 'Fiction'); // category_id -> categories
            assert.strictEqual(first[4], '2019');
            assert.strictEqual(first[5], '$1,500.00'); // currency: 'USD'
            assert.strictEqual(first[6], '1,650'); // price * 1.1 | number
            assert.strictEqual(first[7], '4,500'); // price * stock | number
            assert.strictEqual(first[8], 'In stock'); // ternary
            assert.strictEqual(text(doc.querySelectorAll('tbody tr')[1].querySelectorAll('td')[8]), 'Out of stock');
        });

        test('pagination walks all pages and the Next/Previous links work', async () => {
            const seen = [];
            let href = 'books.html';
            for (let i = 0; i < 5 && href; i++) {
                const doc = await page(href);
                seen.push(...titles(doc));
                const next = Array.from(doc.querySelectorAll('.pager a')).find(a => /Next/.test(a.textContent));
                href = next ? next.getAttribute('href') : null;
                if (i === 2) assert.ok(!next, 'last page has no Next');
            }
            assert.strictEqual(seen.length, 8);
            assert.strictEqual(new Set(seen).size, 8);
            const page2 = await page('books.html?_offset=3');
            assert.deepStrictEqual(texts(page2, '.pager a'), ['← Previous', 'Next →']);
            assert.match(text(page2.querySelector('p.muted')), /Showing 3 of 8 book\(s\) \(from #4\)/);
            assert.ok(page2.querySelector('.pager a').getAttribute('href').startsWith('books.html?_offset=0&'));
            const last = await page('books.html?_offset=6');
            assert.strictEqual(titles(last).length, 2);
            assert.deepStrictEqual(texts(last, '.pager a'), ['← Previous']);
        });

        test('filters: category (numeric field), status, author, exact title; combinable', async () => {
            assert.deepStrictEqual(titles(await page('books.html?category=1')).sort(), ["The Lighthouse Keeper's Atlas", 'Tides and Letters']);
            assert.deepStrictEqual(titles(await page('books.html?status=draft')), ['Unfinished Manuscript']);
            assert.deepStrictEqual(titles(await page('books.html?author=4&_sort=year')).length, 2);
            assert.deepStrictEqual(titles(await page('books.html?q=Salt%20Roads')), ['Salt Roads']);
            assert.deepStrictEqual(titles(await page('books.html?category=4&status=published&sort=year&order=asc')), ['Plain HTML', 'Small Software']);
            const none = await page('books.html?q=Nope');
            assert.deepStrictEqual(titles(none), []);
            assert.ok(texts(none, '.notice').some(t => /No books match/.test(t)), '!shelf._length');
            // empty parameters (as submitted by the search form) are ignored
            assert.strictEqual(titles(await page('books.html?q=&category=&status=')).length, 3);
        });

        test('sort / order controls', async () => {
            const byYearDesc = await page('books.html?sort=year&order=desc');
            assert.deepStrictEqual(titles(byYearDesc), ['Unfinished Manuscript', 'Small Software', 'Plain HTML']);
            const byTitle = await page('books.html?sort=title&order=asc');
            assert.deepStrictEqual(titles(byTitle), ['Kitchen Physics', 'Orbits for Everyone', 'Plain HTML']);
            const byPrice = await page('books.html?sort=price&order=desc&_offset=1');
            assert.deepStrictEqual(titles(byPrice), ['Salt Roads', 'Kitchen Physics', 'Small Software']); // 3000, [2800, 2200, 1800]
            // sort links keep the other filters
            const doc = await page('books.html?category=1&q=');
            assert.ok(doc.querySelector('th a').getAttribute('href').includes('category=1'));
        });

        test('search form is auto-bound from the URL (data-t-scope="_sys.query") and select/radio state is restored', async () => {
            const doc = await page('books.html?q=Salt%20Roads&category=3&status=published&sort=year&order=desc');
            const f = doc.querySelector('form.filters');
            assert.strictEqual(f.querySelector('[name=q]').value, 'Salt Roads');
            assert.strictEqual(f.querySelector('[name=category][value="3"]').checked, true);
            assert.strictEqual(f.querySelector('[name=category][value=""]').checked, false);
            assert.strictEqual(f.querySelector('[name=status] option[selected]').value, 'published');
            assert.strictEqual(f.querySelector('[name=sort] option[selected]').value, 'year');
            assert.strictEqual(f.querySelector('[name=order][value=desc]').checked, true);
            // no query: "All" stays checked
            const plain = await page('books.html');
            assert.strictEqual(plain.querySelector('[name=category][value=""]').checked, true);
        });
    });

    describe('book detail and forms (read side)', () => {
        test('detail: relations, nested access, pipes, arithmetic, conditions, tags, reviews', async () => {
            const doc = await page('book.html?id=1');
            assert.strictEqual(text(doc.querySelector('article h2')), "The Lighthouse Keeper's Atlas");
            assert.match(text(doc.querySelector('article > p:nth-of-type(2)')), /by Hana Mori in Fiction Featured/);
            const f = facts(doc);
            assert.match(f, /Published 2019\/05\/14/);
            assert.match(f, /Pages 320/);
            assert.match(f, /Reading time 8 hours/); // pages / 40
            assert.match(f, /Price \$1,500\.00/);
            assert.match(f, /With 10% tax \$1,650\.00/);
            assert.match(f, /Price for 3 copies 4,800/); // (price + 100) * 3
            assert.match(f, /Availability In stock/);
            assert.match(f, /ISBN 978-0-00-000001-1/);
            assert.match(f, /Publisher HARBOR PRESS/); // uppercase
            assert.ok(texts(doc, '.notice').some(t => /Only a few copies left \(3\)/.test(t)), 'AND condition');
            assert.ok(text(doc.body).includes('Short: A RETIRED CARTOGRAPHER RETURNS TO A R...'), 'truncate | uppercase chain');
            assert.deepStrictEqual(texts(doc, '.tag'), ['novel', 'sea', 'memory']); // list of strings
            assert.deepStrictEqual(JSON.parse(unescape(doc.querySelector('details pre').textContent)), { isbn: '978-0-00-000001-1', publisher: 'Harbor Press' }); // json pipe
            // reviews: filtered by book_id, sorted desc by created_at
            assert.strictEqual(text(doc.querySelector('h3')), 'Reviews (2)');
            const reviews = texts(doc, '.reviews li');
            assert.match(reviews[0], /^Bob 4\/5 Recommended Regular reader Great atmosphere/);
            assert.match(reviews[1], /^Alice 5\/5 Recommended Regular reader Beautiful and slow/);
            assert.strictEqual(doc.querySelector('.bar').getAttribute('style'), 'width: 80%');
        });

        test('detail: default pipe, OR condition, draft banner, missing/unknown ids', async () => {
            const draft = await page('book.html?id=8');
            assert.ok(texts(draft, '.notice').some(t => /draft/.test(t)));
            assert.match(facts(draft), /ISBN n\/a/, 'default pipe');
            assert.strictEqual(draft.querySelectorAll('.tag').length, 0, 'empty tags list renders nothing');
            assert.match(text(draft.body), /No reviews yet\./, '!bookReviews._length');
            const noReview = await page('book.html?id=2');
            const second = texts(noReview, '.reviews li')[0]; // Dave (newest first)
            assert.match(second, /\(no comment\)/, 'default on empty string');
            assert.match(second, /Not for everyone/, 'rating:lt=3');
            assert.ok(!/Recommended/.test(second));
            const missing = await page('book.html?id=999');
            assert.ok(texts(missing, '.notice').some(t => /Book not found/.test(t)));
            assert.strictEqual(missing.querySelector('article'), null);
            const none = await page('book.html');
            assert.ok(texts(none, '.notice').some(t => /No book selected/.test(t)));
            assert.strictEqual(none.querySelector('article'), null);
        });

        test('edit form: every control is auto-bound from data-t-scope="book"', async () => {
            const doc = await page('book-edit.html?id=1');
            const form = doc.querySelector('form[method=POST]');
            assert.strictEqual(form.getAttribute('action'), '/_sys/data/books.json?id=1&_method=PUT');
            assert.strictEqual(form.querySelector('[name=title]').value, "The Lighthouse Keeper's Atlas");
            assert.strictEqual(form.querySelector('[name=author_id]:checked').value, '1');
            assert.strictEqual(form.querySelector('[name=category_id]:checked').value, '1');
            assert.strictEqual(form.querySelector('[name=year]').value, '2019');
            assert.strictEqual(form.querySelector('[name=stock]').value, '3');
            assert.strictEqual(form.querySelector('[name=status]:checked').value, 'published');
            assert.strictEqual(form.querySelector('[name=featured]').checked, true);
            assert.match(form.querySelector('[name=summary]').value, /^A retired cartographer/);
            assert.strictEqual(form.querySelector('[name="tags.1"]').value, 'sea');
            assert.strictEqual(form.querySelector('[name="meta.isbn"]').value, '978-0-00-000001-1');
            assert.strictEqual(form.querySelector('[name=published_at]').value, '2019-05-14T12:00:00Z');
            assert.strictEqual(form.querySelector('[name="data-t-redirect"]').value, '/book.html?id=1&saved=1');
            // draft record: radio switches, checkbox off
            const d = await page('book-edit.html?id=8');
            assert.strictEqual(d.querySelector('[name=status]:checked').value, 'draft');
            assert.strictEqual(d.querySelector('[name=featured]').checked, false);
            // delete form
            const del = Array.from(d.querySelectorAll('form')).find(f => /_method=DELETE/.test(f.getAttribute('action')));
            assert.strictEqual(del.getAttribute('action'), '/_sys/data/books.json?id=8&_method=DELETE');
            assert.strictEqual(del.querySelector('button').getAttribute('data-title'), 'Unfinished Manuscript');
            assert.ok(!/\{/.test(del.querySelector('button').getAttribute('onclick')), 'event handler keeps plain JS');
        });

        test('new form is empty, with sane defaults', async () => {
            const doc = await page('book-new.html');
            const form = doc.querySelector('form');
            assert.strictEqual(form.getAttribute('action'), '/_sys/data/books.json');
            assert.strictEqual(form.querySelector('[name=title]').value, '');
            assert.strictEqual(form.querySelectorAll('[name=author_id]').length, 4);
            assert.strictEqual(form.querySelector('[name=author_id]:checked'), null);
            assert.strictEqual(form.querySelector('[name=status]:checked').value, 'published');
            assert.strictEqual(form.querySelector('[name=featured]').checked, false);
        });
    });

    describe('authors', () => {
        test('list: nested lists (genres, links), country filter, pipes', async () => {
            const doc = await page('authors.html');
            assert.strictEqual(doc.querySelectorAll('.card').length, 4);
            const hana = doc.querySelectorAll('.card')[0];
            assert.deepStrictEqual(texts(hana, '.tag'), ['Literary', 'Mystery']);
            assert.deepStrictEqual(texts(hana, 'ul li'), ['Website', 'Interview']);
            assert.strictEqual(hana.querySelector('ul li a').getAttribute('href'), 'https://example.com/hana');
            assert.strictEqual(text(hana.querySelector('.badge')), 'JP');
            const amara = doc.querySelectorAll('.card')[2];
            assert.strictEqual(amara.querySelector('ul'), null, 'empty links array: data-t-if hides the list');
            const jp = await page('authors.html?country=jp');
            assert.deepStrictEqual(texts(jp, '.card h2 a'), ['Hana Mori', 'Ken Tanaka']);
            assert.match(text(jp.querySelector('p.muted')), /2 of 4 author\(s\) in JP/);
        });

        test('detail: scoped fields, books of the author via author_id filter + category relation', async () => {
            const doc = await page('author.html?id=4');
            assert.strictEqual(text(doc.querySelector('article h2')), 'Ken Tanaka');
            assert.match(text(doc.querySelector('article')), /JP · born 1990/);
            assert.deepStrictEqual(texts(doc, 'article li').map(t => t.replace(/\s+/g, ' ')), ['Small Software (2024, Technology)', 'Plain HTML (2023, Technology)']);
            const draftAuthor = await page('author.html?id=3');
            assert.ok(texts(draftAuthor, 'article li').some(t => /draft/.test(t)), 'status:ne=published');
            assert.ok(texts(await page('author.html?id=99'), '.notice').some(t => /Author not found/.test(t)));
        });
    });

    describe('playground: pipes, arithmetic, conditions, system values', () => {
        test('every documented feature renders as specified', async () => {
            const doc = await page('pipes.html?x=5&_offset=20');
            const t = (id) => text(doc.getElementById(id));
            assert.strictEqual(t('p-date'), '2019/05/14');
            assert.strictEqual(t('p-number'), '1,500');
            assert.match(t('p-currency'), /^[¥￥]1,500$/); // JPY by default
            assert.strictEqual(t('p-currency-usd'), '$1,500.00');
            assert.strictEqual(t('p-upper'), 'HARBOR PRESS');
            assert.strictEqual(t('p-lower'), 'harbor press');
            assert.strictEqual(t('p-truncate'), 'A retired cartogr...');
            assert.strictEqual(t('p-default'), 'no isbn');
            assert.strictEqual(t('p-ternary-true'), 'featured');
            assert.strictEqual(t('p-ternary-false'), 'regular');
            assert.strictEqual(t('p-chain'), 'A RETIRED...');
            assert.deepStrictEqual(JSON.parse(unescape(doc.getElementById('p-json').textContent)), ['novel', 'sea', 'memory']);
            assert.strictEqual(t('a-mul'), '1500 x 1.1 = 1650');
            assert.strictEqual(t('a-paren'), '(1500 + 100) x 3 = 4800');
            assert.strictEqual(t('a-mod'), '320 % 7 = 5');
            assert.strictEqual(t('a-div0'), 'division by zero is safe: 0');
            assert.strictEqual(t('a-pipe'), 'piped: 1,650');
            assert.strictEqual(t('a-page'), 'next offset: 30');
            for (const id of ['c-exists', 'c-neg', 'c-eq', 'c-ne', 'c-gt', 'c-gte', 'c-lt', 'c-lte', 'c-and', 'c-or', 'c-var']) {
                assert.ok(doc.getElementById(id), id + ' should be shown');
            }
            assert.strictEqual(doc.getElementById('c-never'), null);
            assert.strictEqual(t('r-author'), 'Hana Mori (JP) wrote this Fiction book.');
            assert.strictEqual(t('r-meta'), 'Publisher: Harbor Press');
            assert.strictEqual(t('r-scope'), 'Scoped: Hana Mori was born in 1968');
            assert.strictEqual(t('s-length'), '8 reviews, title length 29');
            assert.strictEqual(t('s-query'), '?x = 5 / 5');
            assert.strictEqual(t('s-index'), '1.Hana Mori 2.Luis Ortega 3.Amara Okafor 4.Ken Tanaka');
            const btn = doc.getElementById('e-button');
            assert.strictEqual(btn.getAttribute('data-id'), '1');
            assert.strictEqual(btn.getAttribute('onclick'), "alert('Book id: ' + this.dataset.id)");
        });

        test('defaults when the query is empty', async () => {
            const doc = await page('pipes.html');
            assert.strictEqual(text(doc.getElementById('s-query')), '?x = (not set) / (shortcut)');
            assert.strictEqual(text(doc.getElementById('a-page')), 'next offset: 10');
        });

        test('about: snippet include, nested json pipe, placeholder escaping', async () => {
            const r = await get('about.html?from=test');
            const doc = new JSDOM(r.text).window.document;
            assert.match(text(doc.querySelector('section.card')), /small library and reading-log app/);
            assert.ok(!/Fallback text/.test(r.text), 'include replaces the original content');
            assert.match(text(doc.body), /Query parameter from: test/);
            assert.strictEqual(JSON.parse(unescape(doc.getElementById('site-json').textContent)).owner, 'Bracify Examples');
            assert.ok(r.text.includes('\\{book.title\\}'), 'escaped placeholder is left for the client to unescape');
        });
    });

    describe('forms: POST / PUT / DELETE round-trips (PRG redirects)', () => {
        let newId;

        test('POST creates a book (nested fields, redirect, list shows it)', async () => {
            const doc = await page('book-new.html');
            const res = await submitForm(doc, 'form', {
                title: 'Created Over HTTP', author_id: '2', category_id: '2', year: '2026', pages: '120', price: '1000', stock: '5',
                status: 'published', featured: true, summary: 'Made by the e2e test.', 'tags.0': 'test', 'tags.1': 'http', 'meta.isbn': 'ISBN-E2E',
                'meta.publisher': 'Test Press'
            });
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.location, '/books.html?saved=1', 'data-t-redirect is honoured');
            const list = await follow(res);
            assert.ok(texts(list, '.notice').some(t => /Saved\./.test(t)));
            const found = await page('books.html?q=' + encodeURIComponent('Created Over HTTP'));
            assert.deepStrictEqual(titles(found), ['Created Over HTTP']);
            newId = new URL(found.querySelector('tbody tr td:nth-child(2) a').getAttribute('href'), 'http://x/').searchParams.get('id');
            assert.ok(newId && newId.length > 3, 'generated id');
            const all = await page('index.html');
            assert.deepStrictEqual(texts(all, '.stat b').slice(0, 1), ['9']);
        });

        test('the created record is rendered correctly (nested objects/arrays, string numbers, filters)', async () => {
            const doc = await page('book.html?id=' + newId);
            assert.strictEqual(text(doc.querySelector('article h2')), 'Created Over HTTP');
            assert.match(text(doc.querySelector('article > p:nth-of-type(2)')), /by Luis Ortega in Science Featured/);
            assert.deepStrictEqual(texts(doc, '.tag'), ['test', 'http']);
            const f = facts(doc);
            assert.match(f, /ISBN ISBN-E2E/);
            assert.match(f, /Price \$1,000\.00/, 'numeric strings are formatted as numbers');
            assert.match(f, /With 10% tax \$1,100\.00/);
            // string-typed numbers still match numeric filters (category_id was posted as "2")
            assert.ok(titles(await page('books.html?category=2&_sort=title')).includes('Created Over HTTP'));
            assert.ok(titles(await page('books.html?author=2&_sort=title')).includes('Created Over HTTP'));
        });

        test('PUT (POST + ?_method=PUT) updates the record via the edit form', async () => {
            const doc = await page('book-edit.html?id=' + newId);
            assert.strictEqual(doc.querySelector('[name=title]').value, 'Created Over HTTP');
            assert.strictEqual(doc.querySelector('[name=author_id]:checked').value, '2', 'bound from a string value');
            const res = await submitForm(doc, 'form[method=POST]', { title: 'Updated Over HTTP', stock: '2', status: 'draft', featured: false, 'meta.publisher': 'Edited Press' });
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.location, `/book.html?id=${newId}&saved=1`);
            const updated = await follow(res);
            assert.strictEqual(text(updated.querySelector('article h2')), 'Updated Over HTTP');
            assert.ok(texts(updated, '.notice').some(t => /Saved\./.test(t)));
            assert.ok(texts(updated, '.notice').some(t => /draft/.test(t)), 'status changed to draft');
            assert.ok(!updated.querySelector('article .badge'), 'featured badge gone');
            assert.match(facts(updated), /Publisher EDITED PRESS/);
            assert.match(facts(updated), /ISBN ISBN-E2E/, 'untouched nested field kept');
            assert.ok(texts(updated, '.notice').some(t => /Only a few copies left \(2\)/.test(t)), 'stock:lte=3 AND stock:gt=0 with string stock');
            // no duplicate was created
            assert.deepStrictEqual(titles(await page('books.html?q=Updated%20Over%20HTTP')), ['Updated Over HTTP']);
            assert.deepStrictEqual(titles(await page('books.html?q=Created%20Over%20HTTP')), []);
            assert.strictEqual(texts(await page('index.html'), '.stat b')[0], '9');
        });

        test('review form POST appends a review to the book page', async () => {
            const doc = await page('book.html?id=1');
            const res = await submitForm(doc, 'form[action="/_sys/data/reviews.json"]', { reviewer: 'Zed', rating: '3', comment: 'Posted by the test.' });
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.location, '/book.html?id=1&saved=1');
            const after = await follow(res);
            assert.strictEqual(text(after.querySelector('h3')), 'Reviews (3)');
            const mine = texts(after, '.reviews li').find(t => /^Zed/.test(t));
            assert.ok(mine, 'new review is listed');
            assert.match(mine, /3\/5/);
            assert.match(mine, /Posted by the test\./);
            assert.ok(!/Recommended|Not for everyone/.test(mine), 'rating 3 is neither >=4 nor <3');
            // hidden book_id (string) still matches the numeric filter on other pages
            assert.strictEqual(texts(await page('index.html'), '.stat b')[2], '9');
        });

        test('DELETE (POST + ?_method=DELETE) removes the record', async () => {
            const doc = await page('book-edit.html?id=' + newId);
            const del = Array.from(doc.querySelectorAll('form')).findIndex(f => /_method=DELETE/.test(f.getAttribute('action')));
            assert.ok(del >= 0);
            const forms = doc.querySelectorAll('form');
            forms[del].setAttribute('id', 'del');
            const res = await submitForm(doc, '#del');
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.location, '/books.html?deleted=1');
            const list = await follow(res);
            assert.ok(texts(list, '.notice').some(t => /Deleted\./.test(t)));
            assert.deepStrictEqual(titles(await page('books.html?q=Updated%20Over%20HTTP')), []);
            assert.strictEqual(texts(await page('index.html'), '.stat b')[0], '8');
            const gone = await page('book.html?id=' + newId);
            assert.ok(texts(gone, '.notice').some(t => /Book not found/.test(t)));
        });

        test('delete button of a list row deletes a seeded record', async () => {
            const doc = await page('books.html?status=draft');
            const forms = doc.querySelectorAll('tbody tr form');
            assert.strictEqual(forms.length, 1);
            forms[0].setAttribute('id', 'rowdel');
            const res = await submitForm(doc, '#rowdel');
            assert.strictEqual(res.status, 302);
            const list = await follow(res);
            assert.deepStrictEqual(titles(await page('books.html?status=draft')), []);
            assert.ok(texts(list, '.notice').some(t => /Deleted\./.test(t)));
            assert.ok(!texts(await page('index.html'), '.notice').some(t => /draft/.test(t)), 'drafts banner disappears');
        });

        test('authors: create (nested genres/links), edit, delete', async () => {
            const doc = await page('author-new.html');
            const res = await submitForm(doc, 'form', {
                name: 'Zoe Test', country: 'us', born: '1999', bio: 'Created by test.', 'genres.0': 'Testing', 'links.0.label': 'Home', 'links.0.url': 'https://example.com/zoe'
            });
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.location, '/authors.html?saved=1');
            const list = await follow(res);
            assert.strictEqual(list.querySelectorAll('.card').length, 5);
            const zoe = Array.from(list.querySelectorAll('.card')).find(c => /Zoe Test/.test(c.textContent));
            assert.deepStrictEqual(texts(zoe, '.tag'), ['Testing']);
            assert.strictEqual(zoe.querySelector('ul li a').getAttribute('href'), 'https://example.com/zoe');
            const id = new URL(zoe.querySelector('h2 a').getAttribute('href'), 'http://x/').searchParams.get('id');

            const edit = await page('author-edit.html?id=' + id);
            assert.strictEqual(edit.querySelector('[name=country]').value, 'us');
            assert.strictEqual(edit.querySelector('[name=country] option[selected]').value, 'us', 'static <option>s are auto-selected');
            assert.strictEqual(edit.querySelector('[name="links.0.label"]').value, 'Home');
            const r2 = await submitForm(edit, 'form[method=POST]', { name: 'Zoe Updated', born: '2000' });
            assert.strictEqual(r2.location, `/author.html?id=${id}&saved=1`);
            const detail = await follow(r2);
            assert.strictEqual(text(detail.querySelector('article h2')), 'Zoe Updated');
            assert.match(text(detail.querySelector('article')), /US · born 2000/);

            const listDoc = await page('authors.html');
            const card = Array.from(listDoc.querySelectorAll('.card')).find(c => /Zoe Updated/.test(c.textContent));
            card.querySelector('form').setAttribute('id', 'authdel');
            const r3 = await submitForm(listDoc, '#authdel');
            assert.strictEqual(r3.location, '/authors.html?deleted=1');
            assert.strictEqual((await follow(r3)).querySelectorAll('.card').length, 4);
        });
    });

    describe('Data API protections', () => {
        test('GET on the data endpoint is forbidden; cross-origin writes are rejected', async () => {
            assert.strictEqual((await get('_sys/data/books.json')).status, 403);
            const before = texts(await page('index.html'), '.stat b')[0];
            const bad = await fetch(url('_sys/data/books.json'), {
                method: 'POST', redirect: 'manual',
                headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: 'http://evil.example' },
                body: 'title=Evil'
            });
            assert.strictEqual(bad.status, 403);
            assert.strictEqual(texts(await page('index.html'), '.stat b')[0], before);
            const same = await fetch(url('_sys/data/books.json?id=1&_method=DELETE'), {
                method: 'POST', redirect: 'manual',
                headers: { 'content-type': 'application/x-www-form-urlencoded', Origin: 'http://evil.example' }, body: ''
            });
            assert.strictEqual(same.status, 403, 'DELETE override is also protected');
            assert.strictEqual(titles(await page('books.html?q=' + encodeURIComponent("The Lighthouse Keeper's Atlas"))).length, 1);
        });

        test('without data-t-redirect the server redirects back to the Referer', async () => {
            const res = await fetch(url('_sys/data/reviews.json'), {
                method: 'POST', redirect: 'manual',
                headers: { 'content-type': 'application/x-www-form-urlencoded', Referer: url('book.html?id=3') },
                body: 'book_id=3&reviewer=Ref&rating=4'
            });
            assert.strictEqual(res.status, 302);
            assert.strictEqual(res.headers.get('location'), '/book.html?id=3'); // same-origin root-relative path (#45)
        });
    });

    describe('SPA navigation target pages', () => {
        test('every internal link of the dashboard resolves to a rendered page', async () => {
            const doc = await page('index.html');
            const hrefs = new Set(Array.from(doc.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(x => x.endsWith('.html') || x.includes('.html?')));
            assert.ok(hrefs.size >= 8);
            for (const href of hrefs) assert.strictEqual((await get(href)).status, 200, href);
        });
    });
});
