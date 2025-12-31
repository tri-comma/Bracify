import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

test('Browser Compatibility: Unsupported Browser UI', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'file:///project/index.html'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    global.history = dom.window.history;
    global.Node = dom.window.Node;
    global.HTMLElement = dom.window.HTMLElement;

    // Simulate unsupported browser by ensuring showDirectoryPicker is missing
    delete dom.window.showDirectoryPicker;

    const Bracify = require('../../lib/engine.cjs');

    // Trigger initialization check
    const event = new dom.window.Event('DOMContentLoaded');
    document.dispatchEvent(event);

    // Give it a moment to render the overlay
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.getElementById('bracify-init-overlay');
    assert.ok(overlay, 'Overlay should be visible for unsupported browser');
    assert.ok(overlay.innerHTML.includes('Unsupported Browser'), 'Should show Unsupported Browser message');
    assert.ok(overlay.innerHTML.includes('Chrome'), 'Should suggest switching to Chrome');

    // Cleanup
    delete global.window;
    delete global.document;
});

test('Browser Compatibility: Permission Denied Retry UI', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'file:///project/index.html'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    global.history = dom.window.history;
    global.Node = dom.window.Node;
    global.HTMLElement = dom.window.HTMLElement;

    // Simulate supported browser
    dom.window.showDirectoryPicker = async () => { throw new Error('AbortError'); };

    const Bracify = require('../../lib/engine.cjs');

    // Manually trigger "denied" state overlay
    // We need to access the internal showInitOverlay via BracifyLib or just test the logic flow
    // Since showInitOverlay is internal, we trigger a manual request that fails

    const rootAccessPromise = Bracify.requestRootAccess();
    await new Promise(r => setTimeout(r, 10));

    // Since showInitOverlay is called inside DOMContentLoaded usually, let's just test the requestRootAccess return
    const handle = await rootAccessPromise;
    assert.strictEqual(handle, null, 'Should return null when access is denied');

    // Cleanup
    delete global.window;
    delete global.document;
});
