import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');

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

test('Step 2: Rendering Engine Integration (Build-free CSR)', async (t) => {
    const { Engine, preloadSources, resolvePathHandle, readFileContent } = Bracify;

    // Setup mock structure
    const root = new MockDirectoryHandle('root', {
        '_sys': new MockDirectoryHandle('_sys', {
            'data': new MockDirectoryHandle('data', {
                'article.json': new MockFileHandle('article.json', '[{"id":1,"title":"Hello FS"},{"id":2,"title":"Zero Server"}]'),
                'user.json': new MockFileHandle('user.json', '{"name": "Admin"}')
            })
        }),
        '_parts': new MockDirectoryHandle('_parts', {
            'header.html': new MockFileHandle('header.html', '<header><h1>{site.name}</h1></header>'),
            'item.html': new MockFileHandle('item.html', '<div class="item-card">{item.title}</div>'),
            'recursive.html': new MockFileHandle('recursive.html', '<div class="outer">Outer <div data-t-include="_parts/inner.html"></div></div>'),
            'inner.html': new MockFileHandle('inner.html', '<span class="inner">Inner Content</span>'),
            'dynamic_1.html': new MockFileHandle('dynamic_1.html', '<p>Type 1 Content</p>'),
            'dynamic_2.html': new MockFileHandle('dynamic_2.html', '<p>Type 2 Content</p>')
        })
    });

    // Mock Bracify.rootHandle for tests
    Bracify.rootHandle = root;

    await t.test('data-t-include: should resolve simple HTML fragment from rootHandle', async () => {
        const dom = new JSDOM('<div data-t-include="_parts/inner.html"></div>');
        const document = dom.window.document;
        const engine = new Engine({
            includeResolver: async (path) => {
                const h = await resolvePathHandle(root, path);
                return await readFileContent(h);
            }
        });

        await engine.processElement(document.body, {});
        const inner = document.body.querySelector('.inner');
        assert.strictEqual(inner.textContent, 'Inner Content');
    });

    await t.test('data-t-include: should handle recursive includes', async () => {
        const dom = new JSDOM('<div data-t-include="_parts/recursive.html"></div>');
        const document = dom.window.document;
        const engine = new Engine({
            includeResolver: async (path) => {
                const h = await resolvePathHandle(root, path);
                return await readFileContent(h);
            }
        });

        await engine.processElement(document.body, {});
        assert.ok(document.body.querySelector('.outer'), 'Should have outer');
        assert.ok(document.body.querySelector('.inner'), 'Should have inner via recursion');
        assert.strictEqual(document.body.querySelector('.inner').textContent, 'Inner Content');
    });

    await t.test('data-t-include: should resolve path with placeholders (dynamic include)', async () => {
        const dom = new JSDOM('<div data-t-include="_parts/dynamic_{type}.html"></div>');
        const document = dom.window.document;
        const engine = new Engine({
            includeResolver: async (path) => {
                const h = await resolvePathHandle(root, path);
                return await readFileContent(h);
            }
        });

        await engine.processElement(document.body, { type: '1' });
        assert.strictEqual(document.body.querySelector('p').textContent, 'Type 1 Content');
    });

    await t.test('data-t-include: template pattern resolving variables in context', async () => {
        const dom = new JSDOM('<div data-t-include="_parts/header.html"></div>');
        const document = dom.window.document;
        const engine = new Engine({
            includeResolver: async (path) => {
                const h = await resolvePathHandle(root, path);
                return await readFileContent(h);
            }
        });

        await engine.processElement(document.body, { site: { name: 'Bracify Test' } });
        assert.strictEqual(document.body.querySelector('h1').textContent, 'Bracify Test');
    });

    await t.test('data-t-source: should read JSON from rootHandle if available', async () => {
        const dom = new JSDOM('<div data-t-source="articles" href="_sys/data/article.json"><div data-t-list="articles">{articles.title}</div></div>');
        const document = dom.window.document;
        global.document = document;
        global.Node = dom.window.Node;

        const engine = new Engine(); // Will use browserLocalFetcher internally if configured

        // Setup BracifyFetcher to use our mock
        // In real browser, we'll update browserLocalFetcher to check rootHandle
        // For test, we can override BracifyFetcher
        Bracify.rootHandle = root;

        await engine.processElement(document.body, {});

        // This test will fail until we update engine.cjs
        const listItems = document.querySelectorAll('.articles-item'); // Default class for list items is usually name-item? 
        // Wait, standard engine.cjs uses element-item if not specified? 
        // Actually it doesn't add class by default, it just clones.

        // Let's check innerHTML
        assert.ok(document.body.innerHTML.includes('Hello FS'));
        assert.ok(document.body.innerHTML.includes('Zero Server'));

        delete global.document;
        delete global.Node;
    });

    await t.test('preloadSources: should load all link[data-t-source] from rootHandle', async () => {
        const dom = new JSDOM(`
            <link data-t-source="users" href="_sys/data/user.json">
            <link data-t-source="posts" href="_sys/data/article.json?id=1">
        `);
        global.document = dom.window.document;
        global.window = dom.window;

        // Reset global data
        dom.window.__BRACIFY_DATA__ = {};
        Bracify.rootHandle = root;

        const data = await preloadSources();

        assert.ok(data.users, 'Should load users');
        assert.strictEqual(data.users.name, 'Admin');

        assert.ok(data.posts, 'Should load posts');
        assert.strictEqual(data.posts.length, 1);
        assert.strictEqual(data.posts[0].title, 'Hello FS');

        delete global.document;
        delete global.window;
    });
});
