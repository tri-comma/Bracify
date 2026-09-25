import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');
const { resolveValue, Engine } = Bracify;

test('Pipe argument parsing', async (t) => {
    await t.test('no arguments', () => {
        assert.strictEqual(resolveValue('{name | uppercase}', { name: 'abc' }), 'ABC');
    });

    await t.test('unquoted numeric argument', () => {
        assert.strictEqual(resolveValue('{name | truncate: 5}', { name: 'abcdefgh' }), 'ab...');
    });

    await t.test('single-quoted argument', () => {
        assert.strictEqual(resolveValue("{d | date: 'yyyy'}", { d: '2025-06-01T00:00:00Z' }), '2025');
    });

    await t.test('double-quoted argument', () => {
        assert.strictEqual(resolveValue('{d | date: "yyyy"}', { d: '2025-06-01T00:00:00Z' }), '2025');
    });

    await t.test('multiple comma-separated arguments', () => {
        assert.strictEqual(resolveValue("{ok | ternary: 'Y', 'N'}", { ok: true }), 'Y');
        assert.strictEqual(resolveValue("{ok | ternary: 'Y', 'N'}", { ok: false }), 'N');
    });

    await t.test('quoted content preserves internal : , | as literal characters', () => {
        assert.strictEqual(resolveValue("{x | default: 'a:b,c|d'}", { x: undefined, other: 1 }), 'a:b,c|d');
    });

    await t.test('leading/trailing whitespace around pipe segments is trimmed', () => {
        assert.strictEqual(resolveValue('{ name  |  uppercase  }', { name: 'abc' }), 'ABC');
    });

    await t.test('missing closing quote runs to the end of the argument (no throw)', () => {
        assert.doesNotThrow(() => resolveValue("{x | default: 'abc}", { other: 1 }));
    });

    await t.test('date format string with time tokens survives colon-splitting', () => {
        assert.strictEqual(
            resolveValue("{d | date: 'yyyy/mm/dd HH:MM:SS'}", { d: new Date(2025, 11, 10, 14, 5, 9).toISOString() }),
            '2025/12/10 14:05:09'
        );
    });

    await t.test('unknown pipe name passes the value through unchanged', () => {
        assert.strictEqual(resolveValue('{name | nope}', { name: 'abc' }), 'abc');
    });

    await t.test('unknown pipe mid-chain is skipped, later pipes still apply', () => {
        assert.strictEqual(resolveValue('{name | nope | uppercase}', { name: 'abc' }), 'ABC');
    });

    await t.test('__proto__ / constructor as pipe names are ignored safely (no crash, no pollution)', () => {
        assert.strictEqual(resolveValue('{name | __proto__}', { name: 'abc' }), 'abc');
        assert.strictEqual(resolveValue('{name | constructor}', { name: 'abc' }), 'abc');
        assert.strictEqual(Object.prototype.polluted, undefined);
    });
});

test('Pipe chaining', async (t) => {
    await t.test('default -> uppercase', () => {
        const data = { user: {} }; // loaded, nickname missing
        assert.strictEqual(resolveValue("{user.nickname | default: 'guest' | uppercase}", data), 'GUEST');
    });

    await t.test('truncate -> uppercase', () => {
        assert.strictEqual(resolveValue("{name | truncate: 10 | uppercase}", { name: 'Bracify is simple' }), 'BRACIFY...');
    });

    await t.test('arithmetic expression -> currency', () => {
        const data = { item: { price: 1000 } };
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(1100);
        assert.strictEqual(resolveValue('{item.price * 1.1 | currency}', data), expected);
    });

    await t.test('uppercase -> default replaces empty result from an unloaded-but-present property', () => {
        const data = { user: {} }; // loaded scope, nickname missing -> uppercase yields '', then default replaces it
        assert.strictEqual(resolveValue("{user.nickname | uppercase | default: '-'}", data), '-');
    });
});

test('Existing pipe compatibility (date/number/arithmetic)', async (t) => {
    const iso = new Date(2025, 11, 10).toISOString();

    await t.test("date: 'yyyy/mm/dd'", () => {
        assert.strictEqual(resolveValue("{d | date: 'yyyy/mm/dd'}", { d: iso }), '2025/12/10');
    });

    await t.test('date: "yyyy"', () => {
        assert.strictEqual(resolveValue('{d | date: "yyyy"}', { d: iso }), '2025');
    });

    await t.test('number', () => {
        assert.strictEqual(resolveValue('{n | number}', { n: 12345 }), (12345).toLocaleString());
    });

    await t.test('{a * 2 | number}', () => {
        assert.strictEqual(resolveValue('{a * 2 | number}', { a: 5000 }), (10000).toLocaleString());
    });
});

test('uppercase / lowercase pipe', async (t) => {
    await t.test('ascii letters', () => {
        assert.strictEqual(resolveValue('{v | uppercase}', { v: 'abc-001' }), 'ABC-001');
        assert.strictEqual(resolveValue('{v | lowercase}', { v: 'ABC-001' }), 'abc-001');
    });

    await t.test('mixed with Japanese text (non-latin characters pass through)', () => {
        assert.strictEqual(resolveValue('{v | uppercase}', { v: 'abcあいう' }), 'ABCあいう');
    });

    await t.test('numeric value is stringified first', () => {
        assert.strictEqual(resolveValue('{v | uppercase}', { v: 123 }), '123');
    });

    await t.test('null yields empty string', () => {
        const data = { v: null };
        assert.strictEqual(resolveValue('{v | uppercase}', data), '');
    });
});

test('currency pipe', async (t) => {
    await t.test('defaults to JPY when currency code omitted', () => {
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(1500);
        assert.strictEqual(resolveValue('{p | currency}', { p: 1500 }), expected);
    });

    await t.test('explicit currency code', () => {
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(1500);
        assert.strictEqual(resolveValue("{p | currency: 'USD'}", { p: 1500 }), expected);
    });

    await t.test('decimal value', () => {
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(19.99);
        assert.strictEqual(resolveValue("{p | currency: 'USD'}", { p: 19.99 }), expected);
    });

    await t.test('numeric string is coerced', () => {
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(1500);
        assert.strictEqual(resolveValue('{p | currency}', { p: '1500' }), expected);
    });

    await t.test('non-numeric string passes through unchanged', () => {
        assert.strictEqual(resolveValue('{p | currency}', { p: 'N/A' }), 'N/A');
    });

    await t.test('null / empty string yields empty string', () => {
        assert.strictEqual(resolveValue('{p | currency}', { p: null }), '');
        assert.strictEqual(resolveValue('{p | currency}', { p: '' }), '');
    });

    await t.test('invalid currency code falls back to number-style formatting', () => {
        assert.strictEqual(resolveValue("{p | currency: 'NOTACODE'}", { p: 1500 }), (1500).toLocaleString());
    });

    await t.test('works with arithmetic expression', () => {
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(220);
        assert.strictEqual(resolveValue('{item.price * 2 | currency}', { item: { price: 110 } }), expected);
    });
});

test('truncate pipe', async (t) => {
    await t.test('truncates and appends "..." within the specified length', () => {
        assert.strictEqual(resolveValue('{v | truncate: 10}', { v: 'Bracify is simple' }), 'Bracify...');
    });

    await t.test('value exactly at the limit is unchanged', () => {
        assert.strictEqual(resolveValue('{v | truncate: 7}', { v: 'Bracify' }), 'Bracify');
    });

    await t.test('value shorter than the limit is unchanged', () => {
        assert.strictEqual(resolveValue('{v | truncate: 100}', { v: 'short' }), 'short');
    });

    await t.test('length of 3 or less omits "..." and hard-cuts', () => {
        assert.strictEqual(resolveValue('{v | truncate: 3}', { v: 'Bracify' }), 'Bra');
        assert.strictEqual(resolveValue('{v | truncate: 1}', { v: 'Bracify' }), 'B');
    });

    await t.test('surrogate pairs / emoji are not split', () => {
        // "😀😀😀😀😀" is 5 grapheme units via Array.from, each a surrogate pair in UTF-16
        assert.strictEqual(resolveValue('{v | truncate: 4}', { v: '😀😀😀😀😀' }), '😀...');
    });

    await t.test('missing or non-numeric length argument leaves value unchanged', () => {
        assert.strictEqual(resolveValue('{v | truncate}', { v: 'Bracify is simple' }), 'Bracify is simple');
        assert.strictEqual(resolveValue("{v | truncate: 'abc'}", { v: 'Bracify is simple' }), 'Bracify is simple');
        assert.strictEqual(resolveValue('{v | truncate: -5}', { v: 'Bracify is simple' }), 'Bracify is simple');
    });

    await t.test('null yields empty string', () => {
        assert.strictEqual(resolveValue('{v | truncate: 10}', { v: null }), '');
    });
});

test('default pipe', async (t) => {
    await t.test('loaded undefined property uses fallback', () => {
        assert.strictEqual(resolveValue("{user.nickname | default: 'no-name'}", { user: {} }), 'no-name');
    });

    await t.test('null uses fallback', () => {
        assert.strictEqual(resolveValue("{v | default: 'fallback'}", { v: null }), 'fallback');
    });

    await t.test('empty string uses fallback', () => {
        assert.strictEqual(resolveValue("{v | default: 'fallback'}", { v: '' }), 'fallback');
    });

    await t.test('0 is not empty, passes through', () => {
        assert.strictEqual(resolveValue("{v | default: 'fallback'}", { v: 0 }), '0');
    });

    await t.test('false is not empty, passes through', () => {
        assert.strictEqual(resolveValue("{v | default: 'fallback'}", { v: false }), 'false');
    });

    await t.test('normal value passes through, fallback unused', () => {
        assert.strictEqual(resolveValue("{v | default: 'fallback'}", { v: 'actual' }), 'actual');
    });

    await t.test('fallback argument may itself contain , and :', () => {
        assert.strictEqual(resolveValue("{v | default: 'a, b: c'}", { v: null }), 'a, b: c');
    });
});

test('ternary pipe', async (t) => {
    const cases = [
        [true, 'Y'], [false, 'N'], [0, 'N'], [1, 'Y'], ['', 'N'],
        ['false', 'Y'], ['0', 'Y'], [[], 'N'], [{}, 'N'], [[1], 'Y'], [{ a: 1 }, 'Y']
    ];
    for (const [val, expected] of cases) {
        await t.test(`isTruthy(${JSON.stringify(val)}) => ${expected}`, () => {
            assert.strictEqual(resolveValue("{v | ternary: 'Y', 'N'}", { v: val }), expected);
        });
    }

    await t.test('omitted false-case argument yields empty string', () => {
        assert.strictEqual(resolveValue("{v | ternary: 'Y'}", { v: false }), '');
    });
});

test('json pipe', async (t) => {
    await t.test('object', () => {
        assert.strictEqual(resolveValue('{v | json}', { v: { a: 1 } }), JSON.stringify({ a: 1 }, null, 2));
    });

    await t.test('array', () => {
        assert.strictEqual(resolveValue('{v | json}', { v: [1, 2] }), JSON.stringify([1, 2], null, 2));
    });

    await t.test('string', () => {
        assert.strictEqual(resolveValue('{v | json}', { v: 'abc' }), '"abc"');
    });

    await t.test('circular reference falls back to String()', () => {
        const circular = {};
        circular.self = circular;
        assert.strictEqual(resolveValue('{v | json}', { v: circular }), String(circular));
    });
});

test('Unresolved-data judgement (§3.5)', async (t) => {
    await t.test('top-level key missing: all pipes keep the placeholder, including number/date', () => {
        const data = {}; // e.g. CLI build without the "article"/"product" source
        assert.strictEqual(
            resolveValue("{article.updated_at | date: 'yyyy'}", data),
            "{article.updated_at | date: 'yyyy'}"
        );
        assert.strictEqual(resolveValue('{product.price | number}', data), '{product.price | number}');
        assert.strictEqual(
            resolveValue("{article.is_published | ternary: 'Y', 'N'}", data),
            "{article.is_published | ternary: 'Y', 'N'}"
        );
        assert.strictEqual(
            resolveValue("{article.nickname | default: '-'}", data),
            "{article.nickname | default: '-'}"
        );
    });

    await t.test('top-level key present, property missing: default/ternary apply, others become empty string', () => {
        const data = { article: {} }; // "article" was fetched, but has no such field
        assert.strictEqual(resolveValue("{article.updated_at | date: 'yyyy'}", data), '');
        assert.strictEqual(resolveValue('{article.price | number}', data), '');
        assert.strictEqual(resolveValue("{article.is_published | ternary: 'Y', 'N'}", data), 'N');
        assert.strictEqual(resolveValue("{article.nickname | default: '-'}", data), '-');
    });

    await t.test('top-level key present with a real value: normal pipe behavior', () => {
        const data = { article: { is_published: true } };
        assert.strictEqual(resolveValue("{article.is_published | ternary: 'Y', 'N'}", data), 'Y');
    });

    await t.test('placeholder without a pipe is unaffected by the loaded/unloaded distinction', () => {
        assert.strictEqual(resolveValue('{article.title}', {}), '{article.title}');
        assert.strictEqual(resolveValue('{article.title}', { article: {} }), '{article.title}');
    });

    await t.test('data-t-scope style short reference (ctx.inScope=true) counts as loaded', () => {
        assert.strictEqual(
            resolveValue("{nickname | default: 'guest'}", {}, { inScope: true }),
            'guest'
        );
        // Without inScope, the same lookup with no matching top-level key stays unresolved.
        assert.strictEqual(
            resolveValue("{nickname | default: 'guest'}", {}),
            "{nickname | default: 'guest'}"
        );
    });

    await t.test('?query params: loaded only when _sys is present (SSR/CSR vs CLI build)', () => {
        assert.strictEqual(
            resolveValue("{?id | default: 'none'}", {}),
            "{?id | default: 'none'}"
        );
        assert.strictEqual(
            resolveValue("{?id | default: 'none'}", { _sys: { query: {} } }),
            'none'
        );
        assert.strictEqual(
            resolveValue("{?id | default: 'none'}", { _sys: { query: { id: '42' } } }),
            '42'
        );
    });

    await t.test('two-stage evaluation: unresolved on first pass (build), resolved on second pass (browser)', () => {
        const template = "{article.is_published | ternary: 'Published', 'Draft'}";
        const buildTimeData = {}; // e.g. static build without the article source
        const pass1 = resolveValue(template, buildTimeData);
        assert.strictEqual(pass1, template, 'placeholder should survive the first pass untouched');

        const browserData = { article: { is_published: true } };
        const pass2 = resolveValue(pass1, browserData);
        assert.strictEqual(pass2, 'Published');
    });
});

test('Integration: text/attribute bindings via Engine.processElement', async (t) => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    const engine = new Engine({});

    await t.test('text node applies new pipes', async () => {
        const div = document.createElement('div');
        div.innerHTML = "<span>{user.code | uppercase}</span><span>{article.is_published | ternary: 'Published', 'Draft'}</span>";
        await engine.processElement(div, { user: { code: 'abc-1' }, article: {} });
        assert.strictEqual(div.children[0].textContent, 'ABC-1');
        assert.strictEqual(div.children[1].textContent, 'Draft');
    });

    await t.test('attribute binding applies pipes', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<input title="{p | currency}">';
        await engine.processElement(div, { p: 1500 });
        const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'JPY' }).format(1500);
        assert.strictEqual(div.querySelector('input').getAttribute('title'), expected);
    });

    await t.test('sanitizeUrl still applies when a pipe result contains a dangerous scheme', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<a href="{link | default: \'javascript:alert(1)\'}">go</a>';
        await engine.processElement(div, { link: null });
        assert.strictEqual(div.querySelector('a').getAttribute('href'), 'about:blank');
    });

    await t.test('a "{" carried through by a pipe is not re-evaluated (no double evaluation)', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<span>{note | uppercase}</span>';
        await engine.processElement(div, { note: 'value is {secret}', secret: 'SHOULD_NOT_APPEAR' });
        assert.strictEqual(div.textContent, 'VALUE IS {SECRET}');
    });

    await t.test('data-t-scope: short property reference resolves default/ternary as loaded', async () => {
        const div = document.createElement('div');
        div.innerHTML = "<div data-t-scope=\"user\"><span>{nickname | default: 'guest'}</span></div>";
        await engine.processElement(div, { user: {} });
        assert.strictEqual(div.querySelector('span').textContent, 'guest');
    });

    await t.test('data-t-list: item property reference resolves default/ternary as loaded', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<ul><li data-t-list="items"><span>{items.name | default: \'(no name)\'}</span></li></ul>';
        await engine.processElement(div, { items: [{}, { name: 'Bob' }] });
        const spans = div.querySelectorAll('li span');
        assert.strictEqual(spans[0].textContent, '(no name)');
        assert.strictEqual(spans[1].textContent, 'Bob');
    });

    delete global.window;
    delete global.document;
    delete global.HTMLElement;
});
