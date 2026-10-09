import assert from 'node:assert/strict';

function walk(value, fn) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) fn(value);
  Object.values(value).forEach(child => walk(child, fn));
}
function removeNavigation(value) {
  if (Array.isArray(value)) return value.filter(v => v?.type !== 'custom:paper-buttons-row').map(removeNavigation);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, removeNavigation(child)]));
}
function bindings(value) {
  const values = [];
  walk(value, obj => {
    for (const key of ['entity', 'service', 'perform_action', 'service_data', 'target']) if (obj[key] !== undefined) values.push(JSON.stringify([key, obj[key]]));
    if (Array.isArray(obj.entities)) values.push(JSON.stringify(['entities', obj.entities.filter(e => typeof e === 'string')]));
  });
  return values.sort();
}
export function buildRedesign(source) {
  const definitions = [
    ['Overview', 'overview', 'mdi:home-outline', source.views.find(v => v.path === 'default_view_hidden')],
    ['Liam', 'liam', 'mdi:star-outline', source.views.find(v => v.path === 'liams-dash')],
    ['Network', 'network', 'mdi:lan', source.views.find(v => v.path === 'internet-troubleshooting')],
  ];
  const views = definitions.map(([title, page, icon, original]) => {
    assert.ok(original, `Missing original ${title} view.`);
    const sections = removeNavigation(structuredClone(original.sections));
    const groups = [];
    const add = (id, title, cards) => { if (cards.length) groups.push({ id, title, cards }); };
    const cards = i => sections[i]?.cards || [];
    if (page === 'overview') {
      add('timers', 'Running timers', cards(0));
      const today = cards(1);
      add('weather', 'Weather & air quality', today.slice(0, 2));
      if (today[2]?.type === 'vertical-stack') {
        add('household', 'Household status & everyday controls', today[2].cards.slice(0, 1));
        add('lists', 'Shopping, plans & collection days', today[2].cards.slice(1));
      } else add('lists', 'Shopping, plans & household status', today.slice(2, 3));
      add('climate', 'House temperature', today.slice(3, 4));
      add('plants', 'Plants', today.slice(4, 7));
      add('medication', 'Medication', today.slice(7));
      const house = cards(2);
      add('rooms', 'Room lights & controls', house.slice(0, 1));
      add('modes', 'House modes, routines & everyday controls', house.slice(1));
      const media = cards(3);
      for (const card of media) {
        if (card.type === 'custom:tabbed-card') {
          for (const [index, tab] of card.tabs.entries()) add(index === 0 ? 'media' : 'remotes', tab.attributes?.label || 'Media controls', [tab.card]);
        } else add('media-extra', 'Media extras', [card]);
      }
      // Calendar stays a native card in a detail sheet, independent of the new agenda summary.
      // This is a read-only convenience, not a moved or modified original control.
      groups.push({ id: 'events', title: 'Family calendar', cards: [{ type: 'calendar', entities: ['calendar.family', 'calendar.calendar', 'calendar.brightwheel_liam'], initial_view: 'listWeek' }], added: true });
    } else if (page === 'liam') {
      const room = cards(0);
      add('music', 'Music & playlists', room.slice(0, 3));
      add('room', 'Lights, climate & screen controls', room.slice(3).filter(c => c.type !== 'iframe'));
      add('routine', 'Bedtime routine', room.filter(c => c.type === 'iframe'));
      add('rewards', 'Stars, rewards & history', cards(1));
      add('clock', 'Clock, locks & device information', cards(2));
    } else {
      const network = cards(0);
      add('maintenance', 'Network restart & maintenance', network.slice(0, 1));
      const connection = network[1];
      assert.equal(connection.type, 'custom:tabbed-card');
      for (const [index, tab] of connection.tabs.entries()) add(['gateway', 'aps', 'ports', 'wifi'][index], ['Gateway diagnostics', 'Access points', 'Remote access & port forwards', 'Guest Wi-Fi QR'][index], [tab.card]);
      add('devices', 'Cabinet, appliances, garage & front door', network.slice(2));
      const extras = cards(1);
      add('tablet', 'Wall tablet', extras.slice(0, 1));
      add('printers', 'Baker & Rainier', extras.slice(1));
      const servers = cards(2);
      add('servers', 'Server diagnostics', servers.slice(0, 1));
      add('cleaning', 'Roomba & dock', servers.slice(1));
      add('tv', 'TV & remotes', [...cards(3), ...cards(4)]);
    }
    assert.deepEqual(bindings(groups.filter(g => !g.added).flatMap(g => g.cards)), bindings(sections.flatMap(s => s.cards)), `Original ${title} entity/service bindings changed.`);
    const viewMap = { '/lovelace/0': 'overview', '/lovelace/default_view_hidden': 'overview', '/lovelace/1': 'network', '/lovelace/internet-troubleshooting': 'network', '/lovelace/2': 'liam', '/lovelace/liams-dash': 'liam' };
    walk(groups, obj => { if (obj.navigation_path && viewMap[obj.navigation_path]) obj.navigation_path = `/quiet-hours-preview/${viewMap[obj.navigation_path]}`; });
    return { title, path: page, icon, type: 'panel', theme: 'Quiet Hours Preview', cards: [{ type: 'custom:quiet-hours-dashboard', page, detail_groups: groups }] };
  });
  return { title: 'Quiet Hours Preview', kiosk_mode: { hide_header: true, hide_sidebar: true }, views };
}
