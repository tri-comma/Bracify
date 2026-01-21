import { test } from 'node:test';
import assert from 'node:assert';
import Bracify from '../../lib/engine.cjs';

const { evaluateCondition } = Bracify;

// Mock data
const mockData = {
    user: {
        role: 'admin',
        id: 1,
        active: true,
        age: 30
    },
    post: {
        status: 'published',
        author_id: 1,
        view_count: 100
    },
    config: {
        theme: 'dark'
    },
    nullVal: null,
    undefinedVal: undefined,
    falseVal: false,
    zeroVal: 0
};

test('Conditional Logic (Data API Style)', async (t) => {

    await t.test('Single token (truthy/falsy check)', () => {
        assert.strictEqual(evaluateCondition('user.active', mockData), true);
        assert.strictEqual(evaluateCondition('user.role', mockData), true);
        assert.strictEqual(evaluateCondition('nullVal', mockData), false);
        assert.strictEqual(evaluateCondition('undefinedVal', mockData), false);
        assert.strictEqual(evaluateCondition('falseVal', mockData), false);
        // Note: isTruthy treats 0 as false in Bracify
        assert.strictEqual(evaluateCondition('zeroVal', mockData), false);
    });

    await t.test('Single token negation', () => {
        assert.strictEqual(evaluateCondition('!user.active', mockData), false);
        assert.strictEqual(evaluateCondition('!nullVal', mockData), true);
    });

    await t.test('Equality (=)', () => {
        assert.strictEqual(evaluateCondition('user.role=admin', mockData), true);
        assert.strictEqual(evaluateCondition('user.role=editor', mockData), false);
        assert.strictEqual(evaluateCondition('post.status=published', mockData), true);
    });

    await t.test('Not Equal (:ne=)', () => {
        assert.strictEqual(evaluateCondition('user.role:ne=editor', mockData), true);
        assert.strictEqual(evaluateCondition('user.role:ne=admin', mockData), false);
    });

    await t.test('Greater Than (:gt=)', () => {
        assert.strictEqual(evaluateCondition('user.age:gt=20', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:gt=30', mockData), false); // 30 > 30 false
        assert.strictEqual(evaluateCondition('user.age:gt=40', mockData), false);
    });

    await t.test('Less Than (:lt=)', () => {
        assert.strictEqual(evaluateCondition('user.age:lt=40', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:lt=30', mockData), false);
    });

    await t.test('Greater Than or Equal (:gte=)', () => {
        assert.strictEqual(evaluateCondition('user.age:gte=30', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:gte=29', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:gte=31', mockData), false);
    });

    await t.test('Less Than or Equal (:lte=)', () => {
        assert.strictEqual(evaluateCondition('user.age:lte=30', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:lte=31', mockData), true);
        assert.strictEqual(evaluateCondition('user.age:lte=29', mockData), false);
    });

    await t.test('OR logic (comma separated values)', () => {
        assert.strictEqual(evaluateCondition('user.role=admin,editor', mockData), true);
        assert.strictEqual(evaluateCondition('user.role=editor,guest', mockData), false);
        assert.strictEqual(evaluateCondition('post.status=draft,published,archived', mockData), true);
    });

    await t.test('OR logic with :ne= (AND logic for negation)', () => {
        // role is admin.
        // :ne=editor,guest -> is not editor AND is not guest -> True
        assert.strictEqual(evaluateCondition('user.role:ne=editor,guest', mockData), true);

        // :ne=admin,guest -> is not admin (False) AND ... -> False
        assert.strictEqual(evaluateCondition('user.role:ne=admin,guest', mockData), false);
    });

    await t.test('AND logic (space separated)', () => {
        assert.strictEqual(evaluateCondition('user.role=admin user.active', mockData), true);
        assert.strictEqual(evaluateCondition('user.role=admin user.age:gt=20', mockData), true);
        assert.strictEqual(evaluateCondition('user.role=admin user.age:gt=40', mockData), false);
    });

    await t.test('Variable resolution ({})', () => {
        // user.id=1, post.author_id=1
        assert.strictEqual(evaluateCondition('user.id={post.author_id}', mockData), true);

        // If we change one (using new object to avoid mutation issues if strict)
        const data2 = { ...mockData, user: { ...mockData.user, id: 99 } };
        assert.strictEqual(evaluateCondition('user.id={post.author_id}', data2), false);
    });

    await t.test('Complex combination', () => {
        // role is admin OR editor
        // AND age > 20
        // AND active is true
        assert.strictEqual(evaluateCondition('user.role=admin,editor user.age:gt=20 user.active', mockData), true);
    });
});
