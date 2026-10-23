const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('train list keeps only real positions; Link is told apart from Amtrak and Sounder', async () => {
    const { validTrains, isLink } = await load('train-layer.js');
    const kept = validTrains([{ id: 'a', lat: 47.76, lon: -122.32 }, { id: 'b', lat: null, lon: -122.3 },
        { id: 'c', lat: 47.8, lon: 200 }, { id: 'd', lat: '47.81', lon: '-122.38' }]);
    assert.deepEqual(kept.map(t => t.id), ['a', 'd']);
    assert.equal(validTrains(undefined).length, 0);
    assert.equal(isLink({ kind: 'link' }), true);
    assert.equal(isLink({ kind: 'amtrak' }), false);
    assert.equal(isLink({ kind: 'sounder' }), false);
});

test('each season has its own fixed plane, boat and train colours, with boats and trains far apart', () => {
    const fs = require('node:fs');
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const hue = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    const apart = (a, b) => Math.abs(((hue(a) - hue(b)) % 360 + 540) % 360 - 180);
    for (const season of ['winter', 'spring', 'summer', 'fall']) {
        const rule = new RegExp(String.raw`\[data-season=${season}\]\{--plane:(#[0-9a-f]{6});--boat:(#[0-9a-f]{6});--train:(#[0-9a-f]{6})\}`).exec(html);
        assert.ok(rule, `no colour row for ${season}`);
        const [, plane, boat, train] = rule;
        // Dimmed on the map, hues 60° apart blurred together (fall mint vs sky blue, 2026-10-23).
        assert.ok(apart(boat, train) >= 80, `${season}: boat ${boat} and train ${train} too alike`);
        assert.ok(new Set([plane, boat, train]).size === 3, season);
    }
    // The season is picked on the page itself, not by ambience.js.
    assert.match(html, /dataset\.season\s*=/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../js/ambience.js'), 'utf8'), /setProperty\('--(plane|boat|train)'/);
});

test('labels placed by one layer are kept clear by the next', async () => {
    const { labelSide } = await load('flight-backdrop.js');
    // A boat label lands right of 600,300; a train at the same spot must go left, not on top.
    const taken = [];
    assert.equal(labelSide(taken, 600, 300, ['Walla Walla', 'Ferry']), 'right');
    assert.equal(labelSide(taken, 600, 300, ['Cascades 516', 'To Vancouver BC']), 'left');
});
