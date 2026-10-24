const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('each highway stretch belongs to the nearest station of its road and direction', async () => {
    const { assignSegments } = await load('road-traffic.js');
    // I-5 as two one-way carriageways ~40 m apart, plus a two-way SR 9 and an unrelated road.
    const ways = [
        { kind: 'motorway', ref: 'I 5', oneway: true, points: [[47.740, -122.3240], [47.750, -122.3240], [47.760, -122.3240]] },   // NB
        { kind: 'motorway', ref: 'I 5', oneway: true, points: [[47.760, -122.3235], [47.750, -122.3235], [47.740, -122.3235]] },   // SB
        { kind: 'primary', ref: 'SR 9', oneway: false, points: [[47.80, -122.15], [47.81, -122.15]] },
        { kind: 'primary', points: [[47.745, -122.3240], [47.746, -122.3240]] },                                                   // no ref
    ];
    const stations = [
        { id: 'nb', ref: 'I 5', dir: 'NB', lat: 47.751, lon: -122.3238 },
        { id: 'sb', ref: 'I 5', dir: 'SB', lat: 47.751, lon: -122.3238 },
        { id: 'sr9', ref: 'SR 9', dir: 'SB', lat: 47.805, lon: -122.15 },
        { id: 'far', ref: 'I 405', dir: 'NB', lat: 47.75, lon: -122.20 },
    ];
    const parts = assignSegments(ways, stations);
    assert.equal(parts.nb.length, 2);
    assert.ok(parts.nb.every(([a, b]) => b[0] > a[0]));     // only the northbound carriageway
    assert.equal(parts.sb.length, 2);
    assert.ok(parts.sb.every(([a, b]) => b[0] < a[0]));
    assert.equal(parts.sr9.length, 1);                      // two-way road: either direction's station
    assert.equal(parts.far, undefined);
    // Stretches farther than the reach from every station stay plain (I-5's are ~550 m from theirs).
    const near = assignSegments(ways, stations, 100);
    assert.equal(near.nb, undefined);
    assert.equal(near.sb, undefined);
    assert.equal(near.sr9.length, 1);
});

test('the traffic overlay has its own name: this.roads is the street-drawing group', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '../js/flight-backdrop.js'), 'utf8');
    // 2026-10-24: passing the overlay as `roads` was overwritten by the streets group, and the
    // overlay error froze the plane refresh. Overlays now run guarded.
    assert.match(src, /constructor\(config, map, status, tally, vessels, trains, roadTraffic[,)]/);
    assert.match(src, /this\.refreshOverlay\(this\.roadTraffic, 'stations', 'roads'/);
    assert.match(src, /catch \(error\) \{ console\.warn\('Map overlay failed:', error\); \}\s*\n\s*this\.busy = false;/);
});

test('each direction is drawn on its own side: NB east of the road, SB west', async () => {
    const { assignSegments, sideLine } = await load('road-traffic.js');
    // Two-way road: a southbound station still gets its stretch pointing south.
    const parts = assignSegments([{ kind: 'primary', ref: 'SR 9', oneway: false, points: [[47.80, -122.15], [47.81, -122.15]] }],
        [{ id: 'sb', ref: 'SR 9', dir: 'SB', lat: 47.805, lon: -122.15 }]);
    const [[a, b]] = parts.sb;
    assert.ok(b[0] < a[0], 'points south');
    // Screen: heading north (y decreasing) shifts east (+x); heading south shifts west (-x).
    assert.equal(sideLine([100, 200], [100, 100]), 'M103.0,200.0L103.0,100.0');
    assert.equal(sideLine([100, 100], [100, 200]), 'M97.0,100.0L97.0,200.0');
    // Heading east shifts south (+y).
    assert.equal(sideLine([100, 100], [200, 100]), 'M100.0,103.0L200.0,103.0');
});
