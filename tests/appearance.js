// Run with: node tests/appearance.js
import assert from 'node:assert/strict';
import { APPEARANCE_STATE, getAppearance } from '../src/gradient/appearance.js';

const config = {
    colors: { start: 'main-start', end: 'main-end' },
    gradientDirection: 'vertical',
    maximizedColors: { start: 'alternate-start', end: 'alternate-end' },
    maximizedGradientDirection: 'horizontal',
    overviewColors: { start: 'overview-start', end: 'overview-end' },
    overviewGradientDirection: 'vertical'
};
const main = { name: 'main', colors: config.colors, direction: config.gradientDirection };
const alternate = { name: 'alternate', colors: config.maximizedColors, direction: config.maximizedGradientDirection };
const overview = { name: 'overview', colors: config.overviewColors, direction: config.overviewGradientDirection };

for (const [windowBehavior, triggered] of [
    ['keep-gradient', main], ['keep-theme', null], ['apply-style', alternate]
]) {
    for (const [overviewBehavior, selectedOverview] of [
        ['keep-gradient', main], ['keep-theme', null], ['apply-style', overview]
    ]) {
        const settings = { ...config, maximizedBehavior: windowBehavior, overviewBehavior };
        assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.NORMAL), main);
        assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.TRIGGERED), triggered);
        assert.deepEqual(getAppearance(settings, APPEARANCE_STATE.OVERVIEW), selectedOverview);
    }
}
console.log('Appearance selection passed for all window and overview behavior combinations');
