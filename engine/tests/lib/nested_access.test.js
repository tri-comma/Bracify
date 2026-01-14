import { test } from 'node:test';
import assert from 'node:assert';
import Bracify from '../../lib/engine.cjs';

const { resolveValue, getNestedValue } = Bracify;

test('Nested property access', async (t) => {
    const data = {
        user: {
            name: 'Yamada',
            address: {
                city: 'Tokyo',
                zip: '123-4567',
                null_val: null
            }
        },
        items: [
            { id: 1, info: { title: 'Item 1' } }
        ],
        wrapped_items: [
            {
                list: [{ name: 'Nested Item' }]
            }
        ]
    };

    await t.test('should access 2nd level property', () => {
        assert.strictEqual(resolveValue('{user.name}', data), 'Yamada');
        assert.strictEqual(resolveValue('{user.address.city}', data), 'Tokyo');
    });

    await t.test('should access 3rd level property', () => {
        assert.strictEqual(resolveValue('{user.address.zip}', data), '123-4567');
    });

    await t.test('should handle missing property gracefully', () => {
        // Keeps placeholder if undefined
        assert.strictEqual(resolveValue('{user.notfound.city}', data), '{user.notfound.city}');
    });

    await t.test('should handle null property as empty string', () => {
        // null should be converted to ''
        assert.strictEqual(resolveValue('{user.address.null_val}', data), '');
    });

    await t.test('should handle array auto-expansion in nest', () => {
        // items is array length 1 -> expands
        assert.strictEqual(resolveValue('{items.info.title}', data), 'Item 1');
    });

    await t.test('should handle intermediate expansion even with noExpand=true', () => {
        // wrapped_items is array length 1. 
        // We want 'list' property (which is an array).
        // getNestedValue with noExpand=true should still expand 'wrapped_items' to get to 'list'.
        const val = getNestedValue(data, 'wrapped_items.list', true);
        assert.ok(Array.isArray(val));
        assert.strictEqual(val[0].name, 'Nested Item');
    });

    await t.test('should handle explicit index in nest', () => {
        assert.strictEqual(resolveValue('{items.0.info.title}', data), 'Item 1');
    });

    await t.test('should handle negative condition (raw boolean)', () => {
        // data-t-if uses it without curly braces
        assert.strictEqual(resolveValue('!user.address.notfound', data), true);
        assert.strictEqual(resolveValue('!user.address.city', data), false);
    });

    await t.test('should work with pipes in nest', () => {
        const data2 = {
            order: {
                updated_at: '2025-01-01T10:00:00Z'
            }
        };
        assert.strictEqual(resolveValue('{order.updated_at | date: "yyyy"}', data2), '2025');
    });
});
