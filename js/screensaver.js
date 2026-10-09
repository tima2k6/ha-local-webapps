// screensaver.js — the "Quiet Hours" screensaver (preview.html).
// Black OLED-friendly layout: thin clock, met.no weather, the next three
// family-calendar events (plus Liam's Brightwheel school events) and static status tags instead of a scrolling ticker.
// After sunset the clock dims and the weather/agenda column goes; tags stay.
// The ticker's and timers' HA logic is reused by subclassing them; only their
// rendering changes.

import { Ticker } from './ticker.js?v=4';
import { Timers } from './timers.js?v=2';

const WEATHER = 'weather.forecast_home';
const CALENDAR = 'calendar.family';
// Brightwheel is the whole school's feed: keep Liam's classroom (D105 Explorer) and
// "All Rooms" events, skip ones Family already has (see similar()), and say they're Liam's.
const SCHOOL = { entity: 'calendar.brightwheel_liam', room: 'D105', label: 'Liam' };
const MAX_EVENTS = 3;
const DRIFT_MS = 180000;     // burn-in guard: nudge the whole layout every 3 minutes

const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===== Weather icons: inline stroke SVG, colored by CSS =====
const CLOUD = 'M7 19h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.2 3.9 3.9 0 0 0 7 19z';
const CLOUD_UP = 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 7.2 3.9 3.9 0 0 0 7 15z';
const ICON_PATHS = {
    'sunny': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    'clear-night': '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    'partlycloudy': '<path d="M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1"/><path d="M5.3 10.2A3.5 3.5 0 0 1 11 6.6"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.4 13.6 3.2 3.2 0 0 0 9 20z"/>',
    'cloudy': `<path d="${CLOUD}"/>`,
    'fog': '<path d="M7 9.5a5 5 0 0 1 9.6-1.9A3.5 3.5 0 0 1 17.5 14"/><path d="M3 14h14M5 17.5h14M3 21h12"/>',
    'rainy': `<path d="${CLOUD_UP}"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>`,
    'pouring': `<path d="${CLOUD_UP}"/><path d="M8 17.5l-1.5 4M12 17.5l-1.5 4M16 17.5l-1.5 4"/>`,
    'lightning': `<path d="${CLOUD_UP}"/><path d="M12.5 15.5L10.5 19h3l-2 3.5"/>`,
    'snowy': `<path d="${CLOUD_UP}"/><path d="M8.5 19h.01M12 21h.01M15.5 19h.01M10 22.5h.01M14 22.5h.01"/>`,
    'windy': '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2.5 2.5 0 1 1-2.5 2.5M3 16h9a2.5 2.5 0 1 1-2.5 2.5"/>'
};
const ICON_ALIAS = {
    'lightning-rainy': 'lightning', 'snowy-rainy': 'snowy', 'hail': 'snowy',
    'windy-variant': 'windy', 'exceptional': 'fog'
};
const icon = cond => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    ICON_PATHS[cond] || ICON_PATHS[ICON_ALIAS[cond]] || ICON_PATHS.cloudy}</svg>`;

const LABELS = {
    'clear-night': 'Clear', 'partlycloudy': 'Partly cloudy', 'lightning': 'Thunder',
    'lightning-rainy': 'Thunderstorms', 'snowy-rainy': 'Sleet', 'pouring': 'Heavy rain',
    'rainy': 'Rain', 'snowy': 'Snow', 'windy-variant': 'Windy', 'exceptional': 'Severe weather',
    'sunny': 'Sunny', 'cloudy': 'Cloudy', 'fog': 'Fog', 'hail': 'Hail', 'windy': 'Windy'
};
const label = c => LABELS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : '');

// ===== Clock =====
class Clock {
    constructor(el) { this.el = el; }

    tick() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(now);
        const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
        const period = parts.find(p => p.type === 'dayPeriod')?.value || '';
        const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        this.el.querySelector('.date').textContent = date;
        this.el.querySelector('.time').textContent = time;
        this.el.querySelector('.period').textContent = period;
    }

    start() {
        this.tick();
        setInterval(() => this.tick(), 1000);
    }
}

// ===== Weather =====
class Weather {
    constructor(haUrl, token, el, nightEl) {
        Object.assign(this, { haUrl, token, el, nightEl });
    }

    async api(path, body) {
        const r = await fetch(`${this.haUrl}/api/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    async refresh() {
        try {
            const [cur, fc] = await Promise.all([
                this.api(`states/${WEATHER}`),
                this.api('services/weather/get_forecasts?return_response', { entity_id: WEATHER, type: 'daily' })
            ]);

            const days = fc.service_response?.[WEATHER]?.forecast || [];
            const today = days[0], next = days[1];
            const temp = Math.round(cur.attributes.temperature);
            const cond = cur.state;

            const tomorrow = next
                ? `<div class="wx-next">${esc(new Date(next.datetime).toLocaleDateString([], { weekday: 'long' }))} — ${esc(label(next.condition).toLowerCase())}, ${Math.round(next.temperature)}° / ${Math.round(next.templow)}°</div>`
                : '';
            this.el.innerHTML = `
                <div class="wx-now">
                    <div class="wx-icon">${icon(cond)}</div>
                    <div class="wx-temp">${temp}°</div>
                    <div class="wx-cond">
                        <div class="wx-label">${esc(label(cond))}</div>
                        ${today ? `<div class="wx-hilo">H ${Math.round(today.temperature)}°  ·  L ${Math.round(today.templow)}°</div>` : ''}
                    </div>
                </div>
                ${tomorrow}`;
            this.nightEl.innerHTML = `${icon(cond)}<span>${temp}°  ·  ${esc(label(cond))}</span>`;
        } catch (e) {
            console.error('Weather:', e);
        }
    }

    start() {
        this.refresh();
        setInterval(() => this.refresh(), 300000);
    }
}

// ===== Family calendar + Liam's school events =====
const evDay = ev => (ev.start.date || ev.start.dateTime).slice(0, 10);
const forLiam = ev => { const loc = ev.location || ''; return !loc || /all rooms/i.test(loc) || loc.includes(SCHOOL.room); };
// "Similar" = within a day of each other and mostly the same words ("Picture Day!" on the
// 14th vs Family's "Picture day" on the 13th), or one title contained in the other.
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'at', 'to', 'in', 'on', 'liam', 'liams', 's']);
const words = s => new Set(String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w)));
function similar(a, b) {
    if (Math.abs(Date.parse(evDay(a)) - Date.parse(evDay(b))) > 86400e3) return false;
    const x = words(a.summary), y = words(b.summary);
    if (!x.size || !y.size) return false;
    const shared = [...x].filter(w => y.has(w)).length;
    return shared === Math.min(x.size, y.size) || shared / new Set([...x, ...y]).size >= 0.5;
}

async function familyEvents(haUrl, token, start, end) {
    const get = async cal => {
        const r = await fetch(`${haUrl}/api/calendars/${cal}?start=${start.toISOString()}&end=${end.toISOString()}`,
            { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`${cal}: HTTP ${r.status}`);
        return r.json();
    };
    const [family, school] = await Promise.all([get(CALENDAR), get(SCHOOL.entity).catch(e => { console.error('School calendar:', e); return []; })]);
    const liam = school.filter(ev => forLiam(ev) && !family.some(f => similar(ev, f)))
        .map(ev => ({ ...ev, summary: `${SCHOOL.label} · ${String(ev.summary || 'School event').trim()}` }));
    return [...family, ...liam];
}

// ===== Next three calendar events =====
class Agenda {
    constructor(haUrl, token, el) { Object.assign(this, { haUrl, token, el }); }

    static when(ev) {
        const allDay = !ev.start.dateTime;
        const start = allDay ? new Date(`${ev.start.date}T00:00:00`) : new Date(ev.start.dateTime);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day0 = new Date(start); day0.setHours(0, 0, 0, 0);
        const diff = Math.round((day0 - today) / 86400000);
        const day = diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow'
            : diff < 6 ? start.toLocaleDateString([], { weekday: 'short' })
            : `${start.toLocaleDateString([], { weekday: 'short' })} ${start.getDate()}`;
        const time = allDay ? 'All day' : start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `${day} · ${time}`;
    }

    async refresh() {
        try {
            const start = new Date(), end = new Date();
            end.setDate(end.getDate() + 14);
            const events = (await familyEvents(this.haUrl, this.token, start, end))
                .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date))
                .slice(0, MAX_EVENTS);
            this.el.innerHTML = events.length
                ? events.map(ev => `<div class="ev"><div class="ev-when">${esc(Agenda.when(ev))}</div><div class="ev-name">${esc(ev.summary || 'Untitled')}</div></div>`).join('')
                : '<div class="ev-none">Nothing in the next two weeks</div>';
        } catch (e) {
            console.error('Agenda:', e);
        }
    }

    start() {
        this.refresh();
        setInterval(() => this.refresh(), 300000);
    }
}

// ===== Insights: a few quiet, rotating lines under the weather =====
// Whatever is worth saying at this time of day, plus house check-ins (warm-ups,
// heat hold, 3D printers), thirsty plants and clock changes whenever they apply; two lines show at once and the
// rest take turns. Something that needs someone (meds) stays pinned on top.
// Never the same things as the tags along the bottom; hidden at night with the
// rest of the day layout. Mail was left out on purpose: its sensors aren't
// accurate enough (2026-10-08).
const SUN = 'sun.sun';
const COMMUTES = [
    { entity: 'sensor.wazeemily_commute_emily_commute', label: 'Emily', detail: 'to work', people: ['person.emily'], normal: 15 },
    { entity: 'sensor.waze_kings_commute', label: "King's", people: ['person.tim', 'person.emily'], normal: 4 },
    { entity: 'sensor.tim_eta_waze_tim_eta', label: 'Tim', detail: 'drive home', people: ['person.tim'], away: true },
    { entity: 'sensor.emily_home_eta_waze_emily_eta', label: 'Emily', detail: 'drive home', people: ['person.emily'], away: true,
        workZone: 'zone.emily_s_hotel', workFrom: 15 * 60 + 30, workNormal: 15 }
];
const COMMUTE_WINDOW = { from: 6 * 60 + 30, until: 8 * 60, stale: 15 * 60e3 };
const PICKUP = {
    from: 14 * 60 + 30, until: 18 * 60, stale: 15 * 60e3, snapshotStale: 2 * 60e3,
    attendance: 'sensor.brightwheel_liam_attendance', zone: 'zone.king_s', route: 'sensor.waze_kings_commute',
    sync: 'sensor.brightwheel_a2096536_45d9_4eaf_aa19_38c985d5e450_last_sync',
    status: 'sensor.brightwheel_a2096536_45d9_4eaf_aa19_38c985d5e450_status'
};
const MEDS_TAKEN = 'binary_sensor.prozac_taken_today';   // same sensor as the 6 PM reminder
const MEDS_FROM = 14 * 60;                                // meds line from 2 PM until night
const EVENING = 18 * 60;
const PRINTERS = ['x1c_00m00a2c0618544', 'p1s_01p00c611801219'];   // Bambu: Rainier, Flower
const PRINT_DONE_FOR = 2 * 3600e3;    // "finished its print" for two hours after
const WARMUPS = { house: 'the whole house', living_room: 'the living room', bedroom: 'the bedroom', liam: "Liam's room", office: 'the office' };
const HOLD = 'input_boolean.climate_manual_override_active';
const ROOMS = ['living_room', 'bedroom', 'liam_s_room', 'office'].map(r => `climate.${r}_thermostat`);
const OPEN_WINDOWS = 'sensor.open_windows_count';
// Plants: soil moisture vs each plant's own "too dry" number (set in the plant card)
const PLANTS = { snake_plant: 'The snake plant', dracaena: 'The dracaena', mimosa_pudica: 'The mimosa' };
const PLANT_SOON = 5;            // % above too-dry that counts as "soon"
const PLANT_STALE = 2 * 86400e3; // ignore readings older than this (dead battery)
const FRESH_AIR = { from: 10 * 60, until: 19 * 60, low: 60, high: 75, warmer: 4 };   // °F
// Only-when-it-matters weather and air. The pinned ones (amber) stay up top.
const AQI = 'sensor.u_s_air_quality_index';     // AirVisual, hourly; fine particles = smoke
const AQI_POOR = 101, AQI_BAD = 151;            // EPA: sensitive groups / everyone
// Outdoor humidity: judged by dew point (85% on a cool PNW day is normal, not muggy)
const MUGGY_DEW = 65;                           // °F dew point: sticky outside
const DRY_OUT = 20;                             // % humidity: very dry (fire weather)
const THUNDER = new Set(['lightning', 'lightning-rainy']);
const STRONG_WIND = 30;                         // mph, pinned
const HOT = 90, HARD_FREEZE = 28;               // °F
const UV_HIGH = 7;

// ===== Moon: full and new moon times (Meeus, Astronomical Algorithms ch. 49,
// main terms; good to a few minutes) =====
function moonPhaseTime(k) {      // k: whole = new moon, .5 = full moon; returns ms
    const rad = Math.PI / 180, T = k / 1236.85;
    const E = 1 - 0.002516 * T;
    const M = (2.5534 + 29.1053567 * k) * rad;
    const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T) * rad;
    const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T) * rad;
    const O = (124.7746 - 1.56375588 * k) * rad;
    const full = k % 1 !== 0;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T;
    jde += (full ? -0.40614 : -0.40720) * Math.sin(Mp) + (full ? 0.17302 : 0.17241) * E * Math.sin(M)
        + (full ? 0.01614 : 0.01608) * Math.sin(2 * Mp) + (full ? 0.01043 : 0.01039) * Math.sin(2 * F)
        + (full ? 0.00734 : 0.00739) * E * Math.sin(Mp - M) - 0.00514 * E * Math.sin(Mp + M)
        + (full ? 0.00209 : 0.00208) * E * E * Math.sin(2 * M) - 0.00111 * Math.sin(Mp - 2 * F)
        - 0.00057 * Math.sin(Mp + 2 * F) + 0.00056 * E * Math.sin(2 * Mp + M) - 0.00042 * Math.sin(3 * Mp)
        + 0.00042 * E * Math.sin(M + 2 * F) + 0.00038 * E * Math.sin(M - 2 * F)
        - 0.00024 * E * Math.sin(2 * Mp - M) - 0.00017 * Math.sin(O);
    return (jde - 2440587.5) * 86400000;
}
// The full or new moon that falls in [from, until), if any: { full, at }
function moonBetween(from, until) {
    const k0 = Math.floor(((from / 86400000 + 2440587.5) - 2451550.09766) / 29.530588861);
    for (let k = k0 - 1; k <= k0 + 2; k += 0.5) {
        const at = moonPhaseTime(k);
        if (at >= from && at < until) return { full: k % 1 !== 0, at };
    }
    return null;
}

// ===== Daylight saving: the next clock change within a week, if any =====
function clockChange(now) {
    let off = now.getTimezoneOffset();
    for (let h = 1; h <= 8 * 24; h++) {
        const t = new Date(now.getTime() + h * 3600e3);
        if (t.getTimezoneOffset() !== off) return { at: t, back: t.getTimezoneOffset() > off };
    }
    return null;
}
// ...and one that happened in the last 12 hours
function clockChanged(now) {
    const before = new Date(now.getTime() - 12 * 3600e3);
    return before.getTimezoneOffset() !== now.getTimezoneOffset() ? { back: now.getTimezoneOffset() > before.getTimezoneOffset() } : null;
}
const WET = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy', 'snowy-rainy', 'hail']);
const SNOW = new Set(['snowy', 'snowy-rainy', 'hail']);
const FROST_AT = 34;          // °F low that counts as frost
const BIG_CHANGE = 8;         // °F difference in highs worth mentioning
const WINDY_AT = 15;          // mph
const SHOWN = 2, ROTATE_MS = 20000;

const INS_ICONS = {
    sunrise: '<path d="M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 6v3M5.2 9.2l2 2M18.8 9.2l-2 2M8 21h8"/>',
    sunset: '<path d="M3 17h18M6.5 17a5.5 5.5 0 0 1 11 0M12 5v4M10 7l2 2 2-2M8 21h8"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 0 7.5H7z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.6 8.6l4.8 6.8"/>',
    cold: '<path d="M12 3v18M5 7l14 10M19 7L5 17M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>',
    warm: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    wind: '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h16a2.5 2.5 0 1 1-2.5 2.5M3 16h9a2.5 2.5 0 1 1-2.5 2.5"/>',
    print: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8h16M9 15.5h6M12 8v4.5"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2.5h6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    window: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>',
    plant: '<path d="M12 21v-9M12 12c0-4 3-7 8-7 0 4.5-3 7-8 7zM12 15c0-3-2.5-5.5-7-5.5 0 3.5 2.5 5.5 7 5.5zM8 21h8"/>',
    air: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    storm: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 0 7.5"/><path d="M12.5 12L10 16.5h4L11.5 21"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    fog: '<path d="M7 9.5a5 5 0 0 1 9.6-1.9A3.5 3.5 0 0 1 17.5 14M3 14h14M5 17.5h14M3 21h12"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
};
const insIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${INS_ICONS[name]}</svg>`;

// "7:21" (sun times are never ambiguous), "1 PM" / "noon", "10:00 AM"
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]\.?M\.?$/i, '');
const hr = d => d.getHours() === 12 ? 'noon' : d.toLocaleTimeString([], { hour: 'numeric' });
const hmFull = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

class Insights {
    constructor(haUrl, token, el) {
        Object.assign(this, { haUrl, token, el });
        this.data = {};
        this.turn = 0;
        const preview = new URLSearchParams(location.search).get('commute_preview');
        this.commutePreview = ['tim', 'emily', 'both', 'emily-work', 'pickup', 'dropoff'].includes(preview) ? preview : null;
    }

    async api(path, body) {
        const r = await fetch(`${this.haUrl}/api/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    // Everything read every minute (sun, meds, printers, warm-ups, hold) in one
    // template call, so the meds line goes soon after the dose is logged
    async refreshStates() {
        const tpl = `{% set ns = namespace(p=[], w=[]) %}
{% for id in ${JSON.stringify(PRINTERS)} %}{% set st = states['sensor.' ~ id ~ '_print_status'] %}{% if st %}
{% set ns.p = ns.p + [{'name': (states('sensor.' ~ id ~ '_printer_name').split(' (')[0]), 'status': st.state,
  'end': states('sensor.' ~ id ~ '_end_time'),
  'left': states('sensor.' ~ id ~ '_remaining_time')}] %}{% endif %}{% endfor %}
{% set ns2 = namespace(pl=[]) %}{% for id in ${JSON.stringify(Object.keys(PLANTS))} %}{% set sm = states['sensor.' ~ id ~ '_soil_moisture'] %}
{% if sm and sm.state | is_number %}{% set ns2.pl = ns2.pl + [{'id': id, 'v': sm.state | float, 'min': states('number.' ~ id ~ '_min_soil_moisture') | float(0),
  'at': sm.last_updated.isoformat()}] %}{% endif %}{% endfor %}
{% for k in ${JSON.stringify(Object.keys(WARMUPS))} %}{% set t = states['timer.climate_boost_' ~ k] %}
{% if t and t.state == 'active' %}{% set ns.w = ns.w + [{'room': k, 'ends': t.attributes.finishes_at}] %}{% endif %}{% endfor %}
{% set nc = namespace(items=[]) %}{% for route in ${JSON.stringify(COMMUTES)} %}
{% set commute = states[route.entity] %}{% set presence = namespace(active=false, work=false) %}
{% for person in route.people %}
{% if route.away | default(false) %}
{% if states(person) not in ['home', 'unknown', 'unavailable'] and state_attr(person, 'latitude') is number and state_attr(person, 'longitude') is number %}{% set presence.active = true %}{% endif %}
{% if route.workZone is defined and is_state(person, state_attr(route.workZone, 'friendly_name')) %}{% set presence.work = true %}{% endif %}
{% elif is_state(person, 'home') %}{% set presence.active = true %}{% endif %}{% endfor %}
{% set nc.items = nc.items + [{'entity': route.entity, 'value': states(route.entity), 'active': presence.active, 'work': presence.work,
  'at': commute.last_reported.isoformat() if commute else none}] %}{% endfor %}
{{ {'rise': state_attr('${SUN}', 'next_rising'), 'set': state_attr('${SUN}', 'next_setting'),
    'commutes': nc.items,
    'viewer_home': is_state('person.tim', 'home') or is_state('person.emily', 'home'),
    'attendance': {'status': states('${PICKUP.attendance}'), 'at': state_attr('${PICKUP.attendance}', 'timestamp'),
        'sync': states('${PICKUP.sync}'), 'syncOk': is_state('${PICKUP.status}', 'ok'),
        'parentAtSchool': is_state('person.tim', state_attr('${PICKUP.zone}', 'friendly_name'))
            or is_state('person.emily', state_attr('${PICKUP.zone}', 'friendly_name'))},
    'meds': states('${MEDS_TAKEN}'), 'hold': states('${HOLD}'), 'printers': ns.p, 'warm': ns.w,
    'aqi': states('${AQI}'), 'dew': state_attr('${WEATHER}', 'dew_point'),
    'humid': state_attr('${WEATHER}', 'humidity'),
    'out': state_attr('${WEATHER}', 'temperature'), 'cond': states('${WEATHER}'), 'windows': states('${OPEN_WINDOWS}'), 'plants': ns2.pl,
    'inside': (${JSON.stringify(ROOMS)} | map('state_attr', 'current_temperature') | select('is_number') | list) } | tojson }}`;
        try {
            const r = await fetch(`${this.haUrl}/api/template`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: tpl })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = JSON.parse(await r.text());
            // "Finished" only for a print this screen watched end: a Home Assistant
            // restart resets last_changed and would make an old print look new
            const was = new Map((this.data.printers || []).map(p => [p.name, p.status]));
            this.finished = this.finished || {};
            for (const p of d.printers) {
                const before = was.get(p.name);
                if ((before === 'running' || before === 'pause') && (p.status === 'finish' || p.status === 'failed')) this.finished[p.name] = Date.now();
            }
            Object.assign(this.data, {
                sun: { next_rising: d.rise, next_setting: d.set },
                commutes: d.commutes,
                viewerHome: d.viewer_home === true,
                attendance: d.attendance,
                statesAt: Date.now(),
                medsTaken: d.meds !== 'off',
                hold: d.hold === 'on',
                printers: d.printers,
                warm: d.warm,
                outside: typeof d.out === 'number' ? d.out : null,
                outsideCond: d.cond,
                inside: d.inside.length ? d.inside.reduce((a, b) => a + b, 0) / d.inside.length : null,
                windowsOpen: parseInt(d.windows, 10) || 0,
                plants: d.plants,
                aqi: parseFloat(d.aqi),
                dew: typeof d.dew === 'number' ? d.dew : null,
                humidOut: typeof d.humid === 'number' ? d.humid : null
            });
        } catch (e) { console.error('Insights:', e); }
        this.render();
    }

    async refreshForecast() {
        try {
            const [h, d] = await Promise.all(['hourly', 'daily'].map(type =>
                this.api('services/weather/get_forecasts?return_response', { entity_id: WEATHER, type })));
            const list = r => (r.service_response?.[WEATHER]?.forecast || []).map(x => ({ ...x, t: new Date(x.datetime) }));
            Object.assign(this.data, { hourly: list(h), daily: list(d) });
        } catch (e) { console.error('Insights forecast:', e); }
        this.render();
    }

    // Tomorrow's first timed event before noon (all-day events don't start "early")
    async refreshCalendar() {
        try {
            const a = new Date(); a.setHours(24, 0, 0, 0);
            const b = new Date(a); b.setHours(12);
            const evs = await familyEvents(this.haUrl, this.token, a, b);
            const starts = evs.filter(e => e.start.dateTime).map(e => new Date(e.start.dateTime))
                .filter(t => t >= a && t < b).sort((x, y) => x - y);
            this.data.earlyTomorrow = starts[0] || null;
        } catch (e) { console.error('Insights calendar:', e); }
        this.render();
    }

    hours(from, until) {
        return (this.data.hourly || []).filter(h => h.t >= from && h.t < until);
    }

    // Wet hours between from and until, grouped into [start, end) spans
    wetSpans(from, until) {
        const spans = [];
        let snow = false;
        for (const h of this.hours(from, until)) {
            if (!WET.has(h.condition)) continue;
            if (SNOW.has(h.condition)) snow = true;
            const last = spans[spans.length - 1], end = new Date(h.t.getTime() + 3600e3);
            if (last && last[1].getTime() === h.t.getTime()) last[1] = end;
            else spans.push([h.t, end]);
        }
        const heavy = this.hours(from, until).some(h => h.condition === 'pouring');
        return { spans, word: snow ? 'Snow' : heavy ? 'Heavy rain' : 'Rain' };
    }

    // Every line that applies right now: [tone, icon, html]. tone 'nudge' stays pinned.
    lines(now = new Date()) {
        const m = now.getHours() * 60 + now.getMinutes();
        const { sun, daily } = this.data;
        const out = [];

        const dropoff = this.dropoffLine(now);
        if (dropoff) out.push(dropoff);
        const pickup = this.pickupLine(now);
        if (pickup) out.push(pickup);

        for (const route of COMMUTES) {
            if (route.entity === PICKUP.route) continue;
            if (!this.commutePreview && this.data.viewerHome !== true) continue;
            const commute = route.away && this.commutePreview
                ? { active: this.commutePreview === 'both' || this.commutePreview === route.label.toLowerCase()
                        || (this.commutePreview === 'emily-work' && !!route.workZone),
                    work: this.commutePreview === 'emily-work' && !!route.workZone,
                    value: this.commutePreview === 'emily-work' ? 15 : route.label === 'Tim' ? 18 : 25, at: now.toISOString() }
                : (this.data.commutes || []).find(c => c.entity === route.entity);
            if (!commute?.active || (!route.away && (m < COMMUTE_WINDOW.from || m >= COMMUTE_WINDOW.until))) continue;
            const minutes = Number(commute.value), age = now - new Date(commute.at);
            if (commute.work) {
                if (m < route.workFrom && !this.commutePreview) continue;
                const workStart = new Date(now); workStart.setHours(Math.floor(route.workFrom / 60), route.workFrom % 60, 0, 0);
                const sampled = Number.isFinite(minutes) && minutes > 0 && commute.at
                    && new Date(commute.at) >= workStart && age >= 0;
                const estimate = sampled ? Math.round(minutes) : route.workNormal;
                out.push([this.commutePreview ? 'homeward featured' : 'homeward', 'clock', `Emily: at work - <b>${plural(estimate, 'minute')}</b> away`]);
                continue;
            }
            const fresh = commute.value !== '' && Number.isFinite(minutes) && minutes > 0
                && commute.at && age >= 0 && age < COMMUTE_WINDOW.stale;
            const heavy = fresh && route.normal > 0 && minutes - route.normal >= 5 && minutes >= route.normal * 1.3;
            out.push([route.away ? this.commutePreview ? 'homeward featured' : 'homeward' : heavy ? 'featured nudge' : 'featured', 'clock', fresh
                ? route.away ? `${esc(route.label)}: <b>${Math.round(minutes)}-minute</b> drive home`
                    : `${esc(route.label)}: <b>${plural(Math.round(minutes), 'minute')}</b>${route.detail ? ' ' + esc(route.detail) : ''}${heavy ? ' - HEAVY TRAFFIC' : ''}`
                : `${esc(route.label)}: ${route.away ? 'drive home' : 'commute'} unavailable`]);
        }

        if (this.data.medsTaken === false && m >= MEDS_FROM)
            out.push(['nudge', 'pill', "Tim hasn't taken his meds yet"]);

        // Pinned: bad air, storms, strong wind
        const aqi = this.data.aqi;
        if (aqi >= AQI_BAD) out.push(['nudge', 'air', `Unhealthy air outside · AQI <b>${Math.round(aqi)}</b>, keep windows shut`]);
        else if (aqi >= AQI_POOR) out.push(['nudge', 'air', `Air quality is poor · AQI <b>${Math.round(aqi)}</b>, keep windows shut`]);
        const next12 = this.hours(new Date(new Date(now).setMinutes(0, 0, 0)), new Date(now.getTime() + 12 * 3600e3));
        const storm = next12.find(h => THUNDER.has(h.condition));
        if (storm && m < NIGHT_STARTS - 60) out.push(['nudge', 'storm', storm.t <= now ? 'Thunderstorms nearby'
            : `Thunderstorms possible around <b>${esc(hr(storm.t))}</b>`]);
        const gale = next12.filter(h => h.t < new Date(now.getTime() + 8 * 3600e3)).find(h => h.wind_speed >= STRONG_WIND);
        if (gale) out.push(['nudge', 'wind', gale.t <= now ? `Strong winds now, up to <b>${Math.round(gale.wind_speed)} mph</b>`
            : `Strong winds around <b>${esc(hr(gale.t))}</b>, up to ${Math.round(gale.wind_speed)} mph`]);

        // House check-ins, any time of day
        for (const w of this.data.warm || []) {
            const ends = new Date(w.ends);
            if (ends > now) out.push(['', 'warm', `Warming up ${esc(WARMUPS[w.room] || w.room)} until <b>${esc(hmFull(ends))}</b>`]);
        }
        if (this.data.hold) out.push(['', 'warm', 'Heat schedule is on hold for now']);
        for (const p of this.data.printers || []) {
            const name = esc(p.name || '3D printer');
            if (p.status === 'running') {
                const end = Date.parse(p.end) || (parseFloat(p.left) > 0 ? now.getTime() + parseFloat(p.left) * 3600e3 : NaN);
                out.push(['', 'print', isNaN(end) ? `${name} is printing` : `${name} is printing · done around <b>${esc(hmFull(new Date(end)))}</b>`]);
            } else if (p.status === 'prepare' || p.status === 'init' || p.status === 'slicing') {
                out.push(['', 'print', `${name} is getting ready to print`]);
            } else if (p.status === 'pause') {
                out.push(['', 'print', `${name}'s print is paused`]);
            } else if ((p.status === 'finish' || p.status === 'failed') && now - (this.finished?.[p.name] || 0) < PRINT_DONE_FOR) {
                out.push(['', 'print', p.status === 'finish' ? `${name} finished its print` : `${name}'s print stopped early`]);
            }
        }

        let rise = null, set = null;
        if (sun?.next_setting && sun?.next_rising) {
            set = new Date(sun.next_setting);
            rise = new Date(sun.next_rising);
            if (dayKey(rise) !== dayKey(now)) rise = new Date(rise.getTime() - 86400e3);   // today's, near enough
            if (dayKey(set) !== dayKey(now)) set = new Date(set.getTime() - 86400e3);
        }

        // Plants: dry ones any time of day; "all happy" now and then by day
        const plants = (this.data.plants || []).filter(p => now - new Date(p.at) < PLANT_STALE && p.min > 0);
        for (const p of plants) {
            if (p.v < p.min) out.push(['', 'plant', `${esc(PLANTS[p.id])} needs water · soil at <b>${Math.round(p.v)}%</b>`]);
            else if (p.v < p.min + PLANT_SOON) out.push(['', 'plant', `${esc(PLANTS[p.id])} will want water soon`]);
        }
        const plantsHappy = plants.length === Object.keys(PLANTS).length && plants.every(p => p.v >= p.min + PLANT_SOON);

        // Clocks: the week before a change, and the morning after
        const cc = clockChange(now);
        if (cc) {
            const eve = new Date(cc.at.getTime() - 12 * 3600e3);      // the evening before the 2 AM change
            const days = Math.round((new Date(eve).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400e3);
            const when = days <= 0 ? 'tonight' : days === 1 ? 'tomorrow night' : eve.toLocaleDateString([], { weekday: 'long' }) + ' night';
            out.push(['', 'clock', cc.back ? `Clocks fall back <b>${when}</b> · an extra hour of sleep`
                : `Clocks spring forward <b>${when}</b> · an hour less sleep`]);
        }
        const cd = clockChanged(now);
        if (cd && m < 12 * 60) out.push(['', 'clock', `Clocks went ${cd.back ? 'back' : 'forward'} an hour last night · check the oven and car`]);

        if (m < EVENING) {
            // Fresh air: nice out, cooler than the house, dry, windows shut
            const { outside: o, inside: i } = this.data;
            if (m >= FRESH_AIR.from && m < FRESH_AIR.until && o !== null && i !== null && !this.data.windowsOpen && !(aqi >= AQI_POOR)
                && !WET.has(this.data.outsideCond) && o >= FRESH_AIR.low && o <= FRESH_AIR.high && i - o >= FRESH_AIR.warmer)
                out.push(['', 'window', `<b>${Math.round(o)}°</b> outside, <b>${Math.round(i)}°</b> in · nice for an open window`]);

            if (plantsHappy) out.push(['', 'plant', `All ${plants.length === 3 ? 'three' : plants.length} plants are happy`]);

            // Rain in the next 12 hours
            const hourStart = new Date(now); hourStart.setMinutes(0, 0, 0);
            const horizon = new Date(now.getTime() + 12 * 3600e3);
            const { spans, word } = this.wetSpans(hourStart, horizon);
            if (spans.length) {
                const [a, b] = spans[0], next = spans[1];
                const end = b >= new Date(horizon.getTime() - 3600e3) ? null : b;
                let t;
                if (a <= now) t = end ? `${word} till about <b>${esc(hr(end))}</b>` : `${word} on and off all day`;
                else t = end ? `${word} later, about <b>${esc(hr(a))} – ${esc(hr(end))}</b>` : `${word} from about <b>${esc(hr(a))}</b>`;
                if (a <= now && end && next) t += `, back around <b>${esc(hr(next[0]))}</b>`;
                out.push(['', 'rain', t]);
            }

            // Fog in the morning
            if (m < 11 * 60 && this.data.outsideCond === 'fog') out.push(['', 'fog', 'Foggy out · take it slow on the roads']);

            // Hot today, sticky out, strong sun
            const rest = this.hours(now, new Date(new Date(now).setHours(21, 0, 0, 0)));
            const peak = rest.reduce((a, h) => (!a || h.temperature > a.temperature ? h : a), null);
            if (peak && peak.temperature >= HOT) out.push(['', 'warm', `Hot one today · up to <b>${Math.round(peak.temperature)}°</b> around ${esc(hr(peak.t))}`]);
            const { dew, humidOut: rh } = this.data;
            if (dew !== null && dew >= MUGGY_DEW) out.push(['', 'drop', rh !== null ? `Muggy out · <b>${Math.round(rh)}%</b> humidity` : 'Muggy out']);
            else if (rh !== null && rh <= DRY_OUT) out.push(['', 'drop', `Very dry out · <b>${Math.round(rh)}%</b> humidity`]);
            const uv = rest.filter(h => h.uv_index >= UV_HIGH);
            if (uv.length) out.push(['', 'warm', `Strong sun · UV <b>${Math.round(Math.max(...uv.map(h => h.uv_index)))}</b> around ${esc(hr(uv[0].t))}, sunscreen weather`]);

            // Windy later today
            const gusty = this.hours(now, new Date(Math.min(horizon, new Date(now).setHours(20, 0, 0, 0))))
                .filter(h => h.wind_speed >= WINDY_AT);
            if (gusty.length && !gale) {
                const top = Math.round(Math.max(...gusty.map(h => h.wind_speed)));
                out.push(['', 'wind', gusty[0].t <= now ? `Windy now, up to <b>${top} mph</b>`
                    : `Windy from about <b>${esc(hr(gusty[0].t))}</b>, up to ${top} mph`]);
            }

            // The sun: both times in the morning; sunset and light left after noon
            if (rise && set) {
                if (m < 12 * 60) out.push(['', 'sunrise', `Sunrise <b>${esc(hm(rise))}</b> · sunset <b>${esc(hm(set))}</b>`]);
                else if (set > now) {
                    const left = (set - now) / 3600e3;
                    const light = left < 1 ? 'under an hour of light left' : `about ${plural(Math.round(left), 'hour')} of light left`;
                    out.push(['', 'sunset', `Sunset at <b>${esc(hm(set))}</b> · ${light}`]);
                }
                // Day length
                const len = (((set - rise) / 60e3) % 1440 + 1440) % 1440;
                out.push(['', 'sunrise', `<b>${Math.floor(len / 60)}h ${Math.round(len % 60)}m</b> of daylight today`]);
            }
        } else {
            // Frost tonight
            const tonight = this.hours(now, new Date(now.getTime() + 12 * 3600e3));
            const low = tonight.length ? Math.round(Math.min(...tonight.map(h => h.temperature))) : null;
            if (low !== null && low <= HARD_FREEZE) out.push(['nudge', 'cold', `Hard freeze tonight · low <b>${low}°</b>, bring in the plants`]);
            else if (low !== null && low <= FROST_AT) out.push(['', 'cold', `Frost likely tonight · low <b>${low}°</b>`]);

            // How tomorrow will feel
            const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
            const today = (daily || []).find(d => dayKey(d.t) === dayKey(now));
            const next = (daily || []).find(d => dayKey(d.t) === dayKey(tmr));
            if (next) {
                const hi = Math.round(next.temperature);
                const diff = today ? hi - Math.round(today.temperature) : 0;
                const at = h => { const t = new Date(tmr); t.setHours(h, 0, 0, 0); return t; };
                const am = this.wetSpans(at(6), at(12)), pm = this.wetSpans(at(12), at(20));
                const wet = am.spans.length > 0 || pm.spans.length > 0;
                const w = (am.spans.length ? am : pm).word.toLowerCase();
                const when = am.spans.length && pm.spans.length ? `${w} on and off`
                    : am.spans.length ? `${w} in the morning` : `${w} in the afternoon`;
                const feel = diff <= -BIG_CHANGE ? 'Cooler tomorrow' : diff >= BIG_CHANGE ? 'Warmer tomorrow' : null;
                if (feel) out.push(['', diff > 0 ? 'warm' : 'cold', `${feel} · ${wet ? `${when}, ` : ''}high <b>${hi}°</b>`]);
                else if (wet) out.push(['', 'rain', `${when.charAt(0).toUpperCase() + when.slice(1)} tomorrow · high <b>${hi}°</b>`]);
            }

            if (this.data.earlyTomorrow)
                out.push(['', 'cal', `First thing tomorrow at <b>${esc(hmFull(this.data.earlyTomorrow))}</b>`]);

            // Full or new moon tonight (noon to noon) or tomorrow night
            const noon = new Date(now); noon.setHours(12, 0, 0, 0);
            const moonTonight = moonBetween(noon.getTime(), noon.getTime() + 86400e3);
            const moonTomorrow = !moonTonight && moonBetween(noon.getTime() + 86400e3, noon.getTime() + 2 * 86400e3);
            const mo = moonTonight || moonTomorrow;
            if (mo) out.push(['', 'moon', mo.full ? `Full moon <b>${moonTonight ? 'tonight' : 'tomorrow night'}</b>`
                : `New moon ${moonTonight ? 'tonight' : 'tomorrow night'} · the darkest skies of the month`]);

            if (sun?.next_rising) out.push(['', 'sunrise', `Sunrise tomorrow at <b>${esc(hm(new Date(sun.next_rising)))}</b>`]);
        }
        return out;
    }

    attendanceForTrip(now) {
        const attendance = this.data.attendance;
        const syncAge = now - new Date(attendance?.sync);
        const snapshotAge = now - this.data.statesAt;
        if (this.data.viewerHome !== true || attendance?.syncOk !== true || attendance.parentAtSchool
            || !Number.isFinite(syncAge) || syncAge < 0 || syncAge >= PICKUP.stale
            || !Number.isFinite(snapshotAge) || snapshotAge < 0 || snapshotAge >= PICKUP.snapshotStale) return null;
        return attendance;
    }

    dropoffLine(now) {
        const preview = this.commutePreview === 'dropoff';
        const m = now.getHours() * 60 + now.getMinutes();
        if (!preview && (now.getDay() === 0 || now.getDay() === 6
            || m < COMMUTE_WINDOW.from || m >= COMMUTE_WINDOW.until)) return null;
        const attendance = preview ? { status: 'checked_out', at: new Date(now - 86400e3).toISOString() }
            : this.attendanceForTrip(now);
        const event = new Date(attendance?.at), age = now - event;
        // A recent prior-day checkout covers weekends, but not missing or old attendance.
        if (attendance?.status !== 'checked_out' || !Number.isFinite(age) || age < 0 || age >= 4 * 86400e3
            || dayKey(event) === dayKey(now)) return null;
        const commute = preview ? { value: 4, at: now.toISOString(), active: true }
            : (this.data.commutes || []).find(c => c.entity === PICKUP.route);
        const minutes = Number(commute?.value), routeAge = now - new Date(commute?.at);
        const fresh = commute?.active && Number.isFinite(minutes) && minutes > 0
            && commute.at && routeAge >= 0 && routeAge < COMMUTE_WINDOW.stale;
        const heavy = fresh && minutes - 4 >= 5 && minutes >= 4 * 1.3;
        return [preview ? 'homeward featured' : heavy ? 'featured nudge' : 'featured', 'clock', `King's: drop-off${fresh
            ? ` - <b>${plural(Math.round(minutes), 'minute')}</b> away${heavy ? ' - HEAVY TRAFFIC' : ''}` : ''}`];
    }

    pickupLine(now) {
        const preview = this.commutePreview === 'pickup';
        const m = now.getHours() * 60 + now.getMinutes();
        if (!preview && (m < PICKUP.from || m >= PICKUP.until)) return null;
        const attendance = preview ? { status: 'checked_in', at: now.toISOString() } : this.attendanceForTrip(now);
        const event = new Date(attendance?.at);
        if (attendance?.status !== 'checked_in' || dayKey(event) !== dayKey(now) || event > now) return null;
        const commute = preview ? { value: 4, at: now.toISOString(), active: true }
            : (this.data.commutes || []).find(c => c.entity === PICKUP.route);
        const minutes = Number(commute?.value), age = now - new Date(commute?.at);
        const fresh = commute?.active && Number.isFinite(minutes) && minutes > 0
            && commute.at && age >= 0 && age < COMMUTE_WINDOW.stale;
        const heavy = fresh && minutes - 4 >= 5 && minutes >= 4 * 1.3;
        return [preview ? 'homeward featured' : '', 'clock', `Liam: at King's${fresh
            ? ` - <b>${plural(Math.round(minutes), 'minute')}</b> away${heavy ? ' - HEAVY TRAFFIC' : ''}` : ''}`];
    }

    // Pinned lines, then the rest taking turns in the space left. Lines that stay
    // on screen keep their element, so only the ones that change fade in.
    render() {
        const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
        const night = m < DAY_STARTS || m >= NIGHT_STARTS;
        const all = this.lines(now).filter(l => !night || l[0].includes('homeward'));
        this.el.classList.toggle('homeward', all.some(l => l[0].includes('homeward')));
        const isPinned = l => l[0] === 'nudge' || l[0].includes('featured');
        let pinned = all.filter(isPinned), rest = all.filter(l => !isPinned(l));
        if (pinned.length > SHOWN) { rest = pinned; pinned = []; }      // several urgent ones take turns
        const room = Math.max(0, SHOWN - pinned.length);
        let shown = rest;
        if (rest.length > room) {
            const start = (this.turn * room) % rest.length;
            shown = Array.from({ length: room }, (_, i) => rest[(start + i) % rest.length]);
        }
        const want = [...pinned, ...shown].map(([tone, ic, text]) => ({ key: `${tone}|${ic}|${text}`, tone, ic, text }));
        const have = new Map([...this.el.children].map(c => [c.dataset.key, c]));
        const els = want.map(w => {
            if (have.has(w.key)) return have.get(w.key);
            const d = document.createElement('div');
            d.className = `ins ${w.tone} fresh`;
            d.dataset.key = w.key;
            d.innerHTML = `${insIcon(w.ic)}<span>${w.text}</span>`;
            return d;
        });
        if (!(els.length === this.el.children.length && els.every((e, i) => e === this.el.children[i])))
            this.el.replaceChildren(...els);
        this.fit();
    }

    // Lines never widen the clock's block (see #insights in index.html), so a long one
    // runs right toward the agenda. Shrink just that line's text until it stops short of
    // the agenda: never cut off, never below 80%. Re-run every render, since the clock's
    // width (and so where the lines start) changes with the time.
    fit() {
        if (document.body.classList.contains('night')) return;
        const side = document.getElementById('side');
        const screen = document.getElementById('screen');
        if (!side || !screen || !this.el.children.length) return;
        const u = screen.getBoundingClientRect().width / 1280;
        const limit = side.getBoundingClientRect().left - 40 * u;
        for (const line of this.el.children) {
            const text = line.querySelector('span');
            if (!text) continue;
            text.style.fontSize = '';
            const over = line.getBoundingClientRect().right - limit;
            if (over <= 0) continue;
            const w = text.getBoundingClientRect().width;
            text.style.fontSize = `calc(var(--u) * ${(29 * Math.max(0.8, (w - over) / w)).toFixed(2)})`;
        }
    }

    start() {
        this.refreshStates(); this.refreshForecast(); this.refreshCalendar();
        setInterval(() => this.refreshStates(), 60000);
        setInterval(() => this.refreshForecast(), 900000);
        setInterval(() => this.refreshCalendar(), 900000);
        setInterval(() => { this.turn++; this.render(); }, ROTATE_MS);
        // Where the agenda and clock end depends on the calendar and the time, both of
        // which change between renders: re-fit whenever either resizes, and once fonts load.
        const ro = new ResizeObserver(() => this.fit());
        for (const id of ['side', 'clock']) { const el = document.getElementById(id); if (el) ro.observe(el); }
        document.fonts?.ready.then(() => this.fit());
    }
}

// ===== Status tags: the ticker's sensors, rendered as static tags =====
// tone: calm (teal), warn (amber), alert (red). Shown on the same
// conditions and in the same words as the old ticker, day and night.
// "Zoey's been fed" stays up for the rest of the feeding window, so whoever
// walks by knows not to feed her again.

class StatusTags extends Ticker {
    constructor(haUrl, token, el) {
        super(haUrl, token, el);
        this.el = el;
    }

    tags() {
        const s = this.states, out = [];
        const feed = {
            'fed': ['calm', "Zoey's been fed"],
            'not-fed': ['alert', 'Zoey has NOT been fed'],
            'overdue': ['warn', "Zoey's probably hungry!"]
        }[s.feedingState];
        if (feed) out.push(feed);

        // Same schedule as the old ticker: only while the waste reminder is
        // on and the trash hasn't been marked as out
        const g = s.garbageCollection, r = s.recyclingCollection;
        if (s.wasteReminder && !s.trashOut) {
            // Only what's due (today or tomorrow, as the reminder sensor
            // counts it): "Trash & recycling tomorrow", "Trash tomorrow"
            const due = v => ['today', 'tomorrow'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null;
            const gd = due(g), rd = due(r);
            const text = gd && rd && gd === rd ? `Trash & recycling ${gd}`
                : [gd && `Trash ${gd}`, rd && `Recycling ${rd}`].filter(Boolean).join(' · ') || 'Trash';
            out.push(['warn', text]);
        }

        const n = s.openWindowsCount, d = s.exteriorDoorCount;
        if (n > 0) out.push(['warn', `${n} window${n === 1 ? '' : 's'} open`]);
        if (d > 0) out.push(['warn', `${d} exterior door${d === 1 ? '' : 's'} open`]);
        return out;
    }

    updateTicker() {
        if (!this.el) return;    // called once from the Ticker constructor, before el is set
        this.el.innerHTML = this.tags()
            .map(([tone, text]) => `<div class="tag ${tone}"><span class="dot"></span>${esc(text)}</div>`)
            .join('');
    }
}

// ===== Timers: same sensors as the old corner box, drawn as a bottom-right tag =====
class TimerTag extends Timers {
    render() {
        const now = Date.now();
        const visible = this.timers().filter(t => now < t.ends + 15000);
        if (!visible.length) { this.container.innerHTML = ''; return; }
        this.container.innerHTML = visible.slice(0, 2).map(t => {
            const rem = Math.ceil((t.ends - now) / 1000);
            const done = rem <= 0;
            const total = Math.max(t.total, rem, 1);
            const pct = done ? 0 : Math.min(100, (rem / total) * 100);
            const name = t.label ? `${Timers.esc(t.label)} · ${Timers.esc(t.device)}` : `Timer · ${Timers.esc(t.device)}`;
            const cls = done ? 'done' : rem <= 10 ? 'ending' : '';
            return `<div class="timer ${cls}">
                <div class="timer-meta"><div class="timer-name">${name}</div>
                <div class="timer-bar"><div style="width:${pct.toFixed(1)}%"></div></div></div>
                <div class="timer-time">${done ? 'Done' : Timers.fmt(rem)}</div>
            </div>`;
        }).join('') + (visible.length > 2 ? `<div class="timer-more">+${visible.length - 2}</div>` : '');
    }
}

// ===== Night mode: a fixed window, not the sun =====
// Day (date, weather, calendar) from 6:30 AM to 10 PM; the dim clock outside it.
// Chosen 2026-10-08 so it no longer drifts with sunrise/sunset through the year.
const DAY_STARTS = 6 * 60 + 15, NIGHT_STARTS = 22 * 60;
function nightWatch(onNight) {
    const check = () => {
        const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
        onNight(m < DAY_STARTS || m >= NIGHT_STARTS);
    };
    check();
    setInterval(check, 30000);
}

// ===== Burn-in guard =====
function drift(el) {
    const nudge = () => {
        const x = Math.round((Math.random() * 2 - 1) * 12);
        const y = Math.round((Math.random() * 2 - 1) * 8);
        el.style.transform = `translate(${x}px, ${y}px)`;
    };
    setInterval(nudge, DRIFT_MS);
}

export function startScreensaver(config) {
    const { haUrl, longLivedAccessToken: token } = config;
    const $ = id => document.getElementById(id);
    new Clock($('clock')).start();
    new Weather(haUrl, token, $('weather'), $('night-weather')).start();
    nightWatch(night => document.body.classList.toggle('night', night));
    new Agenda(haUrl, token, $('agenda')).start();
    new Insights(haUrl, token, $('insights')).start();
    new StatusTags(haUrl, token, $('tags'));
    new TimerTag(haUrl, token, $('timers')).start();
    drift($('screen'));
}
