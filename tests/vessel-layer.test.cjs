const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('boat list keeps only real positions; detail line prefers the ferry route', async () => {
    const { validVessels, vesselDetail } = await load('vessel-layer.js');
    const kept = validVessels([{ id: 1, lat: 47.8, lon: -122.4 }, { id: 2, lat: null, lon: -122 },
        { id: 3, lat: 91, lon: -122 }, { id: 4, lat: '47.7', lon: '-122.45' }]);
    assert.deepEqual(kept.map(v => v.id), [1, 4]);
    assert.equal(vesselDetail({ label: 'Ferry', moving: true, speed: 15, detail: 'Edmonds → Kingston · 9 min' }), 'Edmonds → Kingston · 9 min');
    assert.equal(vesselDetail({ label: 'Cargo ship', moving: true, speed: 14.6 }), 'Cargo ship · 15 kn');
    assert.equal(vesselDetail({ label: 'Ferry', moving: false, speed: 0 }), 'Ferry');
    assert.equal(validVessels(undefined).length, 0);
});

test('a label overlapping screen text is detected; open map space is not', async () => {
    const { labelHitsText } = await load('flight-backdrop.js');
    const clock = [[170, 320, 560, 470]];
    assert.equal(labelHitsText(clock, 365, 420, ['Hyundai Supreme', 'Cargo ship · 15 kn']), true);
    assert.equal(labelHitsText(clock, 490, 600, ['Invictus', 'Fishing boat · 7 kn']), false);
    assert.equal(labelHitsText([], 365, 420, ['Anything']), false);
});

test('boats take the season accent complement, distinct from it and from the near-white planes', async () => {
    const { complement, mix } = await load('ambience.js');
    const hue = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    for (const accent of ['#7fb2e5', '#93cf7e', '#5fc9b4', '#dd9566']) {
        const boat = complement(accent);
        assert.match(boat, /^#[0-9a-f]{6}$/);
        const apart = Math.abs(((hue(boat) - hue(accent)) % 360 + 540) % 360 - 180);
        assert.ok(Math.abs(180 - apart) < 3, `${accent} -> ${boat} is not opposite`);
        assert.notEqual(boat, mix(accent, '#ffffff', .65));
    }
    assert.equal(complement('#dd9566'), '#7bb8e0');
});
