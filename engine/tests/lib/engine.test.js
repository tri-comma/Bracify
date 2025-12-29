import { test } from 'node:test';
import assert from 'node:assert';

// Mock browserLocalFetcher logic from engine/lib/engine.cjs
// We simulate the normalization step
function normalizeHref(href) {
    if (href.startsWith('/')) {
        return href.substring(1);
    }
    return href;
}

test('CSR engine: path normalization and validation', async (t) => {
    // Mock validation logic from engine/lib/engine.cjs
    const validHrefPattern = /^\/?_sys\/data\/([a-zA-Z0-9_-]+)\.json(\?.*)?$/;

    // We simulate the fetcher's pre-check
    function checkAndNormalize(href) {
        if (!validHrefPattern.test(href)) return null;
        if (href.startsWith('/')) return href.substring(1);
        return href;
    }

    await t.test('should remove leading slash from absolute paths', () => {
        const input = '/_sys/data/article.json';
        const expected = '_sys/data/article.json';
        assert.strictEqual(checkAndNormalize(input), expected);
    });

    await t.test('should keep relative paths unchanged', () => {
        const input = '_sys/data/user.json';
        assert.strictEqual(checkAndNormalize(input), input);
    });

    await t.test('should handle paths with query parameters', () => {
        const input = '/_sys/data/item.json?id=123';
        const expected = '_sys/data/item.json?id=123';
        assert.strictEqual(checkAndNormalize(input), expected);
    });

    await t.test('should reject path traversal (../)', () => {
        const input = '../_sys/data/projects.json';
        assert.strictEqual(checkAndNormalize(input), null);
    });

    await t.test('should reject path traversal inside path', () => {
        const input = '_sys/data/../../etc/passwd';
        assert.strictEqual(checkAndNormalize(input), null);
    });

    await t.test('should reject invalid entity names', () => {
        const input = '_sys/data/pro.jects.json';
        assert.strictEqual(checkAndNormalize(input), null);
    });
});
