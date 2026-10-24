// Highway congestion on the flight map: reads sensor.road_traffic (bridges/traffic-bridge on the
// Docker host polls WSDOT's Traffic Flow stations on I-5, I-405, SR-522, SR-9 and SR-525). Each
// stretch of those roads in the map cache (ways carry their OSM `ref`) belongs to the nearest station
// on the same road and direction; only stretches reading moderate or worse are drawn, in one muted
// red that gets bolder with the level, so free-flowing roads stay plain.
import { finite, project } from './flight-backdrop.js?v=36';

export const ROAD_TRAFFIC_ENTITY = 'sensor.road_traffic';
const NS = 'http://www.w3.org/2000/svg';
const REACH_M = 900;              // a stretch this far from every station of its road stays plain
const DIRECTION = { NB: 0, EB: 90, SB: 180, WB: 270 };

const metres = (a, b) => Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));
const bearing = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360;
const turn = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

// Which station each stretch (way segment) belongs to: { stationId: [[lat, lon], [lat, lon]][] }.
// One-way carriageways only take stations of their own direction; two-way roads take either.
export function assignSegments(ways, stations, reach = REACH_M) {
    const byRef = new Map();
    for (const s of stations) if (finite(s.lat) && finite(s.lon)) {
        if (!byRef.has(s.ref)) byRef.set(s.ref, []);
        byRef.get(s.ref).push(s);
    }
    const out = {};
    for (const way of Array.isArray(ways) ? ways : []) {
        const candidates = way.ref && byRef.get(way.ref);
        if (!candidates) continue;
        for (let i = 1; i < way.points.length; i++) {
            const a = way.points[i - 1], b = way.points[i], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const heading = bearing(a, b);
            let best = null, bestD = reach;
            for (const s of candidates) {
                if (way.oneway && s.dir in DIRECTION && turn(heading, DIRECTION[s.dir]) >= 90) continue;
                const d = metres(mid, [s.lat, s.lon]);
                if (d < bestD) { best = s; bestD = d; }
            }
            if (best) (out[best.id] ??= []).push([a, b]);
        }
    }
    return out;
}

export class RoadTrafficLayer {
    constructor(layer) {
        this.layer = layer;
        this.paths = new Map();       // stationId -> <path>
        layer.replaceChildren();
    }

    clear() {
        this.layer.replaceChildren();
        this.paths.clear();
        this.key = null;
    }

    // Station positions don't move, so the stretches are assigned once per map (or station set).
    draw(stations, box, rects = [], { mapData } = {}) {
        const list = Array.isArray(stations) ? stations : [];
        const key = `${box.join(',')}|${list.length}|${mapData?.ways?.length}`;
        if (key !== this.key) {
            this.key = key;
            this.layer.replaceChildren();
            this.paths.clear();
            const parts = assignSegments(mapData?.ways, list);
            for (const [id, segments] of Object.entries(parts)) {
                const d = segments.map(([a, b]) => `M${project(...a, box).map(n => n.toFixed(1)).join(',')}L${project(...b, box).map(n => n.toFixed(1)).join(',')}`).join('');
                const path = document.createElementNS(NS, 'path');
                path.setAttribute('d', d);
                this.paths.set(id, path);
            }
        }
        let slow = 0;
        for (const s of list) {
            const path = this.paths.get(s.id);
            if (!path) continue;
            const level = Number(s.level) >= 2 && Number(s.level) <= 4 ? Number(s.level) : 0;
            if (level) {
                slow++;
                const cls = `lvl-${level}`;
                if (path.getAttribute('class') !== cls) path.setAttribute('class', cls);
                if (!path.isConnected) this.layer.append(path);
            } else if (path.isConnected) path.remove();
        }
        return slow;
    }
}
