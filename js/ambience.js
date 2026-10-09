// ambience.js — mood, not information (2026-10-09).
// The season's accent color, golden hour on the map, weather you can feel (rain,
// snow, fog), the streets drawing in each morning, small holiday touches and
// household birthdays, and a faint sun/moon arc across the top.
// Celebration lines (birthdays, holidays) reach the insights through lines(now).
//
// Preview by URL:
//   ?season=winter|spring|summer|fall   ?golden=1   ?reveal=1
//   ?mood=rain|pouring|snow|fog         ?holiday=halloween|july4|thanksgiving|christmas|newyear
//   ?occasion=Liam (a household birthday) or ?occasion=anniversary

const CALENDAR = 'calendar.family';
// Their birthdays tint the clock and get a "Happy birthday" line; anyone else's
// birthday is already in the agenda.
const HOUSEHOLD = ['Liam', 'Emily', 'Tim', 'Zoey'];

// Accent by season (meteorological: Dec, Mar, Jun, Sep). Fall is copper, not
// amber: amber already means "needs attention" on this screen.
const SEASON = { winter: '#7fb2e5', spring: '#93cf7e', summer: '#5fc9b4', fall: '#dd9566' };
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'];
const BLEND_DAYS = 10;            // a new season's color eases in over its first ten days

// Golden hour: the street lines warm toward amber before sunset, then fade back
const GOLD = '#e3a14f';
const GOLDEN = { before: 45, after: 25 };    // minutes around sunset
const ROAD = { minor: '#343b38', major: '#56605c', water: '#495b57' };
const ROAD_WARMTH = { minor: 0.4, major: 0.5, water: 0.3 };

// Night layout window, same as screensaver.js
const DAY_STARTS = 6 * 60 + 15, NIGHT_STARTS = 22 * 60;

const params = new URLSearchParams(globalThis.location?.search || '');
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const smooth = t => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);

// ===== Colors =====
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };

export function seasonAccent(now, forced) {
    if (SEASON[forced]) return SEASON[forced];
    const month = now.getMonth(), season = SEASON[SEASON_OF[month]];
    if (month % 3 !== 2 || now.getDate() > BLEND_DAYS) return season;   // Mar, Jun, Sep, Dec start a season
    const before = SEASON[SEASON_OF[(month + 11) % 12]];
    return mix(before, season, smooth((now.getDate() - 1 + now.getHours() / 24) / BLEND_DAYS));
}

// 0..1: how golden the map is at `now`, given today's sunset
export function goldenness(now, set) {
    if (!set) return 0;
    const d = (now - set) / 60e3;
    if (d < -GOLDEN.before || d > GOLDEN.after) return 0;
    return smooth(d < 0 ? 1 + d / GOLDEN.before : 1 - d / GOLDEN.after);
}

// ===== Holidays =====
function thanksgiving(year) {                 // fourth Thursday of November
    const d = new Date(year, 10, 1);
    return 1 + ((4 - d.getDay() + 7) % 7) + 21;
}
export function holidayOf(now) {
    const m = now.getMonth() + 1, d = now.getDate();
    if (m === 10 && d >= 24) return 'halloween';
    if (m === 7 && d === 4) return 'july4';
    if (m === 11 && d === thanksgiving(now.getFullYear())) return 'thanksgiving';
    if (m === 12 && (d === 24 || d === 25)) return 'christmas';
    if (m === 1 && d === 1) return 'newyear';
    return null;
}
// Only on the day itself, not the week of Halloween or Christmas Eve
function holidayLine(holiday, now) {
    const m = now.getMonth() + 1, d = now.getDate();
    if (holiday === 'halloween' && d === 31) return ['celebrate', 'moon', 'Happy Halloween'];
    if (holiday === 'july4') return ['celebrate', 'sparkle', 'Happy Fourth of July'];
    if (holiday === 'thanksgiving') return ['celebrate', 'sparkle', 'Happy Thanksgiving'];
    if (holiday === 'christmas' && d === 25) return ['celebrate', 'sparkle', 'Merry Christmas'];
    if (holiday === 'newyear') return ['celebrate', 'sparkle', 'Happy New Year'];
    return null;
}

// "Sam’s birthday", "Liz bday", "Mason's Birthday" -> the name; "Anniversary" -> 'anniversary'
export function occasionOf(summary) {
    const s = String(summary || '').trim();
    if (/^(our\s+)?anniversary$/i.test(s)) return 'anniversary';
    const b = s.match(/^(.+?)(?:[’']s?)?\s+(?:birthday|bday)\b/i);
    return b ? b[1].trim() : null;
}

// ===== Sun/moon arc =====
// How far through the day (sun) or the night (moon) it is, along a faint arc across
// the top. Not the sun's real altitude; the moon is drawn in tonight's real phase.
const ARC = { cx: 640, cy: 150, rx: 600, ry: 125 };   // the top band, above the date and agenda
const arcPoint = f => [ARC.cx - ARC.rx * Math.cos(Math.PI * f), ARC.cy - ARC.ry * Math.sin(Math.PI * f)];
// 0 = new moon, .5 = full (mean synodic month from the 2000-01-06 new moon; within a day)
export const moonAge = now => ((((now - Date.UTC(2000, 0, 6, 18, 14)) / 86400e3) % 29.530589) + 29.530589) % 29.530589 / 29.530589;

function moonPath(p, r) {                                // waxing p (< .5)
    const k = Math.cos(2 * Math.PI * p);                // 1 at new, -1 at full
    const rx = (r * Math.abs(k)).toFixed(2);
    const crescent = k > 0;
    return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${crescent ? 0 : 1} 0 ${-r}Z`;   // lit on the right
}

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.append(el);
    return el;
}
const hmShort = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]\.?M\.?$/i, '');

class SkyArc {
    constructor(screen, before) {
        this.el = svg('svg', { id: 'sky', viewBox: '0 0 1280 800', 'aria-hidden': 'true' });
        screen.insertBefore(this.el, before);
        const defs = svg('defs', {}, this.el);
        const g = svg('radialGradient', { id: 'sky-glow' }, defs);
        svg('stop', { offset: '0', 'stop-color': '#ffe2a0', 'stop-opacity': '.45' }, g);
        svg('stop', { offset: '1', 'stop-color': '#ffe2a0', 'stop-opacity': '0' }, g);
        const [x0, y0] = arcPoint(0), [x1, y1] = arcPoint(1);
        svg('path', { class: 'arc-track', d: `M${x0} ${y0}A${ARC.rx} ${ARC.ry} 0 0 1 ${x1} ${y1}` }, this.el);
        this.done = svg('path', { class: 'arc-done' }, this.el);
        this.from = svg('text', { class: 'arc-time', x: x0, y: y0 + 26, 'text-anchor': 'middle' }, this.el);
        this.to = svg('text', { class: 'arc-time', x: x1, y: y1 + 26, 'text-anchor': 'middle' }, this.el);
        this.body = svg('g', { class: 'arc-body' }, this.el);
    }

    update(now, rise, set, warm) {
        if (!rise || !set) { this.el.style.display = 'none'; return; }
        this.el.style.display = '';
        const day = now >= rise && now <= set;
        // The night runs from the last sunset to the next sunrise (today's times, a day apart near enough)
        const start = day ? rise : now > set ? set : new Date(set - 86400e3);
        const end = day ? set : now > set ? new Date(+rise + 86400e3) : rise;
        const f = Math.min(1, Math.max(0, (now - start) / (end - start)));
        const [x, y] = arcPoint(f), [x0, y0] = arcPoint(0);
        this.done.setAttribute('d', f > 0.002 ? `M${x0} ${y0}A${ARC.rx} ${ARC.ry} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}` : '');
        this.from.textContent = hmShort(start);
        this.to.textContent = hmShort(end);
        this.el.classList.toggle('moon', !day);
        this.body.replaceChildren();
        this.body.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        if (day) {
            svg('circle', { r: 30, fill: 'url(#sky-glow)' }, this.body);
            svg('circle', { r: 8, class: 'sun', fill: mix('#f6d98a', '#f0a050', warm) }, this.body);
        } else {
            const p = moonAge(now), r = 9;
            svg('circle', { r: r + .5, class: 'moon-dark' }, this.body);
            const lit = moonPath(p < 0.5 ? p : 1 - p, r);
            const path = svg('path', { d: lit, class: 'moon-lit' }, this.body);
            if (p >= 0.5) path.setAttribute('transform', 'scale(-1 1)');   // waning: lit on the left
        }
    }
}

// ===== Mood canvas: rain, snow, and the holiday flourishes =====
const MOOD_OF = { rainy: 'rain', 'lightning-rainy': 'rain', hail: 'rain', pouring: 'pouring', snowy: 'snow', 'snowy-rainy': 'snow', fog: 'fog' };
const FPS = 30;

class Mood {
    constructor(screen, before) {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'mood';
        this.canvas.setAttribute('aria-hidden', 'true');
        screen.insertBefore(this.canvas, before);
        this.ctx = this.canvas.getContext('2d');
        this.kind = null;
        this.drops = [];
        this.fx = [];
        this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        new ResizeObserver(() => this.resize()).observe(this.canvas);
        document.addEventListener('visibilitychange', () => this.wake());
    }

    resize() {
        const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
        this.canvas.width = Math.max(1, Math.round(r.width * dpr));
        this.canvas.height = Math.max(1, Math.round(r.height * dpr));
        this.scale = this.canvas.width / 1280;
    }

    set(kind) {
        document.body.classList.toggle('mood-fog', kind === 'fog');
        const k = kind === 'fog' ? null : kind;
        if (k === this.kind) return;
        this.kind = k;
        const n = { rain: 45, pouring: 90, snow: 55 }[k] || 0;
        this.drops = Array.from({ length: n }, () => this.drop(true));
        this.wake();
    }

    drop(anywhere) {
        const snow = this.kind === 'snow';
        return {
            x: rand(-120, 1300), y: anywhere ? rand(-40, 820) : rand(-60, -20),
            v: snow ? rand(.35, .9) : rand(6, 9.5) * (this.kind === 'pouring' ? 1.25 : 1),
            len: rand(16, 30), r: rand(1, 2.4), ph: rand(0, 6.28)
        };
    }

    add(effect) { this.fx.push({ t0: performance.now(), ...effect }); this.wake(); }

    active() {
        const night = document.body.classList.contains('night');
        return !document.hidden && !this.still
            && ((this.drops.length && !night) || this.fx.some(f => !night || f.night));
    }

    wake() {
        if (this.running || !this.active()) return;
        this.running = true;
        let last = 0;
        const frame = t => {
            if (!this.active()) { this.running = false; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); return; }
            requestAnimationFrame(frame);
            if (t - last < 1000 / FPS - 2) return;
            last = t;
            this.draw(t);
        };
        requestAnimationFrame(frame);
    }

    draw(t) {
        const c = this.ctx, night = document.body.classList.contains('night');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
        c.setTransform(this.scale, 0, 0, this.scale, 0, 0);

        if (this.drops.length && !night) {
            c.beginPath();
            if (this.kind === 'snow') {
                for (const d of this.drops) {
                    d.y += d.v; d.x += Math.sin(t / 1600 + d.ph) * .35;
                    if (d.y > 820) Object.assign(d, this.drop(false));
                    c.moveTo(d.x + d.r, d.y); c.arc(d.x, d.y, d.r, 0, 6.283);
                }
                c.fillStyle = 'rgba(235,240,245,.34)';
                c.fill();
            } else {
                for (const d of this.drops) {
                    d.y += d.v; d.x += d.v * .18;
                    if (d.y > 840) Object.assign(d, this.drop(false));
                    c.moveTo(d.x, d.y); c.lineTo(d.x - d.len * .18, d.y - d.len);
                }
                c.strokeStyle = `rgba(190,205,215,${this.kind === 'pouring' ? .2 : .15})`;
                c.lineWidth = 1.2;
                c.stroke();
            }
        }

        const now = performance.now();
        this.fx = this.fx.filter(f => now - f.t0 < f.dur);
        for (const f of this.fx) {
            if (night && !f.night) continue;
            const p = (now - f.t0) / f.dur;
            if (f.type === 'bat') this.bat(c, f, p, t);
            else if (f.type === 'burst') this.burst(c, f, p, night);
            else if (f.type === 'confetti') this.confetti(c, f, now);
        }
    }

    // A small silhouette crossing the map on a lazy wave, flapping
    bat(c, f, p, t) {
        const x = f.left ? 1340 - p * 1420 : -60 + p * 1420;
        const y = f.y + Math.sin(p * Math.PI * 3) * 36;
        const flap = Math.sin(t / 70) * 7, s = f.left ? -1 : 1;
        const a = Math.min(1, p * 8, (1 - p) * 8) * .5;
        c.save();
        c.translate(x, y); c.scale(s * 1.3, 1.3);
        c.fillStyle = `rgba(160,160,160,${a})`;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(-7, -4 - flap, -16, -flap * 1.4);
        c.quadraticCurveTo(-10, 1, -6, 3);
        c.quadraticCurveTo(-3, 2, 0, 4);
        c.quadraticCurveTo(3, 2, 6, 3);
        c.quadraticCurveTo(10, 1, 16, -flap * 1.4);
        c.quadraticCurveTo(7, -4 - flap, 0, 0);
        c.fill();
        c.restore();
    }

    // A soft firework: sparks spread, sag and fade
    burst(c, f, p, night) {
        const e = 1 - Math.pow(1 - p, 3), a = (1 - p) * (night ? .35 : .55);
        c.fillStyle = f.color.replace('A', a.toFixed(3));
        c.beginPath();
        for (let i = 0; i < 34; i++) {
            const ang = i / 34 * 6.283 + f.spin;
            const x = f.x + Math.cos(ang) * f.r * e, y = f.y + Math.sin(ang) * f.r * e + p * p * 40;
            c.moveTo(x + 1.6, y); c.arc(x, y, 1.6, 0, 6.283);
        }
        c.fill();
    }

    // A gentle shower of paper, a few dozen pieces, for half a minute
    confetti(c, f, now) {
        f.bits ??= Array.from({ length: 36 }, () => ({ x: rand(0, 1280), y: rand(-400, -10), v: rand(.6, 1.2),
            w: rand(4, 7), h: rand(2, 4), rot: rand(0, 6.28), spin: rand(-.05, .05), color: f.colors[Math.floor(rand(0, f.colors.length))] }));
        const fade = Math.min(1, (f.dur - (now - f.t0)) / 3000);
        for (const b of f.bits) {
            b.y += b.v; b.rot += b.spin; b.x += Math.sin(b.y / 60) * .3;
            c.save();
            c.translate(b.x, b.y); c.rotate(b.rot);
            c.globalAlpha = .4 * fade;
            c.fillStyle = b.color;
            c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 2)));
            c.restore();
        }
    }
}

// ===== Morning reveal: the streets draw outward from home when the day layout returns =====
function reveal() {
    const map = document.getElementById('flight-map'), roads = map?.querySelector('#local-roads');
    if (!roads || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let circle = map.querySelector('#reveal-clip circle');
    if (!circle) {
        const clip = svg('clipPath', { id: 'reveal-clip' }, map.querySelector('defs'));
        circle = svg('circle', { cx: 640, cy: 480, r: 0 }, clip);
    }
    roads.setAttribute('clip-path', 'url(#reveal-clip)');
    const t0 = performance.now(), DUR = 6500;
    const step = t => {
        const p = Math.min(1, (t - t0) / DUR);
        circle.setAttribute('r', (1 - Math.pow(1 - p, 3)) * 1150);
        if (p < 1) requestAnimationFrame(step);
        else roads.removeAttribute('clip-path');
    };
    requestAnimationFrame(step);
}

// ===== The conductor =====
export class Ambience {
    constructor(config) {
        this.haUrl = config.haUrl;
        this.token = config.longLivedAccessToken;
        this.forced = {
            season: params.get('season'), golden: params.has('golden'),
            mood: params.get('mood'), holiday: params.get('holiday'), occasion: params.get('occasion')
        };
        this.occasions = [];
        this.sun = null;
        this.cond = null;
    }

    async template(tpl) {
        const r = await fetch(`${this.haUrl}/api/template`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: tpl })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return JSON.parse(await r.text());
    }

    async refreshSky() {
        try {
            const d = await this.template(`{{ {'rise': state_attr('sun.sun', 'next_rising'), 'set': state_attr('sun.sun', 'next_setting'),
                'cond': states('weather.forecast_home')} | tojson }}`);
            this.sun = { rise: d.rise && new Date(d.rise), set: d.set && new Date(d.set) };
            this.cond = d.cond;
        } catch (e) { console.error('Ambience:', e); }
        this.tick();
    }

    async refreshOccasions() {
        try {
            const a = new Date(); a.setHours(0, 0, 0, 0);
            const b = new Date(a); b.setDate(b.getDate() + 1);
            const r = await fetch(`${this.haUrl}/api/calendars/${CALENDAR}?start=${a.toISOString()}&end=${b.toISOString()}`,
                { headers: { Authorization: `Bearer ${this.token}` } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const today = dayKey(new Date());
            this.occasions = (await r.json())
                .filter(ev => ev.start.date && dayKey(new Date(`${ev.start.date}T00:00:00`)) === today)
                .map(ev => occasionOf(ev.summary)).filter(Boolean);
        } catch (e) { console.error('Ambience calendar:', e); }
        this.tick();
    }

    // Today's sunrise and sunset (sun.sun only has the next ones; a day off is near enough)
    today(now) {
        if (!this.sun?.rise || !this.sun?.set) return {};
        let { rise, set } = this.sun;
        if (dayKey(rise) !== dayKey(now)) rise = new Date(rise - 86400e3);
        if (dayKey(set) !== dayKey(now)) set = new Date(set - 86400e3);
        return { rise, set };
    }

    holiday(now) { return this.forced.holiday || holidayOf(now); }

    // The household occasion today, if any: a name, or 'anniversary'
    occasion() {
        const list = this.forced.occasion ? [this.forced.occasion] : this.occasions;
        return list.find(o => o.toLowerCase() === 'anniversary' || HOUSEHOLD.some(h => h.toLowerCase() === o.toLowerCase())) || null;
    }

    // Insight lines: pinned celebrations (tone 'celebrate')
    lines(now = new Date()) {
        const out = [], o = this.occasion();
        if (o) out.push(o.toLowerCase() === 'anniversary' ? ['celebrate', 'heart', 'Happy anniversary']
            : ['celebrate', 'cake', `Happy birthday, <b>${esc(o.charAt(0).toUpperCase() + o.slice(1))}</b>`]);
        const h = holidayLine(this.holiday(now), now);
        if (h) out.push(h);
        return out;
    }

    tick() {
        const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
        const root = document.documentElement.style;
        const { rise, set } = this.today(now);

        const accent = seasonAccent(now, this.forced.season);
        const warm = this.forced.golden ? 1 : goldenness(now, set);
        root.setProperty('--accent', accent);
        root.setProperty('--accent-border', mix(accent, '#0c0c0c', .55));
        root.setProperty('--plane', mix(accent, '#ffffff', .3));
        root.setProperty('--map-label', mix(accent, '#9a9a9a', .55));
        root.setProperty('--map-route', mix(accent, '#7a7a7a', .6));
        for (const k of Object.keys(ROAD)) root.setProperty(`--road-${k}`, mix(ROAD[k], GOLD, warm * ROAD_WARMTH[k]));

        const o = this.occasion();
        document.body.classList.toggle('celebrate', !!o);
        root.setProperty('--celebrate', mix('#f2f2f2', accent, .55));

        this.arc?.update(now, rise, set, warm);
        this.mood.set(this.forced.mood || MOOD_OF[this.cond] || (this.holiday(now) === 'christmas' ? 'snow' : null));
        this.flourish(now, m, set, o);
    }

    // Holiday and birthday touches, each rare: checked every minute, scheduled at random
    // gaps. A previewed holiday or birthday plays at once and every half minute.
    flourish(now, m, set, occasion) {
        if (Date.now() < (this.nextFx || 0)) return;
        const preview = !!(this.forced.holiday || this.forced.occasion);
        const day = m >= DAY_STARTS && m < NIGHT_STARTS, holiday = this.holiday(now);
        const later = (a, b) => { this.nextFx = Date.now() + (preview ? .5 : rand(a, b)) * 60e3; };
        if (holiday === 'halloween' && (preview || set && now > set - 3600e3 && day)) {
            this.mood.add({ type: 'bat', dur: 9000, y: rand(140, 520), left: Math.random() < .5 });
            later(15, 30);
        } else if (holiday === 'july4' && (preview || m >= 21 * 60 && day)) {
            this.fireworks(['rgba(217,102,91,A)', 'rgba(236,236,236,A)', 'rgba(111,143,216,A)'], false);
            later(2, 4);
        } else if (holiday === 'newyear' && (preview || m < 10)) {       // the first minutes of the year, on the night clock
            this.fireworks(['rgba(243,207,122,A)', 'rgba(236,236,236,A)'], true);
            later(.5, 1);
        } else if (occasion && occasion.toLowerCase() !== 'anniversary'
            && (preview || day && (now.getMinutes() === 0 || m === DAY_STARTS))) {   // on the hour, and as the day starts
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fc9b4';
            this.mood.add({ type: 'confetti', dur: 30000, colors: [accent, '#f3cf7a', '#e8e8e8', '#e38f9c'] });
            later(2, 2);
        }
    }

    fireworks(colors, night) {
        for (let i = 0; i < 3; i++) setTimeout(() => this.mood.add({ type: 'burst', dur: 2600, night,
            x: rand(240, 1040), y: rand(90, 360), r: rand(55, 85), spin: rand(0, 1),
            color: colors[Math.floor(rand(0, colors.length))] }), i * rand(500, 1100));
    }

    start() {
        const screen = document.getElementById('screen'), top = document.getElementById('top');
        const map = document.getElementById('flight-map');
        // Above the map, below the edge vignette (#screen::before) and the text
        this.mood = new Mood(screen, map.nextSibling);
        this.arc = new SkyArc(screen, top);

        // Streets draw in from home when the day layout comes back in the morning
        let night = document.body.classList.contains('night');
        new MutationObserver(() => {
            const now = document.body.classList.contains('night');
            if (night && !now) reveal();
            night = now;
            this.mood.wake();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (params.has('reveal')) setTimeout(reveal, 1500);

        this.refreshSky(); this.refreshOccasions();
        setInterval(() => this.refreshSky(), 300000);
        setInterval(() => this.refreshOccasions(), 1800000);
        setInterval(() => this.tick(), 60000);
        return this;
    }
}
