import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

test('Security: Double Evaluation Protection', async (t) => {
    const { Engine, resolveValue } = Bracify;

    await t.test('resolveValue should not evaluate nested placeholders in a single call', () => {
        const data = {
            a: '{b}',
            b: 'secret'
        };
        // If it's a single pass, {a} becomes {b} but {b} is NOT resolved.
        const result = resolveValue('{a}', data);
        assert.strictEqual(result, '{b}', 'Should return literal {b}, not resolve it further');
    });

    await t.test('Engine should not perform double evaluation during DOM processing', async () => {
        const dom = new JSDOM('<div>{user.bio}</div>');
        const document = dom.window.document;
        global.document = document;
        global.Node = dom.window.Node;

        const data = {
            user: {
                bio: 'I am {secret}'
            },
            secret: 'SHHH'
        };

        const engine = new Engine();
        await engine.processElement(document.body, data);

        assert.strictEqual(document.body.innerHTML, '<div>I am {secret}</div>', 'Should not resolve {secret} from the data');

        delete global.document;
        delete global.Node;
    });

    await t.test('Parallel placeholders should be evaluated correctly', () => {
        const data = {
            item: { name: 'Bracify', version: '1.0' }
        };
        const result = resolveValue('{item.name} v{item.version}', data);
        assert.strictEqual(result, 'Bracify v1.0', 'Should resolve multiple independent placeholders');
    });

    await t.test('Nested placeholders in expression should be handled safely (NG case)', () => {
        const data = {
            prop: 'name',
            item: { name: 'Bracify' }
        };
        // {item.{prop}} -> Should not be resolved to 'Bracify'
        const result = resolveValue('{item.{prop}}', data);
        assert.strictEqual(result, '{item.{prop}}', 'Should reject and return the raw string when nesting is detected');
    });
});
