const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);
const fakeBody = () => { const set = new Set(); return { classList: { contains: c => set.has(c), toggle: (c, on) => on ? set.add(c) : set.delete(c) }, set }; };

test('switch states from HA become hide-* classes; only real changes count', async () => {
    const { statesFrom, apply } = await load('map-layers.js');
    const body = fakeBody();
    // Initial subscribe_entities message ("a"), then a change ("c").
    const first = statesFrom({ a: { 'input_boolean.wall_map_boats': { s: 'off' }, 'input_boolean.wall_map_planes': { s: 'on' } } });
    assert.equal(apply(first, body), true);
    assert.deepEqual([...body.set], ['hide-boats']);
    assert.equal(apply(first, body), false);                       // same again: nothing to redraw
    assert.equal(apply(statesFrom({ c: { 'input_boolean.wall_map_boats': { '+': { s: 'on' } } } }), body), true);
    assert.deepEqual([...body.set], []);
    assert.equal(apply({ 'input_boolean.something_else': 'off' }, body), false);
    // Unavailable (HA restarting) never hides a layer.
    apply({ 'input_boolean.wall_map_trains': 'unavailable' }, body);
    assert.equal(body.set.has('hide-trains'), false);
});

test('every layer switch has CSS that hides something, and the page starts the switches', async () => {
    const { LAYERS } = await load('map-layers.js');
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.equal(Object.keys(LAYERS).length, 18);
    // Weather effects stop in the animation code (ambience.js Mood); every other layer is CSS.
    const ambience = fs.readFileSync(path.join(__dirname, '../js/ambience.js'), 'utf8');
    for (const cls of Object.values(LAYERS))
        assert.ok(cls === 'hide-weather' ? ambience.includes("classList.contains('hide-weather')") : html.includes(`body.${cls} `), `no handling for ${cls}`);
    assert.match(html, /startMapLayers\(config\)/);
});

test('map labels: biggest first, never on screen text, on each other or off screen', async () => {
    const { placeMapLabels } = await load('flight-backdrop.js');
    const box = [47.6, -122.6, 47.9, -122.1];   // project(): lat 47.75 -> y 400, lon -122.35 -> x 640
    const labels = [
        { kind: 'place', rank: 3, name: 'Echo Lake Park', lat: 47.75, lon: -122.35 },
        { kind: 'place', rank: 1, name: 'Shoreline', lat: 47.75, lon: -122.35 },
        { kind: 'water', rank: 2, name: 'Lake Under Clock', lat: 47.85, lon: -122.35 },
        { kind: 'place', rank: 2, name: 'Edge Town', lat: 47.75, lon: -122.6 },
        { kind: 'place', rank: 2, name: 'Ballard', lat: 47.66, lon: -122.38 },
    ];
    const clock = [[500, 100, 800, 160]];      // Lake Under Clock lands at y 133
    const names = placeMapLabels(labels, box, clock).map(l => l.name);
    assert.deepEqual(names, ['Shoreline', 'Ballard']);   // the rank-3 label at the same spot loses
    assert.equal(placeMapLabels(undefined, box).length, 0);
});
