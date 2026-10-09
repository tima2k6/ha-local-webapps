// Decorative renderer: reads the existing HA sensor; never calls FR24 directly.
const NS = 'http://www.w3.org/2000/svg';
const ENTITY = 'sensor.flightradar24_current_in_area';
export const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export function viewport(home, bounds) {
    const [north, south, west, east] = String(bounds).split(',').map(Number);
    if (![...home, north, south, west, east].every(Number.isFinite) || north <= south || east <= west) throw new Error('Invalid flight map bounds');
    const [lat, lon] = home, cos = Math.cos(lat * Math.PI / 180);
    const dy = Math.max(Math.abs(north-lat), Math.abs(south-lat), Math.abs(west-lon)*cos/1.6, Math.abs(east-lon)*cos/1.6) * 1.4;
    // Show 25% more ground, looking slightly north: home sits at 60% screen height.
    return [lat-dy*.8, lon-dy*1.6/cos, lat+dy*1.2, lon+dy*1.6/cos];
}

export function project(lat, lon, box) {
    return [(lon-box[1])/(box[3]-box[1])*1280, (box[2]-lat)/(box[2]-box[0])*800];
}

export function validFlights(flights) {
    return (Array.isArray(flights) ? flights : []).filter(f => finite(f.latitude) && finite(f.longitude)
        && Math.abs(Number(f.latitude)) <= 90 && Math.abs(Number(f.longitude)) <= 180
        && !f.on_ground && !f.has_landed);
}

function svg(tag, attributes = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    if (parent) parent.append(el);
    return el;
}

export class FlightBackdrop {
    constructor(config, map, status) {
        Object.assign(this, { config, map, status: status || { textContent: '' } });
        this.markers = new Map();
        this.layer = map.querySelector('.flights');
        this.layer.replaceChildren();
        this.home = map.querySelector('.home');
        this.home.setAttribute('transform', 'translate(640 480)');
        this.map.setAttribute('aria-label', 'Nearby aircraft from Home Assistant over local street linework');
        this.roads = map.querySelector('#local-roads');
    }

    async state(entity) {
        const response = await fetch(`${this.config.haUrl}/api/states/${entity}`, {
            headers: { Authorization: `Bearer ${this.config.longLivedAccessToken}` }, cache: 'no-store',
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`HA HTTP ${response.status}`);
        return response.json();
    }

    async start() {
        this.stopped = false;
        this.connect();
        const mapRequest = fetch(new URL('../data/local-flight-map.json?v=3', import.meta.url))
            .then(response => { if (!response.ok) throw new Error('Map cache unavailable'); return response.json(); })
            .then(data => { this.mapData = data; this.box ??= data.bbox; this.renderMap(); })
            .catch(() => { this.map.dataset.streets = 'unavailable'; });
        try {
            const home = await this.state('zone.home');
            const attrs = home.attributes;
            if (!finite(attrs.latitude) || !finite(attrs.longitude)) throw new Error('Home location unavailable');
            this.center = [Number(attrs.latitude), Number(attrs.longitude)];
            await this.refresh();
        } catch (error) { this.fail(error); }
        await mapRequest;
        // Reconcile missed updates and check freshness; websocket events draw immediately.
        this.timer = setInterval(() => this.refresh(), 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            clearInterval(this.timer);
            clearTimeout(this.reconnectTimer);
            this.ws?.close();
        }, { once: true });
    }

    connect() {
        if (this.stopped) return;
        this.map.dataset.transport = 'connecting';
        const ws = this.ws = new WebSocket(`${this.config.haUrl.replace(/^http/, 'ws')}/api/websocket`);
        ws.onmessage = ({ data }) => {
            const message = JSON.parse(data);
            if (message.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.config.longLivedAccessToken }));
            if (message.type === 'auth_ok') {
                ws.send(JSON.stringify({ id: 1, type: 'subscribe_trigger', trigger: {
                    platform: 'state', entity_id: [ENTITY, 'switch.flightradar24_api_data_fetching']
                } }));
            }
            if (message.type === 'auth_invalid') {
                this.stopped = true;
                this.fail(new Error('HA authentication rejected'));
                ws.close();
            }
            if (message.type === 'result' && message.id === 1) {
                this.map.dataset.transport = message.success ? 'websocket' : 'polling';
                if (message.success) this.refresh();
            }
            if (message.type === 'event' && message.id === 1) this.refresh();
        };
        ws.onclose = () => {
            this.map.dataset.transport = 'polling';
            if (!this.stopped) this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        };
        ws.onerror = () => ws.close();
    }

    renderMap() {
        if (!this.roads || !this.mapData || !this.box) return;
        this.roads.replaceChildren();
        const major = /^(motorway|trunk|primary|secondary|tertiary)/;
        const linework = { water: [], major: [], minor: [] };
        for (const way of this.mapData.ways) {
            const water = /^(water|coastline|river|canal)$/.test(way.kind);
            const points = way.points.map(([lat, lon]) => project(lat, lon, this.box));
            if (points.length < 2) continue;
            linework[water ? 'water' : major.test(way.kind) ? 'major' : 'minor'].push(
                'M'+points.map(p => p.map(n => n.toFixed(1)).join(',')).join('L'));
        }
        for (const kind of ['minor', 'major', 'water']) {
            // Colors here are fallbacks: index.html's --road-* (season, golden hour) override them
            svg('path', { class: `road ${kind}`, d: linework[kind].join(''), fill: 'none',
                stroke: kind === 'water' ? '#495b57' : kind === 'major' ? '#56605c' : '#343b38',
                'stroke-width': kind === 'water' ? 1.2 : kind === 'major' ? 1 : .65,
                'stroke-opacity': kind === 'water' ? 1 : .9,
                'stroke-linejoin': 'round' }, this.roads);
        }
        this.map.dataset.streets = 'osm';
    }

    fail(error) {
        this.layer.replaceChildren();
        this.markers.clear();
        this.status.textContent = `Flight feed unavailable (${error.message})`;
        this.map.dataset.feed = 'unavailable';
        this.map.dataset.feedStatus = error.message;
    }

    async refresh() {
        if (document.hidden) return;
        if (this.busy) { this.pendingRefresh = true; return; }
        this.busy = true;
        try {
            if (!this.center) {
                const home = await this.state('zone.home');
                if (!finite(home.attributes.latitude) || !finite(home.attributes.longitude)) throw new Error('Home location unavailable');
                this.center = [Number(home.attributes.latitude), Number(home.attributes.longitude)];
            }
            const [state, fetching] = await Promise.all([
                this.state(ENTITY), this.state('switch.flightradar24_api_data_fetching')
            ]);
            if (fetching.state === 'off') throw new Error('tracking paused in HA');
            if (['unknown', 'unavailable'].includes(state.state)) throw new Error('sensor unavailable');
            if (!Array.isArray(state.attributes.flights)) throw new Error('flight list unavailable');
            const updated = Date.parse(state.last_updated);
            if (state.attributes.flights.length && (!Number.isFinite(updated) || Date.now()-updated > 180000)) throw new Error('flight positions are stale');
            this.box = viewport(this.center, state.attributes.bounds);
            const key = this.box.join(',');
            if (key !== this.lastMapBox) { this.renderMap(); this.lastMapBox = key; }
            this.draw(validFlights(state.attributes.flights));
            this.map.dataset.feed = 'live';
            this.map.dataset.sourceUpdated = state.last_updated;
            delete this.map.dataset.feedStatus;
            this.status.textContent = `HA flight snapshot · ${this.markers.size} aircraft · source updated ${new Date(state.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
        } catch (error) { this.fail(error); }
        finally {
            this.busy = false;
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                queueMicrotask(() => this.refresh());
            }
        }
    }

    draw(flights) {
        const active = new Set();
        for (const f of flights) {
            const id = String(f.id || f.aircraft_icao_24bit || f.callsign || f.flight_number || `${f.latitude},${f.longitude}`);
            const [x, y] = project(Number(f.latitude), Number(f.longitude), this.box);
            if (x < -20 || x > 1300 || y < -20 || y > 820) continue;
            active.add(id);
            let item = this.markers.get(id);
            if (!item) {
                const group = svg('g', { class: 'live-aircraft' }, this.layer);
                const trails = svg('g', {}, group);
                const marker = svg('g', { class: 'live-marker' }, group);
                const plane = svg('use', { href: '#plane' }, marker);
                const label = svg('text', { x: 22, y: 4 }, marker);
                const route = svg('text', { x: 22, y: 21, class: 'flight-route' }, marker);
                item = { group, trails, marker, plane, label, route };
                this.markers.set(id, item);
            }
            item.marker.style.transform = `translate(${x}px, ${y}px)`;
            item.plane.setAttribute('transform', `rotate(${finite(f.heading) ? Number(f.heading) : 0})`);
            item.label.textContent = f.flight_number || f.callsign || 'Aircraft';
            const origin = f.airport_origin_code_iata || f.airport_origin_code_icao;
            const destination = f.airport_destination_code_iata || f.airport_destination_code_icao;
            item.route.textContent = origin || destination ? `${origin || '?'} → ${destination || '?'}` : '';
            item.trails.replaceChildren();
            let points = (Array.isArray(f.coordinates) ? f.coordinates : [])
                .filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1]))
                .map(p => project(Number(p[0]), Number(p[1]), this.box));
            // FR24 track arrays can be newest-first. Fade toward the current position.
            const distance = p => Math.hypot(p[0]-x, p[1]-y);
            if (points.length > 1 && distance(points[0]) < distance(points.at(-1))) points.reverse();
            points = points.slice(-45);
            if (!points.length || distance(points.at(-1)) > 1) points.push([x, y]);
            for (let i = 1; i < points.length; i++) {
                svg('path', { class: 'trail', d: `M${points[i-1].join(',')}L${points[i].join(',')}`, fill: 'none',
                    stroke: '#5fc9b4', 'stroke-width': 1.6, 'stroke-opacity': (.08+.55*i/points.length).toFixed(2) }, item.trails);
            }
        }
        for (const [id, item] of this.markers) if (!active.has(id)) {
            item.group.remove(); this.markers.delete(id);
        }
    }
}
