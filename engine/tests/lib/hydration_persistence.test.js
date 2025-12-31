import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('Hydration Data Persistence', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head><link data-t-source="articles" href="/_sys/data/articles.json"></head><body></body></html>');

    // Safer global assignment
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;

    // For protected properties, we use defineProperty if needed, but here we try to skip if not critical
    if (typeof global.navigator === 'undefined') {
        global.navigator = dom.window.navigator;
    }

    after(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        // Don't delete navigator if it was already there
    });

    beforeEach(() => {
        global.window.__BRACIFY_DATA__ = {};
        delete global.window.BracifyFetcher;
        delete global.fetch;

        const enginePath = require.resolve('../../lib/engine.cjs');
        delete require.cache[enginePath];
    });

    test('preloadSources should prioritize SSR data and NOT delete it', async () => {
        const ssrData = { id: 1, title: 'Preserved title' };
        global.window.__BRACIFY_DATA__.articles = ssrData;

        // Mock global fetch
        global.fetch = async () => {
            return {
                ok: true,
                json: async () => ({ id: 1, title: 'New title from fetch' })
            };
        };

        const Bracify = require('../../lib/engine.cjs');
        await Bracify.preloadSources();

        assert.ok(global.window.__BRACIFY_DATA__.articles, 'articles data should still exist');
        assert.strictEqual(global.window.__BRACIFY_DATA__.articles.title, 'Preserved title', 'Should have prioritized SSR data over fetch');
    });

    test('browserLocalFetcher should return global data if present (Low-level check)', async () => {
        const ssrData = { test: 'value' };
        global.window.__BRACIFY_DATA__['test_entity'] = ssrData;

        const Bracify = require('../../lib/engine.cjs');
        const engine = new Bracify.Engine();
        const data = {};

        const el = dom.window.document.createElement('div');
        el.setAttribute('data-t-source', 'test_entity');
        el.setAttribute('href', '_sys/data/test_entity.json');

        await engine.processSource(el, data);

        assert.deepStrictEqual(data.test_entity, ssrData, 'Engine should have picked up SSR data from global context');
    });
});
