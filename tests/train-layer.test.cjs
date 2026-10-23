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

test('trains take a third colour, apart from the accent, the boats and the planes', async () => {
    const { complement, mix } = await load('ambience.js');
    const hue = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    const apart = (a, b) => Math.abs(((hue(a) - hue(b)) % 360 + 540) % 360 - 180);
    for (const accent of ['#7fb2e5', '#93cf7e', '#5fc9b4', '#dd9566']) {
        const train = complement(accent, 120), boat = complement(accent);
        assert.match(train, /^#[0-9a-f]{6}$/);
        assert.ok(Math.abs(apart(train, accent) - 120) < 3, `${accent} -> ${train}`);
        assert.ok(apart(train, boat) > 50, `${train} too close to boats ${boat}`);
        assert.notEqual(train, mix(accent, '#ffffff', .65));
    }
    // The default turn is still the boats' complement.
    assert.equal(complement('#dd9566'), complement('#dd9566', 180));
});

test('labels placed by one layer are kept clear by the next', async () => {
    const { labelSide } = await load('flight-backdrop.js');
    // A boat label lands right of 600,300; a train at the same spot must go left, not on top.
    const taken = [];
    assert.equal(labelSide(taken, 600, 300, ['Walla Walla', 'Ferry']), 'right');
    assert.equal(labelSide(taken, 600, 300, ['Cascades 516', 'To Vancouver BC']), 'left');
});
