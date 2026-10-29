// Run with: node tests/colors.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeColor } from '../src/colors.js';

for (const [input, expected] of [
    ['#f00', 'rgba(255,0,0,1)'],
    ['#f008', `rgba(255,0,0,${136 / 255})`],
    ['#FF0080', 'rgba(255,0,128,1)'],
    ['#ff008080', `rgba(255,0,128,${128 / 255})`],
    ['#00000000', 'rgba(0,0,0,0)'],
    [' rgb(0, 128, 255) ', 'rgba(0,128,255,1)'],
    ['rgba(255,0,0,0.4)', 'rgba(255,0,0,0.4)'],
    ['RGBA(100%, 0%, 50%, 25%)', 'rgba(255,0,128,0.25)'],
    ['rgba(1e2, .5, +255, 1e-2)', 'rgba(100,1,255,0.01)']
]) {
    test(`normalizes ${input}`, () => {
        assert.equal(normalizeColor(input), expected, input);
        assert.equal(normalizeColor(expected), expected, 'Normalization must be stable');
    });
}

for (const input of [
    null, undefined, 123, '', 'red', 'transparent', '#12', '#12345', '#1234567', '#ggg',
    'rgb(1,2)', 'rgb(1,2,3,4)', 'rgba(1,2,3)', 'rgba(1,2,3,)',
    'rgb(256,0,0)', 'rgb(-1,0,0)', 'rgb(101%,0%,0%)', 'rgb(10%,0,0)',
    'rgba(0,0,0,1.01)', 'rgba(0,0,0,-.1)', 'rgba(0,0,0,101%)',
    'rgb(NaN,0,0)', 'rgb(1e999,0,0)', 'rgb(0x10,0,0)',
    'rgb(1 2 3)', 'rgb(1,2,3); color: red', 'rgb(1,2,3)junk'
]) {
    test(`rejects ${String(input)}`, () => {
        assert.equal(normalizeColor(input), null, String(input));
    });
}
