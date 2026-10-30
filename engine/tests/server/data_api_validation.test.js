import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Regression tests for Issue #53: the public Data API (/_sys/data/<entity>.json) did not enforce the
// form constraints server-side (curl bypassed `required` etc.) and a POST with an existing id silently
// overwrote that record. Constraints are now derived from the project's forms; POST never overwrites.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();
const scanner = require('../../server/schema-scanner.cjs');

// One connection per request: a pooled keep-alive socket to a previous test's server (ephemeral ports get reused)
// could otherwise be reset and surface as a spurious "fetch failed".
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, headers: { Connection: 'close', ...(opts.headers || {}) } });

const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_H = { 'Content-Type': 'application/json' };

const formPage = (entity, controls) =>
    `<html><body><form method="POST" action="_sys/data/${entity}.json" data-t-redirect="/thanks.html">${controls}</form></body></html>`;

// files: { 'index.html': '<html>...' }
async function withProject(files, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-datavalid-'));
    for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), content);
    }
    const server = new EngineServer(0, () => {}, { sqlite3 });
    await server.setCurrentProjectPath(dir);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    const api = (entity, qs = '') => `${base}/_sys/data/${entity}.json${qs}`;
    const rows = async (entity) => (await db.find(entity, {})).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const ids = async (entity) => (await rows(entity)).map(r => String(r.id));
    const sameOrigin = { Origin: base };
    // Form-style POST (urlencoded, carries data-t-redirect)
    const postForm = (entity, fields, qs = '', method = 'POST') => fetch(api(entity, qs), {
        method,
        headers: { ...FORM_H, ...sameOrigin },
        body: new URLSearchParams({ 'data-t-redirect': '/thanks.html', ...fields }).toString(),
        redirect: 'manual'
    });
    // Raw urlencoded body (repeated keys, id[]=...)
    const rawForm = (entity, body, qs = '') => fetch(api(entity, qs), { method: 'POST', headers: { ...FORM_H, ...sameOrigin }, body, redirect: 'manual' });
    // JSON-style request
    const sendJson = (entity, data, qs = '', method = 'POST') => fetch(api(entity, qs), {
        method,
        headers: { ...JSON_H, Accept: 'application/json', ...sameOrigin },
        body: JSON.stringify(data),
        redirect: 'manual'
    });
    try {
        await fn({ dir, base, api, rows, ids, postForm, rawForm, sendJson, sameOrigin });
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) {
            try { fs.rmSync(dir, { recursive: true, force: true }); break; }
            catch { await new Promise(r => setTimeout(r, 100)); }
        }
    }
}

// Assertions on how a rejected write looks
function assertFormRejected(res, msg = '') {
    assert.strictEqual(res.status, 303, `${msg} expected 303, got ${res.status}`);
    const loc = res.headers.get('location') || '';
    assert.ok(loc.startsWith('/thanks.html?'), `${msg} Location should be data-t-redirect + query, got ${loc}`);
    assert.match(loc, /[?&]error=[^&]+/, `${msg} Location should carry a non-empty error: ${loc}`);
}
async function assertJsonRejected(res, status, msg = '') {
    assert.strictEqual(res.status, status, `${msg} expected ${status}, got ${res.status}`);
    assert.match(res.headers.get('content-type') || '', /json/);
    const body = await res.json();
    assert.ok(body && typeof body.error === 'string' && body.error.length > 0, `${msg} body should be {error}`);
}
function assertAccepted(res, msg = '') {
    assert.ok(res.status >= 200 && res.status < 400, `${msg} expected success, got ${res.status}`);
    const loc = res.headers.get('location') || '';
    assert.ok(!/[?&]error=/.test(loc), `${msg} unexpected error in Location: ${loc}`);
}

// ---------------------------------------------------------------------------------------------
// The two curl cases from the issue
// ---------------------------------------------------------------------------------------------

const BOOKS = {
    'index.html': formPage('books', '<input name="title" required maxlength="80"><input name="year" type="number" min="1000" max="2100">')
};

test('curl case 1: POST without a required field is refused and nothing is written', async () => {
    await withProject(BOOKS, async ({ postForm, ids }) => {
        const res = await postForm('books', { id: 'empty' });
        assertFormRejected(res);
        assert.deepStrictEqual(await ids('books'), [], 'a record without its required title was stored');
    });
});

test('curl case 2: POST with an existing id does not overwrite the record', async () => {
    await withProject(BOOKS, async ({ postForm, rows }) => {
        await db.save('books', 's9', { title: 'ORIGINAL' });
        const res = await postForm('books', { id: 's9', title: 'OVERWRITTEN' });
        assertFormRejected(res);
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'ORIGINAL', 'existing record was overwritten by POST');
    });
});

// ---------------------------------------------------------------------------------------------
// Each constraint type: one reject, one accept
// ---------------------------------------------------------------------------------------------

const ALL_CONTROLS = [
    '<input name="title" required maxlength="10" minlength="2">',
    '<input name="qty" type="number" min="1" max="10">',
    '<input name="rate" type="range" min="0" max="5">',
    '<input name="code" pattern="[A-Z]{3}">',
    '<input name="mail" type="email">',
    '<input name="born" type="date">',
    '<select name="color"><option value="">-</option><option value="red">Red</option><option value="green">Green</option></select>',
    '<input type="radio" name="size" value="s"><input type="radio" name="size" value="m">'
].join('');
const ITEMS = { 'index.html': formPage('items', ALL_CONTROLS) };
const VALID = { title: 'hello', qty: '5', rate: '3', code: 'ABC', mail: 'a@b.co', born: '2020-01-31', color: 'red', size: 's' };

test('a fully valid submission is accepted and stored (form)', async () => {
    await withProject(ITEMS, async ({ postForm, ids }) => {
        const res = await postForm('items', { id: 'ok', ...VALID });
        assertAccepted(res);
        assert.deepStrictEqual(await ids('items'), ['ok']);
    });
});

const CASES = [
    // [label, field overrides that must be rejected, overrides that must be accepted]
    ['required (missing)', { title: '' }, null],
    ['required (absent)', { title: undefined }, null],
    ['maxlength', { title: 'x'.repeat(11) }, { title: 'x'.repeat(10) }],
    ['minlength', { title: 'x' }, { title: 'xx' }],
    ['min (number)', { qty: '0' }, { qty: '1' }],
    ['max (number)', { qty: '11' }, { qty: '10' }],
    ['non-numeric number', { qty: 'abc' }, { qty: '7.5' }],
    ['min/max (range)', { rate: '6' }, { rate: '5' }],
    ['pattern', { code: 'abc' }, { code: 'XYZ' }],
    ['type=email', { mail: 'not-an-email' }, { mail: 'x@y.org' }],
    ['type=date', { born: '31/01/2020' }, { born: '2021-02-28' }],
    ['select enum', { color: 'blue' }, { color: 'green' }],
    ['radio enum', { size: 'xl' }, { size: 'm' }]
];

for (const [label, bad, good] of CASES) {
    test(`constraint ${label}: invalid value rejected (nothing written)`, async () => {
        await withProject(ITEMS, async ({ postForm, ids }) => {
            const body = { id: 'r1', ...VALID, ...bad };
            for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
            const res = await postForm('items', body);
            assertFormRejected(res, label);
            assert.deepStrictEqual(await ids('items'), [], `${label}: record was stored`);
        });
    });
    if (good) {
        test(`constraint ${label}: boundary/valid value accepted`, async () => {
            await withProject(ITEMS, async ({ postForm, ids }) => {
                const res = await postForm('items', { id: 'g1', ...VALID, ...good });
                assertAccepted(res, label);
                assert.deepStrictEqual(await ids('items'), ['g1']);
            });
        });
    }
}

test('optional fields may be omitted entirely', async () => {
    await withProject(ITEMS, async ({ postForm, ids }) => {
        const res = await postForm('items', { id: 'min', title: 'hello' });
        assertAccepted(res);
        assert.deepStrictEqual(await ids('items'), ['min']);
    });
});

test('nested dot-notation field names are validated after unflattening', async () => {
    const files = { 'index.html': formPage('people', '<input name="profile.nick" required maxlength="4">') };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('people', { id: 'a', 'profile.nick': 'toolong' }));
        assertFormRejected(await postForm('people', { id: 'b' }));
        assertAccepted(await postForm('people', { id: 'c', 'profile.nick': 'ok' }));
        assert.deepStrictEqual(await ids('people'), ['c']);
    });
});

test('a field not declared by any form is not validated and is stored as before', async () => {
    await withProject(ITEMS, async ({ postForm, rows }) => {
        const res = await postForm('items', { id: 'x', title: 'hello', undeclared: 'anything goes' });
        assertAccepted(res);
        const all = await rows('items');
        assert.strictEqual(all[0].undeclared, 'anything goes');
    });
});

// ---------------------------------------------------------------------------------------------
// Multiple forms writing to the same entity
// ---------------------------------------------------------------------------------------------

const MULTI = {
    // form A: strict about name, nick/both required
    'a.html': formPage('multi', [
        '<input name="name" required maxlength="5">',
        '<input name="nick" required>',
        '<input name="both" required>',
        '<input name="age" type="number" min="1" max="10">',
        '<input name="free" maxlength="3">'
    ].join('')),
    // form B: loose name (optional, longer), no nick, both required, other age range, free unconstrained
    'sub/b.html': formPage('multi', [
        '<input name="name" maxlength="20">',
        '<input name="both" required>',
        '<input name="age" type="number" min="5" max="100">',
        '<input name="free">',
        '<input name="extra" required>'
    ].join(''))
};

test('multi-form: a field is required only when every form requires it', async () => {
    await withProject(MULTI, async ({ postForm, ids }) => {
        // name: required in A only -> optional; nick: only in A (absent from B) -> optional; extra: only in B -> optional
        assertAccepted(await postForm('multi', { id: 'm1', both: 'x' }), 'optional-in-some-form fields omitted');
        // both: required in A and B -> required
        assertFormRejected(await postForm('multi', { id: 'm2', name: 'n' }), 'required in every form');
        assert.deepStrictEqual(await ids('multi'), ['m1']);
    });
});

test('multi-form: a value violating only one form is accepted (loosest declaration wins)', async () => {
    await withProject(MULTI, async ({ postForm, ids }) => {
        // name 10 chars: violates A (max 5) but fits B (max 20)
        assertAccepted(await postForm('multi', { id: 'l1', both: 'x', name: 'abcdefghij' }));
        // age 3: violates B (min 5) but fits A; age 50: violates A (max 10) but fits B
        assertAccepted(await postForm('multi', { id: 'l2', both: 'x', age: '3' }));
        assertAccepted(await postForm('multi', { id: 'l3', both: 'x', age: '50' }));
        // free: maxlength in A only, unconstrained in B -> unconstrained
        assertAccepted(await postForm('multi', { id: 'l4', both: 'x', free: 'abcdefgh' }));
        assert.deepStrictEqual(await ids('multi'), ['l1', 'l2', 'l3', 'l4']);
    });
});

test('multi-form: a value violating every form is rejected', async () => {
    await withProject(MULTI, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('multi', { id: 'v1', both: 'x', name: 'x'.repeat(21) }), 'name too long for both');
        assertFormRejected(await postForm('multi', { id: 'v2', both: 'x', age: '500' }), 'age above both maxima');
        assertFormRejected(await postForm('multi', { id: 'v3', both: 'x', age: '0' }), 'age below both minima');
        assert.deepStrictEqual(await ids('multi'), []);
    });
});

// ---------------------------------------------------------------------------------------------
// Entity without forms
// ---------------------------------------------------------------------------------------------

test('an entity with no forms in the project is not validated (unchanged behaviour)', async () => {
    const files = { 'index.html': '<html><body>no forms here</body></html>' };
    await withProject(files, async ({ postForm, sendJson, ids }) => {
        assertAccepted(await postForm('ghost', { id: 'g1', whatever: '' }));
        const res = await sendJson('ghost', { id: 'g2', anything: 1 });
        assert.ok(res.status >= 200 && res.status < 400, `got ${res.status}`);
        assert.deepStrictEqual(await ids('ghost'), ['g1', 'g2']);
    });
});

test('forms of another entity do not constrain an unrelated entity', async () => {
    await withProject(BOOKS, async ({ postForm, ids }) => {
        assertAccepted(await postForm('other', { id: 'o1' }));
        assert.deepStrictEqual(await ids('other'), ['o1']);
    });
});

// ---------------------------------------------------------------------------------------------
// Response shapes: HTML form vs JSON
// ---------------------------------------------------------------------------------------------

test('form POST failure: 303 to data-t-redirect with ?error=<message>', async () => {
    await withProject(BOOKS, async ({ postForm }) => {
        const res = await postForm('books', { year: '1500' });
        assertFormRejected(res);
        const err = new URL(res.headers.get('location'), 'http://x').searchParams.get('error');
        assert.match(err, /title/i, `error should name the offending field: ${err}`);
    });
});

test('form POST failure keeps existing query of data-t-redirect', async () => {
    await withProject(BOOKS, async ({ api }) => {
        const res = await fetch(api('books'), {
            method: 'POST', headers: FORM_H, redirect: 'manual',
            body: new URLSearchParams({ 'data-t-redirect': '/new.html?tab=2', year: '1500' }).toString()
        });
        assert.strictEqual(res.status, 303);
        const loc = res.headers.get('location');
        assert.ok(loc.startsWith('/new.html?tab=2&error='), loc);
    });
});

test('form POST failure without data-t-redirect falls back to the Referer', async () => {
    await withProject(BOOKS, async ({ api, base, ids }) => {
        const res = await fetch(api('books'), {
            method: 'POST', redirect: 'manual',
            headers: { ...FORM_H, Referer: `${base}/form.html` },
            body: 'year=1500'
        });
        assert.strictEqual(res.status, 303);
        assert.match(res.headers.get('location') || '', /\/form\.html\?error=/);
        assert.deepStrictEqual(await ids('books'), []);
    });
});

test('Accept: text/html (non-form body) is answered like a form request', async () => {
    await withProject(BOOKS, async ({ api, ids }) => {
        const res = await fetch(api('books'), {
            method: 'POST', redirect: 'manual',
            headers: { ...JSON_H, Accept: 'text/html' },
            body: JSON.stringify({ 'data-t-redirect': '/thanks.html', year: 1500 })
        });
        assertFormRejected(res);
        assert.deepStrictEqual(await ids('books'), []);
    });
});

test('JSON POST failure: 400 with JSON { error }, nothing written', async () => {
    await withProject(BOOKS, async ({ sendJson, ids }) => {
        await assertJsonRejected(await sendJson('books', { id: 'j1' }), 400);
        await assertJsonRejected(await sendJson('books', { id: 'j2', title: 'ok', year: 3000 }), 400);
        assert.deepStrictEqual(await ids('books'), []);
    });
});

test('JSON POST success still stores the record and redirects as before', async () => {
    await withProject(BOOKS, async ({ sendJson, rows }) => {
        const res = await sendJson('books', { id: 'j1', title: 'Fine', year: 2000 });
        assertAccepted(res);
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'Fine');
    });
});

// ---------------------------------------------------------------------------------------------
// POST never overwrites (409), PUT replaces
// ---------------------------------------------------------------------------------------------

test('POST with an existing id (JSON) is 409 and leaves the record untouched', async () => {
    await withProject(BOOKS, async ({ sendJson, rows }) => {
        await db.save('books', 's9', { title: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('books', { id: 's9', title: 'OVERWRITTEN' }), 409);
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'ORIGINAL');
    });
});

test('POST with an existing id given as ?id= is refused (JSON 409 / form 303 error)', async () => {
    await withProject(BOOKS, async ({ sendJson, postForm, rows }) => {
        await db.save('books', 's9', { title: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('books', { title: 'OVERWRITTEN' }, '?id=s9'), 409);
        assertFormRejected(await postForm('books', { title: 'OVERWRITTEN' }, '?id=s9'));
        assert.strictEqual((await rows('books'))[0].title, 'ORIGINAL');
    });
});

test('POST with a duplicate id on an entity without forms is also refused', async () => {
    await withProject({ 'index.html': '<html></html>' }, async ({ sendJson, rows }) => {
        await db.save('ghost', 'd1', { v: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('ghost', { id: 'd1', v: 'NEW' }), 409);
        assert.strictEqual((await rows('ghost'))[0].v, 'ORIGINAL');
    });
});

test('POST with a new id, or without id, still creates', async () => {
    await withProject(BOOKS, async ({ postForm, sendJson, ids }) => {
        await db.save('books', 'old', { title: 'Old' });
        assertAccepted(await postForm('books', { id: 'fresh', title: 'Fresh' }));
        assertAccepted(await sendJson('books', { title: 'No id' }));
        const all = await ids('books');
        assert.strictEqual(all.length, 3);
        assert.ok(all.includes('old') && all.includes('fresh'));
    });
});

test('PUT with a valid body replaces the record', async () => {
    await withProject(BOOKS, async ({ sendJson, rows }) => {
        await db.save('books', 'p1', { title: 'Before', year: 1999 });
        const res = await sendJson('books', { title: 'After' }, '?id=p1', 'PUT');
        assertAccepted(res);
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'After');
    });
});

test('PUT creates the record when the id does not exist yet', async () => {
    await withProject(BOOKS, async ({ sendJson, ids }) => {
        assertAccepted(await sendJson('books', { title: 'Created' }, '?id=newone', 'PUT'));
        assert.deepStrictEqual(await ids('books'), ['newone']);
    });
});

test('PUT with an invalid body is rejected (JSON 400) and the record is unchanged', async () => {
    await withProject(BOOKS, async ({ sendJson, rows }) => {
        await db.save('books', 'p1', { title: 'Keep me' });
        await assertJsonRejected(await sendJson('books', { title: '' }, '?id=p1', 'PUT'), 400);
        await assertJsonRejected(await sendJson('books', { title: 'x'.repeat(81) }, '?id=p1', 'PUT'), 400);
        assert.strictEqual((await rows('books'))[0].title, 'Keep me');
    });
});

test('POST ?_method=PUT form with an invalid body redirects back with an error and changes nothing', async () => {
    await withProject(BOOKS, async ({ postForm, rows }) => {
        await db.save('books', 'p1', { title: 'Keep me' });
        const res = await postForm('books', { year: '1500' }, '?id=p1&_method=PUT');
        assertFormRejected(res);
        assert.strictEqual((await rows('books'))[0].title, 'Keep me');
    });
});

test('POST ?_method=PUT form with a valid body updates the record', async () => {
    await withProject(BOOKS, async ({ postForm, rows }) => {
        await db.save('books', 'p1', { title: 'Before' });
        assertAccepted(await postForm('books', { title: 'After' }, '?id=p1&_method=PUT'));
        assert.strictEqual((await rows('books'))[0].title, 'After');
    });
});

// ---------------------------------------------------------------------------------------------
// DELETE is not validated
// ---------------------------------------------------------------------------------------------

test('DELETE is not validated: removes the record although the form has required fields', async () => {
    await withProject(BOOKS, async ({ api, sameOrigin, postForm, ids }) => {
        await db.save('books', 'd1', { title: 'A' });
        await db.save('books', 'd2', { title: 'B' });
        const res = await fetch(api('books', '?id=d1'), { method: 'DELETE', headers: sameOrigin, redirect: 'manual' });
        assertAccepted(res);
        // form-style delete (empty body, no required title) must work too
        const res2 = await postForm('books', {}, '?id=d2&_method=DELETE');
        assertAccepted(res2);
        assert.deepStrictEqual(await ids('books'), []);
    });
});

// ---------------------------------------------------------------------------------------------
// Hot reload of the project's HTML
// ---------------------------------------------------------------------------------------------

test('editing a form (adding `required`) takes effect without restarting the server', async () => {
    const page = (attrs) => formPage('hot', `<input name="title" ${attrs}>`);
    await withProject({ 'index.html': page('') }, async ({ dir, postForm, ids }) => {
        // Not required yet: an empty submission is accepted (also primes any schema/template cache)
        assertAccepted(await postForm('hot', { id: 'before' }));
        assert.deepStrictEqual(await ids('hot'), ['before']);

        fs.writeFileSync(path.join(dir, 'index.html'), page('required'));

        // fs.watch is asynchronous: poll until the new constraint is in force
        const deadline = Date.now() + 8000;
        let rejected = false;
        let n = 0;
        while (Date.now() < deadline) {
            const res = await postForm('hot', { id: `probe${n++}` });
            if (res.status === 303 && /[?&]error=/.test(res.headers.get('location') || '')) { rejected = true; break; }
            await new Promise(r => setTimeout(r, 150));
        }
        assert.ok(rejected, 'form edit (added `required`) was not picked up by the Data API');
    });
});

// ---------------------------------------------------------------------------------------------
// Which forms count as write forms; includes; dynamic options
// ---------------------------------------------------------------------------------------------

test('a delete-only form does not weaken the create form (required is still enforced)', async () => {
    const files = {
        'index.html': formPage('notes', '<input name="title" required>'),
        'list.html': '<html><body><form method="POST" action="_sys/data/notes.json?id=1&_method=DELETE"><button>x</button></form></body></html>'
    };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('notes', { id: 'n1' }));
        assertAccepted(await postForm('notes', { id: 'n2', title: 'ok' }));
        assert.deepStrictEqual(await ids('notes'), ['n2']);
    });
});

test('a GET search form pointing at the data href is ignored', async () => {
    const files = {
        'index.html': formPage('notes', '<input name="title" required>'),
        'search.html': '<html><body><form method="GET" action="_sys/data/notes.json"><input name="title"></form></body></html>'
    };
    await withProject(files, async ({ postForm }) => {
        assertFormRejected(await postForm('notes', { id: 'n1' }));
    });
});

test('an entity with only delete/GET forms is not validated', async () => {
    const files = {
        'list.html': '<html><body><form method="POST" action="_sys/data/notes.json?id=1&_method=DELETE"><input name="title" required></form></body></html>'
    };
    await withProject(files, async ({ postForm, ids }) => {
        assertAccepted(await postForm('notes', { id: 'n1' }));
        assert.deepStrictEqual(await ids('notes'), ['n1']);
    });
});

test('fields inside a data-t-include partial are validated; templated radio options are not checked as an enum', async () => {
    const files = {
        'new.html': '<html><body><form method="POST" action="/_sys/data/things.json"><div data-t-include="_parts/fields.html"></div></form></body></html>',
        '_parts/fields.html': '<input name="title" required maxlength="5"><label data-t-list="cats"><input type="radio" name="cat" value="{cats.id}" required></label>'
    };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('things', { id: 't1', cat: 'c1' }), 'missing title');
        assertFormRejected(await postForm('things', { id: 't2', title: 'toolong', cat: 'c1' }), 'maxlength');
        assertFormRejected(await postForm('things', { id: 't3', title: 'ok' }), 'required radio group generated by data-t-list');
        assertAccepted(await postForm('things', { id: 't4', title: 'ok', cat: 'any-id-from-db' }));
        assert.deepStrictEqual(await ids('things'), ['t4']);
    });
});

test('a scaffolded-style edit form (POST ?_method=PUT with hidden id) overwrites, POST with that id does not', async () => {
    const files = { 'edit.html': '<html><body><form method="POST" action="_sys/data/posts.json?_method=PUT"><input type="hidden" name="id"><input name="title" required></form></body></html>' };
    await withProject(files, async ({ postForm, rows }) => {
        await db.save('posts', 'p1', { title: 'Before' });
        assertAccepted(await postForm('posts', { id: 'p1', title: 'After' }, '?_method=PUT'));
        assert.strictEqual((await rows('posts'))[0].title, 'After');
        assertFormRejected(await postForm('posts', { id: 'p1', title: 'Again' }));
    });
});

// ---------------------------------------------------------------------------------------------
// Review round: ids, non-scalar values, false rejections, no-redirect fallback, cache
// ---------------------------------------------------------------------------------------------

test('POST ids that are not a string/number are refused (boolean id cannot hit record "1")', async () => {
    await withProject(BOOKS, async ({ sendJson, rawForm, rows }) => {
        await db.save('books', '1', { title: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('books', { id: true, title: 'X' }), 400);
        await assertJsonRejected(await sendJson('books', { id: ['1'], title: 'X' }), 400);
        await assertJsonRejected(await sendJson('books', { id: { a: 1 }, title: 'X' }), 400);
        await assertJsonRejected(await sendJson('books', { title: 'X' }, '?id=1&id=2'), 400);
        assertFormRejected(await rawForm('books', 'data-t-redirect=%2Fthanks.html&id=3&id=x&title=X'));
        assertFormRejected(await rawForm('books', 'data-t-redirect=%2Fthanks.html&id[]=4&title=X'));
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'ORIGINAL');
    });
});

test('POST with a braced id: the second POST is a 409, not a silent overwrite', async () => {
    await withProject(BOOKS, async ({ sendJson, rows }) => {
        assertAccepted(await sendJson('books', { id: '{a}', title: 'FIRST' }));
        await assertJsonRejected(await sendJson('books', { id: '{a}', title: 'SECOND' }), 409);
        await assertJsonRejected(await sendJson('books', { title: 'THIRD' }, '?id=%7Ba%7D'), 409);
        const all = await rows('books');
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].title, 'FIRST');
    });
});

test('numeric ids are compared exactly (POST 5 over "5" is 409)', async () => {
    await withProject(BOOKS, async ({ sendJson }) => {
        await db.save('books', '5', { title: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('books', { id: 5, title: 'X' }), 409);
    });
});

test('PUT with a non string/number id is refused', async () => {
    await withProject(BOOKS, async ({ sendJson, rawForm, rows }) => {
        await db.save('books', '1', { title: 'ORIGINAL' });
        await assertJsonRejected(await sendJson('books', { id: true, title: 'X' }, '', 'PUT'), 400);
        await assertJsonRejected(await sendJson('books', { title: 'X' }, '?id=1&id=2', 'PUT'), 400);
        assertFormRejected(await rawForm('books', 'data-t-redirect=%2Fthanks.html&id=1&id=2&title=X', '?_method=PUT'));
        assert.strictEqual((await rows('books'))[0].title, 'ORIGINAL');
    });
});

test('non-scalar values cannot bypass the constraints of a scalar field', async () => {
    const files = { 'index.html': formPage('s', '<input name="title" required maxlength="5"><input name="year" type="number" min="1" max="9">') };
    await withProject(files, async ({ rawForm, sendJson, ids }) => {
        const base = {};
        const R = 'data-t-redirect=%2Fthanks.html&';
        assertFormRejected(await rawForm('s', R + 'id=a&title=a&title=b'), 'title=a&title=b');
        assertFormRejected(await rawForm('s', R + 'id=b&title=&title=b'), 'title=&title=b');
        await assertJsonRejected(await sendJson('s', { id: 'c', title: ['', ''], ...base }), 400);
        await assertJsonRejected(await sendJson('s', { id: 'd', title: { a: 1 }, ...base }), 400);
        await assertJsonRejected(await sendJson('s', { id: 'e', title: 'ok', year: [1], ...base }), 400);
        await assertJsonRejected(await sendJson('s', { id: 'f', title: 'ok', year: { a: 1 }, ...base }), 400);
        // a field named like an inherited property is really required (own-property lookup)
        assert.deepStrictEqual(scanner.validateRecord({ fields: [{ name: 'constructor', type: 'text', required: true }] }, {}), ['constructor is required']);
        assert.deepStrictEqual(await ids('s'), []);
        // a text field takes a string only (Issue #52): a JSON false/0 no longer satisfies required
        await assertJsonRejected(await sendJson('s', { id: 'g', title: false, ...base }), 400);
        await assertJsonRejected(await sendJson('s', { id: 'k', title: 0, ...base }), 400);
        await assertJsonRejected(await sendJson('s', { id: 'j', title: 123456, ...base }), 400);
        // a number field takes a JSON number (stored as a number)
        assertAccepted(await sendJson('s', { id: 'h', title: 'ok', year: 1, ...base }));
        assertAccepted(await sendJson('s', { id: 'i', title: '0', ...base }));
        assert.deepStrictEqual(await ids('s'), ['h', 'i']);
    });
});

test('select[multiple] and checkbox groups take arrays (each element validated); single controls do not', async () => {
    const files = { 'index.html': formPage('m', [
        '<select name="tags" multiple required><option value="a">a</option><option value="b">b</option></select>',
        '<input type="checkbox" name="opt" value="x"><input type="checkbox" name="opt" value="y">',
        '<input type="email" name="mails" multiple>'
    ].join('')) };
    await withProject(files, async ({ rawForm, postForm, sendJson, ids }) => {
        const R = 'data-t-redirect=%2Fthanks.html&';
        assertAccepted(await rawForm('m', R + 'id=1&tags=a&tags=b&opt=x&opt=y'));
        assertAccepted(await postForm('m', { id: '2', tags: 'a', opt: 'x' }));
        assertFormRejected(await rawForm('m', R + 'id=3&tags=a&tags=zzz'), 'invalid element');
        assertFormRejected(await postForm('m', { id: '4' }), 'multiple select is required');
        assertAccepted(await sendJson('m', { id: '5', tags: ['a'], mails: 'a@b.co, c@d.org' }));
        await assertJsonRejected(await sendJson('m', { id: '6', tags: ['a'], mails: 'a@b.co, nope' }), 400);
        assert.deepStrictEqual(await ids('m'), ['1', '2', '5']);
    });
});

test('disabled controls, hidden constraints and conditional (data-t-if / repeated data-t-list) controls are never required', async () => {
    const controls = [
        '<input name="d" required disabled>',
        '<fieldset disabled><input name="fd" required></fieldset>',
        '<input type="hidden" name="h" required maxlength="1">',
        '<div data-t-if="x"><input name="c" required></div>',
        '<div data-t-list="rows"><input name="rep" required></div>',
        '<input name="plain" required>'
    ].join('');
    await withProject({ 'index.html': formPage('cond', controls) }, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('cond', { id: 'a' }));
        assertAccepted(await postForm('cond', { id: 'b', plain: 'x', h: 'way too long' }));
        assert.deepStrictEqual(await ids('cond'), ['b']);
    });
});

test('required: a single checkbox is enforced, a checkbox group is not', async () => {
    const files = { 'index.html': formPage('chk', '<input type="checkbox" name="agree" value="yes" required><input type="checkbox" name="g" value="1" required><input type="checkbox" name="g" value="2" required>') };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('chk', { id: 'a' }));
        assertAccepted(await postForm('chk', { id: 'b', agree: 'yes' }));
        assert.deepStrictEqual(await ids('chk'), ['b']);
    });
});

test('CRLF in a textarea counts as one character for maxlength', async () => {
    const files = { 'index.html': formPage('ta', '<textarea name="t" maxlength="5"></textarea>') };
    await withProject(files, async ({ postForm, ids }) => {
        assertAccepted(await postForm('ta', { id: 'a', t: 'ab\r\ncd' }));
        assertFormRejected(await postForm('ta', { id: 'b', t: 'abc\r\ndef' }));
        assert.deepStrictEqual(await ids('ta'), ['a']);
    });
});

test('urlencoded failure without data-t-redirect and without Referer answers with JSON, not a bare 400', async () => {
    await withProject(BOOKS, async ({ api, sameOrigin, ids }) => {
        const post = (body, qs = '') => fetch(api('books', qs), { method: 'POST', headers: { ...FORM_H, ...sameOrigin }, body, redirect: 'manual' });
        let res = await post('id=empty');
        await assertJsonRejected(res, 400);
        await db.save('books', 's9', { title: 'ORIGINAL' });
        res = await post('id=s9&title=X');
        await assertJsonRejected(res, 409);
        assert.deepStrictEqual(await ids('books'), ['s9']);
    });
});

test('the write schema is built once for concurrent requests and rebuilt after an HTML edit (also *.HTML)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-datavalid-'));
    fs.writeFileSync(path.join(dir, 'A.HTML'), formPage('w', '<input name="title">'));
    const server = new EngineServer(0, () => {}, { sqlite3 });
    try {
        await server.setCurrentProjectPath(dir);
        const p1 = server.getWriteSchema();
        const inflight = server.writeSchemaCache;
        const p2 = server.getWriteSchema();
        assert.strictEqual(server.writeSchemaCache, inflight, 'concurrent callers must share one in-flight scan');
        assert.strictEqual(await p1, await p2);
        assert.strictEqual((await p1).get('w').length, 1);
        fs.writeFileSync(path.join(dir, 'A.HTML'), formPage('w', '<input name="title" required>'));
        const deadline = Date.now() + 8000;
        let required = false;
        while (Date.now() < deadline && !required) {
            const forms = (await server.getWriteSchema()).get('w');
            required = forms[0].fields.get('title').required;
            if (!required) await new Promise(r => setTimeout(r, 100));
        }
        assert.ok(required, 'upper-case .HTML edit was not picked up');
    } finally {
        await server.stop();
        for (let i = 0; i < 5; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    }
});

test('a data-t-list radio group keeps `required`; a data-t-if radio group does not', async () => {
    const files = { 'index.html': formPage('bk', [
        '<label data-t-list="authors"><input type="radio" name="author_id" value="{authors.id}" required></label>',
        '<div data-t-if="x"><input type="radio" name="opt" value="a" required></div>'
    ].join('')) };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('bk', { id: 'a' }), 'missing author_id');
        assertAccepted(await postForm('bk', { id: 'b', author_id: 'a1' }));
        assert.deepStrictEqual(await ids('bk'), ['b']);
    });
});

test('a text input under data-t-if is not required', async () => {
    const files = { 'index.html': formPage('cx', '<div data-t-if="x"><input name="maybe" required></div><input name="always" required>') };
    await withProject(files, async ({ postForm, ids }) => {
        assertFormRejected(await postForm('cx', { id: 'a' }));
        assertAccepted(await postForm('cx', { id: 'b', always: 'x' }));
        assert.deepStrictEqual(await ids('cx'), ['b']);
    });
});
