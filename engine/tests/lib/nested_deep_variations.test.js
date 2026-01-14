import { test } from 'node:test';
import assert from 'node:assert';
import Bracify from '../../lib/engine.cjs';

const { resolveValue, getNestedValue } = Bracify;

test('Nested property access - Deep variations', async (t) => {
    const data = {
        // パターンA: 単数.複数.単数
        company: {
            name: 'Tech Corp',
            departments: [
                {
                    name: 'Engineering',
                    lead: { name: 'Alice' }
                }
            ]
        },
        // パターンB: 複数.単数.複数
        projects: [
            {
                name: 'Alpha',
                owner: {
                    name: 'Bob',
                    tasks: ['Code', 'Test']
                }
            }
        ],
        // パターンC: 複数(2件) -> 自動展開されないはず
        users: [
            { name: 'User 1' },
            { name: 'User 2' }
        ]
    };

    await t.test('単数.複数(1件).単数: すべて自動展開されて末端までアクセスできるか', () => {
        // company(単) -> departments(1件なので展開) -> lead(単) -> name
        assert.strictEqual(resolveValue('{company.departments.lead.name}', data), 'Alice');
    });

    await t.test('複数(1件).単数.複数(2件): data-t-list 用に末端の配列を取得できるか', () => {
        // projects(1件なので名目上展開) -> owner(単) -> tasks(配列)
        // resolveValue (プレースホルダー) の場合は、tasksが複数あるので undefined/オリジナルのまま になるはず
        assert.strictEqual(resolveValue('{projects.owner.tasks}', data), '{projects.owner.tasks}');

        // getNestedValue(noExpand=true) の場合は、イテレート対象として配列そのものが返るべき
        const tasks = getNestedValue(data, 'projects.owner.tasks', true);
        assert.ok(Array.isArray(tasks));
        assert.strictEqual(tasks.length, 2);
        assert.strictEqual(tasks[0], 'Code');
    });

    await t.test('複数(2件).プロパティ: 自動展開されずにプレースホルダーが残るか (曖昧性の排除)', () => {
        // usersは2件あるので、users.name がどちらを指すか不明
        assert.strictEqual(resolveValue('{users.name}', data), '{users.name}');
    });

    await t.test('data-t-list="parent.children" (単数.複数) のシミュレーション', () => {
        const complexData = {
            blog: {
                title: 'My Blog',
                posts: [
                    { title: 'Post 1' },
                    { title: 'Post 2' }
                ]
            }
        };
        // getNestedValue(noExpand=true) で blog(単) を通り抜けて posts(配列) を取得できるか
        const posts = getNestedValue(complexData, 'blog.posts', true);
        assert.ok(Array.isArray(posts));
        assert.strictEqual(posts.length, 2);
        assert.strictEqual(posts[0].title, 'Post 1');
    });

    await t.test('インデックス指定 (隠し仕様としての維持)', () => {
        // 自動展開に頼らず明示的に指定する場合
        assert.strictEqual(resolveValue('{users.1.name}', data), 'User 2');
    });
});
