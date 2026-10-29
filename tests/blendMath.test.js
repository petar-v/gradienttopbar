// Run with: node tests/blendMath.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBlendOpacities } from '../src/gradient/blendMath.js';

for (const [a, b] of [[1, 1], [0.1, 0.6], [0, 0], [1, 0]]) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        test(`uniform-alpha compositing at progress ${p}, source ${a}, destination ${b}`, () => {
            const { sourceOpacity: s, destinationOpacity: d } = calculateBlendOpacities(p, b, b);
            assert(Math.abs(d * b + s * a * (1 - d * b) - ((1 - p) * a + p * b)) < 1e-12,
                `Uniform-alpha compositing at progress ${p}, source ${a}, destination ${b}`);
        });
    }
}
for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
    for (const [index, args] of [[invalid, 0, 1], [0.5, invalid, 1], [0.5, 0, invalid]].entries()) {
        test(`blend rejects ${invalid} at argument ${index}`, () => {
            assert.throws(() => calculateBlendOpacities(...args), { name: 'RangeError' });
        });
    }
}
