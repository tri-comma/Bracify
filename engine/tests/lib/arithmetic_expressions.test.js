import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

const { resolveValue, evaluateExpression, getNestedValue } = Bracify;

test('Arithmetic expressions in placeholders', async (t) => {
    const data = {
        _sys: { query: { _offset: '20' } },
        item: { price: 100, qty: 3 },
        projects: [{ title: 'A' }, { title: 'B' }]
    };

    await t.test('adds variables (pagination offset)', () => {
        // {_sys.query._offset + 10} -> query value "20" + 10 = 30
        assert.strictEqual(resolveValue('{_sys.query._offset + 10}', data), '30');
    });

    await t.test('supports the four basic operations', () => {
        assert.strictEqual(resolveValue('{item.price + 1}', data), '101');
        assert.strictEqual(resolveValue('{item.price - 1}', data), '99');
        assert.strictEqual(resolveValue('{item.price * 2}', data), '200');
        assert.strictEqual(resolveValue('{item.price / 4}', data), '25');
    });

    await t.test('supports the modulo operator', () => {
        assert.strictEqual(resolveValue('{10 % 3}', data), '1');
        assert.strictEqual(resolveValue('{item.qty % 2}', data), '1');
    });

    await t.test('supports parentheses and precedence', () => {
        assert.strictEqual(resolveValue('{(item.price + 50) * 2}', data), '300');
        assert.strictEqual(resolveValue('{item.price + 2 * 3}', data), '106');
        assert.strictEqual(resolveValue('{(2 + 3) * (4 - 1)}', data), '15');
    });

    await t.test('supports expressions without spaces around operators', () => {
        assert.strictEqual(resolveValue('{item.price*2+1}', data), '201');
    });

    await t.test('supports unary minus', () => {
        assert.strictEqual(resolveValue('{-item.price + 150}', data), '50');
        assert.strictEqual(resolveValue('{-(2 + 3)}', data), '-5');
    });

    await t.test('supports nested property access in expressions', () => {
        const nested = {
            order: { line: { price: 80 } }
        };
        assert.strictEqual(resolveValue('{order.line.price * 2}', nested), '160');
    });

    await t.test('renders index correction {projects._index + 1}', () => {
        const scoped = { ...data, projects: { ...data.projects[1], _index: 1 } };
        assert.strictEqual(resolveValue('{projects._index + 1}', scoped), '2');
    });
});

test('Arithmetic expressions combined with pipe filters', async (t) => {
    const data = {
        item: { price: 100 }
    };

    await t.test('passes the computed result into the number pipe', () => {
        // {item.price * 1.1 | number} -> 110 (100 * 1.1)
        assert.strictEqual(resolveValue('{item.price * 1.1 | number}', data), '110');
    });

    await t.test('pipe still works on plain paths (regression)', () => {
        assert.strictEqual(resolveValue('{item.price | number}', data), '100');
    });

    await t.test('works with multiple placeholders in one string', () => {
        assert.strictEqual(
            resolveValue('Total: {item.price * 1.1 | number} yen (qty {item.qty * 2})', { ...data, item: { price: 100, qty: 3 } }),
            'Total: 110 yen (qty 6)'
        );
    });
});

test('Safe evaluation of undefined / non-numeric values', async (t) => {
    const data = {
        item: { price: 100 }
    };

    await t.test('falls back to 0 for an undefined variable', () => {
        assert.strictEqual(resolveValue('{missing.var + 5}', data), '5');
        assert.strictEqual(resolveValue('{missing * 10}', data), '0');
    });

    await t.test('falls back to 0 for null variables', () => {
        const d = { item: { discount: null } };
        assert.strictEqual(resolveValue('{item.discount + 5}', d), '5');
    });

    await t.test('falls back to 0 for non-numeric variables', () => {
        const d = { item: { name: 'Bracify' } };
        assert.strictEqual(resolveValue('{item.name + 1}', d), '1');
    });

    await t.test('does not throw on a malformed expression', () => {
        assert.strictEqual(resolveValue('{foo + }', data), '0');
        assert.strictEqual(resolveValue('{()}', data), '0');
    });

    await t.test('guards against division by zero', () => {
        assert.strictEqual(resolveValue('{10 / 0}', data), '0');
        assert.strictEqual(resolveValue('{10 % 0}', data), '0');
    });

    await t.test('cleans up floating point artifacts', () => {
        assert.strictEqual(resolveValue('{0.1 * 3}', data), '0.3');
        assert.strictEqual(resolveValue('{item.price * 1.1}', data), '110');
    });

    await t.test('hyphenated keys stay plain lookups (not arithmetic)', () => {
        const d = { item: { 'first-name': 'Taro' } };
        assert.strictEqual(resolveValue('{item.first-name}', d), 'Taro');
    });

    await t.test('missing path without operators still keeps placeholder (regression)', () => {
        assert.strictEqual(resolveValue('{item.notfound}', data), '{item.notfound}');
    });
});

test('evaluateExpression (direct unit)', async (t) => {
    const data = {
        price: 100,
        qty: 3
    };

    await t.test('evaluates basic arithmetic', () => {
        assert.strictEqual(evaluateExpression('2 + 3 * 4', data), 14);
        assert.strictEqual(evaluateExpression('(2 + 3) * 4', data), 20);
        assert.strictEqual(evaluateExpression('10 - 4', data), 6);
        assert.strictEqual(evaluateExpression('9 / 2', data), 4.5);
        assert.strictEqual(evaluateExpression('7 % 4', data), 3);
    });

    await t.test('resolves variable paths from data', () => {
        assert.strictEqual(evaluateExpression('price * qty', data), 300);
        assert.strictEqual(evaluateExpression('price + 1', data), 101);
    });

    await t.test('falls back undefined variables to 0', () => {
        assert.strictEqual(evaluateExpression('unknown + 10', data), 10);
    });
});

test('List iteration injects a 0-based _index for index correction', async (t) => {
    const dom = new JSDOM('<ul><li data-t-list="projects">No. {projects._index + 1}: {projects.title}</li></ul>');
    const document = dom.window.document;
    global.document = document;
    global.Node = dom.window.Node;

    const { Engine } = Bracify;
    const data = {
        projects: [{ title: 'Alpha' }, { title: 'Beta' }, { title: 'Gamma' }]
    };

    try {
        const engine = new Engine();
        await engine.processElement(document.body, data);
        const lis = document.querySelectorAll('li');
        assert.strictEqual(lis.length, 3);
        assert.strictEqual(lis[0].textContent, 'No. 1: Alpha');
        assert.strictEqual(lis[1].textContent, 'No. 2: Beta');
        assert.strictEqual(lis[2].textContent, 'No. 3: Gamma');
    } finally {
        delete global.document;
        delete global.Node;
    }
});
