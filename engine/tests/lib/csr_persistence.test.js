import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Mock DOM logic
const listeners = {};
const mockHandle = {
    kind: 'directory',
    name: 'test-root',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted'
};

const mockIndexedDB = {
    _store: {},
    open: (name, version) => {
        const request = {
            onupgradeneeded: null,
            onsuccess: null,
            onerror: null,
            result: {
                objectStoreNames: {
                    contains: (storeName) => true
                },
                createObjectStore: (storeName) => { },
                transaction: (stores, mode) => ({
                    objectStore: (storeName) => ({
                        put: (value, key) => {
                            mockIndexedDB._store[key] = value;
                        },
                        get: (key) => {
                            const req = {
                                onsuccess: null,
                                onerror: null,
                                result: mockIndexedDB._store[key]
                            };
                            setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
                            return req;
                        }
                    })
                })
            }
        };
        setTimeout(() => {
            if (request.onupgradeneeded) request.onupgradeneeded({ target: request });
            if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
    }
};

global.window = {
    indexedDB: mockIndexedDB,
    Bracify: {},
    location: { protocol: 'file:', href: 'file:///index.html' },
    document: {
        addEventListener: (event, handler) => { listeners[event] = handler; },
        body: {
            appendChild: () => { },
            setAttribute: () => { },
            hasAttribute: () => false,
            getAttribute: () => null,
            removeAttribute: () => { },
            tagName: 'BODY',
            children: [],
            childNodes: [],
            attributes: []
        },
        createElement: () => ({ style: {} }),
        getElementById: () => null,
        querySelectorAll: () => []
    },
    showDirectoryPicker: async () => mockHandle,
    addEventListener: (event, handler) => { listeners[event] = handler; }
};
global.document = global.window.document;
global.location = global.window.location;
global.fetch = () => Promise.resolve({ ok: false });
global.HTMLElement = class { };

test('CSR Persistence: loadHandle on DOMContentLoaded', async () => {
    // 1. Setup Mock DB with existing handle
    mockIndexedDB._store['root'] = mockHandle;

    // 2. Load Engine
    const Bracify = require('../../lib/engine.cjs');

    // 3. Trigger DOMContentLoaded
    // Wait for async initialization which registers listener
    await new Promise(resolve => setTimeout(resolve, 100));

    if (listeners['DOMContentLoaded']) {
        await listeners['DOMContentLoaded']();
    } else {
        throw new Error('DOMContentLoaded listener not registered');
    }

    // 4. Verify rootHandle is restored
    assert.strictEqual(Bracify.rootHandle, mockHandle, 'Root handle should be restored from IndexedDB');
});
