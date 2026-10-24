// Family on the flight map: person.* entities (HA companion app GPS), drawn only while away from home
// (the HOME marker covers home). A ring with the initial in the season accent, like HOME, so it reads
// as family, not traffic. Someone beyond the map is pinned to the screen edge toward where they are,
// with miles and an arrow. Moves like the other markers: glides by day, jumps at night.
import { finite, project, labelSide, placeLabels, glide } from './flight-backdrop.js?v=37';

export const FAMILY = ['person.tim', 'person.emily'];
const NS = 'http://www.w3.org/2000/svg';
const EDGE = 30;                                  // pinned markers sit this far inside the screen,
const EDGE_BOTTOM = 14;                           // nearer the bottom: the status line sits just above
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const svg = (tag, attributes, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    parent.append(el);
    return el;
};

export function miles(a, b) {
    const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 7917.5 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function arrowTo(a, b) {
    const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
    const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
    return ARROWS[Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8];
}

// Someone away, from their person state: { id, name, initial, lat, lon, place } or null (home/unknown).
export function personView(state) {
    const a = state?.attributes ?? {};
    if (!state || ['home', 'unknown', 'unavailable'].includes(state.state) || !finite(a.latitude) || !finite(a.longitude)) return null;
    const name = String(a.friendly_name || state.entity_id.split('.')[1]).replace(/^./, c => c.toUpperCase());
    return { id: state.entity_id, name, initial: name[0], lat: Number(a.latitude), lon: Number(a.longitude),
        place: state.state === 'not_home' ? '' : state.state };      // a zone's name, e.g. "Work"
}

// A screen point, or where the line from `from` toward it leaves the screen (inset by EDGE).
export function pinToEdge(from, to) {
    const [x0, y0] = from, [x1, y1] = to, lo = [EDGE, EDGE], hi = [1280 - EDGE, 800 - EDGE_BOTTOM];
    if (x1 >= lo[0] && x1 <= hi[0] && y1 >= lo[1] && y1 <= hi[1]) return { x: x1, y: y1, pinned: false };
    let t = 1;
    for (const [d, p, a, b] of [[x1 - x0, x0, lo[0], hi[0]], [y1 - y0, y0, lo[1], hi[1]]])
        if (d) t = Math.min(t, ((d > 0 ? b : a) - p) / d);
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, pinned: true };
}

export class FamilyLayer {
    constructor(layer) {
        this.layer = layer;
        this.markers = new Map();
        layer.replaceChildren();
    }

    clear() {
        this.layer.replaceChildren();
        this.markers.clear();
    }

    draw(states, box, rects = [], { home, night = false, reportedAt = Date.now() } = {}) {
        const active = new Set();
        const homeXY = home ? project(...home, box) : [640, 480];
        for (const p of (Array.isArray(states) ? states : []).map(personView).filter(Boolean)) {
            active.add(p.id);
            const spot = pinToEdge(homeXY, project(p.lat, p.lon, box));
            let item = this.markers.get(p.id);
            if (!item) {
                const group = svg('g', { class: 'live-person' }, this.layer);
                const marker = svg('g', { class: 'person-marker' }, group);
                svg('circle', { r: 10 }, marker);
                const initial = svg('text', { class: 'person-initial', 'text-anchor': 'middle', y: 4 }, marker);
                const label = svg('text', { x: 16, y: 4 }, marker);
                const detail = svg('text', { x: 16, y: 19, class: 'person-detail' }, marker);
                item = { group, marker, initial, label, detail };
                this.markers.set(p.id, item);
            }
            // People report every few minutes while moving: glide unless the gap is over 10 min.
            glide(item.marker, item, spot.x, spot.y, reportedAt, night, 600000);
            setText(item.initial, p.initial);
            const far = home ? `${Math.round(miles(home, [p.lat, p.lon]))} mi ${arrowTo(home, [p.lat, p.lon])}` : '';
            // Pinned at an edge there is room for one line only: "Emily · 10 mi ↓ · Work".
            setText(item.label, spot.pinned ? [p.name, far, p.place].filter(Boolean).join(' · ') : p.name);
            setText(item.detail, spot.pinned ? '' : p.place || 'Away');
            item.group.classList.toggle('pinned', spot.pinned);
            const lines = [item.label.textContent, item.detail.textContent].filter(Boolean);
            // Pinned at the right edge, the label goes inward.
            placeLabels(item.group, [item.label, item.detail], labelSide(rects, spot.x, spot.y, lines, spot.x > 1000 ? 'left' : 'right'), 16);
        }
        for (const [id, item] of this.markers) if (!active.has(id)) { item.group.remove(); this.markers.delete(id); }
        return active.size;
    }
}
