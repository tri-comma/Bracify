import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

// Issue #101: a layout <form> that wraps a page's `data-t-content` slot. The write schema (#53) only expanded
// `data-t-include` INSIDE a <form>, so fields the page pours into the layout's slot were never seen: not validated
// (#53) and not typed (#52). The fields must come from the page after the slot has been filled.

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const sqlite3 = require('sqlite3').verbose();

// One connection per request (see data_api_validation.test.js)
const fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, headers: { Connection: 'close', ...(opts.headers || {}) } });

const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JSON_H = { 'Content-Type': 'application/json' };

async function withProject(files, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-layoutform-'));
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
    const row = async (entity, id) => (await rows(entity)).find(r => String(r.id) === String(id));
    const postForm = (entity, fields) => fetch(api(entity), {
        method: 'POST',
        headers: { ...FORM_H, Origin: base },
        body: new URLSearchParams({ 'data-t-redirect': '/thanks.html', ...fields }).toString(),
        redirect: 'manual'
    });
    const sendJson = (entity, data) => fetch(api(entity), {
        method: 'POST',
        headers: { ...JSON_H, Accept: 'application/json', Origin: base },
        body: JSON.stringify(data),
        redirect: 'manual'
    });
    try {
        await fn({ dir, server, base, api, rows, row, postForm, sendJson });
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

// ---- project building blocks ----

const layoutWith = (slots, attrs = '') =>
    `<form method="POST" action="_sys/data/articles.json" data-t-redirect="index.html"${attrs}>${slots}<button>Save</button></form>`;
const useLayout = (layout, slots) =>
    `<html><body><div data-t-include="${layout}">${slots}</div></body></html>`;
const slot = (name, inner) => `<div data-t-content="${name}">${inner}</div>`;

// The issue's example
const ISSUE = {
    '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
    'new.html': useLayout('_parts/layout.html', slot('fields', '<input name="title" required maxlength="80">'))
};

// ---------------------------------------------------------------------------------------------
// 1. The issue's example
// ---------------------------------------------------------------------------------------------

test('layout form: a missing required title from the page slot is refused (form -> 303 ?error, JSON -> 400)', async () => {
    await withProject(ISSUE, async ({ postForm, sendJson, rows }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'form without title');
        const err = await assertJsonRejected(await sendJson('articles', { id: 'a2' }), 'JSON without title');
        assert.match(err, /title/);
        assert.strictEqual((await rows('articles')).length, 0, 'nothing saved');
    });
});

test('layout form: maxlength of the slot field is enforced', async () => {
    await withProject(ISSUE, async ({ postForm, sendJson, rows }) => {
        assertFormRejected(await postForm('articles', { id: 'a1', title: 'x'.repeat(81) }), 'form too long');
        await assertJsonRejected(await sendJson('articles', { id: 'a2', title: 'x'.repeat(81) }), 'JSON too long');
        assert.strictEqual((await rows('articles')).length, 0);
    });
});

test('layout form: a valid title is saved', async () => {
    await withProject(ISSUE, async ({ postForm, sendJson, row }) => {
        assertAccepted(await postForm('articles', { id: 'a1', title: 'x'.repeat(80) }));
        assertAccepted(await sendJson('articles', { id: 'a2', title: 'hello' }));
        assert.strictEqual((await row('articles', 'a1')).title, 'x'.repeat(80));
        assert.strictEqual((await row('articles', 'a2')).title, 'hello');
    });
});

test('layout form: page content outside any data-t-content fills the unnamed (default) slot', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content></div>'),
        'new.html': useLayout('_parts/layout.html', '<input name="title" required>')
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'default slot');
        assertAccepted(await postForm('articles', { id: 'a2', title: 't' }));
    });
});

// ---------------------------------------------------------------------------------------------
// 2. Typing (#52) applies to slot fields too
// ---------------------------------------------------------------------------------------------

test('layout form: a type="number" slot field is stored as a number and a non-number is refused', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        'new.html': useLayout('_parts/layout.html', slot('fields', '<input name="title" required><input name="price" type="number" min="0">'))
    }, async ({ postForm, sendJson, row }) => {
        assertAccepted(await postForm('articles', { id: 'a1', title: 't', price: '9' }));
        assert.strictEqual((await row('articles', 'a1')).price, 9, 'form value typed as number');
        assertAccepted(await sendJson('articles', { id: 'a2', title: 't', price: '10' }));
        assert.strictEqual((await row('articles', 'a2')).price, 10, 'JSON numeric string typed as number');
        assertFormRejected(await postForm('articles', { id: 'a3', title: 't', price: 'abc' }), 'not a number');
        assertFormRejected(await postForm('articles', { id: 'a4', title: 't', price: '-1' }), 'below min');
    });
});

// ---------------------------------------------------------------------------------------------
// 3. Nested layouts and multiple slots
// ---------------------------------------------------------------------------------------------

test('layout form: several slots of one layout all contribute fields', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<section data-t-content="main"></section><aside data-t-content="side"></aside>'),
        'new.html': useLayout('_parts/layout.html',
            slot('main', '<input name="title" required>') + slot('side', '<input name="price" type="number" required>'))
    }, async ({ postForm, row }) => {
        assertFormRejected(await postForm('articles', { id: 'a1', price: '1' }), 'missing title (main slot)');
        assertFormRejected(await postForm('articles', { id: 'a2', title: 't' }), 'missing price (side slot)');
        assertAccepted(await postForm('articles', { id: 'a3', title: 't', price: '5' }));
        assert.strictEqual((await row('articles', 'a3')).price, 5);
    });
});

test('layout form: nested layouts (outer layout includes the form layout) expose the page field', async () => {
    await withProject({
        // inner owns the <form>; outer fills inner's "fields" slot and adds its own slot "extra" and field "author"
        '_parts/inner.html': layoutWith('<div data-t-content="fields"></div>'),
        '_parts/outer.html': `<div data-t-include="_parts/inner.html">${slot('fields', '<input name="author" required>' + slot('extra', ''))}</div>`,
        'new.html': useLayout('_parts/outer.html', slot('extra', '<input name="title" required maxlength="10">'))
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1', author: 'me' }), 'missing page title');
        assertFormRejected(await postForm('articles', { id: 'a2', title: 't' }), 'missing outer layout author');
        assertFormRejected(await postForm('articles', { id: 'a3', author: 'me', title: 'x'.repeat(11) }), 'title too long');
        assertAccepted(await postForm('articles', { id: 'a4', author: 'me', title: 'ok' }));
    });
});

// ---------------------------------------------------------------------------------------------
// 4. data-t-if and slot-name mismatch
// ---------------------------------------------------------------------------------------------

test('layout form: a slot field under data-t-if in the page drops required but keeps other constraints', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        'new.html': useLayout('_parts/layout.html', slot('fields', '<div data-t-if="show"><input name="title" required maxlength="5"></div>'))
    }, async ({ postForm, row }) => {
        assertAccepted(await postForm('articles', { id: 'a1' }));
        assert.ok(await row('articles', 'a1'), 'saved without the conditional field');
        assertFormRejected(await postForm('articles', { id: 'a2', title: 'too long' }), 'maxlength still enforced');
    });
});

test('layout form: a layout slot element carrying data-t-if also drops required', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-if="show" data-t-content="fields"></div>'),
        'new.html': useLayout('_parts/layout.html', slot('fields', '<input name="title" required maxlength="5">'))
    }, async ({ postForm }) => {
        assertAccepted(await postForm('articles', { id: 'a1' }));
        assertFormRejected(await postForm('articles', { id: 'a2', title: 'too long' }), 'maxlength still enforced');
    });
});

test('layout form: page content for a slot the layout does not have contributes no fields', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div><input name="note" maxlength="3">'),
        'new.html': useLayout('_parts/layout.html', slot('other', '<input name="ghost" required maxlength="2">'))
    }, async ({ postForm, row }) => {
        // ghost is never rendered, so it is neither required nor length-limited
        assertAccepted(await postForm('articles', { id: 'a1', ghost: 'way too long' }));
        assert.ok(await row('articles', 'a1'));
        // fields the layout itself declares are still validated
        assertFormRejected(await postForm('articles', { id: 'a2', note: 'toolong' }), 'layout own field');
    });
});

test('layout form: a slot the page leaves unfilled contributes no fields (the layout form stays valid)', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        'new.html': useLayout('_parts/layout.html', '')
    }, async ({ postForm }) => {
        assertAccepted(await postForm('articles', { id: 'a1', anything: 'goes' }));
    });
});

// ---------------------------------------------------------------------------------------------
// 5. The bare layout file is not a second, field-less write form
// ---------------------------------------------------------------------------------------------
//
// The scan walks EVERY .html file, so `_parts/layout.html` is also scanned on its own. Its <form> has an unfilled
// slot, i.e. it declares NO `title`. validateWriteForms is "loosest wins": an empty value is only an error when
// EVERY write form of the entity contains the field and requires it (`declaring.length < forms.length` => skip).
// If the bare layout were counted as an extra form next to the page-filled one, `title` would be declared by 1 of
// 2 forms and its `required` would silently be dropped, defeating the whole fix. Intended behavior: the form that
// users actually submit is the page-filled one; a layout whose slots are filled by pages (it is used as a layout)
// must not add a separate, slot-less form. So required must still be enforced below.

test('layout form: the bare layout file does not make the page-filled required field optional', async () => {
    await withProject(ISSUE, async ({ postForm, sendJson }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'title required despite the bare layout file');
        await assertJsonRejected(await sendJson('articles', { id: 'a2' }), 'JSON');
    });
});

test('layout form: two pages using one layout are two forms; the loosest page still wins', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        'new.html': useLayout('_parts/layout.html', slot('fields', '<input name="title" required>')),
        'quick.html': useLayout('_parts/layout.html', slot('fields', '<input name="title">'))
    }, async ({ postForm }) => {
        // quick.html does not require a title, so a record without one is a legitimate submission
        assertAccepted(await postForm('articles', { id: 'a1' }));
    });
});

test('layout form: a plain form on another page is counted next to the layout-filled form (required needs every form)', async () => {
    await withProject({
        ...ISSUE,
        'other.html': '<html><body><form method="POST" action="_sys/data/articles.json"><input name="body"></form></body></html>'
    }, async ({ postForm }) => {
        // other.html has no title: loosest wins, so a missing title is accepted (documented #53 rule)
        assertAccepted(await postForm('articles', { id: 'a1', body: 'b' }));
    });
});

// ---------------------------------------------------------------------------------------------
// 6. Performance guard: 200 pages that use a form layout
// ---------------------------------------------------------------------------------------------

const buildMany = (n, mode) => {
    const files = {
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        '_parts/fields.html': '<input name="title" required maxlength="80"><input name="price" type="number">'
    };
    for (let i = 0; i < n; i++) {
        files[`p${i}.html`] = mode === 'layout'
            ? useLayout('_parts/layout.html', slot('fields', '<input name="title" required maxlength="80"><input name="price" type="number">'))
            // baseline: the pre-existing supported shape (include inside the form)
            : `<html><body><form method="POST" action="_sys/data/articles.json"><div data-t-include="_parts/fields.html"></div></form></body></html>`;
    }
    return files;
};

const timeScan = async (server) => {
    server.writeSchemaCache = null;
    const t0 = process.hrtime.bigint();
    const schema = await server.getWriteSchema();
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, schema };
};

test('layout form: scanning 200 layout-mode pages stays within a loose bound of the include-in-form baseline', async () => {
    let baseline;
    await withProject(buildMany(200, 'include'), async ({ server }) => {
        baseline = (await timeScan(server)).ms;
    });
    await withProject(buildMany(200, 'layout'), async ({ server, postForm }) => {
        const { ms, schema } = await timeScan(server);
        console.log(`[perf #101] 200 pages scan: include-in-form baseline ${baseline.toFixed(0)}ms, layout-mode ${ms.toFixed(0)}ms`);
        // Correctness first: the layout pages must actually have contributed (otherwise a fast scan proves nothing)
        const forms = schema.get('articles') || [];
        assert.ok(forms.some(f => f.fields.has('title')), 'layout-mode pages expose the slot field');
        // Relative on purpose (absolute times vary a lot between machines). The old full-render approach cost roughly
        // 2.5x this baseline; allow 3x plus 3s of slack so only a real regression trips it.
        assert.ok(ms < baseline * 3 + 3000,`layout-mode scan ${ms.toFixed(0)}ms vs baseline ${baseline.toFixed(0)}ms`);
        assertFormRejected(await postForm('articles', { id: 'x' }), 'still validated');
    });
});

// ---------------------------------------------------------------------------------------------
// 7. Review follow-ups: root-level includes and "a file is dropped only when a page really used it as a layout"
// ---------------------------------------------------------------------------------------------

const bodyLayout = (layout, slots) => `<html><body data-t-include="${layout}">${slots}</body></html>`;

test('layout form: <body data-t-include> pages (the examples\' shape) expose the slot field', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<div data-t-content="fields"></div>'),
        'new.html': bodyLayout('_parts/layout.html', slot('fields', '<input name="title" required maxlength="5">'))
    }, async ({ postForm, sendJson, rows }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'missing title');
        await assertJsonRejected(await sendJson('articles', { id: 'a2', title: 'too long' }), 'JSON too long');
        assertAccepted(await postForm('articles', { id: 'a3', title: 'ok' }));
        assert.strictEqual((await rows('articles')).length, 1);
    });
});

test('layout form: <body data-t-include> with a nested layout exposes the fields of both levels', async () => {
    await withProject({
        '_parts/inner.html': layoutWith('<div data-t-content="fields"></div>'),
        '_parts/outer.html': `<div data-t-include="_parts/inner.html">${slot('fields', '<input name="author" required>' + slot('extra', ''))}</div>`,
        'new.html': bodyLayout('_parts/outer.html', slot('extra', '<input name="title" required>'))
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1', author: 'me' }), 'missing title');
        assertFormRejected(await postForm('articles', { id: 'a2', title: 't' }), 'missing author');
        assertAccepted(await postForm('articles', { id: 'a3', title: 't', author: 'me' }));
    });
});

test('layout form: a layout with its own form that no page uses is still counted on its own (as before)', async () => {
    await withProject({
        '_parts/newsletter.html': `<form method="POST" action="_sys/data/articles.json"><input name="title" required><div data-t-content="extra"></div></form>`,
        'other.html': '<html><body><form method="POST" action="_sys/data/articles.json"><input name="title" required></form></body></html>'
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'title required by both forms');
    });
});

test('layout form: a layout reached only through a dynamic include path stays counted on its own', async () => {
    await withProject({
        '_parts/layout.html': layoutWith('<input name="title" required><div data-t-content="fields"></div>'),
        'page.html': `<html><body><div data-t-include="{?layout}">${slot('fields', '<input name="note">')}</div></body></html>`
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'standalone layout form still enforces title');
    });
});

test('layout form: a page with its own write form and a stray data-t-content is still scanned', async () => {
    await withProject({
        'page.html': `<html><body><form method="POST" action="_sys/data/articles.json"><input name="title" required></form><div><div data-t-content="x">y</div></div></body></html>`
    }, async ({ postForm }) => {
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'title required');
    });
});

test('layout form: circular layouts terminate and a missing partial contributes nothing', async () => {
    await withProject({
        '_parts/a.html': layoutWith(`<div data-t-include="_parts/b.html"><div data-t-content="fields"></div></div>`),
        '_parts/b.html': `<div data-t-include="_parts/a.html"><div data-t-content="fields"></div></div><div data-t-content="fields"></div>`,
        'new.html': useLayout('_parts/a.html', slot('fields', '<input name="title" required>')),
        'gone.html': useLayout('_parts/missing.html', slot('fields', '<input name="ghost" required>'))
    }, async ({ postForm }) => {
        // the cycle is cut; the page's own filled form is still read
        assertFormRejected(await postForm('articles', { id: 'a1' }), 'title required');
        assertAccepted(await postForm('articles', { id: 'a2', title: 't' }));
    });
});
