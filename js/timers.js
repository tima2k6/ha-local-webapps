// Alexa timers from every Echo in the house, in a corner of the screensaver.
// Only visible while a timer runs. Each Echo has a sensor.<device>_next_timer:
// its state is the soonest finish time, and sorted_active lists every running
// timer on that device (triggerTime = finish, ms epoch; remainingTime goes
// stale, so it isn't used). Same WebSocket pattern as the ticker: get_states
// once, then follow state_changed. Counts down locally every second.
const TIMER_SENSOR = /^sensor\..+_next_timer(_\d+)?$/;
const DONE_SHOW_MS = 15000;   // a finished timer says "Done" this long, then goes
const MAX_SHOWN = 3;

export class Timers {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.sensors = new Map();      // entity_id -> HA state object
        this.ws = null;
        this.reconnectDelay = 5000;
        this.reconnectTimer = null;
        this.authFailed = false;
    }

    start() {
        this.setupWebSocket();
        this.render();
        setInterval(() => this.render(), 1000);
    }

    setupWebSocket() {
        if (this.authFailed) return;
        if (this.ws) {
            this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
            try { this.ws.close(); } catch (e) { /* already closed */ }
        }
        this.ws = new WebSocket(`${this.haUrl.replace(/^http/, 'ws')}/api/websocket`);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'auth_required') {
                this.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
            } else if (data.type === 'auth_ok') {
                this.reconnectDelay = 5000;
                this.ws.send(JSON.stringify({ id: 1, type: 'get_states' }));
            } else if (data.type === 'auth_invalid') {
                console.error('Timers: auth rejected -', data.message);
                this.authFailed = true;
                this.ws.close();
            } else if (data.type === 'result' && data.id === 1) {
                this.sensors.clear();
                data.result.forEach(s => this.ingest(s.entity_id, s));
                this.ws.send(JSON.stringify({ id: 2, type: 'subscribe_events', event_type: 'state_changed' }));
                this.render();
            } else if (data.type === 'event' && data.event?.event_type === 'state_changed') {
                const id = data.event.data.entity_id;
                if (TIMER_SENSOR.test(id)) {
                    this.ingest(id, data.event.data.new_state);
                    this.render();
                }
            }
        };

        this.ws.onclose = () => {
            if (this.authFailed) return;
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.setupWebSocket(), this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        };
    }

    // Keep only Echo timer sensors; new_state is null when an entity is removed
    ingest(entityId, state) {
        if (!TIMER_SENSOR.test(entityId)) return;
        if (state) this.sensors.set(entityId, state);
        else this.sensors.delete(entityId);
    }

    // "Alexa Pup Next timer" -> "Pup", "Bedroom Dot Next timer" -> "Bedroom Dot"
    static deviceName(state) {
        const name = state.attributes?.friendly_name || state.entity_id;
        return name.replace(/^Alexa\s+/i, '').replace(/\s+Next timer$/i, '').trim();
    }

    // Every running timer across the house, soonest first
    timers() {
        const out = [], seen = new Set();
        for (const s of this.sensors.values()) {
            const first = Date.parse(s.state);
            if (isNaN(first)) continue;                   // unknown / unavailable: none running
            const device = Timers.deviceName(s);
            let list = s.attributes?.sorted_active;
            if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
            list = (list || []).map(t => Array.isArray(t) ? (t[1] || {}) : t)
                               .filter(t => (t.status || 'ON') === 'ON');
            if (!list.length) list = [{}];
            list.forEach((t, i) => {
                // The state is the integration's own finish time for the first one
                const ends = i === 0 ? first : t.triggerTime;
                if (!ends) return;
                const key = t.id || `${device}@${Math.round(ends / 1000)}`;
                if (seen.has(key)) return;                // a duplicate sensor for the same Echo
                seen.add(key);
                out.push({
                    ends,
                    total: Math.round((t.originalDurationInMillis || 0) / 1000),
                    label: t.timerLabel || '',
                    device
                });
            });
        }
        return out.sort((a, b) => a.ends - b.ends);
    }

    static fmt(secs) {
        secs = Math.max(0, secs);
        const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
        const two = n => String(n).padStart(2, '0');
        return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
    }

    static esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    render() {
        const now = Date.now();
        const visible = this.timers().filter(t => now < t.ends + DONE_SHOW_MS);
        this.container.classList.toggle('active', visible.length > 0);
        if (!visible.length) { this.container.innerHTML = ''; return; }

        const rows = visible.slice(0, MAX_SHOWN).map(t => {
            const rem = Math.ceil((t.ends - now) / 1000);
            const done = rem <= 0;
            // An extended timer outgrows its original length; the bar starts full then
            const total = Math.max(t.total, rem, 1);
            const pct = done ? 0 : Math.min(100, (rem / total) * 100);
            const name = t.label
                ? `${Timers.esc(t.label)} <span class="timer-device">· ${Timers.esc(t.device)}</span>`
                : Timers.esc(t.device);
            const cls = done ? 'done' : rem <= 10 ? 'ending' : '';
            return `<div class="timer-row ${cls}">
                <div class="timer-name">${name}</div>
                <div class="timer-time">${done ? 'Done' : Timers.fmt(rem)}</div>
                <div class="timer-bar"><div style="width:${pct.toFixed(1)}%"></div></div>
            </div>`;
        }).join('');
        const more = visible.length > MAX_SHOWN ? `<div class="timer-more">+${visible.length - MAX_SHOWN} more</div>` : '';
        this.container.innerHTML = `<div class="timer-header">${visible.length > 1 ? 'Timers' : 'Timer'}</div>${rows}${more}`;
    }
}
