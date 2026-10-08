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

// ===== Insights: a few quiet, rotating lines under the weather =====
// Whatever is worth saying at this time of day; two lines show at once and the
// rest take turns. Something that needs someone (meds) stays pinned on top.
// Never the same things as the tags along the bottom; hidden at night with the
// rest of the day layout. Mail was left out on purpose: its sensors aren't
// accurate enough (2026-10-08).
const SUN = 'sun.sun';
const MEDS_TAKEN = 'binary_sensor.prozac_taken_today';   // same sensor as the 6 PM reminder
const MEDS_FROM = 14 * 60;                                // meds line from 2 PM until night
const EVENING = 18 * 60;
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

    // Sun and meds: every minute, so the meds line goes soon after the dose is logged
    async refreshStates() {
        try {
            const [sun, meds] = await Promise.all([this.api(`states/${SUN}`), this.api(`states/${MEDS_TAKEN}`)]);
            Object.assign(this.data, { sun: sun.attributes, medsTaken: meds.state !== 'off' });
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
            const evs = await this.api(`calendars/${CALENDAR}?start=${a.toISOString()}&end=${b.toISOString()}`);
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
        return { spans, word: snow ? 'Snow' : 'Rain' };
    }

    // Every line that applies right now: [tone, icon, html]. tone 'nudge' stays pinned.
    lines(now = new Date()) {
        const m = now.getHours() * 60 + now.getMinutes();
        const { sun, daily } = this.data;
        const out = [];

        if (this.data.medsTaken === false && m >= MEDS_FROM)
            out.push(['nudge', 'pill', "Tim hasn't taken his meds yet"]);

        let rise = null, set = null;
        if (sun?.next_setting && sun?.next_rising) {
            set = new Date(sun.next_setting);
            rise = new Date(sun.next_rising);
            if (dayKey(rise) !== dayKey(now)) rise = new Date(rise.getTime() - 86400e3);   // today's, near enough
            if (dayKey(set) !== dayKey(now)) set = new Date(set.getTime() - 86400e3);
        }

        if (m < EVENING) {
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

            // Windy later today
            const gusty = this.hours(now, new Date(Math.min(horizon, new Date(now).setHours(20, 0, 0, 0))))
                .filter(h => h.wind_speed >= WINDY_AT);
            if (gusty.length) {
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
            if (low !== null && low <= FROST_AT) out.push(['', 'cold', `Frost likely tonight · low <b>${low}°</b>`]);

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

            if (sun?.next_rising) out.push(['', 'sunrise', `Sunrise tomorrow at <b>${esc(hm(new Date(sun.next_rising)))}</b>`]);
        }
        return out;
    }

    // Pinned lines, then the rest taking turns in the space left. Lines that stay
    // on screen keep their element, so only the ones that change fade in.
    render() {
        const all = this.lines();
        const pinned = all.filter(l => l[0] === 'nudge'), rest = all.filter(l => l[0] !== 'nudge');
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
        if (els.length === this.el.children.length && els.every((e, i) => e === this.el.children[i])) return;
        this.el.replaceChildren(...els);
    }

    start() {
        this.refreshStates(); this.refreshForecast(); this.refreshCalendar();
        setInterval(() => this.refreshStates(), 60000);
        setInterval(() => this.refreshForecast(), 900000);
        setInterval(() => this.refreshCalendar(), 900000);
        setInterval(() => { this.turn++; this.render(); }, ROTATE_MS);
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
const DAY_STARTS = 6 * 60 + 30, NIGHT_STARTS = 22 * 60;
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
