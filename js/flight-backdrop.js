// Decorative renderer: reads the existing HA sensor; never calls FR24 directly.
const NS = 'http://www.w3.org/2000/svg';
const ENTITY = 'sensor.flightradar24_current_in_area';
const TALLY_ENTITY = 'sensor.flightradar24_planes_today';
export const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

// FR24 altitude is reported in feet above sea level; this is a visual cue,
// not an estimate of clearance above the terrain below the aircraft.
export function altitudeScale(altitude) {
    if (!finite(altitude) || Number(altitude) < 0) return 1;
    const feet = Number(altitude);
    if (feet <= 1000) return 1.6;
    if (feet <= 10000) return 1.6 - .6 * (feet - 1000) / 9000;
    return Math.max(.8, 1 - .2 * (feet - 10000) / 20000);
}

function distanceKm(lat, lon, otherLat, otherLon) {
    if (![lat, lon, otherLat, otherLon].every(finite)
        || Math.abs(Number(lat)) > 90 || Math.abs(Number(otherLat)) > 90
        || Math.abs(Number(lon)) > 180 || Math.abs(Number(otherLon)) > 180) return Infinity;
    const r = Math.PI / 180;
    const a = Math.sin((otherLat-lat)*r/2)**2 + Math.cos(lat*r)*Math.cos(otherLat*r)*Math.sin((otherLon-lon)*r/2)**2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function flightPhase(f, home, now = Date.now()) {
    if (!Array.isArray(home) || home.length !== 2 || f.on_ground || f.has_landed
        || !finite(f.altitude) || !finite(f.vertical_speed) || Number(f.altitude) < 0) return '';
    const nearby = airport => {
        const lat = f[`airport_${airport}_latitude`], lon = f[`airport_${airport}_longitude`];
        // Restrict cues to local airports and their nearby airborne traffic.
        return distanceKm(...home, lat, lon) <= 80 && distanceKm(f.latitude, f.longitude, lat, lon) <= 60;
    };
    if (Number(f.altitude) <= 12000 && Number(f.vertical_speed) <= -300 && nearby('destination') && finite(f.heading)) {
        const r = Math.PI / 180, lat = Number(f.latitude)*r, destinationLat = Number(f.airport_destination_latitude)*r;
        const lonDifference = (Number(f.airport_destination_longitude)-Number(f.longitude))*r;
        const bearing = Math.atan2(Math.sin(lonDifference)*Math.cos(destinationLat),
            Math.cos(lat)*Math.sin(destinationLat)-Math.sin(lat)*Math.cos(destinationLat)*Math.cos(lonDifference)) / r;
        const difference = Math.abs(((Number(f.heading)-bearing)%360+540)%360-180);
        if (difference <= 75) return '↘ Arriving';
    }
    const raw = f.time_real_departure;
    const departure = finite(raw) ? Number(raw)*(Number(raw) < 1e12 ? 1000 : 1)
        : typeof raw === 'string' ? Date.parse(raw) : NaN;
    const age = now-departure;
    if (Number(f.altitude) <= 15000 && Number(f.vertical_speed) >= 300 && nearby('origin')
        && age >= 0 && age <= 20*60000) return '↗ Departing';
    return '';
}

// Rewriting an unchanged value still invalidates the SVG, so skip no-op writes.
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== String(value)) el.setAttribute(name, value); };
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };

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

export function dailyTallyText(state, now = new Date()) {
    const zone = state?.attributes?.time_zone || 'America/Los_Angeles';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(p => p.type === type).value;
    const day = `${part('year')}-${part('month')}-${part('day')}`;
    const count = Number(state?.state);
    if (!finite(state?.state) || !Number.isSafeInteger(count) || count < 0 || state?.attributes?.day !== day) return '';
    return `${count.toLocaleString()} aircraft today`;
}

// Screen text the map sits under (clock, weather, agenda...), as tight per-line boxes in
// map units. A plane or boat whose label would land on one keeps a dimmed icon only.
const SCREEN_TEXT = '#clock .date, #clock .time, #clock .period, #weather, #insights, #night-weather, '
    + '.agenda-head, #agenda, #tags, #timers, #flight-tally';
export function screenTextRects(map) {
    const toMap = map.getScreenCTM?.()?.inverse();
    if (!toMap) return [];
    const range = document.createRange(), rects = [];
    for (const el of document.querySelectorAll(SCREEN_TEXT)) {
        range.selectNodeContents(el);
        for (const r of range.getClientRects()) {
            if (r.width < 1 || r.height < 1) continue;
            const a = new DOMPoint(r.left, r.top).matrixTransform(toMap), b = new DOMPoint(r.right, r.bottom).matrixTransform(toMap);
            rects.push([a.x, a.y, b.x, b.y]);
        }
    }
    return rects;
}
// Label block beside a marker at x,y (name line, plus detail line if given), right or left.
export function labelBox(x, y, lines, side = 'right') {
    const width = 26 + 7.5 * Math.max(0, ...lines.map(s => String(s || '').length));
    const bottom = y + (lines.length > 1 ? 24 : 8);
    // Text only, not the icon, so two boats at one dock can label opposite sides.
    return side === 'right' ? [x + 8, y - 14, x + width, bottom] : [x - width, y - 14, x - 8, bottom];
}
export function labelHitsText(rects, x, y, lines, side = 'right') {
    const box = labelBox(x, y, lines, side);
    return box[0] < 0 || box[2] > 1280
        || rects.some(r => box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1]);
}
// Where a marker's labels go, first that is clear of screen text and other labels:
// both lines right, both left, name only right ('right-name'), name only left, else
// 'hidden' (icon only, dimmed). The chosen block is added to `rects` for later markers.
export function labelSide(rects, x, y, lines) {
    const options = [['right', lines], ['left', lines]];
    if (lines.length > 1) options.push(['right-name', lines.slice(0, 1)], ['left-name', lines.slice(0, 1)]);
    for (const [side, used] of options) {
        const edge = side.startsWith('left') ? 'left' : 'right';
        if (labelHitsText(rects, x, y, used, edge)) continue;
        rects.push(labelBox(x, y, used, edge));
        return side;
    }
    return 'hidden';
}
// Apply a placement to a marker group and its label <text>s (gap = distance from the icon).
// The first label is the name; any others are hidden for a '-name' placement.
export function placeLabels(group, labels, side, gap) {
    group.classList.toggle('under-text', side === 'hidden');
    group.classList.toggle('name-only', side.endsWith('-name'));
    const left = side.startsWith('left');
    for (const label of labels) {
        setAttr(label, 'x', left ? -gap : gap);
        setAttr(label, 'text-anchor', left ? 'end' : 'start');
    }
}

function svg(tag, attributes = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    if (parent) parent.append(el);
    return el;
}

export class FlightBackdrop {
    // vessels, trains: optional { layer: VesselLayer | TrainLayer, entity } drawn on the same projection.
    constructor(config, map, status, tally, vessels, trains) {
        Object.assign(this, { config, map, status: status || { textContent: '' }, tally, vessels, trains });
        this.markers = new Map();
        this.layer = map.querySelector('.flights');
        this.layer.replaceChildren();
        this.home = map.querySelector('.home');
        this.home.setAttribute('transform', 'translate(640 480)');
        this.map.setAttribute('aria-label', 'Nearby aircraft from Home Assistant over local street linework');
        // Streets live in their own SVG (#road-map) under this one, with the same viewBox.
        this.roads = document.querySelector('#local-roads');
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
        const mapRequest = fetch(new URL('../data/local-flight-map.json?v=4', import.meta.url))
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
        // Websocket events draw immediately; polling only covers a dead socket
        // (every 10 s) and a slow freshness check while it is live (every 30 s).
        this.timer = setInterval(() => {
            if (this.map.dataset.transport === 'websocket' && Date.now() - (this.lastRefresh || 0) < 30000) return;
            this.refresh();
        }, 10000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            clearInterval(this.timer);
            clearTimeout(this.reconnectTimer);
            for (const item of this.markers.values()) clearTimeout(item.retireTimer);
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
                    platform: 'state', entity_id: [ENTITY, 'switch.flightradar24_api_data_fetching', TALLY_ENTITY,
                        ...[this.vessels, this.trains].filter(Boolean).map(o => o.entity)]
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
        if (this.center && this.box) {
            const [x, y] = project(...this.center, this.box);
            this.home.setAttribute('transform', `translate(${x} ${y})`);
        }
        if (!this.roads || !this.mapData || !this.box) return;
        this.roads.replaceChildren();
        const major = /^(motorway|trunk|primary|secondary|tertiary)/;
        const linework = { water: [], major: [], minor: [], rail: [], light_rail: [] };
        for (const way of this.mapData.ways) {
            const water = /^(water|coastline|river|canal)$/.test(way.kind);
            const points = way.points.map(([lat, lon]) => project(lat, lon, this.box));
            if (points.length < 2) continue;
            linework[water ? 'water' : way.kind in linework ? way.kind : major.test(way.kind) ? 'major' : 'minor'].push(
                'M'+points.map(p => p.map(n => n.toFixed(1)).join(',')).join('L'));
        }
        // Rail is dashed so it never reads as a road: BNSF in long dashes, Link in short ones.
        const look = {
            minor: ['#343b38', .65, .9], major: ['#56605c', 1, .9], water: ['#495b57', 1.2, 1],
            rail: ['#7a6f63', 1.1, 1, '4 3'], light_rail: ['#7a6f63', 1, 1, '2 2'],
        };
        // Rail goes last: the shore line runs right beside the coastline and would vanish under it.
        for (const kind of ['minor', 'major', 'water', 'rail', 'light_rail']) {
            if (!linework[kind].length) continue;
            // Colors here are fallbacks: index.html's --road-* (season, golden hour) override them
            const [stroke, width, opacity, dash] = look[kind];
            svg('path', { class: `road ${kind}`, d: linework[kind].join(''), fill: 'none', stroke,
                'stroke-width': width, 'stroke-opacity': opacity, 'stroke-linejoin': 'round',
                ...(dash ? { 'stroke-dasharray': dash } : {}) }, this.roads);
        }
        this.map.dataset.streets = 'osm';
    }

    fail(error) {
        for (const item of this.markers.values()) clearTimeout(item.retireTimer);
        this.layer.replaceChildren();
        this.markers.clear();
        this.activeAircraftCount = 0;
        this.status.textContent = `Flight feed unavailable (${error.message})`;
        this.map.dataset.feed = 'unavailable';
        this.map.dataset.feedStatus = error.message;
    }

    async refresh() {
        if (document.hidden) return;
        if (this.busy) { this.pendingRefresh = true; return; }
        this.busy = true;
        this.lastRefresh = Date.now();
        try {
            // An unavailable map feed must not erase a valid daily total.
            if (this.tally) {
                try { this.tally.textContent = dailyTallyText(await this.state(TALLY_ENTITY)); }
                catch { this.tally.textContent = ''; }
                this.tally.hidden = !this.tally.textContent;
            }
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
            this.draw(validFlights(state.attributes.flights), updated);
            this.map.dataset.feed = 'live';
            this.map.dataset.sourceUpdated = state.last_updated;
            delete this.map.dataset.feedStatus;
            this.status.textContent = `HA flight snapshot · ${this.activeAircraftCount ?? this.markers.size} aircraft · source updated ${new Date(state.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
        } catch (error) { this.fail(error); }
        finally {
            // Boats then trains, each avoiding the labels placed before it.
            const placed = await this.refreshOverlay(this.vessels, 'vessels', 'boats', this.map.dataset.feed === 'live' && this.placedLabels);
            await this.refreshOverlay(this.trains, 'trains', 'trains', placed);
            this.busy = false;
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                queueMicrotask(() => this.refresh());
            }
        }
    }

    // Boats and trains have their own sensors; a missing or stale one clears only that layer.
    // `taken`: label boxes already placed this refresh (else just the screen text). Returns the
    // boxes taken after this layer's labels, for the next layer.
    async refreshOverlay(overlay, attribute, name, taken) {
        const rects = taken ? [...taken] : screenTextRects(this.map);
        if (!overlay) return rects;
        const { layer, entity } = overlay;
        try {
            if (!this.box) throw new Error('no map box yet');
            const state = await this.state(entity);
            const updated = Date.parse(state.last_updated);
            if (['unknown', 'unavailable'].includes(state.state) || !Number.isFinite(updated)
                || Date.now() - updated > 600000) throw new Error(`${name} feed unavailable`);
            this.map.dataset[name] = layer.draw(state.attributes[attribute], this.box, rects);
        } catch (error) {
            layer.clear();
            this.map.dataset[name] = error.message;
        }
        return rects;
    }

    draw(flights, reportedAt = Date.now()) {
        const active = new Set(), textRects = screenTextRects(this.map);
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
            const returning = item.departed;
            if (returning) {
                clearTimeout(item.retireTimer);
                item.departed = false;
                item.marker.style.display = '';
                item.trails.style.transition = '';
                item.trails.style.opacity = '';
            }
            const previous = item.position;
            if (!previous || returning || previous.x !== x || previous.y !== y) {
                const gap = previous ? reportedAt - previous.reportedAt : 0;
                // Span the observed update cadence, with two seconds of overlap.
                // CSS retargets from the currently displayed position, avoiding
                // the old two-second move followed by eight seconds at rest.
                const duration = !previous || returning || gap > 30000 ? 0
                    : Math.min(32000, Math.max(10000, gap) + 2000);
                item.marker.style.transitionDuration = `${duration}ms`;
                // One visible step per second: a continuous glide repaints the
                // whole SVG every frame, which outpaced the kiosk's charger.
                item.marker.style.transitionTimingFunction = `steps(${Math.max(1, Math.round(duration / 1000))}, end)`;
                item.marker.style.transform = `translate(${x}px, ${y}px)`;
                item.position = { x, y, reportedAt };
            }
            setAttr(item.plane, 'href', String(f.aircraft_category || '').toLowerCase() === 'helicopter' ? '#helicopter' : '#plane');
            const scale = altitudeScale(f.altitude);
            setAttr(item.plane, 'transform', `rotate(${finite(f.heading) ? Number(f.heading) : 0}) scale(${scale.toFixed(3)})`);
            setText(item.label, f.airline_short || f.airline
                || (String(f.aircraft_category || '').toLowerCase() === 'helicopter' ? 'Helicopter' : 'Aircraft'));
            const origin = f.airport_origin_code_iata || f.airport_origin_code_icao;
            const destination = f.airport_destination_code_iata || f.airport_destination_code_icao;
            const route = origin || destination ? `${origin || '?'} → ${destination || '?'}` : '';
            setText(item.route, [route, flightPhase(f, this.center)].filter(Boolean).join(' · '));
            // Leave breathing room between the larger silhouette and its labels.
            placeLabels(item.group, [item.label, item.route],
                labelSide(textRects, x, y, [item.label.textContent, item.route.textContent]), Math.round(22 * Math.max(1, scale)));
            let points = (Array.isArray(f.coordinates) ? f.coordinates : [])
                .filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1]))
                .map(p => project(Number(p[0]), Number(p[1]), this.box));
            // FR24 track arrays can be newest-first. Fade toward the current position.
            const distance = p => Math.hypot(p[0]-x, p[1]-y);
            if (points.length > 1 && distance(points[0]) < distance(points.at(-1))) points.reverse();
            points = points.slice(-45);
            if (!points.length || distance(points.at(-1)) > 1) points.push([x, y]);
            const trailKey = points.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
            if (trailKey === item.trailKey) continue;
            item.trailKey = trailKey;
            item.trails.replaceChildren();
            for (let i = 1; i < points.length; i++) {
                svg('path', { class: 'trail', d: `M${points[i-1].join(',')}L${points[i].join(',')}`, fill: 'none',
                    stroke: '#5fc9b4', 'stroke-width': 1.6, 'stroke-opacity': (.08+.55*i/points.length).toFixed(2) }, item.trails);
            }
        }
        this.activeAircraftCount = active.size;
        this.placedLabels = textRects;
        for (const [id, item] of this.markers) if (!active.has(id)) {
            if (item.departed) continue;
            item.departed = true;
            item.marker.style.display = 'none';
            // Keep only the observed path, fading gently for two minutes.
            item.trails.style.transition = 'opacity 120s steps(120, end)';
            item.trails.style.opacity = '0';
            item.retireTimer = setTimeout(() => {
                if (item.departed && this.markers.get(id) === item) {
                    item.group.remove(); this.markers.delete(id);
                }
            }, 120000);
        }
    }
}
