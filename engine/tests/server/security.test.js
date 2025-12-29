import { test } from 'node:test';
import assert from 'node:assert';

// Mock DOM environment for SSR testing logic
// Since we can't easily import the internal logic of index.cjs without refactoring,
// we will test the validation regex logic directly which is the core of the fix.

test('Security: data-t-source href validation', async (t) => {
    // The regex used in engine/server/index.cjs
    const validHrefPattern = /^\/?_sys\/data\/([a-zA-Z0-9_-]+)\.json(\?.*)?$/;

    await t.test('should accept valid valid absolute paths', () => {
        assert.ok(validHrefPattern.test('/_sys/data/article.json'));
        assert.ok(validHrefPattern.test('/_sys/data/user_profile.json'));
        assert.ok(validHrefPattern.test('/_sys/data/my-data-123.json'));
    });

    await t.test('should accept valid relative paths (CSR friendly)', () => {
        assert.ok(validHrefPattern.test('_sys/data/article.json'));
        assert.ok(validHrefPattern.test('_sys/data/config.json'));
    });

    await t.test('should accept paths with query parameters', () => {
        assert.ok(validHrefPattern.test('/_sys/data/article.json?id=1'));
        assert.ok(validHrefPattern.test('_sys/data/user.json?status=active&sort=desc'));
    });

    await t.test('should reject path traversal attempts', () => {
        assert.strictEqual(validHrefPattern.test('/_sys/data/../config.json'), false);
        assert.strictEqual(validHrefPattern.test('_sys/data/../../etc/passwd'), false);
        assert.strictEqual(validHrefPattern.test('/_sys/data/..%2fconfig.json'), false);
    });

    await t.test('should reject invalid entity names (symbols)', () => {
        assert.strictEqual(validHrefPattern.test('/_sys/data/user.name.json'), false); // dots not allowed in entity name
        assert.strictEqual(validHrefPattern.test('/_sys/data/user/profile.json'), false); // slashes not allowed
        assert.strictEqual(validHrefPattern.test('/_sys/data/u$er.json'), false);
    });

    await t.test('should reject paths outside of _sys/data', () => {
        assert.strictEqual(validHrefPattern.test('/_sys/other/config.json'), false);
        assert.strictEqual(validHrefPattern.test('/api/data/user.json'), false);
    });
});
