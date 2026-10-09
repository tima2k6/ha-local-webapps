import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildRedesign } from './quiet-hours-redesign.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const credentials = fs.readFileSync(path.join(root, 'js/ha-config.js'), 'utf8');
const haUrl = credentials.match(/(?:const|let|var)\s+HA_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
const token = credentials.match(/(?:const|let|var)\s+HA_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!haUrl || !token) throw new Error('HA connection settings were not found.');
const socket = new WebSocket(haUrl.replace(/^http/, 'ws') + '/api/websocket');
const authTimer = setTimeout(() => socket.close(), 20000);
let nextId = 1;
const pending = new Map();
const authenticated = new Promise((resolve, reject) => {
  socket.addEventListener('error', () => reject(new Error('HA WebSocket connection failed.')));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: token }));
    else if (message.type === 'auth_ok') { clearTimeout(authTimer); resolve(); }
    else if (message.type === 'auth_invalid') reject(new Error('HA authentication failed.'));
    else if (message.type === 'result') {
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.success ? request.resolve(message.result) : request.reject(new Error(JSON.stringify(message.error))); }
    }
  });
});
function call(type, fields = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${type}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, type, ...fields }));
  });
}
function walk(value, fn) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) fn(value);
  for (const child of Object.values(value)) walk(child, fn);
}

const previewPath = 'quiet-hours-preview';
const themeName = 'Quiet Hours Preview';
const theme = {
  'card-mod-theme': themeName,
  'primary-color': '#5fc9b4', 'accent-color': '#5fc9b4',
  'primary-background-color': '#0c0c0c', 'secondary-background-color': '#151515',
  'lovelace-background': '#0c0c0c', 'ha-card-background': '#151515',
  'card-background-color': '#151515', 'ha-card-border-color': '#303030',
  'ha-card-border-width': '1px', 'ha-card-border-radius': '16px',
  'ha-card-box-shadow': 'none', 'divider-color': '#303030',
  'primary-text-color': '#f2f2f2', 'secondary-text-color': '#b4b4b4',
  'disabled-text-color': '#777777', 'text-primary-color': '#f2f2f2',
  'app-header-background-color': '#0c0c0c', 'app-header-text-color': '#e5e5e5',
  'sidebar-background-color': '#101010', 'sidebar-text-color': '#c8c8c8',
  'sidebar-icon-color': '#9e9e9e', 'sidebar-selected-icon-color': '#5fc9b4',
  'sidebar-selected-text-color': '#f2f2f2', 'sidebar-selected-background-color': '#1b2926',
  'state-icon-color': '#9e9e9e', 'state-icon-active-color': '#5fc9b4',
  'state-icon-unavailable-color': '#777777', 'state-active-color': '#5fc9b4',
  'state-inactive-color': '#9e9e9e', 'state-unavailable-color': '#777777',
  'warning-color': '#e0a64a', 'error-color': '#ff6b5e', 'success-color': '#5fc9b4',
  'ha-font-family-body': 'Figtree, sans-serif', 'ha-font-family-heading': 'Outfit, sans-serif',
  'ha-font-family-longform': 'Figtree, sans-serif',
  'primary-font-family': 'Figtree, sans-serif',
  'paper-font-common-base_-_font-family': 'Figtree, sans-serif',
  'paper-font-body1_-_font-family': 'Figtree, sans-serif',
  'mdc-typography-font-family': 'Figtree, sans-serif',
  'ha-view-sections-column-gap': '24px', 'ha-view-sections-row-gap': '24px',
  'bubble-main-background-color': '#151515', 'bubble-secondary-background-color': '#242424',
  'bubble-accent-color': '#5fc9b4', 'bubble-border-radius': '16px',
  'mini-media-player-base-color': '#e5e5e5', 'mini-media-player-accent-color': '#5fc9b4',
  'graph-color': '#5fc9b4', 'paper-slider-active-color': '#5fc9b4',
  'paper-slider-knob-color': '#5fc9b4', 'switch-checked-color': '#5fc9b4',
  'switch-checked-track-color': '#2c5a51',
  'card-mod-root': "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&family=Figtree:wght@400;500;600&display=swap');\n:host { font-family: Figtree, sans-serif; }",
  modes: { dark: {} },
};
function themeYaml() {
  return '# Separate preview theme; does not change the household default.\n' + themeName + ':\n' + Object.entries(theme).map(([key, value]) =>
    typeof value === 'object' ? `  ${key}:\n    dark: {}` : `  ${key}: ${JSON.stringify(value)}`
  ).join('\n') + '\n';
}
const surfaceStyle = `\n/* Quiet Hours preview */\nha-card { background: var(--ha-card-background, #151515) !important; border: 1px solid var(--ha-card-border-color, #303030) !important; border-radius: 16px !important; box-shadow: none !important; font-family: Figtree, sans-serif !important; }`;
function styleCard(card) {
  if (card.type === 'custom:paper-buttons-row') return;
  if (!card.type || ['grid', 'horizontal-stack', 'vertical-stack', 'conditional', 'divider', 'section', 'heading'].includes(card.type)) return;
  // Preserve embedded app sizing and transparent fullscreen popup styles.
  if (card.type === 'iframe') return;
  card.card_mod ??= {};
  if (!card.card_mod.style) card.card_mod.style = surfaceStyle;
  else if (typeof card.card_mod.style === 'string') card.card_mod.style += surfaceStyle;
  else card.card_mod.style['.'] = (card.card_mod.style['.'] || '') + surfaceStyle;
  if (card.type === 'custom:button-card') {
    card.styles ??= {};
    card.styles.card = [...(card.styles.card || []), { 'font-family': 'Figtree, sans-serif' }, { 'border-radius': '16px' }, { 'box-shadow': 'none' }];
  }
  if (card.type === 'custom:mini-graph-card' && !card.color_thresholds) card.line_color = '#5fc9b4';
  if (card.type === 'custom:timer-bar-card') {
    card.bar_foreground = '#5fc9b4'; card.bar_background = '#242424'; card.bar_height = '6px';
  }
}
function withoutOldNavigation(value) {
  if (Array.isArray(value)) return value.filter(v => v?.type !== 'custom:paper-buttons-row').map(withoutOldNavigation);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutOldNavigation(v)]));
}
function heading(text, subtitle) {
  return { type: 'custom:button-card', name: text, label: subtitle, show_icon: false, show_label: true,
    tap_action: { action: 'none' }, hold_action: { action: 'none' },
    grid_options: { columns: 'full', rows: 'auto' },
    styles: { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '12px 4px 20px' }],
      name: [{ 'font-family': 'Outfit, sans-serif' }, { 'font-size': 'clamp(30px, 4vw, 44px)' }, { 'font-weight': '300' }, { 'justify-self': 'start' }, { color: '#f2f2f2' }],
      label: [{ 'font-family': 'Figtree, sans-serif' }, { 'font-size': '14px' }, { color: '#b4b4b4' }, { 'justify-self': 'start' }, { 'margin-top': '10px' }, { 'white-space': 'normal' }, { 'text-align': 'left' }] }
  };
}
function buildPreview(source) {
  const oldViews = [source.views[0], source.views[2], source.views[1]];
  const definitions = [
    ['Overview', 'overview', 'mdi:home-outline', 'The house, at a glance.', ['Running timers', 'Today', 'Around the house', 'More from home']],
    ['Liam', 'liam', 'mdi:toy-brick-outline', 'A quieter place for room controls, bedtime, and little wins.', ['Room & bedtime', 'Stars & rewards', 'Clock & panel']],
    ['Network', 'network', 'mdi:lan', 'Connections, devices, and maintenance in one place.', ['Network & devices', 'Servers & printers', 'Cleaning', 'Living room media', 'Media controls']],
  ];
  const viewMap = { '/lovelace/0': 'overview', '/lovelace/default_view_hidden': 'overview', '/lovelace/internet-troubleshooting': 'network', '/lovelace/1': 'network', '/lovelace/liams-dash': 'liam', '/lovelace/2': 'liam' };
  let climateButton;
  walk(source.views[0], obj => { if (obj.type === 'custom:paper-buttons-row') climateButton = structuredClone(obj.buttons.find(b => b.name === 'Climate')); });
  const views = oldViews.map((original, i) => {
    const [title, viewPath, icon, subtitle, labels] = definitions[i];
    const view = withoutOldNavigation(structuredClone(original));
    view.title = title; view.path = viewPath; view.icon = icon; view.theme = themeName;
    view.background = '#0c0c0c';
    walk(view, obj => {
      if (obj.navigation_path && viewMap[obj.navigation_path]) obj.navigation_path = `/${previewPath}/${viewMap[obj.navigation_path]}`;
      styleCard(obj);
    });
    for (const [sectionIndex, section] of view.sections.entries()) {
      section.cards.unshift({ type: 'heading', heading: labels[sectionIndex] || 'Details', heading_style: 'subtitle', grid_options: { columns: 'full', rows: 1 } });
    }
    const buttons = definitions.map(([name, target, navIcon]) => ({ type: 'custom:button-card', name, icon: navIcon,
      tap_action: { action: 'navigate', navigation_path: `/${previewPath}/${target}` },
      styles: { card: [{ height: '64px' }, { background: target === viewPath ? '#1b2926' : '#151515' }, { border: `1px solid ${target === viewPath ? '#2c5a51' : '#303030'}` }, { 'border-radius': '16px' }, { 'box-shadow': 'none' }],
        icon: [{ width: '22px' }, { color: target === viewPath ? '#5fc9b4' : '#9e9e9e' }],
        name: [{ 'font-family': 'Figtree, sans-serif' }, { 'font-size': '13px' }, { color: '#e5e5e5' }] }
    }));
    if (climateButton) buttons.push({ type: 'custom:button-card', name: 'Climate', icon: 'mdi:thermostat', tap_action: climateButton.tap_action, styles: structuredClone(buttons.find(b => b.name !== title).styles) });
    view.sections.unshift({ type: 'grid', column_span: view.max_columns || 3, cards: [
      heading(title, subtitle),
      { type: 'grid', columns: buttons.length, square: false, cards: buttons, grid_options: { columns: 'full', rows: 'auto' } },
      { type: 'markdown', content: 'Preview · Live controls · Original dashboards remain available in Overview.', text_only: true, grid_options: { columns: 'full', rows: 'auto' }, card_mod: { style: 'ha-card { color: #9e9e9e; font-size: 12px; background: transparent; border: none; padding: 0 4px; }' } },
    ] });
    return view;
  });
  // Original service actions and entity bindings must survive styling exactly.
  function bindings(value) {
    const values = [];
    walk(value, obj => {
      for (const k of ['entity', 'service', 'perform_action', 'service_data', 'target']) if (obj[k] !== undefined) values.push(JSON.stringify([k, obj[k]]));
      if (Array.isArray(obj.entities)) values.push(JSON.stringify(['entities', obj.entities.filter(e => typeof e === 'string')]));
    });
    return values.sort();
  }
  for (let i = 0; i < views.length; i++) {
    assert.deepEqual(bindings(views[i].sections.slice(1)), bindings(withoutOldNavigation(oldViews[i].sections)), 'Existing entity bindings and service actions changed.');
  }
  return { title: 'Quiet Hours Preview', views };
}

try {
  await authenticated;
  const source = await call('lovelace/config', { url_path: 'lovelace' });
  const dashboards = await call('lovelace/dashboards/list');
  const themes = await call('frontend/get_themes');
  console.log(JSON.stringify({ dashboards: dashboards.map(d => ({ title: d.title, path: d.url_path })), themeCount: Object.keys(themes.themes).length }));
  if (process.argv.includes('--prepare-redesign')) {
    const config = buildRedesign(source);
    const output = path.join(root, 'previews/quiet-hours');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'dashboard-draft.json'), JSON.stringify(config, null, 2));
    const states = await call('get_states');
    const uiSource = fs.readFileSync(path.join(root, 'js/quiet-hours-dashboard.js'), 'utf8');
    const ids = new Set([...uiSource.matchAll(/['"]((?:sensor|binary_sensor|light|climate|text|input_number|input_select|input_text|input_datetime|input_boolean|weather|vacuum|media_player)\.[a-z0-9_]+)['"]/g)].map(m => m[1]));
    const selected = states.filter(s => ids.has(s.entity_id));
    fs.writeFileSync(path.join(output, 'preview-states.json'), JSON.stringify(Object.fromEntries(selected.map(s => [s.entity_id, s])), null, 2));
    const services = await call('get_services');
    console.log(JSON.stringify({ prepared: true, viewTypes: config.views.map(v => v.type), detailGroups: config.views.map(v => ({ page: v.path, groups: v.cards[0].detail_groups.map(g => g.id) })), bedtimeServices: Object.keys(services.script).filter(s => s.startsWith('bedtime_routine_')), samples: selected.filter(s => /stars|bedtime_routine_phase|_ap_state|ultra_state/.test(s.entity_id)).map(s => ({ id: s.entity_id, state: s.state, attributes: s.attributes })) }));
  } else if (process.argv.includes('--redesign')) {
    if (!dashboards.some(d => d.url_path === previewPath)) throw new Error('Preview dashboard is missing.');
    const previous = await call('lovelace/config', { url_path: previewPath });
    const config = buildRedesign(source);
    const output = path.join(root, 'previews/quiet-hours');
    fs.mkdirSync(output, { recursive: true });
    const backupPath = path.join(output, `dashboard-before-redesign-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(previous, null, 2));
    const liveDir = '\\\\192.168.2.125\\config\\www\\quiet-hours-preview';
    fs.mkdirSync(liveDir, { recursive: true });
    for (const file of ['quiet-hours-dashboard.js', 'quiet-hours-dashboard.css']) fs.copyFileSync(path.join(root, 'js', file), path.join(liveDir, file));
    const resources = await call('lovelace/resources');
    const url = '/local/quiet-hours-preview/quiet-hours-dashboard.js?v=20261009-redesign-2';
    const existing = resources.find(r => r.url.startsWith('/local/quiet-hours-preview/quiet-hours-dashboard.js'));
    if (existing) await call('lovelace/resources/update', { resource_id: existing.id, url, res_type: 'module' });
    else await call('lovelace/resources/create', { url, res_type: 'module' });
    await call('lovelace/config/save', { url_path: previewPath, config });
    const saved = await call('lovelace/config', { url_path: previewPath });
    assert.deepEqual(saved, config, 'Saved redesign differs from generated configuration.');
    assert.deepEqual(await call('lovelace/config', { url_path: 'lovelace' }), source, 'Original dashboard changed.');
    fs.writeFileSync(path.join(output, 'dashboard.json'), JSON.stringify(config, null, 2));
    const states = await call('get_states');
    const ids = ['input_select.bedtime_routine_phase', 'text.liams_clock_stars', 'input_number.liam_star_goal', 'sensor.cloud_gateway_ultra_state', 'sensor.office_ap_state', 'sensor.bedroom_ap_state'];
    console.log(JSON.stringify({ redesigned: `${haUrl}/${previewPath}/overview`, preserved: 'Original dashboard and all detail entity/service bindings', samples: states.filter(s => ids.includes(s.entity_id)).map(s => ({ id: s.entity_id, state: s.state, attributes: s.attributes })) }));
  } else if (process.argv.includes('--publish')) {
    if (dashboards.some(d => d.url_path === previewPath)) throw new Error('Preview already exists; refusing to overwrite it.');
    const config = buildPreview(source);
    const output = path.join(root, 'previews/quiet-hours');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'dashboard.json'), JSON.stringify(config, null, 2));
    fs.writeFileSync(path.join(output, 'theme.yaml'), themeYaml());
    const themeDir = '\\\\192.168.2.125\\config\\themes\\quiet-hours-preview';
    if (fs.existsSync(themeDir)) throw new Error('Preview theme directory exists; refusing to overwrite it.');
    fs.mkdirSync(themeDir);
    fs.writeFileSync(path.join(themeDir, 'quiet-hours-preview.yaml'), themeYaml());
    await call('call_service', { domain: 'frontend', service: 'reload_themes' });
    const loadedThemes = await call('frontend/get_themes');
    assert.ok(loadedThemes.themes[themeName], 'Preview theme did not load.');
    await call('lovelace/dashboards/create', { url_path: previewPath, title: 'Quiet Hours Preview', icon: 'mdi:palette-outline', mode: 'storage', require_admin: false, show_in_sidebar: true });
    await call('lovelace/config/save', { url_path: previewPath, config });
    const saved = await call('lovelace/config', { url_path: previewPath });
    assert.deepEqual(saved, config, 'Saved preview differs from generated configuration.');
    assert.deepEqual(await call('lovelace/config', { url_path: 'lovelace' }), source, 'Original dashboard changed.');
    console.log(JSON.stringify({ published: `${haUrl}/${previewPath}/overview`, views: saved.views.map(v => ({ title: v.title, path: v.path })), verified: 'Theme loaded; saved config matches; original unchanged; entity and service bindings preserved.' }));
  } else for (const view of source.views.slice(0, 3)) {
    const nav = []; const popups = []; const entities = [];
    walk(view, card => {
      if (card.type === 'custom:paper-buttons-row') nav.push(card);
      if (card.type === 'custom:bubble-card' && card.card_type === 'pop-up') popups.push({ name: card.name, hash: card.hash });
      if (card.entity) entities.push(card.entity);
    });
    console.log(JSON.stringify({ view: view.title, nav, popups, entities: [...new Set(entities)].slice(0, 50) }));
  }
} finally { clearTimeout(authTimer); socket.close(); }
