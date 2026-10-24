const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m);   // Oct 2026: 26 = Monday, 24 = Saturday

test('the drive to work shows weekday mornings at home; the drive home once at the hotel from 3:30', async () => {
    const { COMMUTES, activeLeg } = await load('commute-layer.js');
    const emily = COMMUTES[0], st = state => ({ 'person.emily': { state } });
    assert.equal(activeLeg(emily, st('home'), at(26, 7, 15)).key, 'zone.home>zone.emily_s_hotel');
    assert.equal(activeLeg(emily, st('home'), at(26, 8, 30)), null);              // window over
    assert.equal(activeLeg(emily, st('not_home'), at(26, 7, 15)), null);          // already left
    assert.equal(activeLeg(emily, st('home'), at(24, 7, 15)), null);              // Saturday
    assert.equal(activeLeg(emily, st("Emily's Hotel"), at(26, 16)).key, 'zone.emily_s_hotel>zone.home');
    assert.equal(activeLeg(emily, st("Emily's Hotel"), at(26, 14)), null);        // before 3:30
    assert.equal(activeLeg(emily, st('home'), at(24, 23), 'emily-work').toWork, false);   // preview
});

test('labels: minutes when Waze is fresh, heavy traffic when well over normal', async () => {
    const { COMMUTES, legLabel } = await load('commute-layer.js');
    const emily = COMMUTES[0], now = Date.parse('2026-10-26T14:15:00Z');
    const s = (state, mins = 2) => ({ state: String(state), last_reported: new Date(now - mins * 60e3).toISOString() });
    // Legs through King's are added up: 4.2 + 12.0.
    assert.equal(legLabel(emily, emily.toWork, true, [s(4.2), s(12.03)], now), 'Emily · 16 min to work');
    assert.equal(legLabel(emily, emily.toHome, false, [s(14), s(10)], now), 'Emily · 24 min home · heavy traffic');
    assert.equal(legLabel(emily, emily.toWork, true, [s(4.2), s(12, 40)], now), 'Emily · to work');   // one leg stale
    assert.equal(legLabel(emily, emily.toWork, true, [s(4.2), undefined], now), 'Emily · to work');   // one leg missing
});
