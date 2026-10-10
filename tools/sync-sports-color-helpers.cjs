// Create missing sports-color helpers. Existing values are preserved.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'js/ha-config.js'), 'utf8');
const get = key => config.match(new RegExp('\\b' + key + '\\s*=\\s*[\x27\x22]([^\x27\x22]+)'))[1];
const url = get('HA_URL').replace(/\/$/, '');
const token = get('HA_TOKEN');
const palette = JSON.parse(fs.readFileSync(path.join(root, 'data/sports-colors.json'), 'utf8')).colors;
let nextId = 1;
const pending = new Map();
const ws = new WebSocket(url.replace(/^http/, 'ws') + '/api/websocket');
const ready = new Promise((resolve, reject) => {
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    else if (message.type === 'auth_ok') resolve();
    else if (message.type === 'auth_invalid') reject(new Error('HA authentication failed'));
    else if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.success) resolve(message.result);
      else reject(new Error(JSON.stringify(message.error)));
    }
  };
  ws.onerror = () => reject(new Error('HA WebSocket connection failed'));
});
function command(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('HA command timed out: ' + type)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, type, ...data }));
  });
}
async function api(endpoint, body) {
  const response = await fetch(url + '/api/' + endpoint, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('HA API HTTP ' + response.status);
  return response.json();
}
(async () => {
  try {
    await ready;
    const helpers = await command('input_text/list');
    const states = await api('states');
    const existing = new Map(states.map(state => [state.entity_id, state]));
    let created = 0;
    for (const color of palette) {
      if (!existing.has(color.entity_id)) {
        if (helpers.some(helper => helper.name === color.name)) throw new Error('Name collision: ' + color.name);
        const helper = await command('input_text/create', {
          name: color.name, min: 0, max: 11, mode: 'text',
          icon: 'mdi:palette', pattern: '^\\d{1,3},\\d{1,3},\\d{1,3}$'
        });
        if ('input_text.' + helper.id !== color.entity_id) throw new Error('Unexpected helper ID: ' + helper.id);
        await api('services/input_text/set_value', { entity_id: color.entity_id, value: color.value });
        created++;
      }
    }
    const live = new Map((await api('states')).map(state => [state.entity_id, state]));
    const stored = await command('input_text/list');
    for (const color of palette) {
      const state = live.get(color.entity_id);
      if (!state || !/^\d{1,3},\d{1,3},\d{1,3}$/.test(state.state)
          || state.state.split(',').some(channel => Number(channel) > 255)) throw new Error('Invalid helper: ' + color.entity_id);
      if (!stored.some(helper => 'input_text.' + helper.id === color.entity_id)) throw new Error('Helper not in storage collection: ' + color.entity_id);
      console.log(color.entity_id + ' = ' + state.state);
    }
    console.log('Created ' + created + '; verified ' + palette.length + ' persistent, UI-editable color helpers.');
  } finally { ws.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
