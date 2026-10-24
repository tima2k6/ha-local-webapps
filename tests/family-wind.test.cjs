const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('people show only while away; zones name the place', async () => {
    const { personView } = await load('family-layer.js');
    const st = (state, extra = {}) => ({ entity_id: 'person.emily', state, attributes: { friendly_name: 'Emily', latitude: 47.6, longitude: -122.33, ...extra } });
    assert.equal(personView(st('home')), null);
    assert.equal(personView(st('unavailable')), null);
    assert.equal(personView(st('not_home', { latitude: undefined })), null);
    assert.deepEqual(personView(st('not_home')), { id: 'person.emily', name: 'Emily', initial: 'E', lat: 47.6, lon: -122.33, place: '' });
    assert.equal(personView(st('Work')).place, 'Work');
});

test('someone beyond the map is pinned to the screen edge toward them', async () => {
    const { pinToEdge, arrowTo, miles } = await load('family-layer.js');
    assert.deepEqual(pinToEdge([640, 480], [700, 500]), { x: 700, y: 500, pinned: false });
    const down = pinToEdge([640, 480], [640, 2000]);          // far south
    assert.deepEqual([down.x, down.y, down.pinned], [640, 786, true]);   // below the status line
    const left = pinToEdge([640, 400], [-1000, 400]);
    assert.deepEqual([left.x, left.y], [30, 400]);
    const home = [47.751, -122.35], downtown = [47.608, -122.335];
    assert.equal(arrowTo(home, downtown), '↓');
    assert.ok(Math.abs(miles(home, downtown) - 9.9) < .5, String(miles(home, downtown)));
});

test('wind: direction from the weather entity, streaks point downwind, calm draws nothing', async () => {
    const { windOf, streak } = await load('wind-layer.js');
    assert.deepEqual(windOf({ wind_bearing: 240.8, wind_speed: 5.59, wind_speed_unit: 'mph' }), { from: 240.8, mph: 5.59 });
    assert.ok(Math.abs(windOf({ wind_bearing: 0, wind_speed: 16.09, wind_speed_unit: 'km/h' }).mph - 10) < .01);
    assert.equal(windOf({}), null);
    // Blowing toward east (90°): the line runs left to right, head on the right.
    assert.match(streak(100, 100, 90, 20), /^M90\.0,100\.0L110\.0,100\.0/);
});
