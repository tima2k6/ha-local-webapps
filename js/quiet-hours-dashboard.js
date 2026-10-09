// A deliberately separate, native HA dashboard preview. No credentials are stored here.
const QH_CSS = new URL('./quiet-hours-dashboard.css?v=20261009-redesign-2', import.meta.url).href;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  cloud: '<path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-1 4.5 4.5 0 0 0-1 9Z"/>',
  rain: '<path d="M5 15a4 4 0 0 1 1-8 6 6 0 0 1 11 1 4 4 0 0 1 2 7M8 18l-1 3m6-3-1 3m6-3-1 3"/>',
  network: '<rect x="8" y="2" width="8" height="6" rx="1"/><path d="M12 8v6M4 14h16M4 14v3m8-3v3m8-3v3"/><rect x="1" y="17" width="6" height="5" rx="1"/><rect x="9" y="17" width="6" height="5" rx="1"/><rect x="17" y="17" width="6" height="5" rx="1"/>',
  star: '<path d="m12 2 3 6.5 7 1-5 5 1 7-6-3.5L6 21l1-6.5-5-5 7-1Z"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lights: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9z"/>',
  thermometer: '<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M12 7v10"/>',
  door: '<path d="M5 21V3h14v18M3 21h18M14 12h1"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
  bowl: '<path d="M3 12h18l-3 8H6zM8 8c-3-3 3-3 0-6m8 6c-3-3 3-3 0-6"/>',
  music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>',
  display: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M6 6h1m-1 11h1m9-11h2m-2 11h2"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0M12 20h.01"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v5l3 2M9 2h6m-3 0v3m6 1 2-2"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>', pause: '<path d="M8 4v16m8-16v16"/>',
  tools: '<path d="m14 7 3-4 4 4-4 3M14 7 3 18l3 3L17 10M4 3l3 1 2 3-2 2-3-2z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.list}</svg>`;
const ROOM_DEFS = [
  ['Living room', 'sensor.living_room_average_temp', 'climate.living_room_thermostat', 'living'],
  ['Bedroom', 'sensor.bedroom_temp_calibrated', 'climate.bedroom_thermostat', 'bedroom'],
  ["Liam’s room", 'sensor.liams_room_temperature', 'climate.liam_s_room_thermostat', 'liam'],
  ['Office', 'sensor.office_average_temp', 'climate.office_thermostat', 'office'],
];
const LIGHTS = [
  ['Ceiling', 'light.liams_overhead_light'], ['Neon', 'light.neon_light'], ['Headboard', 'light.liams_headboard'],
  ['Lamp', 'light.hue_color_lamp_1'], ['Bloom', 'light.hue_bloom'], ['Clock screen', 'light.liams_clock_screen'],
];
const NETWORK = [
  ['Gateway', 'sensor.cloud_gateway_ultra_state', 'wifi', 'gateway'],
  ['Office AP', 'sensor.office_ap_state', 'wifi', 'aps'],
  ['Bedroom AP', 'sensor.bedroom_ap_state', 'wifi', 'aps'],
];
const SERVERS = [
  ['Proxmox', 'binary_sensor.node_proxmox_status', 'server', 'servers'],
  ['Home Assistant', 'binary_sensor.home_assistant_vm_status', 'server', 'servers'],
  ['Fileshare', 'binary_sensor.fileshare_lxc_status', 'server', 'servers'],
  ['Docker', 'binary_sensor.docker_vm_status', 'server', 'servers'],
  ['Homebridge', 'binary_sensor.homebridge_lxc_status', 'server', 'servers'],
  ['MQTT', 'binary_sensor.mqtt_lxc_status', 'server', 'servers'],
];
const WATCHED = [...new Set([
  ...ROOM_DEFS.flatMap(r => [r[1], r[2]]), ...LIGHTS.map(r => r[1]), ...NETWORK.map(r => r[1]), ...SERVERS.map(r => r[1]),
  'weather.forecast_home', 'sensor.hub_mode', 'sensor.zoey_feeding_status', 'sensor.open_windows_count', 'sensor.exterior_door_count',
  'sensor.waste_collection_reminder', 'input_boolean.trash_out', 'sensor.garbage_pickup', 'sensor.recycling_pickup',
  'input_select.bedtime_routine_phase', 'sensor.bedtime_phase_time_remaining', 'input_datetime.bedtime_phase_ends',
  'input_text.bedtime_pause_seconds', 'input_datetime.bedtime_routine_start_time', 'input_boolean.bedtime_routine_enabled',
  'text.liams_clock_stars', 'input_number.liam_star_bank', 'input_number.liam_star_goal', 'sensor.liams_clock_mood', 'media_player.liam_lab',
  'input_boolean.paw_patrol_lullabies', 'input_boolean.liam_s_favorites', 'sensor.node_proxmox_cpu_used',
  'sensor.node_proxmox_memory_used_percentage', 'sensor.cloud_gateway_ultra_memory_utilization',
  'sensor.tim_s_tab_a9_battery', 'sensor.av_cabinet_controller_cabinet_temperature', 'vacuum.c_c_robot',
  'sensor.alexa_pup_next_timer', 'sensor.bedroom_dot_next_timer', 'sensor.office_dog_next_timer', 'sensor.liam_lab_next_timer',
  'sensor.google_home_kitchen_display_kitchen_display_timers', 'sensor.google_home_bedroom_display_bedroom_display_timers',
])];

export class QuietHoursDashboard extends HTMLElement {
  constructor() {
    super();
    // Font faces belong in the document; shadow-root @font-face support varies.
    if (!document.getElementById('quiet-hours-fonts')) {
      const fonts = document.createElement('link');
      fonts.id = 'quiet-hours-fonts'; fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&family=Figtree:wght@400;500;600&display=swap';
      document.head.append(fonts);
    }
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<link rel="stylesheet" href="${QH_CSS}"><main></main><div class="sheet" hidden><div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title"></h2><button data-close aria-label="Close details">${icon('close')}</button></div><div class="sheet-body"></div></div></div><div class="toast" role="status"></div>`;
    this._main = this.shadowRoot.querySelector('main');
    this._sheet = this.shadowRoot.querySelector('.sheet');
    this._childCards = [];
    this._pending = new Set();
    this._agenda = null;
    this._agendaAt = 0;
    this.shadowRoot.addEventListener('click', e => this._click(e));
    this.shadowRoot.addEventListener('keydown', e => this._key(e));
  }
  setConfig(config) {
    if (!['overview', 'liam', 'network'].includes(config.page)) throw new Error('Quiet Hours needs an overview, liam, or network page.');
    this._config = config;
    this._signature = '';
    this._queueRender();
  }
  set hass(hass) {
    this._hass = hass;
    for (const card of this._childCards) card.hass = hass;
    const signature = JSON.stringify([hass.connected, WATCHED.map(id => hass.states[id])]);
    if (signature !== this._signature) { this._signature = signature; this._queueRender(); }
    if (this._config?.page === 'overview' && Date.now() - this._agendaAt > 120000) this._loadAgenda();
  }
  connectedCallback() { this._tick = setInterval(() => this._queueRender(), 10000); this._queueRender(); }
  disconnectedCallback() { clearInterval(this._tick); clearTimeout(this._toastTimer); cancelAnimationFrame(this._frame); this._agendaGeneration = (this._agendaGeneration || 0) + 1; }
  getCardSize() { return 15; }
  getGridOptions() { return { columns: 'full' }; }
  _queueRender() { if (this._frame) return; this._frame = requestAnimationFrame(() => { this._frame = null; this._render(); }); }
  _entity(id) { return this._hass?.states[id]; }
  _state(id) { const s = this._entity(id)?.state; return s && !['unknown', 'unavailable'].includes(s) ? s : null; }
  _number(id, attribute) { const v = attribute ? this._entity(id)?.attributes?.[attribute] : this._state(id); return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
  _rounded(id, attribute) { const n = this._number(id, attribute); return n === null ? '—' : Math.round(n); }
  _formatState(id) {
    const state = this._state(id);
    if (id.startsWith('weather.')) return ({ partlycloudy: 'Partly cloudy', 'clear-night': 'Clear night', 'snowy-rainy': 'Snow & rain', 'lightning-rainy': 'Thunderstorms' })[state] || (state ? state.replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Unavailable');
    return state ? state.replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Unavailable';
  }
  _unit(id) { return this._entity(id)?.attributes?.unit_of_measurement || ''; }
  _more(id) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true })); }
  _disabled(id) { return this._state(id) === null || this._hass?.connected === false || this._pending.has(id) ? 'disabled' : ''; }
  _render() {
    if (!this._config || !this._hass) { this._main.innerHTML = '<div class="canvas"><p class="empty">Connecting to Home Assistant…</p></div>'; return; }
    const page = this._config.page;
    const focused = this.shadowRoot.activeElement;
    const focusKey = focused?.getAttribute('data-focus');
    const content = page === 'overview' ? this._overview() : page === 'liam' ? this._liam() : this._network();
    this._main.innerHTML = `<div class="canvas">${this._navigation()}${content}<footer class="footer"><span>Quiet Hours · Design preview · Live controls</span><button data-directory data-focus="directory">All controls ${icon('arrow')}</button><a href="/lovelace/0">Original dashboard ↗</a></footer></div>`;
    if (focusKey) [...this.shadowRoot.querySelectorAll('[data-focus]')].find(el => el.getAttribute('data-focus') === focusKey)?.focus({ preventScroll: true });
  }
  _navigation() {
    const page = this._config.page;
    return `<header class="topbar"><div class="brand">${icon('moon')}<div>Quiet Hours<small>The house, together</small></div></div><nav class="nav" aria-label="Dashboard views">${[['overview', 'home', 'Overview'], ['liam', 'star', 'Liam'], ['network', 'network', 'Network']].map(([path, glyph, title]) => `<a href="/quiet-hours-preview/${path}" data-route data-focus="nav-${path}" class="${page === path ? 'active' : ''}" ${page === path ? 'aria-current="page"' : ''}>${icon(glyph)}${title}</a>`).join('')}</nav><div class="top-end ${this._hass.connected === false ? 'offline' : ''}"><span class="live-dot"></span>${this._hass.connected === false ? 'Reconnecting' : 'Live at home'}</div></header>`;
  }
  _sectionTitle(title, group, label = 'Details') { return `<div class="section-title"><h2>${title}</h2><button data-group="${escapeHTML(group)}" data-focus="group-${escapeHTML(group)}">${label} ↗</button></div>`; }
  _shortcut(title, subtitle, glyph, action, key) { return `<button class="shortcut" data-${action}="${escapeHTML(key)}" data-focus="shortcut-${escapeHTML(key)}">${icon(glyph)}<span><h3>${title}</h3><small>${escapeHTML(subtitle)}</small></span>${icon('arrow').replace('<svg ', '<svg class="arrow" ')}</button>`; }
  _overview() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).split(' ');
    const condition = this._state('weather.forecast_home');
    const glyph = /rain|pouring|hail/.test(condition) ? 'rain' : condition === 'sunny' ? 'sun' : condition === 'clear-night' ? 'moon' : 'cloud';
    const weather = this._entity('weather.forecast_home');
    const humidity = weather?.attributes?.humidity;
    const agenda = this._agenda?.length ? this._agenda.slice(0, 3).map(event => {
      const start = event.start.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start.date}T00:00:00`);
      const sameDay = start.toDateString() === now.toDateString();
      return `<div class="event"><div class="event-time">${event.start.dateTime ? escapeHTML(start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) : 'All day'}</div><div class="event-name">${escapeHTML(event.summary)}<small>${sameDay ? 'Today' : escapeHTML(start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}${event.location ? ` · ${escapeHTML(event.location)}` : ''}</small></div></div>`;
    }).join('') : `<p class="empty">${this._agendaError ? 'Calendar is unavailable. Open Events for details.' : this._agenda === null ? 'Loading the family calendar…' : 'A little breathing room. Nothing coming up this week.'}</p>`;
    return `<section class="overview-hero"><div><p class="date">${escapeHTML(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</p><div class="time">${time[0]}<small>${time[1]}</small></div><div class="weather-line">${icon(glyph)}<span class="temperature">${this._rounded('weather.forecast_home', 'temperature')}°</span><div class="weather-copy">${escapeHTML(this._formatState('weather.forecast_home'))}<small>${humidity !== undefined ? `${escapeHTML(humidity)}% humidity · ` : ''}${escapeHTML(this._formatState('sensor.hub_mode'))} mode</small></div></div></div><div class="agenda"><div class="section-title"><span class="eyebrow">Coming up</span><button data-group="events">Family calendar ↗</button></div>${agenda}</div></section><section class="status-strip" aria-label="Household status">${this._statusPills()}</section><div class="below"><section>${this._sectionTitle('Around the house', 'rooms', 'Room controls')}<div class="room-grid">${ROOM_DEFS.map(([name, temperature, climate, key]) => {
      const target = this._number(climate, 'temperature');
      const activity = this._entity(climate)?.attributes?.hvac_action;
      return `<button class="room" data-app="climate" data-hash="room/${key}" data-focus="room-${key}"><span class="room-name">${name}<small class="${activity === 'heating' ? 'heat' : ''}">${activity === 'heating' ? 'Heating' : this._state(climate) === 'off' ? 'Heat off' : this._state(climate) === null ? 'Thermostat unavailable' : 'Comfortable'}${target !== null ? ` · Set to ${Math.round(target)}°` : ''}</small></span><span class="room-temp">${this._rounded(temperature)}°<small>${escapeHTML(this._unit(temperature))}</small></span></button>`;
    }).join('')}</div></section><section>${this._sectionTitle('Everyday things', 'household', 'More')}<div class="shortcut-list">${this._shortcut('House climate', 'All rooms, schedules & history', 'thermometer', 'app', 'climate')}${this._shortcut('Lists & plans', 'Shopping, chores, mail & collection days', 'list', 'group', 'lists')}${this._shortcut('Music & TV', 'Players, playlists & remotes', 'music', 'group', 'media')}${this._shortcut('LED panel', this._formatState('sensor.led_matrix_panel_display_mode'), 'display', 'app', 'led-panel')}</div></section></div>`;
  }
  _statusPills() {
    const pill = (text, glyph, severity, group) => `<button class="status-pill ${severity}" data-group="${group}" data-focus="status-${group}-${glyph}">${icon(glyph)}${escapeHTML(text)}</button>`;
    const items = [];
    const feed = this._state('sensor.zoey_feeding_status');
    if (feed !== 'outside-feeding-time') items.push(pill(({ fed: 'Zoey’s been fed', 'not-fed': 'Zoey is ready for dinner', overdue: 'Zoey’s feeding is overdue' })[feed] || 'Zoey · Status unavailable', 'bowl', feed === 'fed' ? 'calm' : feed === 'overdue' ? 'alert' : feed === 'not-fed' ? 'warn' : 'unknown', 'household'));
    const doors = this._number('sensor.exterior_door_count'), windows = this._number('sensor.open_windows_count');
    items.push(pill(doors === null ? 'Doors · Status unavailable' : doors ? `${doors} exterior door${doors === 1 ? '' : 's'} open` : 'Exterior doors closed', 'door', doors === null ? 'unknown' : doors ? 'warn' : 'calm', 'household'));
    if (windows === null || windows > 0) items.push(pill(windows === null ? 'Windows · Status unavailable' : `${windows} window${windows === 1 ? '' : 's'} open`, 'window', windows === null ? 'unknown' : 'warn', 'household'));
    if (this._state('sensor.waste_collection_reminder') === 'true' && this._state('input_boolean.trash_out') !== 'on') items.push(pill('Collection day · Take bins out', 'trash', 'warn', 'lists'));
    const activeTimers = WATCHED.filter(id => /next_timer|display_timers/.test(id)).filter(id => { const state = this._state(id); return state && Number.isFinite(Date.parse(state)) && Date.parse(state) > Date.now(); });
    if (activeTimers.length) items.push(pill(`${activeTimers.length} timer${activeTimers.length === 1 ? '' : 's'} running`, 'timer', 'calm', 'timers'));
    return items.join('');
  }
  _liam() {
    const phase = this._state('input_select.bedtime_routine_phase');
    const active = phase && !/^(idle|off|done|complete|completed|inactive|goodnight.*)$/i.test(phase);
    const paused = Number(this._state('input_text.bedtime_pause_seconds')) > 0;
    const end = Date.parse(this._state('input_datetime.bedtime_phase_ends')?.replace(' ', 'T') || '');
    const remaining = paused ? Number(this._state('input_text.bedtime_pause_seconds')) : active && Number.isFinite(end) ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : this._number('sensor.bedtime_phase_time_remaining');
    const countdown = remaining !== null && Number.isFinite(remaining) ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '—:—';
    const phaseNames = ['Warning', 'Jammies', 'Books', 'Snuggle 1', 'Snuggle 2'];
    const phaseIndex = /warning/i.test(phase) ? 0 : /jamm|ready/i.test(phase) ? 1 : /book|wind/i.test(phase) ? 2 : /snuggle.*1/i.test(phase) ? 3 : /snuggle.*2/i.test(phase) ? 4 : -1;
    const stars = this._starCount();
    const goal = this._number('input_number.liam_star_goal');
    const schedule = this._state('input_datetime.bedtime_routine_start_time');
    const scheduled = schedule ? new Date(`2000-01-01T${schedule}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Not set';
    const player = this._entity('media_player.liam_lab');
    return `<div class="page-title"><div><span class="eyebrow">His own little corner</span><h1>Liam’s room</h1><p>Wind down, settle in, celebrate the little wins.</p></div><button class="metric-inline" data-app="climate" data-hash="room/liam" data-focus="liam-climate">${this._rounded('sensor.liams_room_temperature')}°<small>${escapeHTML(this._formatState('climate.liam_s_room_thermostat'))} · Room climate ↗</small></button></div><div class="liam-layout"><section><div class="routine"><div class="routine-top"><span class="eyebrow">Bedtime routine</span>${icon('moon')}</div><h2>${phase === null ? 'Routine unavailable' : active ? escapeHTML(this._formatState('input_select.bedtime_routine_phase')) : 'Ready when you are.'}</h2><p class="routine-copy">${active ? paused ? 'Paused. Pick up right where you left off.' : 'A little closer to a good night’s sleep.' : this._state('input_boolean.bedtime_routine_enabled') === 'on' ? `Auto-start at ${escapeHTML(scheduled)}` : 'Start bedtime when it’s time to wind down.'}</p>${active ? `<div class="countdown">${countdown}<small style="font:12px Figtree;color:#9e9e9e;margin-left:10px">${paused ? 'paused' : 'remaining'}</small></div>` : ''}<div class="steps">${phaseNames.map((_, i) => `<span class="step ${active && i < phaseIndex ? 'done' : ''} ${active && i === phaseIndex ? 'current' : ''}"></span>`).join('')}</div><div class="step-labels">${phaseNames.map(p => `<span>${p}</span>`).join('')}</div><div class="actions">${active ? `<button class="primary" data-script="${paused ? 'bedtime_routine_resume_2' : 'bedtime_routine_pause_2'}" data-focus="routine-pause" ${this._disabled('input_select.bedtime_routine_phase')}>${icon(paused ? 'play' : 'pause')}${paused ? 'Resume' : 'Pause'}</button><button class="secondary" data-script="bedtime_routine_skip_to_next_2" data-focus="routine-next" ${this._disabled('input_select.bedtime_routine_phase')}>Next phase ${icon('arrow')}</button>` : `<button class="primary" data-script="bedtime_routine_start" data-focus="routine-start" ${this._disabled('input_select.bedtime_routine_phase')}>${icon('play')}Start bedtime</button>`}<button class="secondary" data-app="bedtime" data-focus="routine-settings">Routine settings</button></div></div><div class="controls-block">${this._sectionTitle('Set the mood', 'room', 'Brightness & settings')}<div class="light-grid">${LIGHTS.map(([name, entity]) => `<button class="light-control ${this._state(entity) === 'on' ? 'on' : ''}" data-toggle="${entity}" data-focus="light-${entity}" ${this._disabled(entity)} aria-pressed="${this._state(entity) === 'on'}">${icon('lights')}<span>${name}</span><small>${escapeHTML(this._formatState(entity))}</small></button>`).join('')}</div></div></section><section><div class="reward"><div class="reward-top"><span class="eyebrow">Little wins add up</span>${icon('star')}</div><div class="display-number">${stars === null ? '—' : stars}<small>${goal === null ? 'stars' : `of ${goal} stars`}</small></div><div class="stars-track" aria-hidden="true">${Array.from({ length: Math.min(12, Math.max(0, goal ?? 7)) }, (_, i) => `<span class="${stars !== null && i < stars ? 'earned' : ''}">${icon('star')}</span>`).join('')}</div><p>${escapeHTML(this._formatState('sensor.liams_clock_mood'))} mood · ${stars !== null && goal !== null ? stars >= goal ? 'Reward goal reached.' : `${Math.max(0, goal - stars)} more to the next reward.` : 'Reward progress unavailable.'}</p><div class="actions"><button class="secondary" data-group="rewards" data-focus="reward-award">${icon('star')}Award a star</button><button class="text-link" data-group="rewards">History & rewards ↗</button></div></div><div class="music">${this._sectionTitle('A little music', 'music', 'Player')}<p class="music-status">${player?.attributes?.media_title ? escapeHTML(player.attributes.media_title) : this._state('media_player.liam_lab') === 'playing' ? 'Playing in Liam’s room' : 'Something soft for the evening.'}</p><div class="music-buttons">${[['Favorites', 'input_boolean.liam_s_favorites'], ['Lullabies', 'input_boolean.paw_patrol_lullabies']].map(([name, entity]) => `<button class="${this._state(entity) === 'on' ? 'on' : ''}" data-toggle="${entity}" data-focus="music-${entity}" ${this._disabled(entity)} aria-pressed="${this._state(entity) === 'on'}">${name}</button>`).join('')}</div><div class="shortcut-list">${this._shortcut('Clock & panel', 'Display, locks & device settings', 'display', 'group', 'clock')}</div></div></section></div>`;
  }
  _starCount() {
    // The text entity encodes the weekly grid, not the bank total.
    return this._number('input_number.liam_star_bank');
  }
  _health(id) {
    const state = this._state(id)?.toLowerCase();
    if (state === null || state === undefined) return ['Unavailable', 'unknown'];
    if (['on', 'connected', 'online', 'running', 'ok', 'healthy', 'up', 'ready'].includes(state)) return [id.startsWith('binary_sensor.') ? 'Running' : 'Online', 'calm'];
    return [state.replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase()), 'warn'];
  }
  _deviceRows(devices) {
    return devices.map(([name, entity, glyph, group]) => {
      const [label, severity] = this._health(entity);
      const small = name === 'Proxmox' ? `CPU ${this._rounded('sensor.node_proxmox_cpu_used')}% · Memory ${this._rounded('sensor.node_proxmox_memory_used_percentage')}%` : name === 'Gateway' ? `Memory ${this._rounded('sensor.cloud_gateway_ultra_memory_utilization')}%` : name.includes('AP') ? 'Wireless access point' : 'Service host';
      return `<button class="device" data-group="${group}" data-focus="device-${entity}">${icon(glyph)}<span class="device-copy"><h3>${name}</h3><small>${small}</small></span><span class="device-state ${severity}"><i class="dot"></i>${escapeHTML(label)}</span></button>`;
    }).join('');
  }
  _network() {
    const devices = [...NETWORK, ...SERVERS];
    const healthy = devices.filter(d => this._health(d[1])[1] === 'calm').length;
    const unavailable = devices.filter(d => this._health(d[1])[1] === 'unknown').length;
    const attention = devices.length - healthy - unavailable;
    const title = attention ? `${attention} connection${attention === 1 ? '' : 's'} to check.` : unavailable ? 'Some status is unavailable.' : 'Everything is connected.';
    return `<div class="page-title"><div><span class="eyebrow">Behind the scenes</span><h1>Network & devices</h1><p>A clear view of what keeps the house running.</p></div></div><section class="health-hero"><div><div class="health-title ${attention || unavailable ? 'warn' : ''}"><i class="dot"></i>${title}</div><p>${healthy} of ${devices.length} monitored connections healthy${unavailable ? ` · ${unavailable} unavailable` : ''}. Open a device for diagnostics.</p></div><div class="network-metrics"><div class="metric"><div class="num">${healthy}<span style="font-size:18px;color:#777"> / ${devices.length}</span></div><small>Connections healthy</small></div><div class="metric"><div class="num">${this._rounded('sensor.av_cabinet_controller_cabinet_temperature')}°</div><small>Cabinet temperature</small></div><div class="metric"><div class="num">${this._rounded('sensor.tim_s_tab_a9_battery')}%</div><small>Wall tablet battery</small></div></div></section><div class="network-columns"><section>${this._sectionTitle('Connectivity', 'gateway', 'Diagnostics')}<div class="device-list">${this._deviceRows(NETWORK)}</div><button class="text-link" data-group="ports">Remote access & port forwards ↗</button><br><button class="text-link" data-group="wifi">Guest Wi-Fi QR ↗</button></section><section>${this._sectionTitle('Infrastructure', 'servers', 'All metrics')}<div class="device-list">${this._deviceRows(SERVERS)}</div></section><section>${this._sectionTitle('Around the house', 'devices', 'All devices')}<div class="device-list">${this._shortcut('Wall tablet', `${this._rounded('sensor.tim_s_tab_a9_battery')}% battery · Kiosk & display controls`, 'display', 'group', 'tablet')}${this._shortcut('Printers', 'Baker & Rainier · Print status', 'server', 'group', 'printers')}${this._shortcut('Roomba & dock', this._formatState('vacuum.c_c_robot'), 'home', 'group', 'cleaning')}${this._shortcut('Cabinet & appliances', 'Cooling, air conditioning, garage & door', 'thermometer', 'group', 'devices')}${this._shortcut('TV & remotes', 'Living room controls', 'display', 'group', 'tv')}</div></section></div><section class="maintenance"><div><h3>Maintenance, when you need it.</h3><p>Restart and configuration controls stay out of the everyday view.</p></div><div class="maintenance-actions"><button class="secondary" data-group="maintenance" data-focus="maintenance">${icon('tools')}Maintenance controls</button></div></section>`;
  }
  async _loadAgenda() {
    if (!this._hass?.callApi || this._agendaLoading) return;
    this._agendaLoading = true; this._agendaAt = Date.now();
    const generation = this._agendaGeneration = (this._agendaGeneration || 0) + 1;
    const start = new Date(), end = new Date(start.getTime() + 7 * 86400000);
    try {
      const events = await this._hass.callApi('GET', `calendars/calendar.family?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      if (generation !== this._agendaGeneration) return;
      this._agenda = events.filter(e => e.start && (e.end?.dateTime ? Date.parse(e.end.dateTime) > start.getTime() : e.end?.date ? new Date(`${e.end.date}T00:00:00`).getTime() > start.getTime() : true)).sort((a, b) => new Date(a.start.dateTime || `${a.start.date}T00:00:00`) - new Date(b.start.dateTime || `${b.start.date}T00:00:00`));
      this._agendaError = false;
    } catch { this._agendaError = true; this._agenda = []; }
    finally { this._agendaLoading = false; this._queueRender(); }
  }
  async _click(event) {
    const button = event.target.closest('button,a');
    if (!button) { if (event.target === this._sheet) this._closeSheet(); return; }
    if (button.disabled) return;
    if (button.hasAttribute('data-close')) { this._closeSheet(); return; }
    if (button.hasAttribute('data-route')) {
      event.preventDefault(); history.pushState(null, '', button.getAttribute('href'));
      window.dispatchEvent(new Event('location-changed')); return;
    }
    if (button.hasAttribute('data-directory')) { this._directory(); return; }
    if (button.dataset.group) { await this._openGroup(button.dataset.group); return; }
    if (button.dataset.app) { this._openApp(button.dataset.app, button.dataset.hash || ''); return; }
    if (button.dataset.more) { this._more(button.dataset.more); return; }
    if (button.dataset.toggle) {
      const entity = button.dataset.toggle;
      if (!['light', 'input_boolean'].includes(entity.split('.')[0]) || this._state(entity) === null) return;
      await this._service(entity.split('.')[0], 'toggle', { entity_id: entity }, entity);
    }
    if (button.dataset.script) {
      const script = button.dataset.script;
      if (!['bedtime_routine_start', 'bedtime_routine_pause_2', 'bedtime_routine_resume_2', 'bedtime_routine_skip_to_next_2'].includes(script)) return;
      await this._service('script', script, {}, 'input_select.bedtime_routine_phase');
    }
  }
  async _service(domain, service, data, key) {
    if (this._pending.has(key) || this._hass.connected === false) return;
    this._pending.add(key); this._queueRender();
    try { await this._hass.callService(domain, service, data); }
    catch { this._toast('That change did not go through. Check the connection and try again.'); }
    finally { this._pending.delete(key); this._queueRender(); }
  }
  _showSheet(title, app = false) {
    if (this._sheet.hidden) {
      this._returnFocus = this.shadowRoot.activeElement;
      this._returnFocusKey = this._returnFocus?.getAttribute('data-focus');
    }
    this._sheet.hidden = false;
    this.shadowRoot.getElementById('sheet-title').textContent = title;
    const body = this.shadowRoot.querySelector('.sheet-body');
    body.className = `sheet-body${app ? ' app' : ''}`; body.replaceChildren(); this._childCards = [];
    this.shadowRoot.querySelector('[data-close]').focus();
    return body;
  }
  _closeSheet() {
    this._sheet.hidden = true; this._sheet.querySelector('.sheet-body').replaceChildren(); this._childCards = [];
    this._sheetGeneration = (this._sheetGeneration || 0) + 1;
    const current = this._returnFocus?.isConnected ? this._returnFocus : [...this.shadowRoot.querySelectorAll('[data-focus]')].find(el => el.getAttribute('data-focus') === this._returnFocusKey);
    current?.focus?.({ preventScroll: true });
  }
  _key(event) {
    if (this._sheet.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); this._closeSheet(); }
    if (event.key === 'Tab') {
      // Traverse nested HA card shadow roots as well as our own sheet controls.
      const focusables = [];
      const collect = root => { for (const el of root.children || []) { if (el.matches?.('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"],iframe') && el.getClientRects().length) focusables.push(el); if (el.shadowRoot) collect(el.shadowRoot); collect(el); } };
      collect(this._sheet);
      let active = this.shadowRoot.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
    }
  }
  _directory() {
    const body = this._showSheet('All controls');
    const list = document.createElement('div'); list.className = 'sheet-list';
    list.innerHTML = (this._config.detail_groups || []).map(group => `<button data-group="${escapeHTML(group.id)}"><span>${escapeHTML(group.title)}</span><small>Open ↗</small></button>`).join('');
    body.append(list);
  }
  async _openGroup(id) {
    const group = this._config.detail_groups?.find(g => g.id === id);
    if (!group) { this._toast('These controls are available in All controls.'); return; }
    const body = this._showSheet(group.title);
    const generation = this._sheetGeneration = (this._sheetGeneration || 0) + 1;
    body.innerHTML = '<p class="empty full">Loading controls…</p>';
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this._sheetGeneration || this._sheet.hidden) return;
      body.replaceChildren();
      for (const config of group.cards) {
        const card = helpers.createCardElement(config);
        card.hass = this._hass;
        if (['vertical-stack', 'horizontal-stack', 'custom:tabbed-card', 'custom:layout-card', 'custom:stack-in-card', 'iframe', 'conditional'].includes(config.type)) card.classList.add('full');
        body.append(card); this._childCards.push(card);
      }
    } catch { body.innerHTML = '<p class="empty full">These controls could not load. Your original dashboard is still available.</p>'; }
  }
  _openApp(name, hash) {
    const apps = { climate: ['House climate', 'climate.html?embed&v=20261008g'], bedtime: ['Bedtime routine', 'bedtime.html?embed&v=20261009-redesign-1'], 'led-panel': ['LED panel', 'led-panel.html?embed&v=20261009-redesign-1'] };
    const app = apps[name]; if (!app) return;
    const body = this._showSheet(app[0], true), iframe = document.createElement('iframe');
    iframe.title = app[0]; iframe.src = `/local/webapps/${app[1]}${hash ? `#${hash}` : ''}`;
    body.append(iframe);
  }
  _toast(message) { this.shadowRoot.querySelector('.toast').textContent = message; clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => { this.shadowRoot.querySelector('.toast').textContent = ''; }, 7000); }
}
if (!customElements.get('quiet-hours-dashboard')) customElements.define('quiet-hours-dashboard', QuietHoursDashboard);
window.customCards ??= [];
if (!window.customCards.some(card => card.type === 'quiet-hours-dashboard')) window.customCards.push({ type: 'quiet-hours-dashboard', name: 'Quiet Hours Dashboard', description: 'Screensaver-inspired household, Liam, and network views.' });
