// month-calendar.js — touch mode only (index.html?touch=1): tapping the agenda turns the
// clock/weather/insights/agenda into a full month calendar over the same map; tapping
// anywhere else opens the HA dashboard. Without ?touch=1 the page stays touchless (the
// Fully screensaver overlay, which eats every touch anyway).
// Same calendars as the agenda (familyEvents: Family + Liam's D105 / All Rooms school events).
// Static on purpose: nothing animates while it is open (screensaver power budget).

import { familyEvents } from './screensaver.js?v=52';

const IDLE_MS = 60000;        // back to the screensaver after a minute without a touch
const CELL_EVENTS = 2;        // event names per day cell; the rest become "+N more"
const SWIPE_PX = 60;

const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const isLiam = ev => String(ev.summary || '').startsWith('Liam · ');

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

    async load() {
        const month = this.month, start = this.gridStart(), end = addDays(start, 42);
        try {
            const events = await familyEvents(this.haUrl, this.token, start, end);
            if (month !== this.month || !this.isOpen) return;      // moved on while loading
            this.byDay = new Map();
            for (const ev of events.sort((a, b) => sortKey(a) - sortKey(b)))
                for (const d of eventDays(ev)) {
                    const k = key(d);
                    if (!this.byDay.has(k)) this.byDay.set(k, []);
                    this.byDay.get(k).push(ev);
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
        const today = midnight(new Date()), start = this.gridStart();
        const thisMonth = today.getMonth() === this.month.getMonth() && today.getFullYear() === this.month.getFullYear();
        const title = this.month.toLocaleDateString([], { month: 'long', year: 'numeric' });
        const heads = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="mc-dow">${d}</div>`).join('');
        let cells = '';
        for (let i = 0; i < 42; i++) {
            const d = addDays(start, i), evs = this.byDay.get(key(d)) || [];
            const cls = ['mc-day',
                d.getMonth() !== this.month.getMonth() && 'other',
                key(d) === key(today) && 'today',
                key(d) === key(this.selected) && 'sel',
                d < today && 'past'].filter(Boolean).join(' ');
            const shown = evs.slice(0, CELL_EVENTS).map(ev =>
                `<div class="mc-ev${isLiam(ev) ? ' liam' : ''}">${nameOf(ev)}</div>`).join('');
            const more = evs.length > CELL_EVENTS ? `<div class="mc-more">+${evs.length - CELL_EVENTS} more</div>` : '';
            cells += `<div class="${cls}" data-day="${d.getTime()}"><div class="mc-num">${d.getDate()}</div>${shown}${more}</div>`;
        }
        const sel = this.byDay.get(key(this.selected)) || [];
        const selTitle = key(this.selected) === key(today) ? 'Today'
            : key(this.selected) === key(addDays(today, 1)) ? 'Tomorrow'
            : this.selected.toLocaleDateString([], { weekday: 'long' });
        const selDate = this.selected.toLocaleDateString([], { month: 'long', day: 'numeric' });
        const list = !this.loaded && !this.failed ? '<div class="mc-none">Loading…</div>'
            : this.failed && !sel.length ? '<div class="mc-none">Couldn’t load the calendar</div>'
            : sel.length ? sel.map(ev => `<div class="mc-item${isLiam(ev) ? ' liam' : ''}">
                    <div class="mc-when">${esc(timeOf(ev))}${isLiam(ev) ? ' · Liam' : ''}</div>
                    <div class="mc-what">${nameOf(ev)}</div></div>`).join('')
            : '<div class="mc-none">Nothing planned</div>';
        this.el.innerHTML = `
            <div class="mc-main">
                <div class="mc-head">
                    <button class="mc-btn" data-act="prev" aria-label="Previous month">‹</button>
                    <div class="mc-title">${esc(title)}</div>
                    <button class="mc-btn" data-act="next" aria-label="Next month">›</button>
                    ${thisMonth ? '' : '<button class="mc-pill" data-act="today">This month</button>'}
                </div>
                <div class="mc-grid">${heads}${cells}</div>
            </div>
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
