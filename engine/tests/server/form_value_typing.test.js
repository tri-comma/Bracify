import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Issue #52: values saved through the Data API are typed by the project's write forms (the schema built for #53):
// `number`/`range` -> JS number, a single `checkbox` -> boolean, empty number -> omitted. Without this a form-saved
// price is the string "9" and `_sort=price` orders text ("9" > "100" > "10"); `"false"` is truthy in data-t-if.
// It also closes the gaps #53 left: a JSON `false`/`0` satisfied `required` on a text field, and a declared dotted
// child (meta.isbn) was skipped when its parent was sent as a non-object.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_SRC = path.resolve(__dirname, '../../../studio');

// One connection per request (see data_api_validation.test.js)
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, headers: { Connection: 'close', ...(opts.headers || {}) } });

const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_H = { 'Content-Type': 'application/json' };

const formPage = (entity, controls) =>
    `<html><body><form method="POST" action="_sys/data/${entity}.json" data-t-redirect="/thanks.html">${controls}</form></body></html>`;

async function withProject(files, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-typing-'));
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), content);
    }
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    const api = (entity, qs = '') => `${base}/_sys/data/${entity}.json${qs}`;
    const sameOrigin = { Origin: base };
    const rows = async (entity) => (await db.find(entity, {})).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const row = async (entity, id) => (await rows(entity)).find(r => String(r.id) === String(id));
    const ids = async (entity) => (await rows(entity)).map(r => String(r.id));
    const postForm = (entity, fields, qs = '', method = 'POST') => fetch(api(entity, qs), {
        method,
        headers: { ...FORM_H, ...sameOrigin },
        body: new URLSearchParams({ 'data-t-redirect': '/thanks.html', ...fields }).toString(),
        redirect: 'manual'
    });
    const rawForm = (entity, body, qs = '') => fetch(api(entity, qs), { method: 'POST', headers: { ...FORM_H, ...sameOrigin }, body, redirect: 'manual' });
    const sendJson = (entity, data, qs = '', method = 'POST') => fetch(api(entity, qs), {
        method,
        headers: { ...JSON_H, Accept: 'application/json', ...sameOrigin },
        body: typeof data === 'string' ? data : JSON.stringify(data),
        redirect: 'manual'
    });
    const page = async (p) => (await fetch(base + p)).text();
    try {
        await fn({ dir, base, api, rows, row, ids, postForm, rawForm, sendJson, page });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

function assertFormRejected(res, msg = '') {
    assert.strictEqual(res.status, 303, `${msg} expected 303, got ${res.status}`);
    const loc = res.headers.get('location') || '';
    assert.match(loc, /[?&]error=[^&]+/, `${msg} Location should carry a non-empty error: ${loc}`);
    assert.ok(!/Internal(%20|\+)Server(%20|\+)Error/.test(loc), `${msg} must be a validation error, not a crash: ${loc}`);
}
async function assertJsonRejected(res, msg = '') {
    assert.strictEqual(res.status, 400, `${msg} expected 400, got ${res.status}`);
    const body = await res.json();
    assert.ok(body && typeof body.error === 'string' && body.error.length > 0, `${msg} body should be {error}`);
    return body.error;
}
function assertAccepted(res, msg = '') {
    assert.ok(res.status >= 200 && res.status < 400, `${msg} expected success, got ${res.status}`);
    assert.ok(!/[?&]error=/.test(res.headers.get('location') || ''), `${msg} unexpected error in Location: ${res.headers.get('location')}`);
}

// ---------------------------------------------------------------------------------------------
// The issue's repro: sort / data-t-if / expressions over form-saved values (SSR end to end)
// ---------------------------------------------------------------------------------------------

const SHOP = {
    'new.html': formPage('books', [
        '<input name="title" required>',
        '<input name="price" type="number" step="any">',
        '<input type="checkbox" name="featured" value="true">'
    ].join('')),
    'sorted.html': [
        '<html><head><link data-t-source="books" href="_sys/data/books.json?_sort=price&_order=desc"></head><body>',
        '<ul><li data-t-list="books"><b class="o">{books.id}</b></li></ul>',
        '</body></html>'
    ].join(''),
    'flags.html': [
        '<html><head><link data-t-source="books" href="_sys/data/books.json"></head><body>',
        '<ul><li data-t-list="books"><span class="f">{books.id}=<em data-t-if="books.featured">FEATURED</em></span></li></ul>',
        '</body></html>'
    ].join(''),
    'tax.html': [
        '<html><head><link data-t-source="books" href="_sys/data/books.json?id=taxed"></head><body>',
        '<ul><li data-t-list="books"><b class="t">{books.price * 1.1 | currency: \'USD\'}</b></li></ul>',
        '</body></html>'
    ].join('')
};

test('issue repro: prices 9, 10, 100 posted from a form sort numerically (desc) next to a numeric seed', async () => {
    await withProject(SHOP, async ({ postForm, row, page }) => {
        await db.save('books', 'seed50', { title: 'seed', price: 50 });
        for (const p of ['9', '10', '100']) assertAccepted(await postForm('books', { id: `s${p}`, title: `t${p}`, price: p }));
        const html = await page('/sorted.html');
        const order = [...html.matchAll(/<b class="o">([^<]*)<\/b>/g)].map(m => m[1]);
        assert.deepStrictEqual(order, ['s100', 'seed50', 's10', 's9'], `_sort=price&_order=desc gave ${order.join(',')}`);
        assert.strictEqual((await row('books', 's9')).price, 9, 'price must be stored as a number');
    });
});

test('data-t-if="featured": unchecked checkbox is stored false (falsy), checked is true', async () => {
    await withProject(SHOP, async ({ postForm, row, page }) => {
        assertAccepted(await postForm('books', { id: 'off', title: 'a', price: '1' }));
        assertAccepted(await postForm('books', { id: 'on', title: 'b', price: '2', featured: 'true' }));
        assert.strictEqual((await row('books', 'off')).featured, false);
        assert.strictEqual((await row('books', 'on')).featured, true);
        const html = await page('/flags.html');
        const spans = Object.fromEntries([...html.matchAll(/<span class="f">([^<=]*)=([\s\S]*?)<\/span>/g)].map(m => [m[1], m[2]]));
        assert.ok(!/FEATURED/.test(spans.off || ''), `unchecked record rendered the badge: ${html}`);
        assert.ok(/FEATURED/.test(spans.on || ''), `checked record lost the badge: ${html}`);
    });
});

test('a checked checkbox is true whatever value it submits (even the text "false")', async () => {
    await withProject(SHOP, async ({ postForm, row }) => {
        assertAccepted(await postForm('books', { id: 'x', title: 'a', featured: 'false' }));
        // any submitted value of a checked checkbox means checked (a browser only submits checked boxes)
        assert.strictEqual((await row('books', 'x')).featured, true);
    });
});

test('{price * 1.1} renders correctly for a form-saved price, which is stored as a number', async () => {
    await withProject(SHOP, async ({ postForm, row, page }) => {
        assertAccepted(await postForm('books', { id: 'taxed', title: 'a', price: '10' }));
        assert.strictEqual((await row('books', 'taxed')).price, 10);
        const html = await page('/tax.html');
        assert.match(html, /<b class="t">\$11\.00<\/b>/);
    });
});

// ---------------------------------------------------------------------------------------------
// number / range
// ---------------------------------------------------------------------------------------------

const NUMS = { 'index.html': formPage('n', '<input name="price" type="number" step="any"><input name="rate" type="range" min="0" max="5" step="any"><input name="title">') };

test('number/range: numeric strings are stored as JS numbers (form POST)', async () => {
    await withProject(NUMS, async ({ postForm, row }) => {
        assertAccepted(await postForm('n', { id: 'a', price: '9', rate: '3' }));
        assertAccepted(await postForm('n', { id: 'b', price: '1.5', rate: '2.5' }));
        assertAccepted(await postForm('n', { id: 'c', price: ' 9 ' }));
        assertAccepted(await postForm('n', { id: 'd', price: '-3' }));
        assert.strictEqual((await row('n', 'a')).price, 9);
        assert.strictEqual((await row('n', 'a')).rate, 3);
        assert.strictEqual((await row('n', 'b')).price, 1.5);
        assert.strictEqual((await row('n', 'b')).rate, 2.5);
        assert.strictEqual((await row('n', 'c')).price, 9);
        assert.strictEqual((await row('n', 'd')).price, -3);
    });
});

test('number: an empty string omits the field instead of storing "" or 0', async () => {
    await withProject(NUMS, async ({ postForm, sendJson, row }) => {
        assertAccepted(await postForm('n', { id: 'e', price: '', rate: '', title: 't' }));
        assertAccepted(await sendJson('n', { id: 'f', price: '', title: 't' }));
        for (const id of ['e', 'f']) {
            const r = await row('n', id);
            assert.ok(r && !('price' in r), `${id}: price should be omitted, got ${JSON.stringify(r)}`);
            assert.ok(!('rate' in r), `${id}: rate should be omitted`);
        }
    });
});

test('number: non-numeric input (abc, 0x10, 1e999, NaN, Infinity) is rejected and never stored', async () => {
    await withProject(NUMS, async ({ postForm, sendJson, rawForm, ids }) => {
        for (const bad of ['abc', '0x10', '0b11', '1e999', '-1e999', 'NaN', 'Infinity', '-Infinity', '1,5', '9px']) {
            assertFormRejected(await postForm('n', { id: 'bad', price: bad }), `form price=${bad}`);
            await assertJsonRejected(await sendJson('n', { id: 'bad', price: bad }), `json price="${bad}"`);
        }
        // raw JSON can carry an Infinity through the number literal 1e999 (JSON.parse -> Infinity)
        await assertJsonRejected(await sendJson('n', '{"id":"bad","price":1e999}'), 'json literal 1e999');
        await assertJsonRejected(await sendJson('n', { id: 'bad', price: true }), 'boolean for a number');
        await assertJsonRejected(await sendJson('n', { id: 'bad', price: [1] }), 'array for a number');
        assertFormRejected(await rawForm('n', 'data-t-redirect=%2Fthanks.html&id=bad&price=1&price=2'), 'repeated price');
        assert.deepStrictEqual(await ids('n'), [], 'nothing may be stored');
    });
});

test('number: JSON finite numbers are accepted as-is, numeric strings are converted', async () => {
    await withProject(NUMS, async ({ sendJson, row }) => {
        assertAccepted(await sendJson('n', { id: 'a', price: 9 }));
        assertAccepted(await sendJson('n', { id: 'b', price: 1.5 }));
        assertAccepted(await sendJson('n', { id: 'c', price: '10' }));
        assertAccepted(await sendJson('n', { id: 'z', price: 0 }));
        assert.strictEqual((await row('n', 'a')).price, 9);
        assert.strictEqual((await row('n', 'b')).price, 1.5);
        assert.strictEqual((await row('n', 'c')).price, 10, 'JSON "10" must become 10');
        assert.strictEqual((await row('n', 'z')).price, 0, '0 is a value, not "empty"');
    });
});

test('number: min/max are still enforced on the converted value', async () => {
    const files = { 'index.html': formPage('m', '<input name="qty" type="number" min="1" max="10">') };
    await withProject(files, async ({ postForm, row, ids }) => {
        assertFormRejected(await postForm('m', { id: 'lo', qty: '0' }));
        assertFormRejected(await postForm('m', { id: 'hi', qty: '11' }));
        assertAccepted(await postForm('m', { id: 'ok', qty: '10' }));
        assert.strictEqual((await row('m', 'ok')).qty, 10);
        assert.deepStrictEqual(await ids('m'), ['ok']);
    });
});

// ---------------------------------------------------------------------------------------------
// checkbox
// ---------------------------------------------------------------------------------------------

const CHK = { 'index.html': formPage('c', '<input name="title"><input type="checkbox" name="featured" value="true"><input type="checkbox" name="agree">') };

test('single checkbox: checked -> true (any submitted value), absent -> false', async () => {
    await withProject(CHK, async ({ postForm, row }) => {
        assertAccepted(await postForm('c', { id: 'a', featured: 'true', agree: 'on' }));
        assertAccepted(await postForm('c', { id: 'b', featured: 'whatever' }));
        assertAccepted(await postForm('c', { id: 'c', title: 'none' }));
        assert.strictEqual((await row('c', 'a')).featured, true);
        assert.strictEqual((await row('c', 'a')).agree, true);
        assert.strictEqual((await row('c', 'b')).featured, true);
        assert.strictEqual((await row('c', 'b')).agree, false);
        assert.strictEqual((await row('c', 'c')).featured, false);
        assert.strictEqual((await row('c', 'c')).agree, false);
    });
});

test('single checkbox: JSON booleans are accepted as-is, "true"/"false" strings are converted', async () => {
    await withProject(CHK, async ({ sendJson, row }) => {
        assertAccepted(await sendJson('c', { id: 'a', featured: true, agree: false }));
        assertAccepted(await sendJson('c', { id: 'b', featured: 'true', agree: 'false' }));
        assertAccepted(await sendJson('c', { id: 'c' }));
        assert.strictEqual((await row('c', 'a')).featured, true);
        assert.strictEqual((await row('c', 'a')).agree, false);
        assert.strictEqual((await row('c', 'b')).featured, true);
        assert.strictEqual((await row('c', 'b')).agree, false);
        assert.strictEqual((await row('c', 'c')).featured, false, 'absent checkbox (JSON) is false too');
    });
});

test('checkbox absent -> false only when EVERY write form of the entity has that checkbox', async () => {
    const files = {
        'a.html': formPage('mixed', '<input name="title"><input type="checkbox" name="featured" value="1">'),
        'b.html': formPage('mixed', '<input name="title">')
    };
    await withProject(files, async ({ postForm, row }) => {
        assertAccepted(await postForm('mixed', { id: 'a', title: 't' }));
        assertAccepted(await postForm('mixed', { id: 'b', title: 't', featured: '1' }));
        const a = await row('mixed', 'a');
        assert.ok(!('featured' in a), `must stay absent when another form lacks the checkbox: ${JSON.stringify(a)}`);
        assert.strictEqual((await row('mixed', 'b')).featured, true, 'a submitted checkbox is still converted');
    });
});

test('checkbox absent -> false also applies when every one of several forms has it', async () => {
    const files = {
        'a.html': formPage('both', '<input type="checkbox" name="featured" value="1">'),
        'b.html': formPage('both', '<input name="x"><input type="checkbox" name="featured">')
    };
    await withProject(files, async ({ postForm, row }) => {
        assertAccepted(await postForm('both', { id: 'a', x: '1' }));
        assert.strictEqual((await row('both', 'a')).featured, false);
    });
});

test('checkbox groups and select[multiple] stay arrays of strings, even with a single value', async () => {
    const files = { 'index.html': formPage('g', [
        '<input type="checkbox" name="opt" value="1"><input type="checkbox" name="opt" value="2">',
        '<select name="tags" multiple><option value="a">a</option><option value="b">b</option></select>'
    ].join('')) };
    await withProject(files, async ({ postForm, rawForm, sendJson, row }) => {
        assertAccepted(await rawForm('g', 'data-t-redirect=%2Fthanks.html&id=two&opt=1&opt=2&tags=a&tags=b'));
        assertAccepted(await postForm('g', { id: 'one', opt: '1', tags: 'a' }));
        assertAccepted(await postForm('g', { id: 'none' }));
        assertAccepted(await sendJson('g', { id: 'js', opt: ['2'], tags: ['b'] }));
        assert.deepStrictEqual((await row('g', 'two')).opt, ['1', '2']);
        assert.deepStrictEqual((await row('g', 'two')).tags, ['a', 'b']);
        assert.deepStrictEqual((await row('g', 'one')).opt, ['1'], 'one checked value is still an array');
        assert.deepStrictEqual((await row('g', 'one')).tags, ['a']);
        const none = await row('g', 'none');
        assert.ok(!('opt' in none) && !('tags' in none), `an unchecked group is not stored as false: ${JSON.stringify(none)}`);
        assert.deepStrictEqual((await row('g', 'js')).opt, ['2']);
    });
});

// ---------------------------------------------------------------------------------------------
// Text-like fields take strings only (gap 1 of the issue comment)
// ---------------------------------------------------------------------------------------------

const TEXTS = { 'index.html': formPage('t', [
    '<input name="title" required>',
    '<textarea name="body"></textarea>',
    '<select name="color"><option value="">-</option><option value="0">zero</option><option value="red">red</option></select>',
    '<input type="radio" name="size" value="0"><input type="radio" name="size" value="m">',
    '<input type="date" name="born">',
    '<input name="code">'
].join('')) };

test('text field: JSON false / 0 no longer satisfy required and are never stored', async () => {
    await withProject(TEXTS, async ({ sendJson, ids }) => {
        await assertJsonRejected(await sendJson('t', { id: 'a', title: false }), 'title:false');
        await assertJsonRejected(await sendJson('t', { id: 'b', title: 0 }), 'title:0');
        await assertJsonRejected(await sendJson('t', { id: 'c', title: true }), 'title:true');
        await assertJsonRejected(await sendJson('t', { id: 'd', title: 12 }), 'title:12');
        assert.deepStrictEqual(await ids('t'), []);
    });
});

test('every text-like control (textarea, select, radio, date, plain text) rejects JSON non-strings', async () => {
    await withProject(TEXTS, async ({ sendJson, ids }) => {
        // (select / radio / hidden may carry numeric ids, see the relation-id test below; booleans are still refused there)
        for (const [field, value] of [['body', 0], ['body', false], ['color', false], ['size', true], ['born', 20200131], ['code', 0], ['code', false]]) {
            await assertJsonRejected(await sendJson('t', { id: 'x', title: 'ok', [field]: value }), `${field}:${JSON.stringify(value)}`);
        }
        assert.deepStrictEqual(await ids('t'), []);
        // the string forms are fine and stay strings
        assertAccepted(await sendJson('t', { id: 'y', title: 'ok', color: '0', size: '0', code: '0', body: 'x' }));
    });
});

test('text field: strings (including "0" and "false") are stored untouched', async () => {
    await withProject(TEXTS, async ({ postForm, sendJson, row }) => {
        assertAccepted(await postForm('t', { id: 'a', title: '0', code: 'false' }));
        assertAccepted(await sendJson('t', { id: 'b', title: 'false', code: '007' }));
        assert.strictEqual((await row('t', 'a')).title, '0');
        assert.strictEqual((await row('t', 'a')).code, 'false');
        assert.strictEqual((await row('t', 'b')).code, '007');
    });
});

// ---------------------------------------------------------------------------------------------
// Conflicting types, undeclared fields, id
// ---------------------------------------------------------------------------------------------

test('a field typed differently across forms is not converted (stored as submitted)', async () => {
    const files = {
        'a.html': formPage('conf', '<input name="v" type="number">'),
        'b.html': formPage('conf', '<input name="v" type="text">'),
        'c.html': formPage('conf', '<input type="checkbox" name="flag" value="1">'),
        'd.html': formPage('conf', '<input name="flag" type="text">')
    };
    await withProject(files, async ({ postForm, sendJson, row }) => {
        assertAccepted(await postForm('conf', { id: 'a', v: '9' }));
        assertAccepted(await postForm('conf', { id: 'b', v: 'abc' }));
        assertAccepted(await postForm('conf', { id: 'c', v: '' }));
        assertAccepted(await postForm('conf', { id: 'd', flag: 'hello' }));
        assertAccepted(await postForm('conf', { id: 'e' }));
        assertAccepted(await sendJson('conf', { id: 'f', v: 9 }));
        assert.strictEqual((await row('conf', 'a')).v, '9');
        assert.strictEqual((await row('conf', 'b')).v, 'abc');
        assert.strictEqual((await row('conf', 'c')).v, '', 'empty string is kept as submitted');
        assert.strictEqual((await row('conf', 'd')).flag, 'hello');
        assert.ok(!('flag' in (await row('conf', 'e'))), 'absent conflicting checkbox is not turned into false');
        assert.strictEqual((await row('conf', 'f')).v, 9, 'JSON value is stored as submitted');
    });
});

test('number in every form that declares it converts even if the forms differ in other constraints', async () => {
    const files = {
        'a.html': formPage('same', '<input name="q" type="number" min="1" max="10">'),
        'b.html': formPage('same', '<input name="q" type="range" min="5" max="100">')
    };
    await withProject(files, async ({ postForm, row }) => {
        assertAccepted(await postForm('same', { id: 'a', q: '50' }));
        assert.strictEqual((await row('same', 'a')).q, 50);
    });
});

test('undeclared fields and id are left alone (id stays a string)', async () => {
    await withProject(NUMS, async ({ postForm, sendJson, row, rows }) => {
        assertAccepted(await postForm('n', { id: '5', price: '9', undeclared: '42', also: 'true' }));
        assertAccepted(await sendJson('n', { id: '6', price: 1, undeclared: 42, also: false }));
        const five = await row('n', '5');
        assert.strictEqual(five.undeclared, '42');
        assert.strictEqual(five.also, 'true');
        assert.strictEqual((await row('n', '6')).undeclared, 42);
        assert.strictEqual((await row('n', '6')).also, false);
        for (const r of await rows('n')) assert.strictEqual(typeof r.id, 'string', `id of ${JSON.stringify(r)} must stay a string`);
    });
});

test('an entity without write forms is not typed (unchanged behaviour)', async () => {
    await withProject({ 'index.html': '<html></html>' }, async ({ postForm, row }) => {
        assertAccepted(await postForm('ghost', { id: 'g', price: '9', flag: 'true' }));
        const r = await row('ghost', 'g');
        assert.strictEqual(r.price, '9');
        assert.strictEqual(r.flag, 'true');
    });
});

test('typing applies to a data-t-include partial and a dotted number field', async () => {
    const files = {
        'new.html': '<html><body><form method="POST" action="/_sys/data/things.json"><div data-t-include="_parts/f.html"></div></form></body></html>',
        '_parts/f.html': '<input name="stock.count" type="number"><input type="checkbox" name="active" value="1">'
    };
    await withProject(files, async ({ postForm, row }) => {
        assertAccepted(await postForm('things', { id: 'a', 'stock.count': '7' }));
        const r = await row('things', 'a');
        assert.strictEqual(r.stock.count, 7);
        assert.strictEqual(r.active, false);
    });
});

// ---------------------------------------------------------------------------------------------
// Dotted children whose parent is sent as a non-object (gap 2 of the issue comment)
// ---------------------------------------------------------------------------------------------

const META = { 'index.html': formPage('d', [
    '<input name="meta.isbn" pattern="[0-9]{3}">',
    '<input name="tags.name" required>',
    '<input name="title">'
].join('')) };

test('a declared dotted child rejects a parent sent as a non-object (JSON)', async () => {
    await withProject(META, async ({ sendJson, ids }) => {
        await assertJsonRejected(await sendJson('d', { id: 'a', meta: 'str', tags: { name: 'x' } }), 'meta:"str"');
        await assertJsonRejected(await sendJson('d', { id: 'b', meta: 5, tags: { name: 'x' } }), 'meta:5');
        await assertJsonRejected(await sendJson('d', { id: 'c', meta: true, tags: { name: 'x' } }), 'meta:true');
        await assertJsonRejected(await sendJson('d', { id: 'e', meta: ['x'], tags: { name: 'x' } }), 'meta:[x]');
        await assertJsonRejected(await sendJson('d', { id: 'f', meta: { isbn: '123' }, tags: ['x'] }), 'tags:[x]');
        await assertJsonRejected(await sendJson('d', { id: 'g', meta: { isbn: '123' }, tags: 'str' }), 'tags:"str"');
        assert.deepStrictEqual(await ids('d'), []);
    });
});

test('a parent given as {"0": ...} cannot hide a required dotted child', async () => {
    await withProject(META, async ({ sendJson, ids }) => {
        await assertJsonRejected(await sendJson('d', { id: 'a', tags: { 0: 'x' } }), 'tags:{0:x}');
        assert.deepStrictEqual(await ids('d'), []);
    });
});

test('a declared dotted child still works with an object parent, or no parent at all', async () => {
    await withProject(META, async ({ sendJson, postForm, row }) => {
        assertAccepted(await sendJson('d', { id: 'a', meta: { isbn: '123' }, tags: { name: 'x' } }));
        assertAccepted(await sendJson('d', { id: 'b', meta: {}, tags: { name: 'x' } }));
        assertAccepted(await sendJson('d', { id: 'c', tags: { name: 'x' } }));
        assertAccepted(await postForm('d', { id: 'e', 'meta.isbn': '456', 'tags.name': 'y' }));
        await assertJsonRejected(await sendJson('d', { id: 'h', meta: { isbn: 'bad' }, tags: { name: 'x' } }), 'child pattern');
        assert.strictEqual((await row('d', 'a')).meta.isbn, '123');
        assert.strictEqual((await row('d', 'e')).meta.isbn, '456');
    });
});

test('urlencoded meta=str&meta.isbn=x (either order) is rejected, not stored', async () => {
    await withProject(META, async ({ rawForm, ids }) => {
        const R = 'data-t-redirect=%2Fthanks.html&tags.name=n&';
        assertFormRejected(await rawForm('d', R + 'id=a&meta=str&meta.isbn=123'), 'meta first');
        assertFormRejected(await rawForm('d', R + 'id=b&meta.isbn=123&meta=str'), 'meta last');
        assertFormRejected(await rawForm('d', R + 'id=c&meta=str'), 'meta alone');
        assert.deepStrictEqual(await ids('d'), []);
    });
});

// ---------------------------------------------------------------------------------------------
// PUT is typed like POST
// ---------------------------------------------------------------------------------------------

test('PUT (JSON and POST ?_method=PUT form) converts numbers and checkboxes; rejects bad ones', async () => {
    const files = { 'index.html': formPage('p', '<input name="title"><input name="price" type="number"><input type="checkbox" name="featured" value="1">') };
    await withProject(files, async ({ postForm, sendJson, row }) => {
        await db.save('p', 'a', { title: 'old', price: 'x', featured: true });
        assertAccepted(await postForm('p', { title: 'new', price: '9' }, '?id=a&_method=PUT'));
        let r = await row('p', 'a');
        assert.strictEqual(r.price, 9);
        assert.strictEqual(r.featured, false, 'unchecked checkbox on update becomes false');
        assertAccepted(await sendJson('p', { title: 'j', price: '1.5', featured: '1' }, '?id=a', 'PUT'));
        r = await row('p', 'a');
        assert.strictEqual(r.price, 1.5);
        assert.strictEqual(r.featured, true);
        assertAccepted(await sendJson('p', { title: 'j', price: '' }, '?id=a', 'PUT'));
        assert.ok(!('price' in (await row('p', 'a'))), 'empty number omitted on PUT');
        await assertJsonRejected(await sendJson('p', { title: 'j', price: '0x10' }, '?id=a', 'PUT'), 'PUT 0x10');
        assertFormRejected(await postForm('p', { price: 'abc' }, '?id=a&_method=PUT'), 'PUT form abc');
        assert.strictEqual((await row('p', 'a')).title, 'j', 'record untouched after rejected PUTs');
    });
});

// ---------------------------------------------------------------------------------------------
// Studio's own records handler (parity)
// ---------------------------------------------------------------------------------------------

const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
};

test('Studio create/update store numbers and booleans like the Data API (parity)', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-typing-studio-'));
    const studioDir = path.join(tmpRoot, 'studio-like');
    const userDir = path.join(tmpRoot, 'user-proj');
    copyDir(STUDIO_SRC, studioDir);
    fs.rmSync(path.join(studioDir, '_sys'), { recursive: true, force: true });
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'index.html'), `<!DOCTYPE html><html><body>
<form method="POST" action="_sys/data/posts.json" data-t-redirect="index.html">
  <input type="text" name="title" required>
  <input type="number" name="views" min="0" max="100">
  <input type="checkbox" name="published">
</form></body></html>`);
    const server = new EngineServer(0, () => {}, { sqlite3, manageProjects: true });
    const userRecords = async () => {
        const dbm = await db.openProject(userDir);
        try { return await dbm.find('posts', {}); } finally { await dbm.close(); }
    };
    try {
        await server.start();
        await server.setCurrentProjectPath(studioDir);
        const base = `http://localhost:${server.port}`;
        const post = (url, fields) => fetch(base + url, { method: 'POST', redirect: 'manual', headers: FORM_H, body: new URLSearchParams(fields).toString() });
        await post('/_sys/data/projects.json', { id: 'u', name: 'U', path: userDir, port: '0', status: 'stopped' });
        const R = '/_sys/studio/records?project=u&entity=posts';

        let r = await post(R, { 'data-t-redirect': '/x.html', title: 'A', views: '7', published: 'on' });
        assert.ok(!/error=/.test(r.headers.get('location') || ''), r.headers.get('location'));
        r = await post(R, { 'data-t-redirect': '/x.html', title: 'B', views: '' });
        assert.ok(!/error=/.test(r.headers.get('location') || ''), r.headers.get('location'));
        const recs = await userRecords();
        const a = recs.find(x => x.title === 'A'), b = recs.find(x => x.title === 'B');
        assert.strictEqual(a.views, 7, 'studio create: number field stored as number');
        assert.strictEqual(a.published, true, 'studio create: checked checkbox stored as true');
        assert.strictEqual(b.published, false, 'studio create: unchecked checkbox stored as false');
        assert.ok(!('views' in b), 'studio create: empty number omitted');

        r = await post(`/_sys/studio/records/update?project=u&entity=posts&id=${a.id}`, { 'data-t-redirect': '/x.html', title: 'A2', views: '8' });
        assert.ok(!/error=/.test(r.headers.get('location') || ''), r.headers.get('location'));
        const a2 = (await userRecords()).find(x => x.id === a.id);
        assert.strictEqual(a2.views, 8, 'studio update: number');
        assert.strictEqual(a2.published, false, 'studio update: unchecked checkbox -> false');

        r = await post(R, { 'data-t-redirect': '/x.html', title: 'C', views: '0x10' });
        assert.match(r.headers.get('location') || '', /error=/);
        assert.strictEqual((await userRecords()).filter(x => x.title === 'C').length, 0, 'studio must not store 0x10');
    } finally {
        try { await server.stop(); } catch (e) { /* ignore */ }
        for (let i = 0; i < 10; i++) {
            try { fs.rmSync(tmpRoot, { recursive: true, force: true }); break; }
            catch { await new Promise(res => setTimeout(res, 300)); }
        }
    }
});

// ---------------------------------------------------------------------------------------------
// Review follow-ups: required checkbox, strict JSON checkbox strings, numeric ids, huge numbers
// ---------------------------------------------------------------------------------------------

test('a required single checkbox: JSON false / "false" / absent are rejected, true is accepted', async () => {
    const files = { 'index.html': formPage('rq', '<input type="checkbox" name="agree" value="yes" required><input name="t">') };
    await withProject(files, async ({ sendJson, postForm, row, ids }) => {
        await assertJsonRejected(await sendJson('rq', { id: 'a', agree: false }), 'agree:false');
        await assertJsonRejected(await sendJson('rq', { id: 'b', agree: 'false' }), 'agree:"false"');
        await assertJsonRejected(await sendJson('rq', { id: 'b2', agree: 'FALSE' }), 'agree:"FALSE"');
        await assertJsonRejected(await sendJson('rq', { id: 'c' }), 'absent');
        assertFormRejected(await postForm('rq', { id: 'd', t: 'x' }), 'unchecked form');
        assert.deepStrictEqual(await ids('rq'), []);
        assertAccepted(await sendJson('rq', { id: 'e', agree: true }));
        assertAccepted(await postForm('rq', { id: 'f', agree: 'yes' }));
        assert.strictEqual((await row('rq', 'e')).agree, true);
        assert.strictEqual((await row('rq', 'f')).agree, true);
    });
});

test('JSON checkbox strings are strict: true/false/on/declared value only; "" is not submitted', async () => {
    const files = { 'index.html': formPage('st', '<input type="checkbox" name="flag" value="yes"><input name="t">') };
    await withProject(files, async ({ sendJson, postForm, row, ids }) => {
        for (const bad of ['no', '0', 'off', 'maybe']) await assertJsonRejected(await sendJson('st', { id: 'x', flag: bad }), `flag:${bad}`);
        await assertJsonRejected(await sendJson('st', { id: 'x', flag: 1 }), 'flag:1');
        assert.deepStrictEqual(await ids('st'), []);
        for (const [id, v, want] of [['a', 'TRUE', true], ['b', 'On', true], ['c', 'yes', true], ['d', 'False', false], ['e', '', false]]) {
            assertAccepted(await sendJson('st', { id, flag: v }));
            assert.strictEqual((await row('st', id)).flag, want, `flag:${JSON.stringify(v)}`);
        }
        // a browser form: any submitted value still means checked
        assertAccepted(await postForm('st', { id: 'f', flag: 'no' }));
        assert.strictEqual((await row('st', 'f')).flag, true);
    });
});

test('radio / select / hidden accept JSON numbers (relation ids) as given; text fields and booleans do not', async () => {
    const files = { 'index.html': formPage('rel', [
        '<input type="radio" name="author_id" value="{authors.id}"><input type="radio" name="author_id" value="2">',
        '<select name="cat"><option value="1">a</option></select>',
        '<input type="hidden" name="owner">',
        '<input name="title">'
    ].join('')) };
    await withProject(files, async ({ sendJson, row, ids }) => {
        assertAccepted(await sendJson('rel', { id: 'a', author_id: 1, cat: 1, owner: 7 }));
        const r = await row('rel', 'a');
        assert.strictEqual(r.author_id, 1);
        assert.strictEqual(r.cat, 1);
        assert.strictEqual(r.owner, 7);
        await assertJsonRejected(await sendJson('rel', { id: 'b', author_id: true }), 'boolean radio');
        await assertJsonRejected(await sendJson('rel', { id: 'c', title: 1 }), 'number in text');
        await assertJsonRejected(await sendJson('rel', { id: 'd', cat: 2 }), 'number outside the select options');
        assert.deepStrictEqual(await ids('rel'), ['a']);
    });
});

test('number: whitespace-only is omitted; 400 digits and unsafe integers are rejected', async () => {
    await withProject(NUMS, async ({ postForm, sendJson, row, ids }) => {
        assertAccepted(await postForm('n', { id: 'w', price: '   ' }));
        assert.ok(!('price' in (await row('n', 'w'))), 'whitespace-only price should be omitted');
        assertFormRejected(await postForm('n', { id: 'big', price: '9'.repeat(400) }), '400 digits');
        await assertJsonRejected(await sendJson('n', { id: 'big', price: '9'.repeat(400) }), '400 digits json');
        assertFormRejected(await postForm('n', { id: 'big', price: '9007199254740993' }), 'unsafe integer string');
        await assertJsonRejected(await sendJson('n', '{"id":"big","price":9007199254740993}'), 'unsafe integer literal');
        assertAccepted(await postForm('n', { id: 'max', price: '9007199254740991' }));
        assert.strictEqual((await row('n', 'max')).price, 9007199254740991);
        assert.deepStrictEqual(await ids('n'), ['max', 'w']);
    });
});
