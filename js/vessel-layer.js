// Boats on the flight map: reads sensor.nearby_vessels (bridges/vessel-bridge on the
// Docker host joins aisstream.io AIS with WSDOT ferry data). By day markers glide between reports
// like the planes (flight-backdrop.js glide); at night they jump.
import { finite, project, labelSide, placeLabels, glide, trailTo } from './flight-backdrop.js?v=40';

export const VESSEL_ENTITY = 'sensor.nearby_vessels';
const NS = 'http://www.w3.org/2000/svg';
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== String(value)) el.setAttribute(name, value); };
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const svg = (tag, attributes, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    parent.append(el);
    return el;
};

export function validVessels(vessels) {
    return (Array.isArray(vessels) ? vessels : []).filter(v => finite(v.lat) && finite(v.lon)
        && Math.abs(Number(v.lat)) <= 90 && Math.abs(Number(v.lon)) <= 180);
}

// Second label line: the bridge's ferry detail, else the plain type and speed.
export function vesselDetail(v) {
    if (v.detail) return String(v.detail);
    const speed = v.moving && finite(v.speed) ? `${Math.round(Number(v.speed))} kn` : '';
    return [v.label, speed].filter(Boolean).join(' · ');
}

export class VesselLayer {
    constructor(layer) {
        this.layer = layer;
        this.markers = new Map();
        layer.replaceChildren();
    }

    clear() {
        this.layer.replaceChildren();
        this.markers.clear();
    }

    // Labels placed here are added to `rects` (screen text + earlier labels), for the next layer.
    // reportedAt: when HA got this list; night: jump instead of gliding.
    draw(vessels, box, rects = [], { reportedAt = Date.now(), night = false } = {}) {
        const active = new Set();
        // Moving boats claim label space first; docked ferries get what is left.
        for (const v of validVessels(vessels).sort((a, b) => !!b.moving - !!a.moving)) {
            const id = String(v.id ?? `${v.lat},${v.lon}`);
            const [x, y] = project(Number(v.lat), Number(v.lon), box);
            if (x < -20 || x > 1300 || y < -20 || y > 820) continue;
            active.add(id);
            let item = this.markers.get(id);
            if (!item) {
                const group = svg('g', { class: 'live-vessel' }, this.layer);
                const trail = svg('path', { class: 'vessel-trail', fill: 'none' }, group);
                const marker = svg('g', { class: 'vessel-marker' }, group);
                const hull = svg('use', { href: '#hull' }, marker);
                const label = svg('text', { x: 16, y: 4 }, marker);
                const detail = svg('text', { x: 16, y: 19, class: 'vessel-detail' }, marker);
                item = { group, trail, marker, hull, label, detail };
                this.markers.set(id, item);
            }
            item.group.classList.toggle('docked', !v.moving);
            const from = glide(item.marker, item, x, y, reportedAt, night, 60000);
            if (from !== undefined) item.glideFrom = from;
            const angle = finite(v.heading) ? Number(v.heading) : finite(v.course) ? Number(v.course) : 0;
            setAttr(item.hull, 'transform', `rotate(${Math.round(angle)})${v.moving ? '' : ' scale(.75)'}`);
            setText(item.label, v.name || v.label || 'Boat');
            setText(item.detail, vesselDetail(v));
            // A docked boat shows its name only (CSS hides the detail line).
            placeLabels(item.group, [item.label, item.detail],
                labelSide(rects, x, y, v.moving ? [item.label.textContent, item.detail.textContent] : [item.label.textContent]), 16);
            const points = (Array.isArray(v.track) ? v.track : [])
                .filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1]))
                .map(p => project(Number(p[0]), Number(p[1]), box));
            points.push([x, y]);
            const trail = trailTo(points, item.glideFrom, x, y);
            setAttr(item.trail, 'd', trail.length > 1
                ? 'M' + trail.map(p => p.map(n => n.toFixed(1)).join(',')).join('L') : '');
        }
        for (const [id, item] of this.markers) if (!active.has(id)) { item.group.remove(); this.markers.delete(id); }
        return active.size;
    }
}
