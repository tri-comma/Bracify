import { test } from 'node:test';
import assert from 'node:assert';
import Bracify from '../../lib/engine.cjs';

// Extract filterLocalData from Bracify. 
// Note: filterLocalData is not exported directly in the returned object from factory() currently based on previous views.
// We might need to check if it's exported or if we can test it via simulate data fetch.
// Wait, engine.cjs exports: { Engine, resolveValue, getNestedValue, preloadSources, mock, isTruthy, resolvePathHandle, readFileContent, evaluateCondition, rootHandle, ... }
// It does NOT seem to export filterLocalData.
// However, browserLocalFetcher uses filterLocalData.
// And Engine calls dataFetcher.

// Let's create a test that uses browserLocalFetcher (if exported) or just simulates the logic if we can mock it.
// Actually, `filterLocalData` was modified inside `engine.cjs` but is it exported?
// Let's check the exported list again in engine.cjs.

// Based on previous `view_file` of engine.cjs (Step 616/619 etc), the return object was:
/*
    return {
        Engine, resolveValue, getNestedValue, preloadSources, mock, isTruthy, resolvePathHandle, readFileContent, evaluateCondition,
        get rootHandle() { return rootHandle; },
        set rootHandle(val) { rootHandle = val; },
        navigate: ...
    };
*/
// filterLocalData is NOT exported.
// But it is used by `browserLocalFetcher` which is used if no fetcher is provided.
// Hmmm.
// We can test this behavior by using `Engine` with a mocked fetcher that behaves like `browserLocalFetcher` OR by checking if we have access to it.
// Since we can't easily access the private function, we should add it to exports for testing purposes OR refer to it if it's available on Bracify object in some way.
// 
// Let's modify engine.cjs to export `filterLocalData` for testing, similar to `evaluateCondition`.

const { filterLocalData } = Bracify;

test('Data Filtering with Unresolved Placeholders', async (t) => {
    // Mock data list
    const data = [
        { id: 1, name: 'Apple', type: 'Fruit' },
        { id: 2, name: 'Banana', type: 'Fruit' },
        { id: 3, name: 'Carrot', type: 'Vegetable' }
    ];

    await t.test('should filter correctly with valid values', () => {
        // Simulating href with query params
        const href = '/data.json?type=Fruit';
        // We need `filterLocalData` function to test this directly.
        // If it's not exported, we'll fail here.
        if (typeof filterLocalData !== 'function') {
            // Fallback: If not exported, we might need to rely on the fact that existing tests passed?
            // No, user asked to add a test case.
            // I will first assume I need to export it.
            assert.fail('filterLocalData is not exported for testing');
        }

        const result = filterLocalData(data, href);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].name, 'Apple');
        assert.strictEqual(result[1].name, 'Banana');
    });

    await t.test('should ignore unresolved placeholders in query params', () => {
        // This is the fix we added.
        // If query param is "{variable}", it should be ignored instead of searching for literal string "{variable}"
        const href = '/data.json?type={selectedType}';
        const result = filterLocalData(data, href);

        // Should return ALL data (filter ignored)
        assert.strictEqual(result.length, 3);
    });

    await t.test('should still filter if value matches but happens to look like placeholder? No, implementation ignores anything with { and }', () => {
        // Current implementation: if (typeof val === 'string' && val.indexOf('{') !== -1 && val.indexOf('}') !== -1) continue;
        const href = '/data.json?name={Apple}'; // If the value literally starts/ends with braces
        const result = filterLocalData(data, href);
        // It ignores it.
        assert.strictEqual(result.length, 3);
    });
});
