// month-calendar.js — touch mode only (index.html?touch=1): tapping the agenda turns the
// clock/weather/insights/agenda into a full month calendar over the same map; tapping
// anywhere else opens the HA dashboard. Without ?touch=1 the page stays touchless (the
// Fully screensaver overlay, which eats every touch anyway).
// Same calendars as the agenda (familyEvents: Family + Liam's D105 / All Rooms school events),
// plus US holidays (fixed table below) and trash / recycling pickup icons (ReCollect calendar).
// Static on purpose: nothing animates while it is open (screensaver power budget).

import { familyEvents } from './screensaver.js?v=53';

const IDLE_MS = 60000;        // back to the screensaver after a minute without a touch
const CELL_ROWS = 2;          // holiday + event names per day cell; the rest become "+N more"
const SWIPE_PX = 60;
const WASTE = 'calendar.recollect_waste';   // events "ReCollect Waste Pickup", description "Pickup types: garbage, recycling"

const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const isLiam = ev => String(ev.summary || '').startsWith('Liam · ');

// ===== US holidays: a fixed list, worked out per year =====
const nth = (y, m, weekday, n) => {            // n-th weekday of month m (0-based); n = -1: the last one
    if (n > 0) { const d = new Date(y, m, 1); d.setDate(1 + (weekday - d.getDay() + 7) % 7 + 7 * (n - 1)); return d; }
    const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - (d.getDay() - weekday + 7) % 7); return d;
};
function easter(y) {                            // Meeus/Jones/Butcher (Gregorian)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}
function holidays(y) {
    return [
        [new Date(y, 0, 1), "New Year's Day"], [nth(y, 0, 1, 3), 'Martin Luther King Jr. Day'],
        [new Date(y, 1, 14), "Valentine's Day"], [nth(y, 1, 1, 3), "Presidents' Day"],
        [new Date(y, 2, 17), "St. Patrick's Day"], [easter(y), 'Easter'],
        [nth(y, 4, 0, 2), "Mother's Day"], [nth(y, 4, 1, -1), 'Memorial Day'],
        [nth(y, 5, 0, 3), "Father's Day"], [new Date(y, 5, 19), 'Juneteenth'],
        [new Date(y, 6, 4), 'Independence Day'], [nth(y, 8, 1, 1), 'Labor Day'],
        [new Date(y, 9, 31), 'Halloween'], [new Date(y, 10, 11), 'Veterans Day'],
        [nth(y, 10, 4, 4), 'Thanksgiving'], [new Date(y, 11, 24), 'Christmas Eve'],
        [new Date(y, 11, 25), 'Christmas Day'], [new Date(y, 11, 31), "New Year's Eve"]
    ];
}

// ===== Pickup icons (stroke SVG, coloured by CSS) =====
const ICON = {
    garbage: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    recycling: '<path d="M7.5 9.5 10 5.2a2.3 2.3 0 0 1 4 0l1.3 2.3M17.6 11.3l2.1 3.6a2.3 2.3 0 0 1-2 3.5h-3M10.5 18.4H6.3a2.3 2.3 0 0 1-2-3.5l1.2-2.1"/><path d="m13.5 7.4 1.8.1.9-1.6M14.9 16.4l-1.2 2 1.2 1.8M5.5 10.8l2 -1.3 1.9.9"/>'
};
const icon = (name, cls = 'mc-icon') =>
    `<svg class="${cls} ${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const pickupTypes = ev => {
    const m = /pickup types:\s*(.*)/i.exec(ev.description || '');
    return (m ? m[1] : 'garbage').toLowerCase().split(/\s*,\s*/).filter(t => ICON[t]);
};
const PICKUP_WORDS = { garbage: 'Trash', recycling: 'Recycling' };

// The local days an event covers. All-day ends are exclusive dates; a timed event ending
// exactly at midnight doesn't spill into the next day.
function eventDays(ev) {
    const allDay = !ev.start.dateTime;
    const start = allDay ? new Date(`${ev.start.date}T00:00:00`) : new Date(ev.start.dateTime);
    let end = allDay ? new Date(`${(ev.end && ev.end.date) || ev.start.date}T00:00:00`)
        : new Date((ev.end && ev.end.dateTime) || ev.start.dateTime);
    if (allDay || end > start) end = new Date(end - 1);
    const days = [];
    for (let d = midnight(start); d <= end && days.length < 62; d = addDays(d, 1)) days.push(d);
    return days.length ? days : [midnight(start)];
}

const sortKey = ev => (ev.start.dateTime ? 1 : 0) * 1e13 + new Date(ev.start.dateTime || `${ev.start.date}T00:00:00`).getTime();
const timeOf = ev => ev.start.dateTime
    ? new Date(ev.start.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'All day';
const nameOf = ev => esc(String(ev.summary || 'Untitled').replace(/^Liam · /, ''));

export class MonthCalendar {
    constructor(config, el, { onOpen, onClose } = {}) {
        Object.assign(this, { haUrl: config.haUrl, token: config.longLivedAccessToken, el, onOpen, onClose });
        this.byDay = new Map();
        this.pickups = new Map();
        this.isOpen = false;
        // Taps in here never reach the page's "anywhere else = dashboard" handler (Done used to
        // close the calendar and then open the dashboard with the same tap).
        el.addEventListener('click', e => { e.stopPropagation(); this.click(e); });
        el.addEventListener('pointerdown', e => { this.downX = e.clientX; this.downY = e.clientY; });
        el.addEventListener('pointerup', e => this.swipe(e));
        // Any touch inside keeps it open a while longer
        el.addEventListener('pointerdown', () => this.poke(), true);
    }

    open(day = new Date()) {
        this.isOpen = true;
        this.selected = midnight(day);
        this.month = new Date(day.getFullYear(), day.getMonth(), 1);
        document.body.classList.add('month-open');
        this.render();
        this.load();
        this.poke();
        this.onOpen && this.onOpen();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        clearTimeout(this.idle);
        document.body.classList.remove('month-open');
        this.el.innerHTML = '';
        this.onClose && this.onClose();
    }

    poke() {
        clearTimeout(this.idle);
        if (this.isOpen) this.idle = setTimeout(() => this.close(), IDLE_MS);
    }

    // The six weeks on screen, Sunday first
    gridStart() { return addDays(this.month, -this.month.getDay()); }

    // Holidays of the years on screen, by day
    holidaysByDay() {
        const start = this.gridStart(), end = addDays(start, 41), map = new Map();
        for (const y of new Set([start.getFullYear(), end.getFullYear()]))
            for (const [d, name] of holidays(y)) map.set(key(d), name);
        return map;
    }

    async wasteEvents(start, end) {
        const r = await fetch(`${this.haUrl}/api/calendars/${WASTE}?start=${start.toISOString()}&end=${end.toISOString()}`,
            { headers: { Authorization: `Bearer ${this.token}` } });
        if (!r.ok) throw new Error(`${WASTE}: HTTP ${r.status}`);
        return r.json();
    }

    async load() {
        const month = this.month, start = this.gridStart(), end = addDays(start, 42);
        const waste = this.wasteEvents(start, end).catch(e => { console.error('Waste calendar:', e); return []; });
        try {
            const [events, pickups] = await Promise.all([familyEvents(this.haUrl, this.token, start, end), waste]);
            if (month !== this.month || !this.isOpen) return;      // moved on while loading
            this.byDay = new Map();
            for (const ev of events.sort((a, b) => sortKey(a) - sortKey(b)))
                for (const d of eventDays(ev)) {
                    const k = key(d);
                    if (!this.byDay.has(k)) this.byDay.set(k, []);
                    this.byDay.get(k).push(ev);
                }
            this.pickups = new Map();
            for (const ev of pickups) {
                const k = key(eventDays(ev)[0]);
                this.pickups.set(k, [...new Set([...(this.pickups.get(k) || []), ...pickupTypes(ev)])]);
            }
            this.loaded = true;
            this.render();
        } catch (e) {
            console.error('Month calendar:', e);
            this.failed = true;
            this.render();
        }
    }

    go(months) {
        this.month = new Date(this.month.getFullYear(), this.month.getMonth() + months, 1);
        const today = midnight(new Date());
        this.selected = this.month.getMonth() === today.getMonth() && this.month.getFullYear() === today.getFullYear()
            ? today : new Date(this.month);
        this.loaded = this.failed = false;
        this.byDay = new Map();
        this.pickups = new Map();
        this.render();
        this.load();
    }

    click(e) {
        const t = e.target.closest('[data-act], [data-day]');
        if (!t) return;
        if (t.dataset.day) {
            const d = new Date(Number(t.dataset.day));
            if (d.getMonth() !== this.month.getMonth()) { this.go(d < this.month ? -1 : 1); this.selected = d; this.render(); return; }
            this.selected = d;
            this.render();
        } else if (t.dataset.act === 'prev') this.go(-1);
        else if (t.dataset.act === 'next') this.go(1);
        else if (t.dataset.act === 'today') { this.close(); this.open(); }
        else if (t.dataset.act === 'done') this.close();
    }

    swipe(e) {
        const dx = e.clientX - this.downX, dy = e.clientY - this.downY;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) this.go(dx < 0 ? 1 : -1);
    }

    render() {
        const today = midnight(new Date()), start = this.gridStart(), hols = this.holidaysByDay();
        const thisMonth = today.getMonth() === this.month.getMonth() && today.getFullYear() === this.month.getFullYear();
        const title = this.month.toLocaleDateString([], { month: 'long', year: 'numeric' });
        const heads = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="mc-dow">${d}</div>`).join('');
        let cells = '';
        for (let i = 0; i < 42; i++) {
            const d = addDays(start, i), k = key(d), evs = this.byDay.get(k) || [], hol = hols.get(k);
            const cls = ['mc-day',
                d.getMonth() !== this.month.getMonth() && 'other',
                k === key(today) && 'today',
                k === key(this.selected) && 'sel',
                d < today && 'past'].filter(Boolean).join(' ');
            const rows = [...(hol ? [`<div class="mc-hol">${esc(hol)}</div>`] : []),
                ...evs.map(ev => `<div class="mc-ev${isLiam(ev) ? ' liam' : ''}">${nameOf(ev)}</div>`)];
            const shown = rows.slice(0, CELL_ROWS).join('');
            const more = rows.length > CELL_ROWS ? `<div class="mc-more">+${rows.length - CELL_ROWS} more</div>` : '';
            const bins = (this.pickups.get(k) || []).map(t => icon(t)).join('');
            cells += `<div class="${cls}" data-day="${d.getTime()}"><div class="mc-top"><div class="mc-num">${d.getDate()}</div>${bins ? `<div class="mc-bins">${bins}</div>` : ''}</div>${shown}${more}</div>`;
        }
        const sk = key(this.selected), sel = this.byDay.get(sk) || [], selHol = hols.get(sk), selBins = this.pickups.get(sk) || [];
        const selTitle = sk === key(today) ? 'Today'
            : sk === key(addDays(today, 1)) ? 'Tomorrow'
            : this.selected.toLocaleDateString([], { weekday: 'long' });
        const selDate = this.selected.toLocaleDateString([], { month: 'long', day: 'numeric' });
        const extras = (selHol ? `<div class="mc-item hol"><div class="mc-when">Holiday</div><div class="mc-what">${esc(selHol)}</div></div>` : '')
            + (selBins.length ? `<div class="mc-item bins"><div class="mc-when">Pickup day</div><div class="mc-what">${selBins.map(t => `<span class="mc-pick">${icon(t, 'mc-icon big')}${PICKUP_WORDS[t]}</span>`).join('')}</div></div>` : '');
        const list = !this.loaded && !this.failed ? extras + '<div class="mc-none">Loading…</div>'
            : this.failed && !sel.length ? extras + '<div class="mc-none">Couldn’t load the calendar</div>'
            : sel.length ? extras + sel.map(ev => `<div class="mc-item${isLiam(ev) ? ' liam' : ''}">
                    <div class="mc-when">${esc(timeOf(ev))}${isLiam(ev) ? ' · Liam' : ''}</div>
                    <div class="mc-what">${nameOf(ev)}</div></div>`).join('')
            : extras || '<div class="mc-none">Nothing planned</div>';
        this.el.innerHTML = `
            <div class="mc-head">
                <div class="mc-title">${esc(title)}</div>
                <button class="mc-btn" data-act="prev" aria-label="Previous month">‹</button>
                <button class="mc-btn" data-act="next" aria-label="Next month">›</button>
                ${thisMonth ? '' : '<button class="mc-pill" data-act="today">This month</button>'}
            </div>
            <div class="mc-dows">${heads}</div>
            <div class="mc-grid">${cells}</div>
            <div class="mc-side">
                <div class="mc-side-head"><div class="mc-side-title">${esc(selTitle)}</div><div class="mc-side-date">${esc(selDate)}</div></div>
                <div class="mc-list">${list}</div>
                <button class="mc-done" data-act="done">Done</button>
            </div>`;
    }
}

// Touch mode: agenda → month calendar; any other tap → the HA dashboard (homeUrl).
export function startTouchMode(config, homeUrl) {
    const screen = document.getElementById('screen');
    const cal = new MonthCalendar(config, document.getElementById('month'));
    document.body.classList.add('touch');
    screen.addEventListener('click', e => {
        if (cal.isOpen) return;                              // the calendar handles its own taps
        const onAgenda = e.target.closest('#side') && !document.body.classList.contains('night');
        if (onAgenda) cal.open();
        else location.href = homeUrl;
    });
    return cal;
}
