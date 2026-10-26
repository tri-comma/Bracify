import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const EngineServer = require('../../server/index.cjs');
const db = require('../../server/db/index.cjs');
const scanner = require('../../server/schema-scanner.cjs');
const sqlite3 = require('sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_SRC = path.resolve(__dirname, '../../../studio');

let tmpRoot, studioDir, userDir;
let server, base;
let userServer;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// fs.cpSync is unstable on some Node builds (segfault on Windows); copy manually
const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
};

const write = (rel, content) => {
    const f = path.join(userDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
};

const post = (url, fields = {}, headers = {}) => fetch(base + url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString()
});

const page = async (p) => (await fetch(base + p)).text();

const pageData = async (p, origin = base) => {
    const html = await (await fetch(origin + p)).text();
    const m = html.match(/window\.__BRACIFY_DATA__ = (.*);/);
    return JSON.parse(m[1].replace(/\\u003c/g, '<'));
};

// Read the user project's records through a separate DB manager
const userRecords = async (entity, filters = {}, dir = userDir) => {
    const dbm = await db.openProject(dir);
    try { return await dbm.find(entity, filters); } finally { await dbm.close(); }
};

const studioRecords = async (entity) => {
    const data = await pageData('/index.html');
    return data[entity] || [];
};

const loc = (r) => r.headers.get('location') || '';
const errOf = (r) => new URL(loc(r), 'http://x').searchParams.get('error');

const ENT = '/data/entity.html?project=u&entity=posts';

before(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bracify-sd-'));
    studioDir = path.join(tmpRoot, 'studio-like');
    copyDir(STUDIO_SRC, studioDir);
    fs.rmSync(path.join(studioDir, '_sys'), { recursive: true, force: true });

    userDir = path.join(tmpRoot, 'user-proj');
    fs.mkdirSync(userDir, { recursive: true });
    write('index.html', `<!DOCTYPE html><html><body>
<link data-t-source="posts" href="_sys/data/posts.json">
<ul><li data-t-list="posts">{posts.title} by {posts.author} {posts.fromplaceholder}</li></ul>
<form method="POST" action="_sys/data/posts.json" data-t-redirect="index.html">
  <input type="hidden" name="data-t-redirect" value="index.html">
  <input type="text" name="title" required maxlength="20" minlength="2">
  <input type="number" name="views" min="0" max="100">
  <input type="email" name="email">
  <input type="date" name="due">
  <input type="checkbox" name="published">
  <select name="category"><option value="a">A</option><option value="b">B</option></select>
  <textarea name="body"></textarea>
  <input type="text" name="meta.note">
  <input type="text" name="code" pattern="[A-Z]{3}">
  <button type="submit">Save</button>
</form>
</body></html>`);
    write('_parts/footer.html', `<link data-t-source="tags" href="_sys/data/tags.json?_limit=5"><p>{tags.label}</p>`);
    write('node_modules/pkg/x.html', `<link data-t-source="bad" href="_sys/data/bad.json">`);
    write('.hidden/x.html', `<link data-t-source="hiddenent" href="_sys/data/hiddenent.json">`);
    write('_sys/skip.html', `<link data-t-source="sysent" href="_sys/data/sysent.json">`);

    // Seed the user project's DB
    server = new EngineServer(0, () => { }, { sqlite3, manageProjects: true });
    const seed = await db.openProject(userDir);
    await seed.save('posts', 'p1', { title: 'Seed', views: 5, extra: 'x', flag: true, obj: { a: 1 } });
    await seed.save('legacy', 'l1', { name: 'old' });
    await seed.close();

    await server.start();
    await server.setCurrentProjectPath(studioDir);
    base = `http://localhost:${server.port}`;

    await post('/_sys/data/projects.json', { id: 'u', name: 'User Proj', path: userDir, port: '0', status: 'stopped' });
    await post('/_sys/data/projects.json', { id: 'gone', name: 'Gone', path: path.join(tmpRoot, 'nope'), port: '0', status: 'stopped' });
});

after(async () => {
    try { if (userServer) await userServer.stop(); } catch (e) { console.error('cleanup user server failed:', e.message); }
    try { if (server) await server.stop(); } catch (e) { console.error('cleanup server.stop failed:', e.message); }
    for (let i = 0; i < 10; i++) {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); break; } catch (e) {
            console.error(`cleanup rm attempt ${i + 1} failed: ${e.message}`);
            await sleep(500);
        }
    }
});

test('schema scanner', async (t) => {
    const posts = async () => {
        const data = await pageData('/data/entity.html?project=u&entity=posts');
        return data.schema;
    };

    await t.test('collects entities from HTML (incl. _parts), skips node_modules/_sys/dot dirs', () => {
        const names = scanner.scan(userDir).map(e => e.entity).sort();
        assert.deepStrictEqual(names, ['posts', 'tags']);
        const tags = scanner.scan(userDir).find(e => e.entity === 'tags');
        assert.deepStrictEqual(tags.files, ['_parts/footer.html']);
        assert.ok(tags.fields.some(f => f.name === 'label'), 'placeholder field');
    });

    await t.test('field types and validation attributes from forms', async () => {
        const s = await posts();
        const f = Object.fromEntries(s.fields.map(x => [x.name, x]));
        assert.strictEqual(f.title.type, 'text');
        assert.strictEqual(f.title.required, true);
        assert.strictEqual(f.title.maxlength, 20);
        assert.strictEqual(f.title.minlength, 2);
        assert.strictEqual(f.views.type, 'number');
        assert.strictEqual(f.views.min, 0);
        assert.strictEqual(f.views.max, 100);
        assert.strictEqual(f.email.type, 'email');
        assert.strictEqual(f.due.type, 'date');
        assert.strictEqual(f.published.type, 'checkbox');
        assert.strictEqual(f.category.type, 'enum');
        assert.deepStrictEqual(f.category.options, ['a', 'b']);
        assert.strictEqual(f.body.type, 'text');
        assert.strictEqual(f['meta.note'].type, 'text', 'dotted name kept as nested field path');
        assert.strictEqual(f.code.pattern, '[A-Z]{3}');
        assert.ok(!f['data-t-redirect'], 'data-t-redirect skipped');
    });

    await t.test('placeholders add unknown fields; DB records infer types', async () => {
        const s = await posts();
        const f = Object.fromEntries(s.fields.map(x => [x.name, x]));
        assert.strictEqual(f.author.type, 'unknown');
        assert.strictEqual(f.extra.type, 'string');
        assert.strictEqual(f.flag.type, 'boolean');
        assert.strictEqual(f.obj.type, 'object');
        assert.strictEqual(f.views.type, 'number');
        assert.strictEqual(s.count, 1);
    });

    await t.test('DB-only entities are listed', async () => {
        const data = await pageData('/data/index.html?project=u');
        const byName = Object.fromEntries(data.entities.map(e => [e.entity, e]));
        assert.deepStrictEqual(Object.keys(byName).sort(), ['legacy', 'posts', 'tags']);
        assert.strictEqual(byName.legacy.count, 1);
        assert.strictEqual(byName.posts.count, 1);
        assert.ok(byName.posts.fieldCount >= 10);
        assert.deepStrictEqual(byName.legacy.files, []);
    });
});

test('studio pages render via SSR', async (t) => {
    await t.test('entity list page', async () => {
        const html = await page('/data/index.html?project=u');
        assert.ok(html.includes('User Proj'));
        assert.ok(html.includes('entity=posts'));
        assert.ok(html.includes('entity=legacy'));
        assert.ok(html.includes('/_sys/studio/scaffold?project=u&amp;entity=posts') || html.includes('/_sys/studio/scaffold?project=u&entity=posts'));
        assert.ok(!html.includes('{entities.'), 'no unresolved placeholders');
    });

    await t.test('entity page: schema, records, edit and create forms', async () => {
        const html = await page(ENT);
        assert.ok(html.includes('Seed'));
        assert.ok(/name="title"/.test(html));
        assert.ok(/type="number"[^>]*name="views"/.test(html), 'number input generated from schema type');
        assert.ok(/type="email"[^>]*name="email"/.test(html));
        assert.ok(/type="date"[^>]*name="due"/.test(html));
        assert.ok(/type="checkbox"[^>]*name="published"/.test(html));
        assert.ok(/<select[^>]*name="category"/.test(html));
        assert.ok(html.includes('value="a"') && html.includes('value="b"'));
        assert.ok(html.includes('/_sys/studio/records?project=u'));
        assert.ok(html.includes('/_sys/studio/records/update?project=u'));
        assert.ok(html.includes('id=p1'));
        assert.ok(html.includes('/_sys/studio/records/delete?project=u'));
        assert.ok(!/\{records\.|\{schema\./.test(html), 'no unresolved placeholders');
    });

    await t.test('records source supports filters / _sort / _limit', async () => {
        const dbm = await db.openProject(userDir);
        await dbm.save('posts', 'f1', { title: 'Beta', views: '2' });
        await dbm.save('posts', 'f2', { title: 'Alpha', views: '3' });
        await dbm.close();
        const html = await page('/data/entity.html?project=u&entity=posts');
        assert.ok(html.includes('Alpha') && html.includes('Beta'));
        const out = await userRecords('posts', { title: 'Alpha' });
        assert.strictEqual(out.length, 1);
        const rec = await server.studioData.fetch('_sys/studio/records.json?project=u&entity=posts&_sort=title&_limit=1&_order=desc');
        assert.strictEqual(rec.title, 'Seed', '_limit=1 unwraps like the Data API');
        const filtered = await server.studioData.fetch('_sys/studio/records.json?project=u&entity=posts&title=Beta');
        assert.strictEqual(filtered.length, 1);
        assert.ok(Array.isArray(filtered[0].cells));
        const dbm2 = await db.openProject(userDir);
        await dbm2.remove('posts', { id: 'f1' });
        await dbm2.remove('posts', { id: 'f2' });
        await dbm2.close();
    });

    await t.test('GET over HTTP on studio endpoints stays blocked; bad project/entity yield no data', async () => {
        const r = await fetch(base + '/_sys/studio/records.json?project=u&entity=posts');
        assert.strictEqual(r.status, 403);
        assert.strictEqual(await server.studioData.fetch('_sys/studio/records.json?project=gone&entity=posts'), null);
        assert.strictEqual(await server.studioData.fetch('_sys/studio/records.json?project=nope&entity=posts'), null);
        assert.strictEqual(await server.studioData.fetch('_sys/studio/records.json?project=u&entity=..%2F..%2Fx'), null);
        assert.strictEqual(await server.studioData.fetch('_sys/studio/records.json?project=u&entity=_secret'), null);
    });
});

test('CRUD via SSR forms hits the target project DB only', async (t) => {
    const R = '/_sys/studio/records?project=u&entity=posts';

    await t.test('create', async () => {
        const studioBefore = await studioRecords('projects');
        const r = await post(R, { 'data-t-redirect': ENT, title: 'Hello', views: '7', published: 'on', category: 'b', 'meta.note': 'n1', code: 'ABC' });
        assert.strictEqual(r.status, 303);
        assert.strictEqual(loc(r), ENT);
        const rows = await userRecords('posts', { title: 'Hello' });
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].views, '7');
        assert.strictEqual(rows[0].published, 'on');
        assert.deepStrictEqual(rows[0].meta, { note: 'n1' });
        assert.ok(!('data-t-redirect' in rows[0]));
        // Studio's own DB is untouched
        assert.deepStrictEqual(await studioRecords('projects'), studioBefore);
        const studioPosts = await db.find('posts', {});
        assert.strictEqual(studioPosts.length, 0, 'no posts entity created in Studio DB');
    });

    await t.test('rendered page shows created record with checked checkbox and selected option', async () => {
        const html = await page(ENT);
        assert.ok(html.includes('Hello'));
        assert.ok(/type="checkbox"[^>]*name="published"[^>]*checked/.test(html));
    });

    await t.test('update', async () => {
        const [rec] = await userRecords('posts', { title: 'Hello' });
        const r = await post(`/_sys/studio/records/update?project=u&entity=posts&id=${rec.id}`, { 'data-t-redirect': ENT, title: 'Hello2', views: '8', category: 'a' });
        assert.strictEqual(r.status, 303);
        const [after] = await userRecords('posts', { id: rec.id });
        assert.strictEqual(after.title, 'Hello2');
        assert.strictEqual(after.views, '8');
        assert.ok(!('published' in after), 'unchecked checkbox removed');
        assert.ok(!('meta' in after));
        assert.strictEqual((await userRecords('posts')).length, 2);
    });

    await t.test('update preserves fields outside the schema-driven form', async () => {
        const [seed] = await userRecords('posts', { id: 'p1' });
        assert.strictEqual(seed.title, 'Seed');
        const r = await post('/_sys/studio/records/update?project=u&entity=posts&id=p1', { 'data-t-redirect': ENT, title: 'Seed2' });
        assert.strictEqual(r.status, 303);
        const [after] = await userRecords('posts', { id: 'p1' });
        assert.strictEqual(after.title, 'Seed2');
    });

    await t.test('update of an unknown id is an error', async () => {
        const r = await post('/_sys/studio/records/update?project=u&entity=posts&id=missing', { 'data-t-redirect': ENT, title: 'X1' });
        assert.strictEqual(r.status, 303);
        assert.ok(/not found/i.test(errOf(r)));
    });

    await t.test('validation failures redirect back with ?error and do not write', async () => {
        const before = (await userRecords('posts')).length;
        const cases = [
            [{ views: '5' }, /title is required/],
            [{ title: 'x'.repeat(21) }, /at most 20/],
            [{ title: 'x' }, /at least 2/],
            [{ title: 'Ok', views: 'abc' }, /must be a number/],
            [{ title: 'Ok', views: '101' }, /at most 100/],
            [{ title: 'Ok', views: '-1' }, /at least 0/],
            [{ title: 'Ok', email: 'nope' }, /valid email/],
            [{ title: 'Ok', due: '2020-13-45' }, /valid date/],
            [{ title: 'Ok', category: 'zzz' }, /one of/],
            [{ title: 'Ok', code: 'abcd' }, /pattern/]
        ];
        for (const [fields, re] of cases) {
            const r = await post(R, { 'data-t-redirect': ENT, ...fields });
            assert.strictEqual(r.status, 303);
            assert.ok(loc(r).startsWith(ENT + '&error='), loc(r));
            assert.ok(re.test(errOf(r)), `${JSON.stringify(fields)} -> ${errOf(r)}`);
        }
        assert.strictEqual((await userRecords('posts')).length, before);
        // update validation too
        const r = await post('/_sys/studio/records/update?project=u&entity=posts&id=p1', { 'data-t-redirect': ENT, title: '' });
        assert.ok(/required/.test(errOf(r)));
        assert.strictEqual((await userRecords('posts', { id: 'p1' }))[0].title, 'Seed2');
    });

    await t.test('error page displays the message', async () => {
        const html = await page(ENT + '&error=' + encodeURIComponent('title is required'));
        assert.ok(html.includes('title is required'));
    });

    await t.test('falls back to Referer when data-t-redirect is absent', async () => {
        const r = await post(R, { title: 'RefTest' }, { Referer: base + ENT });
        assert.strictEqual(loc(r), base + ENT);
        await post('/_sys/studio/records/delete?project=u&entity=posts&id=' + (await userRecords('posts', { title: 'RefTest' }))[0].id, { 'data-t-redirect': ENT });
    });

    await t.test('delete', async () => {
        const [rec] = await userRecords('posts', { title: 'Hello2' });
        const r = await post(`/_sys/studio/records/delete?project=u&entity=posts&id=${rec.id}`, { 'data-t-redirect': ENT });
        assert.strictEqual(r.status, 303);
        assert.strictEqual((await userRecords('posts', { id: rec.id })).length, 0);
        assert.strictEqual((await userRecords('posts', { id: 'p1' })).length, 1, 'other records untouched');
        const r2 = await post('/_sys/studio/records/delete?project=u&entity=posts', { 'data-t-redirect': ENT });
        assert.ok(/id is required/i.test(errOf(r2)));
    });

    await t.test('project routing config (separate sqlite storage) is honoured', async () => {
        const dbm = await db.openProject(userDir);
        // keep the project DB handle for config; route entity "routed" to its own file
        const SQLiteAdapter = require('../../server/db/drivers/sqlite.cjs');
        const anchor = new SQLiteAdapter({ sqlite3, projectPath: userDir });
        await anchor.init();
        await anchor.saveConfig('db', [{ target_entity: 'routed', engine: 'sqlite', option: { storage: path.join(userDir, '_sys', 'routed.db') } }]);
        await anchor.close();
        await dbm.close();
        write('routed.html', `<link data-t-source="routed" href="_sys/data/routed.json">`);
        const r = await post('/_sys/studio/records?project=u&entity=routed', { 'data-t-redirect': ENT, name: 'R1' });
        assert.strictEqual(r.status, 303);
        assert.ok(!errOf(r), errOf(r));
        const routed = await userRecords('routed');
        assert.strictEqual(routed.length, 1);
        // not stored in the main project DB table
        const raw = await new Promise((resolve, reject) => {
            const d = new sqlite3.Database(path.join(userDir, '_sys', 'data.db'), (e) => {
                if (e) return reject(e);
                d.all("SELECT * FROM data_records WHERE entity='routed'", (e2, rows) => { d.close(); e2 ? reject(e2) : resolve(rows); });
            });
        });
        assert.strictEqual(raw.length, 0);
        fs.rmSync(path.join(userDir, 'routed.html'));
    });
});

test('scaffold (dev only)', async (t) => {
    await t.test('generates list and edit pages; refuses to overwrite', async () => {
        const r = await post('/_sys/studio/scaffold?project=u&entity=posts', { 'data-t-redirect': '/data/index.html?project=u&scaffolded=posts' });
        assert.strictEqual(r.status, 303);
        assert.ok(!errOf(r), errOf(r));
        const index = fs.readFileSync(path.join(userDir, 'posts', 'index.html'), 'utf-8');
        const edit = fs.readFileSync(path.join(userDir, 'posts', 'edit.html'), 'utf-8');
        assert.ok(index.includes('data-t-source="posts"') && index.includes('data-t-list="posts"'));
        assert.ok(/_method=DELETE/.test(index));
        assert.ok(edit.includes('data-t-scope="posts"') && edit.includes('data-t-redirect="index.html"'));
        assert.ok(/name="title"[^>]*required|required[^>]*name="title"/.test(edit));
        assert.ok(/maxlength="20"/.test(edit));
        assert.ok(/pattern="\[A-Z\]\{3\}"/.test(edit));
        assert.ok(/type="number"/.test(edit) && /type="email"/.test(edit) && /type="date"/.test(edit) && /type="checkbox"/.test(edit));
        assert.ok(/<select[^>]*name="category"/.test(edit));

        // second run: error, files untouched
        fs.writeFileSync(path.join(userDir, 'posts', 'index.html'), index + '<!-- keep -->');
        const r2 = await post('/_sys/studio/scaffold?project=u&entity=posts', { 'data-t-redirect': '/data/index.html?project=u' });
        assert.ok(/already exists/.test(errOf(r2)), errOf(r2));
        assert.ok(fs.readFileSync(path.join(userDir, 'posts', 'index.html'), 'utf-8').endsWith('<!-- keep -->'));
        fs.writeFileSync(path.join(userDir, 'posts', 'index.html'), index);
    });

    await t.test('studio list page shows scaffold success message', async () => {
        const html = await page('/data/index.html?project=u&scaffolded=posts');
        assert.ok(html.includes('Scaffold created for posts'));
    });

    await t.test('generated pages render and work when the user project is served', async () => {
        userServer = new EngineServer(0, () => { }, { sqlite3 });
        await userServer.start();
        // The user server shares the DB module singleton; point it at the user project for this test
        await userServer.setCurrentProjectPath(userDir);
        const ub = `http://localhost:${userServer.port}`;
        try {
            const list = await (await fetch(ub + '/posts/index.html')).text();
            assert.ok(list.includes('Seed2'), 'list renders records');
            assert.ok(!list.includes('data-t-list'), 'list attribute processed');
            assert.ok(list.includes('_sys/data/posts.json?id=p1&amp;_method=DELETE'));

            const editNew = await (await fetch(ub + '/posts/edit.html')).text();
            assert.ok(/<form[^>]*method="POST"/.test(editNew));
            assert.ok(!editNew.includes('value="Seed2"'), 'new-record form must not be prefilled with another record');

            const editExisting = await (await fetch(ub + '/posts/edit.html?id=p1')).text();
            assert.ok(/name="title"[^>]*value="Seed2"|value="Seed2"[^>]*name="title"/.test(editExisting), 'edit form bound to record');

            // generated delete form works through the Data API (_method override)
            const created = await fetch(ub + '/_sys/data/posts.json', {
                method: 'POST', redirect: 'manual',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ id: 'del1', title: 'ToDelete' }).toString()
            });
            assert.strictEqual(created.status, 302);
            const del = await fetch(ub + '/_sys/data/posts.json?id=del1&_method=DELETE', {
                method: 'POST', redirect: 'manual',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ 'data-t-redirect': 'index.html' }).toString()
            });
            assert.strictEqual(del.status, 302);
        } finally {
            await userServer.stop();
            userServer = null;
            // restore the Studio DB for subsequent tests
            await server.setCurrentProjectPath(studioDir);
        }
        assert.strictEqual((await userRecords('posts', { id: 'del1' })).length, 0);
    });
});

test('security and error handling', async (t) => {
    await t.test('cross-origin POST is rejected on all studio endpoints', async () => {
        for (const url of ['/_sys/studio/records?project=u&entity=posts', '/_sys/studio/records/update?project=u&entity=posts&id=p1', '/_sys/studio/records/delete?project=u&entity=posts&id=p1', '/_sys/studio/scaffold?project=u&entity=legacy']) {
            const r = await post(url, { title: 'Evil' }, { Origin: 'http://evil.example' });
            assert.strictEqual(r.status, 403, url);
        }
        assert.strictEqual((await userRecords('posts', { title: 'Evil' })).length, 0);
        assert.ok(!fs.existsSync(path.join(userDir, 'legacy')));
        // same-origin Origin header is accepted
        const ok = await post('/_sys/studio/records/delete?project=u&entity=posts&id=none', { 'data-t-redirect': ENT }, { Origin: base });
        assert.strictEqual(ok.status, 303);
    });

    await t.test('invalid / unknown entity names are rejected', async () => {
        for (const entity of ['..%2F..%2Fevil', '../evil', '_secret', 'a%20b', '', 'nothere']) {
            const r = await post(`/_sys/studio/scaffold?project=u&entity=${entity}`, { 'data-t-redirect': '/data/index.html?project=u' });
            assert.strictEqual(r.status, 303, entity);
            assert.ok(errOf(r), `error for ${entity}`);
        }
        const r = await post('/_sys/studio/records?project=u&entity=..%2Fx', { title: 'T1', 'data-t-redirect': ENT });
        assert.ok(errOf(r));
        assert.ok(!fs.existsSync(path.join(tmpRoot, 'evil')) && !fs.existsSync(path.join(userDir, '..', 'evil')));
    });

    await t.test('invalid project is rejected', async () => {
        for (const p of ['nope', 'gone', '']) {
            const r = await post(`/_sys/studio/records?project=${p}&entity=posts`, { title: 'Tx', 'data-t-redirect': ENT });
            assert.strictEqual(r.status, 303, p);
            assert.ok(errOf(r), p);
        }
        const r = await post('/_sys/studio/records?project=u&entity=posts', { views: '1' });
        assert.strictEqual(r.status, 400, 'no redirect target: plain error');
    });

    await t.test('studio data endpoints are 404 when manageProjects is off', async () => {
        const plain = new EngineServer(0, () => { }, { sqlite3 });
        await plain.start();
        await plain.setCurrentProjectPath(studioDir);
        const pb = `http://localhost:${plain.port}`;
        try {
            const r = await fetch(pb + '/_sys/studio/records?project=u&entity=posts', { method: 'POST', redirect: 'manual' });
            assert.strictEqual(r.status, 404);
            const s = await fetch(pb + '/_sys/studio/scaffold?project=u&entity=posts', { method: 'POST', redirect: 'manual' });
            assert.strictEqual(s.status, 404);
            // SSR href whitelist is not extended
            const html = await (await fetch(pb + '/data/index.html?project=u')).text();
            assert.ok(!html.includes('entity=posts'), 'no studio data rendered');
        } finally {
            await plain.stop();
            await server.setCurrentProjectPath(studioDir);
        }
    });
});

test('review hardening', async (t) => {
    await t.test('Data API rejects cross-origin writes (POST, POST?_method=DELETE, PUT); no-Origin and same-origin work', async () => {
        const evil = { Origin: 'http://evil.example' };
        const ok = await post('/_sys/data/notes.json', { id: 'n1', text: 'hi', 'data-t-redirect': '/index.html' });
        assert.strictEqual(ok.status, 302, 'no Origin header allowed');
        const count = async () => (await db.find('notes', {})).length;
        assert.strictEqual(await count(), 1);

        const r1 = await post('/_sys/data/notes.json', { id: 'n2', text: 'x' }, evil);
        assert.strictEqual(r1.status, 403);
        const r2 = await post('/_sys/data/notes.json?id=n1&_method=DELETE', {}, evil);
        assert.strictEqual(r2.status, 403);
        const r3 = await fetch(base + '/_sys/data/notes.json?id=n1', { method: 'PUT', redirect: 'manual', headers: { ...evil, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=changed' });
        assert.strictEqual(r3.status, 403);
        const r4 = await fetch(base + '/_sys/data/notes.json?id=n1', { method: 'DELETE', redirect: 'manual', headers: evil });
        assert.strictEqual(r4.status, 403);
        const rec = await db.find('notes', {});
        assert.strictEqual(rec.length, 1);
        assert.strictEqual(rec[0].text, 'hi', 'nothing changed');

        const same = await post('/_sys/data/notes.json?id=n1&_method=DELETE', {}, { Origin: base });
        assert.strictEqual(same.status, 302);
        assert.strictEqual(await count(), 0, 'same-origin _method=DELETE still works');
    });

    await t.test('ReDoS: nested-quantifier patterns are not enforced and respond quickly; long input rejected', async () => {
        write('redos.html', `<form action="_sys/data/redos.json" method="POST"><input name="v" pattern="(a+)+$"><input name="w" pattern="[a-z]+"></form>`);
        const schema = await server.studioData.fetch('_sys/studio/schema.json?project=u&entity=redos');
        assert.strictEqual(schema.fields.find(f => f.name === 'v').patternSkipped, true);
        const start = Date.now();
        const r = await post('/_sys/studio/records?project=u&entity=redos', { 'data-t-redirect': ENT, v: 'a'.repeat(40) + '!', w: 'abc' });
        assert.ok(Date.now() - start < 3000, 'returned quickly');
        assert.ok(!errOf(r), errOf(r));
        const long = await post('/_sys/studio/records?project=u&entity=redos', { 'data-t-redirect': ENT, w: 'a'.repeat(1001) });
        assert.ok(/too long/.test(errOf(long)), errOf(long));
        fs.rmSync(path.join(userDir, 'redos.html'));
    });

    await t.test('scanner drops field names with markup', () => {
        write('evil.html', `<form action="_sys/data/evilent.json"><input name="ok"><input name='x"><script>alert(1)</script>'><input name="a b"></form>`);
        const e = scanner.scan(userDir).find(x => x.entity === 'evilent');
        assert.deepStrictEqual(e.fields.map(f => f.name), ['ok']);
        const files = scanner.scaffoldFiles(e);
        for (const c of Object.values(files)) assert.ok(!c.includes('<script>'));
        fs.rmSync(path.join(userDir, 'evil.html'));
    });

    await t.test('required checkbox is not enforced', async () => {
        write('chk.html', `<form action="_sys/data/chk.json" method="POST"><input name="name"><input type="checkbox" name="agree" required></form>`);
        const r = await post('/_sys/studio/records?project=u&entity=chk', { 'data-t-redirect': ENT, name: 'n' });
        assert.ok(!errOf(r), errOf(r));
        assert.strictEqual((await userRecords('chk')).length, 1);
        fs.rmSync(path.join(userDir, 'chk.html'));
    });
});
