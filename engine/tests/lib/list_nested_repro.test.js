import { test } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Bracify = require('../../lib/engine.cjs');
const { Engine } = Bracify;

test('Bug Reproduction: data-t-list with dotted path fail to interpolate', async (t) => {
    const html = `
        <div data-t-list="blog.posts">
            <span class="title">{blog.posts.title}</span>
            <span class="author">{blog.posts.author.name}</span>
        </div>
    `;

    const data = {
        blog: {
            posts: [
                { title: 'Post 1', author: { name: 'Alice' } },
                { title: 'Post 2', author: { name: 'Bob' } }
            ]
        }
    };

    const dom = new JSDOM(html);
    const { document } = dom.window;
    global.document = document;
    global.Node = dom.window.Node;

    const engine = new Engine();

    // Process the element
    await engine.processElement(document.body, data);

    const titles = Array.from(document.querySelectorAll('.title')).map(el => el.textContent);
    const authors = Array.from(document.querySelectorAll('.author')).map(el => el.textContent);

    console.log('Detected Titles:', titles);
    console.log('Detected Authors:', authors);

    await t.test('Inner placeholders should be replaced with actual data', () => {
        // 現在のバグ：{blog.posts.title} がそのまま残ってしまう
        assert.strictEqual(titles[0], 'Post 1', 'Title should be Post 1');
        assert.strictEqual(authors[0], 'Alice', 'Author should be Alice');
    });
});
