// Trains on the flight map: reads sensor.nearby_trains (bridges/train-bridge on the Docker
// host polls Amtraker and Sound Transit). Amtrak and Sounder get a locomotive icon and a two-line
// label; Link gets its own locomotive + car icon at the same size and a one-line label ("1 Line").
// By day markers glide between reports like the planes (flight-backdrop.js glide); at night they jump.
import { finite, project, labelSide, placeLabels, glide } from './flight-backdrop.js?v=32';

export const TRAIN_ENTITY = 'sensor.nearby_trains';
const NS = 'http://www.w3.org/2000/svg';
const setAttr = (el, name, value) => { if (el.getAttribute(name) !== String(value)) el.setAttribute(name, value); };
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const svg = (tag, attributes, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    parent.append(el);
    return el;
};

export function validTrains(trains) {
    return (Array.isArray(trains) ? trains : []).filter(t => finite(t.lat) && finite(t.lon)
        && Math.abs(Number(t.lat)) <= 90 && Math.abs(Number(t.lon)) <= 180);
}

// Link: line-only label, placed after Amtrak and Sounder.
export const isLink = t => t.kind === 'link';
const LINK_SCALE = 1.75;   // #link-car is 4.4 × 16.6; Amtrak's #train-car is 8 × 28.5

export class TrainLayer {
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
    // Amtrak and Sounder place first; Link takes the label space that is left.
    // reportedAt: when HA got this list; night: jump instead of gliding.
    draw(trains, box, rects = [], { reportedAt = Date.now(), night = false } = {}) {
        const active = new Set();
        for (const t of validTrains(trains).sort((a, b) => isLink(a) - isLink(b))) {
            const id = String(t.id ?? `${t.lat},${t.lon}`);
            const [x, y] = project(Number(t.lat), Number(t.lon), box);
            if (x < -20 || x > 1300 || y < -20 || y > 820) continue;
            active.add(id);
            const link = isLink(t);
            let item = this.markers.get(id);
            if (!item || item.link !== link) {
                item?.group.remove();
                const group = svg('g', { class: link ? 'live-train link' : 'live-train' }, this.layer);
                const marker = svg('g', { class: 'train-marker' }, group);
                const icon = svg('use', { href: link ? '#link-car' : '#train-car' }, marker);
                const label = svg('text', { x: 18, y: 4 }, marker);
                const detail = svg('text', { x: 18, y: 19, class: 'train-detail' }, marker);
                item = { group, marker, icon, label, detail, link };
                this.markers.set(id, item);
            }
            glide(item.marker, item, x, y, reportedAt, night, 60000);
            // The Link car is drawn small; scaled up it matches the Amtrak/Sounder locomotive.
            const angle = finite(t.heading) ? Math.round(Number(t.heading)) : 0;
            setAttr(item.icon, 'transform', `rotate(${angle})${link ? ` scale(${LINK_SCALE})` : ''}`);
            // Link shows its line only ("1 Line"); the heading shows the direction.
            setText(item.label, t.name || (link ? 'Link' : 'Train'));
            setText(item.detail, link ? '' : String(t.detail || ''));
            const lines = [item.label.textContent, item.detail.textContent].filter(Boolean);
            // 18: the icons are ~29 long, so an east/west train would touch its label at the boats' 16.
            placeLabels(item.group, [item.label, item.detail], labelSide(rects, x, y, lines), 18);
        }
        for (const [id, item] of this.markers) if (!active.has(id)) { item.group.remove(); this.markers.delete(id); }
        return active.size;
    }
}
