const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/flight-backdrop.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('home sits below center and the entire sensor area fits the wider 16:10 viewport', async () => {
    const { viewport, project } = await modulePromise;
    const home = [47.5, -122.3];
    const box = viewport(home, '47.6,47.4,-122.45,-122.15');
    const center = project(...home, box);
    assert.ok(Math.abs(center[0]-640) < 1e-8);
    assert.ok(Math.abs(center[1]-480) < 1e-8);
    for (const point of [[47.6,-122.45], [47.4,-122.15]]) {
        const [x,y] = project(...point, box);
        assert.ok(x >= 0 && x <= 1280 && y >= 0 && y <= 800);
    }
    assert.throws(() => viewport(home, 'unknown'));
    assert.throws(() => viewport(home, '47.4,47.6,-122.45,-122.15'));
});

test('missing positions are never converted to zero; grounded aircraft stay out of the sky', async () => {
    const { validFlights } = await modulePromise;
    const airborne = { id: 'live', latitude: '47.5', longitude: '-122.3' };
    assert.deepEqual(validFlights([airborne,
        { latitude: null, longitude: -122 },
        { latitude: '', longitude: -122 },
        { latitude: 91, longitude: -122 },
        { latitude: 47, longitude: -122, on_ground: true },
        { latitude: 47, longitude: -122, has_landed: true }
    ]), [airborne]);
    assert.deepEqual(validFlights(undefined), []);
});

test('paused or stale HA data clears aircraft; fresh data recovers without reloading', async () => {
    const { FlightBackdrop } = await modulePromise;
    global.document = { hidden: false };
    let cleared = 0, drawn = null, paused = false;
    const feed = Object.create(FlightBackdrop.prototype);
    Object.assign(feed, {
        center: [47.5, -122.3], status: {}, map: { dataset: {} },
        markers: new Map([['old', {}]]), layer: { replaceChildren: () => cleared++ },
        draw: flights => { drawn = flights; }
    });
    const state = { state: '1', last_updated: new Date(Date.now()-240000).toISOString(),
        attributes: { bounds: '47.6,47.4,-122.45,-122.15', flights: [{ id: 'plane', latitude: 47.5, longitude: -122.3 }] } };
    feed.state = async entity => entity.startsWith('switch.') ? { state: paused ? 'off' : 'on' } : state;
    await feed.refresh();
    assert.equal(cleared, 1);
    assert.equal(feed.markers.size, 0);
    assert.equal(feed.map.dataset.feed, 'unavailable');
    assert.match(feed.status.textContent, /stale/);
    state.last_updated = new Date().toISOString();
    await feed.refresh();
    assert.equal(feed.map.dataset.feed, 'live');
    assert.equal(drawn[0].id, 'plane');
    paused = true;
    await feed.refresh();
    assert.equal(cleared, 2);
    assert.match(feed.status.textContent, /paused/);
    delete global.document;
});
