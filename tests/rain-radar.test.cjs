const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('radar is requested for exactly the map box, west,south,east,north', async () => {
    const { radarUrl } = await load('rain-radar.js');
    const u = new URL(radarUrl([47.67, -122.59, 47.87, -122.11]));
    assert.equal(u.searchParams.get('BBOX'), '-122.59,47.67,-122.11,47.87');
    assert.equal(u.searchParams.get('SRS'), 'EPSG:4326');
    assert.equal(u.searchParams.get('TRANSPARENT'), 'TRUE');
});

test('radar colours become one tone: grey noise dropped, heavier rain more solid', async () => {
    const { rainAlpha } = await load('rain-radar.js');
    assert.equal(rainAlpha(154, 162, 180, 255), 0);      // grey-blue clear-air return (seen 2026-10-24)
    assert.equal(rainAlpha(0, 0, 0, 0), 0);              // transparent
    const blue = rainAlpha(40, 120, 230, 255), green = rainAlpha(30, 200, 40, 255),
        yellow = rainAlpha(240, 230, 30, 255), red = rainAlpha(230, 20, 20, 255), magenta = rainAlpha(220, 30, 230, 255);
    assert.ok(blue > 0 && blue < green && green < yellow && yellow < red, [blue, green, yellow, red].join());
    assert.ok(magenta >= red && magenta === Math.round(255 * .8));       // heaviest, still see-through
});
