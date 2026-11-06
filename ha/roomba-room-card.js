// Roomba room card: the Roomba+ room outlines drawn as quiet tiles. Tap rooms to
// pick them (in order), then one button cleans them through script.roomba_clean_rooms.
// Deployed to /config/www/roomba-room-card.js (./deploy.sh), registered as a
// dashboard resource /local/roomba-room-card.js?v=N.
//
//   type: custom:roomba-room-card
//   vacuum: vacuum.c_c_robot          (defaults shown)
//   map: image.cc_roomba_rooms_map
//   script: script.roomba_clean_rooms

const DEFAULTS = {
    vacuum: 'vacuum.c_c_robot', map: 'image.cc_roomba_rooms_map', script: 'script.roomba_clean_rooms',
    path: 'image.cc_roomba_map',   // Roomba+ "Cleaning path", shown under the rooms while it runs
    active: 'binary_sensor.cc_roomba_mission_active', battery: 'sensor.c_c_robot_battery',
    phase: 'sensor.cc_roomba_phase', bin: 'binary_sensor.c_c_robot_bin_full',
    progress: 'sensor.cc_roomba_mission_progress', recharge: 'binary_sensor.cc_roomba_mid_mission_recharge'
};
const GAP = 90;   // map units between rooms (the outline stroke, drawn in the card colour)

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nice = name => String(name).replace(/’/g, "'");
const listWords = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

class RoombaRoomCard extends HTMLElement {
    setConfig(config) {
        this.config = { ...DEFAULTS, ...config };
        this.picked = [];
        this.busy = false;
    }

    getCardSize() { return 8; }
    getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

    set hass(hass) {
        this._hass = hass;
        const c = this.config, s = id => hass.states[id];
        const key = [c.vacuum, c.map, c.path, c.active, c.battery, c.phase, c.bin, c.progress, c.recharge]
            .map(id => s(id)?.last_updated).join('|');
        if (key === this.lastKey) return;
        this.lastKey = key;
        this.render();
    }

    rooms() {
        const map = this._hass.states[this.config.map];
        return Object.values(map?.attributes?.rooms || {}).filter(r => Array.isArray(r.outline) && r.outline.length > 2);
    }

    status() {
        const h = this._hass, c = this.config, st = id => h.states[id]?.state;
        const vac = st(c.vacuum), active = st(c.active) === 'on', bat = parseFloat(st(c.battery));
        const scope = h.states[c.vacuum]?.attributes?.mission_scope;
        const scopeNames = (Array.isArray(scope) ? scope : []).map(r => typeof r === 'string' ? r : r?.name).filter(Boolean);
        const pct = parseFloat(st(c.progress));
        let text;
        if (st(c.phase) === 'stuck' || vac === 'error') text = 'Stuck · needs a hand';
        else if (active && st(c.recharge) === 'on') text = 'Recharging, then it will finish';
        else if (active && vac === 'returning') text = 'Heading back to the dock';
        else if (active && vac === 'paused') text = 'Paused';
        else if (active) text = `Cleaning${scopeNames.length ? ' ' + listWords(scopeNames.map(n => nice(n).toLowerCase())) : ''}`
            + (pct > 0 && pct < 100 ? ` · ${Math.round(pct)}%` : '');
        else if (vac === 'docked') text = st(c.phase) === 'charging' ? 'Docked · charging' : 'Docked';
        else if (vac === 'unavailable' || vac === undefined) text = 'Not connected';
        else text = vac[0].toUpperCase() + vac.slice(1);
        if (st(c.bin) === 'on') text += ' · bin is full';
        return { text, active, vac, battery: Number.isFinite(bat) ? Math.round(bat) : null, scopeNames, alert: /Stuck|bin is full/.test(text) };
    }

    render() {
        if (!this._hass) return;
        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
        const rooms = this.rooms(), st = this.status();
        const xs = rooms.flatMap(r => r.outline.map(p => p[0])), ys = rooms.flatMap(r => r.outline.map(p => p[1]));
        const minX = Math.min(...xs) - GAP, maxX = Math.max(...xs) + GAP, minY = Math.min(...ys) - GAP, maxY = Math.max(...ys) + GAP;
        const fy = y => maxY - y;   // the robot's y runs up, SVG's runs down
        const cleaningNow = new Set(st.active ? st.scopeNames : []);
        const shapes = rooms.map(r => {
            const order = this.picked.indexOf(r.room_id);
            const cls = order >= 0 ? 'room picked' : cleaningNow.has(r.name) ? 'room now' : 'room';
            const pts = r.outline.map(p => `${p[0] - minX},${fy(p[1])}`).join(' ');
            const lx = r.x - minX, ly = fy(r.y);
            return `<g class="${cls}" data-id="${esc(r.room_id)}" role="button" tabindex="0" aria-pressed="${order >= 0}">
                <polygon points="${pts}"/>
                <text x="${lx}" y="${ly}" class="label">${esc(nice(r.name))}</text>
                ${order >= 0 ? `<circle cx="${lx}" cy="${ly - 430}" r="190" class="badge"/><text x="${lx}" y="${ly - 430}" class="badge-n">${order + 1}</text>` : ''}
            </g>`;
        }).join('');

        const pickedNames = this.picked.map(id => rooms.find(r => r.room_id === id)).filter(Boolean).map(r => nice(r.name).toLowerCase());
        let actions;
        if (st.active) actions = `<button class="btn" data-act="pause">${st.vac === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="btn" data-act="dock">Send to dock</button>`;
        else if (this.picked.length) actions = `<button class="btn primary" data-act="rooms" ${this.busy ? 'disabled' : ''}>Clean ${esc(listWords(pickedNames))}</button>
            <button class="btn quiet" data-act="clear">Clear</button>`;
        else actions = `<span class="hint">Tap rooms to pick them</span>
            <button class="btn" data-act="all" ${this.busy ? 'disabled' : ''}>Clean everywhere</button>`;

        this.shadowRoot.innerHTML = `<style>
            :host { display: block; }
            ha-card { padding: 16px 16px 14px; overflow: hidden; }
            .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
            .status { font-size: 14px; color: var(--secondary-text-color); text-align: right; }
            .status.alert { color: var(--warning-color, #e0a030); }
            .bat { opacity: .7; white-space: nowrap; }
            svg { display: block; width: 100%; height: auto; max-height: 520px; touch-action: manipulation; }
            .room polygon { fill: color-mix(in srgb, var(--primary-text-color) 9%, transparent);
                stroke: var(--ha-card-background, var(--card-background-color, #1c1c1c)); stroke-width: ${GAP};
                stroke-linejoin: round; paint-order: stroke; transition: fill .2s; cursor: pointer; }
            .room:hover polygon { fill: color-mix(in srgb, var(--primary-text-color) 14%, transparent); }
            .room.now polygon { fill: color-mix(in srgb, var(--primary-color) 22%, transparent); }
            .room.picked polygon { fill: color-mix(in srgb, var(--primary-color) 48%, transparent); }
            .room:focus { outline: none; }
            .room:focus-visible polygon { fill: color-mix(in srgb, var(--primary-text-color) 18%, transparent); }
            .label { font: 500 300px var(--ha-font-family-body, Roboto, sans-serif); fill: var(--secondary-text-color);
                text-anchor: middle; dominant-baseline: central; pointer-events: none; }
            .picked .label { fill: var(--primary-text-color); }
            .badge { fill: var(--primary-color); pointer-events: none; }
            .badge-n { font: 600 230px var(--ha-font-family-body, Roboto, sans-serif); fill: var(--text-primary-color, #fff);
                text-anchor: middle; dominant-baseline: central; pointer-events: none; }
            .actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; min-height: 36px; }
            .hint { margin-right: auto; font-size: 13px; color: var(--secondary-text-color); }
            .btn { font: 500 14px var(--ha-font-family-body, Roboto, sans-serif); border: none; border-radius: 18px;
                padding: 9px 16px; cursor: pointer; color: var(--primary-text-color);
                background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
            .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); flex: 1; }
            .btn.quiet { background: none; color: var(--secondary-text-color); }
            .btn:disabled { opacity: .5; cursor: default; }
            .path { margin-top: 12px; }
            .path-label { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 6px; }
            .path img { display: block; width: 100%; border-radius: 12px; }
            .empty { color: var(--secondary-text-color); font-size: 14px; padding: 24px 0; text-align: center; }
        </style>
        <ha-card>
            <div class="top">
                <span class="name">${esc(this.config.title || 'Roomba')}</span>
                <span class="status ${st.alert ? 'alert' : ''}">${esc(st.text)}${st.battery !== null ? ` <span class="bat">· ${st.battery}%</span>` : ''}</span>
            </div>
            ${rooms.length ? `<svg viewBox="0 0 ${maxX - minX} ${maxY - minY}" aria-label="Rooms">${shapes}</svg>`
                : '<div class="empty">No room map yet</div>'}
            ${(st.active || this.config.show_path) && this._hass.states[this.config.path]?.attributes?.entity_picture
                ? `<div class="path"><div class="path-label">Cleaning path</div>
                    <img src="${esc(this._hass.states[this.config.path].attributes.entity_picture)}&t=${encodeURIComponent(this._hass.states[this.config.path].state)}" alt="Cleaning path"></div>` : ''}
            <div class="actions">${actions}</div>
        </ha-card>`;

        this.shadowRoot.querySelectorAll('.room').forEach(g => {
            const toggle = () => {
                if (st.active) return;   // no picking mid-run
                const id = g.dataset.id, i = this.picked.indexOf(id);
                i >= 0 ? this.picked.splice(i, 1) : this.picked.push(id);
                this.render();
            };
            g.addEventListener('click', toggle);
            g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        });
        this.shadowRoot.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act)));
    }

    async act(what) {
        const h = this._hass, c = this.config;
        if (what === 'clear') { this.picked = []; return this.render(); }
        this.busy = true; this.render();
        try {
            if (what === 'rooms') await h.callService('script', c.script.replace(/^script\./, ''), { rooms: [...this.picked] });
            else if (what === 'all') await h.callService('vacuum', 'start', { entity_id: c.vacuum });
            else if (what === 'pause') await h.callService('vacuum', h.states[c.vacuum]?.state === 'paused' ? 'start' : 'pause', { entity_id: c.vacuum });
            else if (what === 'dock') await h.callService('vacuum', 'return_to_base', { entity_id: c.vacuum });
            if (what === 'rooms') this.picked = [];
        } finally { this.busy = false; this.render(); }
    }
}

customElements.define('roomba-room-card', RoombaRoomCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'roomba-room-card', name: 'Roomba room card', description: 'Tap rooms on the Roomba+ map, then clean them' });
