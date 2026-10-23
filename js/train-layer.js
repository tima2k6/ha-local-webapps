// Trains on the flight map: reads sensor.nearby_trains (bridges/train-bridge on the Docker
// host polls Amtraker and Sound Transit). Amtrak and Sounder get a car icon and a label; Link
// trains come every few minutes, so they are small unlabelled dots to keep the map quiet.
// Markers jump to each new position: no transitions, keeping the GPU idle.
import { finite, project, labelSide, placeLabels } from './flight-backdrop.js?v=30';

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

// Link is a dot; anything else (Amtrak, Sounder) is a labelled train.
export const isLink = t => t.kind === 'link';

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
    draw(trains, box, rects = []) {
        const active = new Set();
        for (const t of validTrains(trains)) {
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
                const icon = svg('use', { href: link ? '#link-dot' : '#train-car' }, marker);
                item = { group, marker, icon, link };
                if (!link) {
                    item.label = svg('text', { x: 14, y: 4 }, marker);
                    item.detail = svg('text', { x: 14, y: 19, class: 'train-detail' }, marker);
                }
                this.markers.set(id, item);
            }
            setAttr(item.marker, 'transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
            if (link) continue;
            setAttr(item.icon, 'transform', `rotate(${finite(t.heading) ? Math.round(Number(t.heading)) : 0})`);
            setText(item.label, t.name || 'Train');
            setText(item.detail, String(t.detail || ''));
            const lines = [item.label.textContent, item.detail.textContent].filter(Boolean);
            placeLabels(item.group, [item.label, item.detail], labelSide(rects, x, y, lines), 14);
        }
        for (const [id, item] of this.markers) if (!active.has(id)) { item.group.remove(); this.markers.delete(id); }
        return active.size;
    }
}
