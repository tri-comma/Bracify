import { test } from 'node:test';
import assert from 'node:assert';
import Bracify from '../../lib/engine.cjs';

const { resolveValue } = Bracify;

test('Placeholder Escaping', async (t) => {
    const data = {
        user: { name: 'Yamada' }
    };

    await t.test('should skip evaluation for escaped open brace', () => {
        // \{ を含む場合、解決されずにそのまま残るか（ただしバックスラッシュは後の工程で消去される）
        assert.strictEqual(resolveValue('\\{user.name\\}', data), '\\{user.name\\}');
    });

    await t.test('should evaluate unescaped placeholders even if neighbors are escaped', () => {
        // 混合パターン
        const input = 'Escaped: \\{user.name\\}, Real: {user.name}';
        const expected = 'Escaped: \\{user.name\\}, Real: Yamada';
        assert.strictEqual(resolveValue(input, data), expected);
    });

    await t.test('should NOT mangle non-placeholder braces', () => {
        const input = 'Just a { bracket';
        assert.strictEqual(resolveValue(input, data), input);
    });
});
