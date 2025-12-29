import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

test('Security: XSS Prevention (Unit)', async (t) => {

    // Simulate Browser Environment
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;

    const { Engine } = Bracify;
    const engine = new Engine({});

    await t.test('Should auto-escape <script> tags in text binding', async () => {
        const div = document.createElement('div');
        div.innerHTML = '{msg}';
        const data = { msg: '<script>alert(1)</script>' };

        await engine.processElement(div, data);

        // nodeValue should contain the string, but innerHTML should show escaped entities
        // Because browser (JSDOM) treats it as text.
        assert.strictEqual(div.textContent, '<script>alert(1)</script>');
        assert.strictEqual(div.innerHTML.includes('&lt;script&gt;'), true, 'Should be escaped in HTML source');
        assert.strictEqual(div.getElementsByTagName('script').length, 0, 'No script tag should be created');
    });

    await t.test('Should auto-escape event handler vectors in text', async () => {
        const div = document.createElement('div');
        div.innerHTML = '{msg}';
        const data = { msg: '<img src=x onerror=alert(1)>' };

        await engine.processElement(div, data);

        assert.strictEqual(div.textContent, '<img src=x onerror=alert(1)>');
        assert.strictEqual(div.getElementsByTagName('img').length, 0, 'No img tag should be created');
    });

    await t.test('Should safe-bind attributes (no breakout)', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<input value="{val}">';
        // Attempt to close the quote and add an event handler
        const data = { val: '"><script>alert(1)</script>' };

        await engine.processElement(div, data);

        const input = div.querySelector('input');
        // setAttribute safely encodes values. validation check:
        assert.strictEqual(input.getAttribute('value'), '"><script>alert(1)</script>');

        // Ensure no new script tag appeared as a sibling
        assert.strictEqual(div.getElementsByTagName('script').length, 0);
    });

    await t.test('Should sanitize dangerous URL attributes (javascript:)', async () => {
        const div = document.createElement('div');
        div.innerHTML = `
            <a id="l1" href="{url1}">Link</a>
            <img id="i1" src="{url2}">
            <form id="f1" action="{url3}">
                <button formaction="{url4}">Submit</button>
            </form>
        `;

        const data = {
            url1: 'javascript:alert(1)',
            url2: ' javascript:alert(2) ', // with spaces
            url3: 'data:text/html,<html>',
            url4: 'http://example.com' // safe
        };

        await engine.processElement(div, data);

        assert.strictEqual(div.querySelector('#l1').getAttribute('href'), 'about:blank');
        assert.strictEqual(div.querySelector('#i1').getAttribute('src'), 'about:blank');
        assert.strictEqual(div.querySelector('#f1').getAttribute('action'), 'about:blank');
        assert.strictEqual(div.querySelector('button').getAttribute('formaction'), 'http://example.com');
    });

    await t.test('Should allow safe data: URLs (images)', async () => {
        const div = document.createElement('div');
        div.innerHTML = '<img src="{url}">';
        const data = { url: 'data:image/png;base64,123' };

        await engine.processElement(div, data);
        assert.strictEqual(div.querySelector('img').getAttribute('src'), 'data:image/png;base64,123');
    });

    // Clean up
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
});
