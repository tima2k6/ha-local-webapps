const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/flight-backdrop.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('arrival/departure cues combine local airport proximity, altitude, trend, heading and actual departure time', async () => {
    const { flightPhase } = await modulePromise;
    const home = [47.5, -122.3], now = Date.parse('2026-10-11T18:00:00Z');
    const arrival = { latitude: 47.5, longitude: -122.3, altitude: 5000, vertical_speed: -800, heading: 180,
        airport_destination_latitude: 47.2, airport_destination_longitude: -122.3 };
    assert.equal(flightPhase(arrival, home, now), '↘ Arriving');
    for (const change of [{vertical_speed:0}, {vertical_speed:800}, {altitude:30000}, {heading:0},
        {heading:null}, {airport_destination_latitude:45.5}, {airport_destination_latitude:null},
        {latitude:null}, {on_ground:true}, {has_landed:true}, {altitude:null}]) {
        assert.equal(flightPhase({...arrival,...change},home,now),'',JSON.stringify(change));
    }
    const departure = { latitude:47.5, longitude:-122.3, altitude:5000, vertical_speed:1000,
        airport_origin_latitude:47.2, airport_origin_longitude:-122.3, time_real_departure:(now-5*60000)/1000 };
    assert.equal(flightPhase(departure,home,now),'↗ Departing');
    assert.equal(flightPhase({...departure,time_real_departure:new Date(now-5*60000).toISOString()},home,now),'↗ Departing');
    for (const change of [{time_real_departure:null}, {time_real_departure:(now-21*60000)/1000},
        {time_real_departure:(now+60000)/1000}, {vertical_speed:-500}, {vertical_speed:0},
        {altitude:16000}, {airport_origin_latitude:45.5}, {airport_origin_longitude:null}]) {
        assert.equal(flightPhase({...departure,...change},home,now),'',JSON.stringify(change));
    }
    assert.equal(flightPhase(arrival,undefined,now),'');
});

test('altitude scaling makes low flights larger, caps both ends, and keeps missing altitude neutral', async () => {
    const { altitudeScale } = await modulePromise;
    assert.equal(altitudeScale(0), 1.6);
    assert.equal(altitudeScale('1000'), 1.6);
    assert.equal(altitudeScale(10000), 1);
    assert.equal(altitudeScale(30000), .8);
    assert.equal(altitudeScale(60000), .8);
    for (const invalid of [null, undefined, '', 'unknown', -100, Infinity]) assert.equal(altitudeScale(invalid), 1);
    const scales = [1000, 2000, 5000, 10000, 20000, 30000].map(altitudeScale);
    for (let i = 1; i < scales.length; i++) assert.ok(scales[i] < scales[i-1]);
});

test('airline labels and routes replace flight numbers; departed trails last two minutes and recover on re-entry', async () => {
    const { FlightBackdrop } = await modulePromise;
    const original = { document: global.document, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
    const timers = new Map(); let next = 0;
    const element = () => ({ attrs: {}, style: {}, children: [],
        classList: { names: new Set(), toggle(name, on) { on ? this.names.add(name) : this.names.delete(name); } },
        setAttribute(key, value) { this.attrs[key] = value; },
        getAttribute(key) { return key in this.attrs ? String(this.attrs[key]) : null; },
        append(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        remove() { this.removed = true; }
    });
    global.document = { createElementNS: () => element() };
    global.setTimeout = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; };
    global.clearTimeout = id => timers.delete(id);
    try {
        const feed = Object.create(FlightBackdrop.prototype);
        Object.assign(feed, { box: [47.4, -122.45, 47.6, -122.15], markers: new Map(), layer: element(), status: {}, map: { dataset: {} } });
        const plane = { id: 'journey', latitude: 47.5, longitude: -122.3,
            airline: 'Alaska Airlines', airline_short: 'Alaska', flight_number: 'AS123',
            airport_origin_code_iata: 'SEA', airport_destination_code_iata: 'YVR',
            coordinates: [[47.48, -122.31], [47.5, -122.3]] };
        feed.draw([plane], 100000);
        const item = feed.markers.get('journey');
        assert.equal(item.marker.style.transitionDuration, '0ms'); // No flight from the corner on arrival.
        assert.equal(item.label.textContent, 'Alaska');
        assert.equal(item.route.textContent, 'SEA → YVR');
        assert.ok(item.trails.children.length > 0);
        const moved = { ...plane, longitude: -122.29 };
        feed.draw([moved], 110000);
        assert.equal(item.marker.style.transitionDuration, '12000ms');
        assert.equal(item.marker.style.transitionTimingFunction, 'steps(24, end)'); // Two steps a second, not every frame.
        feed.draw([moved], 115000); // Duplicate polls must not alter the movement cadence.
        assert.equal(item.position.reportedAt, 110000);
        feed.draw([{ ...moved, longitude: -122.28 }], 130000);
        assert.equal(item.marker.style.transitionDuration, '22000ms');
        feed.draw([{ ...moved, longitude: -122.27 }], 170000);
        assert.equal(item.marker.style.transitionDuration, '0ms'); // Recover promptly after a long gap.
        feed.draw([]);
        assert.equal(item.marker.style.display, 'none');
        assert.equal(feed.activeAircraftCount, 0);
        assert.ok(item.trails.children.length > 0);
        assert.equal(timers.get(item.retireTimer).ms, 120000);
        assert.equal(item.trails.style.transition, 'opacity 120s steps(120, end)');
        const firstTimer = item.retireTimer;
        feed.draw([]); // Polling must not extend the expiry.
        assert.equal(item.retireTimer, firstTimer);
        feed.draw([plane]);
        assert.equal(timers.has(firstTimer), false);
        assert.equal(item.marker.style.display, '');
        assert.equal(item.marker.style.transitionDuration, '0ms');
        assert.equal(item.trails.style.opacity, '');
        feed.draw([]);
        timers.get(item.retireTimer).fn();
        assert.equal(item.group.removed, true);
        assert.equal(feed.markers.size, 0);
        feed.draw([{ ...plane, airline_short: '', airline: '', aircraft_category: 'Helicopter' }]);
        assert.equal(feed.markers.get('journey').label.textContent, 'Helicopter');
        feed.draw([]);
        const retired = feed.markers.get('journey').retireTimer;
        feed.fail(new Error('paused'));
        assert.equal(timers.has(retired), false);
        assert.equal(feed.markers.size, 0);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
    }
});

test('daily tally uses the HA local day and hides missing or previous-day totals', async () => {
    const { dailyTallyText } = await modulePromise;
    const now = new Date('2026-10-11T06:59:00Z'); // Still October 10 in Seattle.
    const state = { state: '123', attributes: { day: '2026-10-10', time_zone: 'America/Los_Angeles' } };
    assert.equal(dailyTallyText(state, now), '123 aircraft today');
    assert.equal(dailyTallyText({ ...state, state: '1' }, now), '1 aircraft today');
    assert.equal(dailyTallyText({ ...state, state: '0' }, now), '0 aircraft today');
    assert.equal(dailyTallyText(state, new Date('2026-10-11T07:00:00Z')), '');
    for (const invalid of [null, '', 'unknown', 'unavailable', '-1', '1.5']) {
        assert.equal(dailyTallyText({ ...state, state: invalid }, now), '');
    }
    assert.equal(dailyTallyText(undefined, now), '');
});

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
    let cleared = 0, drawn = null, paused = false, homeTransform = '';
    const feed = Object.create(FlightBackdrop.prototype);
    Object.assign(feed, {
        center: [47.5, -122.3], status: {}, map: { dataset: {} },
        markers: new Map([['old', {}]]), layer: { replaceChildren: () => cleared++ },
        home: { setAttribute: (name, value) => { if (name === 'transform') homeTransform = value; } },
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
    const homeNumbers = homeTransform.match(/[\d.]+/g).map(Number);
    assert.ok(Math.abs(homeNumbers[0]-640)<1e-8 && Math.abs(homeNumbers[1]-480)<1e-8);
    assert.equal(drawn[0].id, 'plane');
    paused = true;
    await feed.refresh();
    assert.equal(cleared, 2);
    assert.match(feed.status.textContent, /paused/);
    delete global.document;
});
