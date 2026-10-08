// screensaver.js — the "Quiet Hours" screensaver (preview.html).
// Black OLED-friendly layout: thin clock, met.no weather, the next three
// family-calendar events and static status tags instead of a scrolling ticker.
// After sunset the clock dims and the weather/agenda column goes; tags stay.
// The ticker's and timers' HA logic is reused by subclassing them; only their
// rendering changes.

import { Ticker } from './ticker.js?v=4';
import { Timers } from './timers.js?v=2';

const WEATHER = 'weather.forecast_home';
const CALENDAR = 'calendar.family';
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

// ===== Weather (and the sun, which switches night mode) =====
class Weather {
    constructor(haUrl, token, el, nightEl, onNight) {
        Object.assign(this, { haUrl, token, el, nightEl, onNight });
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
            const [cur, sun, fc] = await Promise.all([
                this.api(`states/${WEATHER}`),
                this.api('states/sun.sun').catch(() => null),
                this.api('services/weather/get_forecasts?return_response', { entity_id: WEATHER, type: 'daily' })
            ]);
            this.onNight(sun?.state === 'below_horizon');

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
            const r = await fetch(`${this.haUrl}/api/calendars/${CALENDAR}?start=${start.toISOString()}&end=${end.toISOString()}`,
                { headers: { Authorization: `Bearer ${this.token}` } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const events = (await r.json())
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

// ===== Status tags: the ticker's sensors, rendered as static tags =====
// tone: calm (teal), warn (amber), alert (red). Shown on the same
// conditions as the old ticker, day and night, except that "Zoey's been
// fed" is only a confirmation: it shows for FED_SHOW_MS after she's marked
// fed, not for the rest of the feeding window. "Not fed" and "probably
// hungry" stay up until handled.
const FED_SHOW_MS = 30 * 60 * 1000;

class StatusTags extends Ticker {
    constructor(haUrl, token, el) {
        super(haUrl, token, el);
        this.el = el;
        this.fedAt = null;            // when the feeding status turned "fed"
        setInterval(() => this.updateTicker(), 60000);   // lets the fed tag expire
    }

    processEntityState(entityId, state, stateObj) {
        if (entityId === 'sensor.zoey_feeding_status') {
            this.fedAt = state === 'fed' ? (Date.parse(stateObj?.last_changed) || Date.now()) : null;
        }
        return super.processEntityState(entityId, state, stateObj);
    }

    static pickup(v) {
        return /^\d+\s+days?$/i.test(v) ? `in ${v}` : String(v).toLowerCase();
    }

    tags() {
        const s = this.states, out = [];
        const feed = {
            'fed': ['calm', "Zoey's been fed"],
            'not-fed': ['alert', 'Zoey has NOT been fed'],
            'overdue': ['warn', "Zoey's probably hungry!"]
        }[s.feedingState];
        const fedTooLongAgo = s.feedingState === 'fed' && !(this.fedAt && Date.now() - this.fedAt < FED_SHOW_MS);
        if (feed && !fedTooLongAgo) out.push(feed);

        // Same schedule as the old ticker: only while the waste reminder is on
        // and the trash hasn't been marked as out
        const g = s.garbageCollection, r = s.recyclingCollection;
        if (s.wasteReminder && !s.trashOut) {
            const what = g && r && g === r ? `trash & recycling ${StatusTags.pickup(g)}`
                : [g && `trash ${StatusTags.pickup(g)}`, r && `recycling ${StatusTags.pickup(r)}`].filter(Boolean).join(' · ');
            out.push(['warn', what ? `Trash night — ${what}` : 'Trash night']);
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
    new Weather(haUrl, token, $('weather'), $('night-weather'),
        night => document.body.classList.toggle('night', night)).start();
    new Agenda(haUrl, token, $('agenda')).start();
    new StatusTags(haUrl, token, $('tags'));
    new TimerTag(haUrl, token, $('timers')).start();
    drift($('screen'));
}
