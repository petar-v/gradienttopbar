// Run with: node tests/appearance.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPEARANCE_STATE, getAppearance } from '../src/gradient/appearance.js';

const main = { colors: { start: 'main-start', end: 'main-end' }, direction: 'vertical' };
const alternate = { colors: { start: 'alternate-start', end: 'alternate-end' }, direction: 'horizontal' };
const overview = { colors: { start: 'overview-start', end: 'overview-end' }, direction: 'vertical' };
const config = { gradients: { main, alternate, overview } };

for (const [windowBehavior, triggered] of [
    ['keep-gradient', main], ['keep-theme', null], ['apply-style', alternate]
]) {
    for (const [overviewBehavior, selectedOverview] of [
        ['keep-gradient', main], ['keep-theme', null], ['apply-style', overview]
    ]) {
        test(`window ${windowBehavior}, overview ${overviewBehavior}`, () => {
            const settings = { ...config, windowBehavior, overviewBehavior };
            assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.NORMAL), main);
            assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.TRIGGERED), triggered);
            assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.OVERVIEW), selectedOverview);
        });
    }
}
