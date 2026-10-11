const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../bedtime.html'), 'utf8');
const api = html.slice(html.indexOf('async function fetchState('), html.indexOf('async function callScript('));

function dashboard(window, fetch) {
    const context = vm.createContext({ window, fetch, HA_URL: 'http://ha', HEADERS: () => ({ Authorization: 'Bearer expired' }) });
    vm.runInContext(api, context);
    return context;
}

test('embedded dashboard reads current app states without sending an expired REST token', async () => {
    let hass = { states: { 'sensor.test': { state: '1' } } };
    const context = dashboard({ HA_IN_APP: true, HA_APP_HASS: () => hass }, () => { throw new Error('Unexpected REST request'); });
    assert.equal((await context.fetchState('sensor.test')).state, '1');
    hass = { states: { 'sensor.test': { state: '2' } } };
    assert.equal((await context.fetchState('sensor.test')).state, '2');
    await assert.rejects(context.fetchState('sensor.missing'), /state unavailable/);
});

test('embedded service actions use the managed connection and propagate failures', async () => {
    const calls = [];
    const context = dashboard({ HA_IN_APP: true, HA_APP_HASS: () => ({ callService: async (...args) => { calls.push(args); return 'ok'; } }) }, () => { throw new Error('Unexpected REST request'); });
    const data = { entity_id: 'script.bedtime_routine_start' };
    assert.equal(await context.callService('script', 'turn_on', data), 'ok');
    assert.deepEqual(calls, [['script', 'turn_on', data]]);
    context.window.HA_APP_HASS = () => null;
    await assert.rejects(context.callService('script', 'turn_on', data), /connection unavailable/);
});

test('standalone dashboard still uses REST and rejects HTTP authentication errors', async () => {
    let response = { ok: true, json: async () => ({ state: 'on' }) };
    const calls = [];
    const context = dashboard({}, async (...args) => { calls.push(args); return response; });
    assert.equal((await context.fetchState('sensor.test')).state, 'on');
    assert.equal(calls[0][0], 'http://ha/api/states/sensor.test');
    response = { ok: false, status: 401 };
    await assert.rejects(context.fetchState('sensor.test'), /401/);
    await assert.rejects(context.callService('light', 'turn_on', {}), /401/);
});
