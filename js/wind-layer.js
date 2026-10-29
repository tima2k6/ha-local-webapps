// Wind on the flight map: a few faint streaks over open water, pointing the way the wind blows,
// longer when it is stronger, from the home weather entity (met.no, updated about hourly). One small
// label gives the numbers. Calm (under 3 mph) draws nothing. Static: redrawn only when it changes.
import { finite, project, labelSide, placeLabels } from './flight-backdrop.js?v=41';

export const WIND_ENTITY = 'weather.forecast_home';
const NS = 'http://www.w3.org/2000/svg';
// Open water, picked by hand: Puget Sound between Kitsap and the east shore, and Lake Washington.
export const WATER = [[47.84, -122.43], [47.80, -122.44], [47.76, -122.44], [47.72, -122.45],
    [47.78, -122.48], [47.74, -122.48], [47.705, -122.255], [47.68, -122.25]];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Weather attributes -> { from (degrees the wind comes from), mph } or null.
export function windOf(attrs) {
    const from = Number(attrs?.wind_bearing), speed = Number(attrs?.wind_speed);
    if (!finite(attrs?.wind_bearing) || !finite(attrs?.wind_speed)) return null;
    const unit = String(attrs.wind_speed_unit || 'mph').toLowerCase();
    const mph = unit.startsWith('km') ? speed / 1.609 : unit === 'm/s' ? speed * 2.237 : unit.startsWith('kn') ? speed * 1.151 : speed;
    const deg = from % 360;                       // (x + 360) % 360 would turn 240.8 into 240.79999...
    return { from: deg < 0 ? deg + 360 : deg, mph };
}

// A streak centred on x,y, blowing toward `to` degrees (screen y is down), with a small head.
export function streak(x, y, to, length) {
    const r = to * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r), h = length / 2;
    const tail = [x - dx * h, y - dy * h], head = [x + dx * h, y + dy * h];
    const side = (s) => [head[0] - dx * 5 + s * dy * 3.5, head[1] - dy * 5 - s * dx * 3.5];
    const f = p => p.map(n => n.toFixed(1)).join(',');
    return `M${f(tail)}L${f(head)}M${f(side(1))}L${f(head)}L${f(side(-1))}`;
}

export class WindLayer {
    constructor(layer) {
        this.layer = layer;
        layer.replaceChildren();
    }

    clear() {
        this.layer.replaceChildren();
        this.key = null;
    }

    draw(attrs, box, rects = []) {
        const wind = windOf(attrs);
        if (!wind || wind.mph < 3) { this.clear(); return 0; }
        const to = (wind.from + 180) % 360, length = Math.min(50, 14 + wind.mph * 1.6);
        const words = `Wind ${COMPASS[Math.round(wind.from / 45) % 8]} ${Math.round(wind.mph)} mph`;
        const points = WATER.map(([lat, lon]) => project(lat, lon, box)).filter(([x, y]) => x > 20 && x < 1260 && y > 20 && y < 780);
        const key = `${box.join(',')}|${to.toFixed(0)}|${length.toFixed(0)}|${words}`;
        if (key !== this.key) {
            this.key = key;
            this.layer.replaceChildren();
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('class', 'wind-streaks');
            path.setAttribute('d', points.map(([x, y]) => streak(x, y, to, length)).join(''));
            this.layer.append(path);
            if (points.length) {
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('transform', `translate(${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)})`);
                const label = document.createElementNS(NS, 'text');
                label.setAttribute('class', 'wind-label');
                label.setAttribute('y', 4);
                label.textContent = words;
                g.append(label);
                this.layer.append(g);
                placeLabels(g, [label], labelSide(rects, ...points[0], [words]), length / 2 + 6);
            }
        }
        return points.length;
    }
}
