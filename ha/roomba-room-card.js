// Roomba card: status, battery, bin and dock power on top; the Roomba+ room map
// as soft tiles you tap to pick (in order); one button cleans them through
// script.roomba_clean_rooms. While it runs: the cleaning path, Pause, Send to dock.
// Deployed to /config/www/roomba-room-card.js (./deploy.sh), registered as a
// dashboard resource /local/roomba-room-card.js?v=N (bump N after each deploy).
//
//   type: custom:roomba-room-card
//   title: Roomba                       (options; defaults below)
//   dock_power: switch.roomba_dock      (omit or null to hide the chip)

const DEFAULTS = {
    vacuum: 'vacuum.c_c_robot', map: 'image.cc_roomba_rooms_map', script: 'script.roomba_clean_rooms',
    path: 'image.cc_roomba_map', active: 'binary_sensor.cc_roomba_mission_active',
    battery: 'sensor.c_c_robot_battery', phase: 'sensor.cc_roomba_phase', bin: 'binary_sensor.c_c_robot_bin_full',
    progress: 'sensor.cc_roomba_mission_progress', recharge: 'binary_sensor.cc_roomba_mid_mission_recharge',
    dock_power: 'switch.roomba_dock', locate: 'button.cc_roomba_locate', evac: 'button.cc_roomba_evac',
    title: 'Roomba'
};
// Soft tiles: each room is blurred and its edge re-thresholded, which rounds every
// corner and pulls the edge in a little, leaving a small gap between neighbours.
const SOFT = 75;    // map units (blur radius)

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nice = name => String(name).replace(/’/g, "'");
const listWords = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const batteryIcon = (pct, charging) => {
    if (pct === null) return 'mdi:battery-unknown';
    const step = Math.max(1, Math.min(10, Math.round(pct / 10))) * 10;
    return charging ? `mdi:battery-charging${step === 100 ? '-100' : '-' + step}` : step === 100 ? 'mdi:battery' : `mdi:battery-${step}`;
};

class RoombaRoomCard extends HTMLElement {
    setConfig(config) {
        this.config = { ...DEFAULTS, ...config };
        this.picked = [];
        this.busy = false;
    }

    getCardSize() { return 9; }
    getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

    set hass(hass) {
        this._hass = hass;
        const c = this.config;
        const key = [c.vacuum, c.map, c.path, c.active, c.battery, c.phase, c.bin, c.progress, c.recharge, c.dock_power]
            .map(id => id && hass.states[id]?.last_updated).join('|');
        if (key === this.lastKey) return;
        this.lastKey = key;
        this.render();
    }

    rooms() {
        const map = this._hass.states[this.config.map];
        return Object.values(map?.attributes?.rooms || {}).filter(r => Array.isArray(r.outline) && r.outline.length > 2);
    }

    status() {
        const h = this._hass, c = this.config, st = id => id ? h.states[id]?.state : undefined;
        const vac = st(c.vacuum), active = st(c.active) === 'on', bat = parseFloat(st(c.battery));
        const scope = h.states[c.vacuum]?.attributes?.mission_scope;
        const scopeNames = (Array.isArray(scope) ? scope : []).map(r => typeof r === 'string' ? r : r?.name).filter(Boolean);
        const pct = parseFloat(st(c.progress));
        const stuck = st(c.phase) === 'stuck' || vac === 'error';
        let text, tone = '';
        if (stuck) { text = 'Stuck · needs a hand'; tone = 'alert'; }
        else if (active && st(c.recharge) === 'on') { text = 'Recharging, then it will finish'; tone = 'on'; }
        else if (active && vac === 'returning') { text = 'Heading back to the dock'; tone = 'on'; }
        else if (active && vac === 'paused') { text = 'Paused'; tone = 'on'; }
        else if (active) {
            text = `Cleaning${scopeNames.length ? ' ' + listWords(scopeNames.map(n => nice(n).toLowerCase())) : ''}`
                + (pct > 0 && pct < 100 ? ` · ${Math.round(pct)}%` : '');
            tone = 'on';
        }
        else if (vac === 'docked') text = st(c.phase) === 'charging' ? 'On the dock, charging' : 'On the dock';
        else if (vac === 'unavailable' || vac === undefined) text = 'Not connected';
        else text = vac[0].toUpperCase() + vac.slice(1);
        return {
            text, tone, active, vac, scopeNames,
            battery: Number.isFinite(bat) ? Math.round(bat) : null, charging: st(c.phase) === 'charging',
            binFull: st(c.bin) === 'on', dock: st(c.dock_power)
        };
    }

    chips(s) {
        const c = this.config, out = [];
        out.push(`<span class="chip ${s.binFull ? 'warn' : ''}"><ha-icon icon="${s.binFull ? 'mdi:delete-alert' : 'mdi:delete-outline'}"></ha-icon>${s.binFull ? 'Bin full' : 'Bin empty'}</span>`);
        if (c.dock_power && s.dock !== undefined)
            out.push(`<button class="chip ${s.dock === 'on' ? '' : 'off'}" data-act="dock_power" title="Turn the dock's power ${s.dock === 'on' ? 'off' : 'on'}">
                <ha-icon icon="mdi:power-plug${s.dock === 'on' ? '' : '-off'}"></ha-icon>Dock power ${s.dock === 'on' ? 'on' : 'off'}</button>`);
        if (c.locate && this._hass.states[c.locate])
            out.push(`<button class="chip" data-act="locate" title="Make the Roomba beep"><ha-icon icon="mdi:map-marker-question-outline"></ha-icon>Find</button>`);
        if (c.evac && this._hass.states[c.evac] && !s.active)
            out.push(`<button class="chip" data-act="evac" title="Empty the bin into the dock"><ha-icon icon="mdi:delete-empty-outline"></ha-icon>Empty bin</button>`);
        return out.join('');
    }

    render() {
        if (!this._hass) return;
        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
        const rooms = this.rooms(), s = this.status();
        const pad = SOFT * 2;
        const xs = rooms.flatMap(r => r.outline.map(p => p[0])), ys = rooms.flatMap(r => r.outline.map(p => p[1]));
        const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
        const W = maxX - minX, H = maxY - minY;
        const pt = p => `${p[0] - minX},${maxY - p[1]}`;   // the robot's y runs up, SVG's runs down
        const now = new Set(s.active ? s.scopeNames : []);
        const state = r => this.picked.includes(r.room_id) ? 'picked' : now.has(r.name) ? 'now' : '';

        const fills = `<defs><filter id="soft" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="${SOFT}"/>
                <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -14"/></filter></defs>`
            + rooms.map(r => `<polygon class="room ${state(r)}" data-id="${esc(r.room_id)}" filter="url(#soft)" points="${r.outline.map(pt).join(' ')}"/>`).join('');
        const cuts = '';
        const labels = rooms.map(r => {
            const order = this.picked.indexOf(r.room_id);
            return `<button class="label ${state(r)}" data-id="${esc(r.room_id)}" aria-pressed="${order >= 0}"
                style="left:${((r.x - minX) / W * 100).toFixed(2)}%;top:${((maxY - r.y) / H * 100).toFixed(2)}%">
                ${order >= 0 ? `<span class="n">${order + 1}</span>` : r.icon ? `<ha-icon icon="${esc(r.icon)}"></ha-icon>` : ''}
                <span>${esc(nice(r.name))}</span></button>`;
        }).join('');

        const pickedNames = this.picked.map(id => rooms.find(r => r.room_id === id)).filter(Boolean).map(r => nice(r.name).toLowerCase());
        let actions;
        if (s.active) actions = `<button class="btn" data-act="pause"><ha-icon icon="mdi:${s.vac === 'paused' ? 'play' : 'pause'}"></ha-icon>${s.vac === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="btn" data-act="home"><ha-icon icon="mdi:home-import-outline"></ha-icon>Send to dock</button>`;
        else if (this.picked.length) actions = `<button class="btn primary" data-act="rooms" ${this.busy ? 'disabled' : ''}><ha-icon icon="mdi:play"></ha-icon>Clean ${esc(listWords(pickedNames))}</button>
            <button class="btn quiet" data-act="clear">Clear</button>`;
        else actions = `<span class="hint">Tap rooms to choose</span>
            <button class="btn" data-act="all" ${this.busy ? 'disabled' : ''}><ha-icon icon="mdi:play"></ha-icon>Clean everywhere</button>`;

        const pathPic = this._hass.states[this.config.path]?.attributes?.entity_picture;
        this.shadowRoot.innerHTML = `<style>
            :host { display: block; --accent: var(--primary-color); --running: var(--state-vacuum-active-color, var(--state-active-color, var(--primary-color))); --tile: color-mix(in srgb, var(--primary-text-color) 7%, transparent); }
            ha-card { padding: 16px; overflow: hidden; font-family: var(--ha-font-family-body, inherit); color: var(--primary-text-color); }
            .head { display: flex; align-items: center; gap: 12px; }
            .avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none;
                background: var(--tile); color: var(--secondary-text-color); }
            .avatar.on { background: color-mix(in srgb, var(--running) 20%, transparent); color: var(--running); }
            .avatar.alert { background: color-mix(in srgb, var(--warning-color, #e0a030) 22%, transparent); color: var(--warning-color, #e0a030); }
            .avatar.on ha-icon { animation: hum 2.4s ease-in-out infinite; }
            @keyframes hum { 50% { transform: rotate(-12deg); } }
            .titles { flex: 1; min-width: 0; }
            .name { font-size: var(--ha-card-header-font-size, var(--ha-font-size-l, 16px)); font-weight: var(--ha-font-weight-medium, 500);
                color: var(--ha-card-header-color, var(--primary-text-color)); line-height: 1.3; }
            .status { font-size: var(--ha-font-size-s, 12px); color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .status.alert { color: var(--warning-color, #e0a030); }
            .bat { display: flex; align-items: center; gap: 2px; font-size: var(--ha-font-size-m, 14px); color: var(--secondary-text-color); }
            .bat ha-icon { --mdc-icon-size: 20px; }
            .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
            .chip { display: inline-flex; align-items: center; gap: 5px; font-family: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: var(--ha-font-weight-medium, 500);
                padding: 6px 11px 6px 8px; border-radius: 16px; border: none; background: var(--tile); color: var(--primary-text-color); }
            button.chip { cursor: pointer; }
            button.chip:hover { background: color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
            .chip ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color); }
            .chip.off { color: var(--secondary-text-color); }
            .chip.warn { background: color-mix(in srgb, var(--warning-color, #e0a030) 18%, transparent); }
            .chip.warn ha-icon { color: var(--warning-color, #e0a030); }
            .map { position: relative; margin-top: 10px; }
            svg { display: block; width: 100%; height: auto; }
            /* opaque fills (mixed with the card colour): the soft-edge filter needs solid alpha */
            .map { --bg: var(--ha-card-background, var(--card-background-color, #1c1c1c)); }
            .room { fill: color-mix(in srgb, var(--primary-text-color) 9%, var(--bg)); cursor: pointer; transition: fill .25s; }
            .room:hover { fill: color-mix(in srgb, var(--primary-text-color) 14%, var(--bg)); }
            .room.now { fill: color-mix(in srgb, var(--running) 28%, var(--bg)); }
            .room.picked { fill: color-mix(in srgb, var(--accent) 55%, var(--bg)); }
            .label { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px;
                border: none; background: none; padding: 4px; cursor: pointer; font-family: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: var(--ha-font-weight-medium, 500);
                color: var(--secondary-text-color); white-space: nowrap; }
            .label ha-icon { --mdc-icon-size: 20px; opacity: .75; }
            .label.picked { color: var(--primary-text-color); }
            .label .n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 600;
                background: var(--accent); color: var(--text-primary-color, #fff); }
            .path { margin-top: 12px; }
            .path-label { font-size: var(--ha-font-size-s, 12px); color: var(--secondary-text-color); margin-bottom: 6px; }
            .path img { display: block; width: 100%; border-radius: 12px; }
            .actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; min-height: 38px; }
            .hint { margin-right: auto; font-size: var(--ha-font-size-s, 12px); color: var(--secondary-text-color); }
            .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-medium, 500);
                border: none; border-radius: 19px; padding: 9px 16px 9px 12px; cursor: pointer; color: var(--primary-text-color); background: var(--tile); }
            .btn ha-icon { --mdc-icon-size: 18px; }
            .btn:hover { background: color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
            .btn.primary { background: var(--accent); color: var(--text-primary-color, #fff); flex: 1; }
            .btn.quiet { background: none; color: var(--secondary-text-color); padding: 9px 12px; }
            .btn:disabled { opacity: .5; cursor: default; }
            .empty { color: var(--secondary-text-color); font-size: var(--ha-font-size-m, 14px); padding: 24px 0; text-align: center; }
        </style>
        <ha-card>
            <div class="head">
                <div class="avatar ${s.tone}"><ha-icon icon="mdi:robot-vacuum"></ha-icon></div>
                <div class="titles">
                    <div class="name">${esc(this.config.title)}</div>
                    <div class="status ${s.tone === 'alert' ? 'alert' : ''}">${esc(s.text)}</div>
                </div>
                ${s.battery !== null ? `<div class="bat"><ha-icon icon="${batteryIcon(s.battery, s.charging)}"></ha-icon>${s.battery}%</div>` : ''}
            </div>
            <div class="chips">${this.chips(s)}</div>
            ${rooms.length ? `<div class="map"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${fills}${cuts}</svg>${labels}</div>`
                : '<div class="empty">No room map yet</div>'}
            ${(s.active || this.config.show_path) && pathPic ? `<div class="path"><div class="path-label">Cleaning path</div>
                <img src="${esc(pathPic)}&t=${encodeURIComponent(this._hass.states[this.config.path].state)}" alt="Cleaning path"></div>` : ''}
            <div class="actions">${actions}</div>
        </ha-card>`;

        this.shadowRoot.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
            if (s.active) return;   // no picking mid-run
            const id = el.dataset.id, i = this.picked.indexOf(id);
            i >= 0 ? this.picked.splice(i, 1) : this.picked.push(id);
            this.render();
        }));
        this.shadowRoot.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act)));
    }

    async act(what) {
        const h = this._hass, c = this.config, vac = { entity_id: c.vacuum };
        if (what === 'clear') { this.picked = []; return this.render(); }
        this.busy = true; this.render();
        try {
            if (what === 'rooms') { await h.callService('script', c.script.replace(/^script\./, ''), { rooms: [...this.picked] }); this.picked = []; }
            else if (what === 'all') await h.callService('vacuum', 'start', vac);
            else if (what === 'pause') await h.callService('vacuum', h.states[c.vacuum]?.state === 'paused' ? 'start' : 'pause', vac);
            else if (what === 'home') await h.callService('vacuum', 'return_to_base', vac);
            else if (what === 'locate') await h.callService('button', 'press', { entity_id: c.locate });
            else if (what === 'evac') await h.callService('button', 'press', { entity_id: c.evac });
            else if (what === 'dock_power') await h.callService('switch', 'toggle', { entity_id: c.dock_power });
        } finally { this.busy = false; this.render(); }
    }
}

customElements.define('roomba-room-card', RoombaRoomCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'roomba-room-card', name: 'Roomba card', description: 'Roomba status, dock power and the Roomba+ room map: tap rooms, then clean them' });
