const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
process.env.TZ = 'America/Los_Angeles';
const context = vm.createContext({ Ticker: class {}, Timers: class {}, Date, URLSearchParams, location: { search: '' } });
const source = fs.readFileSync(path.join(__dirname, '../js/screensaver.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function startScreensaver', 'function startScreensaver');
vm.runInContext(source + '\nglobalThis.Insights = Insights;', context);
const now = new Date('2026-10-09T16:00:00-07:00');
const windowId = 'binary_sensor.bedroom_window_1_contact';
function fixture(entity = windowId, state = 'on', minutes = 45) {
    const instance = new context.Insights('', '', null);
    instance.data = { statesAt: +now, homeOpenings: [{ entity, state, changed: new Date(now - minutes * 60e3).toISOString() }],
        homeClimates: [], outside: 68, inside: 72, aqi: 20, outsideCond: 'sunny' };
    return instance;
}
test('an open window alone is quiet, even after hours', () => {
    assert.equal(fixture(windowId, 'on', 180).homeInsightLines(now).length, 0);
});
test('active heat is relevant only in the affected room; idle heat is quiet', () => {
    const instance = fixture();
    instance.data.homeClimates = [{ entity: 'climate.office_thermostat', state: 'heat', action: 'heating' }];
    assert.equal(instance.homeInsightLines(now).length, 0);
    instance.data.homeClimates[0].entity = 'climate.bedroom_thermostat';
    assert.match(instance.homeInsightLines(now)[0][2], /Close the bedroom window 1.*heat is running/);
    instance.data.homeClimates[0].action = 'idle';
    assert.equal(instance.homeInsightLines(now).length, 0);
});
test('grace periods allow ventilation and brief door use', () => {
    for (const [entity, state, minutes] of [[windowId, 'on', 14], ['binary_sensor.front_door_contact', 'on', 4]]) {
        const instance = fixture(entity, state, minutes); instance.data.everyoneAway = true;
        assert.equal(instance.homeInsightLines(now).length, 0);
    }
});
test('stale snapshots, unavailable contacts, and bad timestamps never prompt', () => {
    for (const change of [i => i.data.statesAt -= 120000, i => i.data.statesAt += 1,
        i => i.data.homeOpenings[0].state = 'unavailable', i => i.data.homeOpenings[0].changed = 'bad',
        i => i.data.homeOpenings[0].changed = new Date(+now + 1000).toISOString()]) {
        const instance = fixture(); instance.data.everyoneAway = true; change(instance);
        assert.equal(instance.homeInsightLines(now).length, 0);
    }
});
test('only meaningful outdoor conditions trigger a window insight', () => {
    for (const data of [{ aqi: 101 }, { outsideCond: 'rainy' }, { outsideWind: 30 }, { outside: 45 }]) {
        const instance = fixture(); Object.assign(instance.data, data);
        assert.equal(instance.homeInsightLines(now).length, 1);
    }
    const instance = fixture(windowId, 'on', 20); instance.data.outside = 45;
    assert.equal(instance.homeInsightLines(now).length, 0);
});
test('interior doors and pet doors are excluded', () => {
    for (const entity of ['binary_sensor.bedroom_door_contact', 'binary_sensor.dog_door_backyard_contact']) {
        const instance = fixture(entity); instance.data.everyoneAway = true;
        assert.equal(instance.homeInsightLines(now).length, 0);
    }
});
test('room cooling and window-paused heating provide accurate reasons', () => {
    const instance = fixture('binary_sensor.slider_door_sensor_contact');
    instance.data.homeClimates = [{ entity: 'climate.living_room', state: 'cool', action: 'cooling' }];
    assert.match(instance.homeInsightLines(now)[0][2], /patio door.*AC is running/);
    const paused = fixture();
    paused.data.homeClimates = [{ entity: 'climate.bedroom_thermostat', state: 'off', offReason: 'Window detection' }];
    assert.match(paused.homeInsightLines(now)[0][2], /heating is paused/);
});
test('unused garage entities cannot produce insights, even when away or late', () => {
    const instance = fixture('cover.garage_door_opener_door', 'open', 120);
    instance.data.aqi = 200;
    instance.data.everyoneAway = true;
    assert.equal(instance.homeInsightLines(now).length, 0);
    const late = new Date('2026-10-09T21:00:00-07:00'); instance.data.statesAt = +late;
    assert.equal(instance.homeInsightLines(late).length, 0);
});
test('insights pause for half an hour and reset when the contact closes', () => {
    const instance = fixture(); instance.data.aqi = 110;
    assert.equal(instance.homeInsightLines(now).length, 1);
    function at(minutes) { const t = new Date(+now + minutes * 60000); instance.data.statesAt = +t; return instance.homeInsightLines(t); }
    assert.equal(at(3).length, 0);
    instance.data.aqi = 20; assert.equal(at(4).length, 0);
    instance.data.aqi = 110; assert.equal(at(5).length, 0);
    assert.equal(at(30).length, 1);
    instance.data.homeOpenings[0].state = 'off'; assert.equal(at(31).length, 0);
    instance.data.homeOpenings[0].state = 'on'; instance.data.homeOpenings[0].changed = new Date(+now + 32 * 60000).toISOString();
    assert.equal(at(48).length, 1);
});
