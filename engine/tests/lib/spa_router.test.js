import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

// Mock FileSystemHandle classes
class MockHandle {
    constructor(name, kind) {
        this.name = name;
        this.kind = kind;
    }
}

class MockFileHandle extends MockHandle {
    constructor(name, content) {
        super(name, 'file');
        this.content = content;
    }
    async getFile() {
        return {
            text: async () => this.content
        };
    }
}

class MockDirectoryHandle extends MockHandle {
    constructor(name, children = {}) {
        super(name, 'directory');
        this.children = children;
    }
    async getDirectoryHandle(name) {
        const child = this.children[name];
        if (child && child.kind === 'directory') return child;
        throw new Error('Not found: ' + name);
    }
    async getFileHandle(name) {
        const child = this.children[name];
        if (child && child.kind === 'file') return child;
        throw new Error('Not found: ' + name);
    }
}

// Setup JSDOM before requiring Bracify Engine
// IMPORTANT: runScripts: "dangerously" is needed to execute scripts in JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><head><title>Old Page</title><meta name="description" content="old"></head><body><div id="app">Old Body</div></body></html>', {
    url: 'file:///project/index.html',
    runScripts: "dangerously",
    resources: "usable"
});
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.history = dom.window.history;
global.location = dom.window.location;
global.Node = dom.window.Node;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLScriptElement = dom.window.HTMLScriptElement;
global.FormData = dom.window.FormData; // Use JSDOM's FormData which supports form element constructor

// Mock scrollTo manually on the window object
dom.window.scrollTo = () => { };

const Bracify = require('../../lib/engine.cjs');

test('Step 3: SPA Router and Full DOM Replacement', async (t) => {
    // Mock Bracify globally for the engine to find itself
    global.window.Bracify = Bracify;

    const root = new MockDirectoryHandle('root', {
        'page2.html': new MockFileHandle('page2.html', `
            <!DOCTYPE html>
            <html>
            <head>
                <title>New Page</title>
                <meta name="description" content="new">
                <style id="page2-style">body { background: red; }</style>
            </head>
            <body class="new-body">
                <h1>Welcome to Page 2</h1>
                <script>window.valX = "secret";</script>
            </body>
            </html>
        `)
    });

    Bracify.rootHandle = root;

    await t.test('navigate: should update title and body', async () => {
        await Bracify.navigate('page2.html');

        assert.strictEqual(document.title, 'New Page');
        assert.ok(document.body.classList.contains('new-body'), 'Body should have new class');
        assert.ok(document.body.innerHTML.includes('Welcome to Page 2'), 'Body should have new content');
    });

    await t.test('navigate: should sync head meta tags', async () => {
        const meta = document.querySelector('meta[name="description"]');
        assert.strictEqual(meta.getAttribute('content'), 'new');
    });

    await t.test('navigate: should execute scripts in body', async () => {
        // Scripts in JSDOM with runScripts: "dangerously" should work when replaced
        assert.strictEqual(global.window.valX, 'secret');
    });

    await t.test('navigate: should update history state', async () => {
        assert.strictEqual(history.state.path, 'page2.html');
    });

    await t.test('navigate: should handle query parameters and update window._sys.query', async () => {
        // Prepare _sys if it doesn't exist
        global.window._sys = { query: {} };

        await Bracify.navigate('page2.html?id=123&mode=edit');

        // Path resolution should have stripped ?id=123 (otherwise it would fail to find file)
        assert.ok(document.body.innerHTML.includes('Welcome to Page 2'));

        // window._sys.query should be updated
        assert.strictEqual(global.window._sys.query.id, '123');
        assert.strictEqual(global.window._sys.query.mode, 'edit');
    });

    await t.test('navigate: should normalize absolute paths when using rootHandle', async () => {
        // Even if path starts with /, it should be resolved relative to rootHandle
        await Bracify.navigate('/page2.html');
        assert.strictEqual(document.title, 'New Page');
    });

    await t.test('navigate: should fallback to replaceState if pushState fails', async () => {
        const originalPushState = history.pushState;
        history.pushState = () => { throw new Error('file:// restriction'); };
        let replaceCalled = false;
        history.replaceState = () => { replaceCalled = true; };

        await Bracify.navigate('page2.html');

        assert.ok(replaceCalled, 'replaceState should be called as fallback');

        // Restore
        history.pushState = originalPushState;
    });

    await t.test('Integration: navigate should correctly fetch and bind data from sources in new page', async () => {
        const rootWithData = new MockDirectoryHandle('root', {
            'page-with-source.html': new MockFileHandle('page-with-source.html', `
                <!DOCTYPE html>
                <html>
                <head>
                    <link data-t-source="items" href="/_sys/data/items.json?id={?id}&_limit=1">
                </head>
                <body>
                    <div data-t-scope="items">
                        <h1 id="item-title">{name}</h1>
                    </div>
                </body>
                </html>
            `),
            '_sys': new MockDirectoryHandle('_sys', {
                'data': new MockDirectoryHandle('data', {
                    'items.json': new MockFileHandle('items.json', JSON.stringify([
                        { id: '1', name: 'Item One' },
                        { id: '123', name: 'Item 123' }
                    ]))
                })
            })
        });

        Bracify.rootHandle = rootWithData;
        global.window._sys = { query: {} };
        global.window.__BRACIFY_DATA__ = {};

        // Navigate with query param
        await Bracify.navigate('page-with-source.html?id=123');

        const title = document.getElementById('item-title');
        assert.ok(title, 'Title element should exist');
        assert.strictEqual(title.textContent, 'Item 123', 'Data should be correctly bound to Item 123');

        // SECOND NAVIGATION: to a different ID (Item 1)
        await Bracify.navigate('page-with-source.html?id=1');
        const title2 = document.getElementById('item-title');
        assert.strictEqual(title2.textContent, 'Item One', 'Data should be correctly bound to Item One on second navigation');
    });


    // Cleanup
    delete global.window;
    delete global.document;
    delete global.DOMParser;
    delete global.history;
    delete global.location;
    delete global.Node;
    delete global.HTMLElement;
    delete global.HTMLScriptElement;
});
