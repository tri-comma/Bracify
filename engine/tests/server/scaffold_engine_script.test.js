import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

// Issue #55: the Studio scaffold must load the client engine through the single engine URL. Scaffolded pages live in
// <entity>/, so the relative form is ../bracify.js (it works on file:// and under the server's virtual /bracify.js).
// The old /engine/lib/engine.cjs path never resolved (the server only maps /engine/engine.cjs).

const require = createRequire(import.meta.url);
const scanner = require('../../server/schema-scanner.cjs');

const schema = {
    entity: 'posts',
    fields: [{ name: 'id', type: 'string' }, { name: 'title', type: 'string' }, { name: 'views', type: 'number' }]
};

test('scaffolded pages load exactly one engine script: ../bracify.js', () => {
    const files = scanner.scaffoldFiles(schema);
    assert.deepStrictEqual(Object.keys(files).sort(), ['posts/edit.html', 'posts/index.html']);
    for (const [rel, html] of Object.entries(files)) {
        const srcs = Array.from(new JSDOM(html).window.document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
        assert.deepStrictEqual(srcs, ['../bracify.js'], rel);
    }
});

test('scaffolded pages no longer reference the unresolvable /engine/lib path', () => {
    for (const html of Object.values(scanner.scaffoldFiles(schema))) {
        assert.ok(!html.includes('/engine/lib/'));
        assert.ok(!/engine\.cjs/.test(html));
    }
});
