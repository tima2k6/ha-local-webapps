// Commutes on the flight map: the drive to work (weekdays, before leaving) and back home (once at work),
// drawn as a soft dashed line in the family accent with one label: "Emily · 8 min to work". The route
// shapes come from data/commute-routes.json (tools/fetch-commute-routes.py: OSRM, via King's); the
// live minutes from the Waze sensors in HA. WSDOT congestion (road-traffic.js) shows on the highway
// parts. Same timing as the commute lines under the weather (screensaver.js COMMUTES). Both go through
// King's (drop-off, pickup), so the minutes are the Waze legs added up.
import { finite, project, labelSide, placeLabels } from './flight-backdrop.js?v=39';

const NS = 'http://www.w3.org/2000/svg';
const STALE_MS = 15 * 60e3;
export const COMMUTES = [{
    person: 'person.emily', name: 'Emily', zone: 'zone.emily_s_hotel', zoneName: "Emily's Hotel",
    // Before she leaves: weekday mornings at home, like the "Emily: N minutes to work" line.
    toWork: { legs: ['sensor.waze_kings_commute', 'sensor.waze_kings_to_hotel'], from: 6 * 60 + 30, until: 8 * 60, normal: 16 },
    // At the hotel from 3:30 PM: the drive home.
    toHome: { legs: ['sensor.waze_hotel_to_kings', 'sensor.waze_kings_to_home'], from: 15 * 60 + 30, until: 24 * 60, normal: 16 },
}];
export const COMMUTE_ENTITIES = [...new Set(COMMUTES.flatMap(c => [c.person, ...c.toWork.legs, ...c.toHome.legs]))];

const weekend = d => d.getDay() === 0 || d.getDay() === 6;

// Which leg (if any) to show for one commute right now: { key, leg, toWork }. `preview` ('emily',
// 'emily-work') forces one, like the screensaver's ?commute_preview=.
export function activeLeg(c, states, now = new Date(), preview = null) {
    const person = states[c.person]?.state, m = now.getHours() * 60 + now.getMinutes();
    const name = c.name.toLowerCase();
    const toWork = preview === name || (!preview && !weekend(now) && person === 'home' && m >= c.toWork.from && m < c.toWork.until);
    const toHome = preview === `${name}-work` || (!preview && !weekend(now) && person === c.zoneName && m >= c.toHome.from && m < c.toHome.until);
    if (toWork) return { key: `zone.home>${c.zone}`, leg: c.toWork, toWork: true };
    if (toHome) return { key: `${c.zone}>zone.home`, leg: c.toHome, toWork: false };
    return null;
}

// "Emily · 16 min to work", "Emily · 24 min home · heavy traffic", or without minutes when any leg is
// missing or stale. `sensors`: the legs' states.
export function legLabel(c, leg, toWork, sensors, now = Date.now()) {
    const ok = sensors.length > 0 && sensors.every(s => finite(s?.state) && Number(s.state) > 0);
    const minutes = ok ? sensors.reduce((sum, s) => sum + Number(s.state), 0) : NaN;
    const age = ok ? Math.max(...sensors.map(s => now - Date.parse(s.last_reported || s.last_updated))) : Infinity;
    const fresh = ok && age >= 0 && age < STALE_MS;
    const heavy = fresh && minutes - leg.normal >= 5 && minutes >= leg.normal * 1.3;
    return [c.name, fresh ? `${Math.round(minutes)} min ${toWork ? 'to work' : 'home'}` : toWork ? 'to work' : 'home', heavy && 'heavy traffic']
        .filter(Boolean).join(' · ');
}

export class CommuteLayer {
    constructor(layer) {
        this.layer = layer;
        this.preview = new URLSearchParams(globalThis.location?.search || '').get('commute_preview');
        this.routes = null;
        fetch(new URL('../data/commute-routes.json?v=1', import.meta.url))
            .then(r => r.ok ? r.json() : null).then(d => { this.routes = d?.routes || null; }).catch(() => {});
        layer.replaceChildren();
    }

    clear() {
        this.layer.replaceChildren();
        this.key = null;
    }

    draw(list, box, rects = []) {
        const states = Object.fromEntries((Array.isArray(list) ? list : []).map(s => [s.entity_id, s]));
        const shown = [];
        for (const c of COMMUTES) {
            const active = activeLeg(c, states, new Date(), this.preview);
            const points = active && this.routes?.[active.key];
            if (points?.length > 1) shown.push({ c, ...active, points, label: legLabel(c, active.leg, active.toWork, active.leg.legs.map(id => states[id])) });
        }
        const key = `${box.join(',')}|${shown.map(s => `${s.key}:${s.label}`).join('|')}`;
        if (key === this.key) return shown.length;
        this.key = key;
        this.layer.replaceChildren();
        for (const s of shown) {
            const xy = s.points.map(([lat, lon]) => project(lat, lon, box));
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('class', 'commute-route');
            path.setAttribute('d', 'M' + xy.map(p => p.map(n => n.toFixed(1)).join(',')).join('L'));
            this.layer.append(path);
            // Label at the route's middle (its ends already have HOME and the family marker).
            const [x, y] = xy[Math.floor(xy.length / 2)];
            const g = document.createElementNS(NS, 'g');
            g.setAttribute('class', 'commute-mark');
            g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
            const text = document.createElementNS(NS, 'text');
            text.setAttribute('y', 4);
            text.textContent = s.label;
            g.append(text);
            this.layer.append(g);
            placeLabels(g, [text], labelSide(rects, x, y, [s.label]), 10);
        }
        return shown.length;
    }
}
