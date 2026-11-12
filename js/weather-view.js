// weather-view.js — touch mode only (index.html?touch=1): tapping the weather turns the
// clock/weather/insights/agenda into a full weather view over the same map: now, the next
// 24 hours (temperature line, rain bars, wind) and the next 7 days. While it is open the map's
// rain radar and wind come forward and the traffic fades. Done or a minute untouched closes it.
// Data: weather.forecast_home (met.no, NWS backup) — rain AMOUNTS, no chance-of-rain.
// Static on purpose: drawn once per open, nothing animates (screensaver power budget).

import { weatherIcon as icon, weatherLabel as label } from './screensaver.js?v=54';

const WEATHER = 'weather.forecast_home';
const AQI = 'sensor.u_s_air_quality_index';
const SUN = 'sun.sun';
const IDLE_MS = 60000;
const HOURS = 24, DAYS = 7;
const WET = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy', 'snowy-rainy', 'hail']);
const RAIN_FULL = 0.15;       // in/hour that fills a rain bar (heavy rain)

const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hr = d => d.toLocaleTimeString([], { hour: 'numeric' }).replace(':00', '');
const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = deg => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const inches = v => v >= 0.995 ? `${v.toFixed(1)} in` : v >= 0.05 ? `${v.toFixed(2).replace(/^0/, '')} in` : v > 0 ? 'trace' : '';
const aqiWord = v => v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Poor for some' : v <= 200 ? 'Unhealthy' : 'Very unhealthy';
// An arrow pointing where the wind blows TO (bearing is where it comes FROM)
const arrow = (deg, x, y, size) => `<g transform="translate(${x} ${y}) rotate(${(deg + 180) % 360})"><path d="M0 ${-size} L${size * .55} ${size * .45} L0 ${size * .15} L${-size * .55} ${size * .45}Z" fill="currentColor"/></g>`;
// The shared weather icon, placed inside the chart's SVG
const iconAt = (cond, x, y, size) => icon(cond).replace('<svg ', `<svg x="${x - size / 2}" y="${y}" width="${size}" height="${size}" `);

export class WeatherView {
    constructor(config, el) {
        Object.assign(this, { haUrl: config.haUrl, token: config.longLivedAccessToken, el });
        this.isOpen = false;
        el.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('[data-act="done"]')) this.close(); });
        el.addEventListener('pointerdown', () => this.poke(), true);
    }

    async api(path, body) {
        const r = await fetch(`${this.haUrl}/api/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
    }

    open() {
        this.isOpen = true;
        document.body.classList.add('weather-open');
        this.el.innerHTML = '<div class="wv-loading">Loading the forecast…</div>';
        this.poke();
        this.load();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        clearTimeout(this.idle);
        document.body.classList.remove('weather-open');
        this.el.innerHTML = '';
        this.onClose && this.onClose();      // ?back=1 (opened from the dashboard's weather card): back to the dashboard
    }

    poke() {
        clearTimeout(this.idle);
        if (this.isOpen) this.idle = setTimeout(() => this.close(), IDLE_MS);
    }

    async load() {
        try {
            const fc = type => this.api('services/weather/get_forecasts?return_response', { entity_id: WEATHER, type })
                .then(r => r.service_response?.[WEATHER]?.forecast || []);
            const [cur, hourly, daily, aqi, sun] = await Promise.all([
                this.api(`states/${WEATHER}`), fc('hourly'), fc('daily'),
                this.api(`states/${AQI}`).catch(() => null), this.api(`states/${SUN}`).catch(() => null)]);
            if (!this.isOpen) return;
            this.render(cur, hourly, daily, aqi, sun);
        } catch (e) {
            console.error('Weather view:', e);
            if (this.isOpen) this.el.innerHTML = `<div class="wv-loading">Couldn’t load the forecast</div>
                <button class="wv-done" data-act="done">Done</button>`;
        }
    }

    render(cur, hourly, daily, aqi, sun) {
        // ?wx_offset=N (preview): start the hourly chart N hours later, e.g. to see rain bars on a dry day
        const offset = Number(new URLSearchParams(location.search).get('wx_offset')) || 0;
        const now = new Date(Date.now() + offset * 3600e3), a = cur.attributes || {};
        const hours = hourly.map(h => ({ ...h, t: new Date(h.datetime) }))
            .filter(h => h.t > new Date(now.getTime() - 3600e3)).slice(0, HOURS);
        const days = daily.map(d => ({ ...d, t: new Date(d.datetime) })).slice(0, DAYS);
        const today = days.find(d => dayKey(d.t) === dayKey(now));

        // ===== Now =====
        const stats = [];
        if (typeof a.wind_speed === 'number') stats.push(['Wind', `${Math.round(a.wind_speed)} mph${typeof a.wind_bearing === 'number' ? ' ' + compass(a.wind_bearing) : ''}`]);
        if (typeof a.humidity === 'number') stats.push(['Humidity', `${Math.round(a.humidity)}%`]);
        const aqiV = parseFloat(aqi?.state);
        if (Number.isFinite(aqiV)) stats.push(['Air quality', `${Math.round(aqiV)} · ${aqiWord(aqiV)}`]);
        const rise = sun?.attributes?.next_rising && new Date(sun.attributes.next_rising);
        const set = sun?.attributes?.next_setting && new Date(sun.attributes.next_setting);
        // Whichever comes next first
        const sunStats = [[rise, 'Sunrise'], [set, 'Sunset']].filter(([d]) => d).sort((x, y) => x[0] - y[0]);
        for (const [d, k] of sunStats) stats.push([k, hm(d)]);
        const nowHtml = `<div class="wv-now">
                <div class="wv-main">
                    <div class="wv-icon">${icon(cur.state)}</div>
                    <div class="wv-temp">${Math.round(a.temperature)}°</div>
                    <div class="wv-cond">
                        <div class="wv-label">${esc(label(cur.state))}</div>
                        ${today ? `<div class="wv-hilo">H ${Math.round(today.temperature)}° · L ${Math.round(today.templow)}°</div>` : ''}
                    </div>
                </div>
                <div class="wv-stats">${stats.map(([k, v]) => `<div class="wv-stat"><div class="wv-k">${esc(k)}</div><div class="wv-v">${esc(v)}</div></div>`).join('')}</div>
            </div>`;

        // ===== Next 24 hours =====
        const wet = hours.filter(h => (h.precipitation || 0) > 0 || WET.has(h.condition));
        let summary = 'Dry for the next 24 hours';
        if (wet.length) {
            const peak = wet.reduce((p, h) => (h.precipitation || 0) > (p.precipitation || 0) ? h : p, wet[0]);
            const last = hr(new Date(wet[wet.length - 1].t.getTime() + 3600e3));
            summary = (wet[0].t <= now ? `Rain until about ${last}` : `Rain ${hr(wet[0].t)} – ${last}`)
                + ((peak.precipitation || 0) >= 0.02 ? ` · heaviest around ${hr(peak.t)}` : ' · light');
        }
        const W = 676, H = 300, X0 = 26, X1 = W - 26;
        const xs = i => X0 + i * (X1 - X0) / Math.max(1, hours.length - 1);
        const temps = hours.map(h => h.temperature);
        const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(4, hi - lo);
        const ty = v => 196 - (v - lo) / span * 82;                       // temperature line between y 114 and 196
        let chart = '';
        hours.forEach((h, i) => {
            const x = xs(i);
            const p = Math.min(1, (h.precipitation || 0) / RAIN_FULL);
            if (p > 0) chart += `<rect class="wv-rain" x="${x - 9}" y="${262 - Math.max(3, p * 44)}" width="18" height="${Math.max(3, p * 44)}" rx="2"/>`;
            if (i % 3) return;
            chart += `<text class="wv-t" x="${x}" y="18" text-anchor="middle">${i === 0 ? 'Now' : esc(hr(h.t))}</text>`;
            chart += `<g class="wv-ic">${iconAt(h.condition, x, 28, 34)}</g>`;
            chart += `<text class="wv-deg" x="${x}" y="${ty(h.temperature) - 12}" text-anchor="middle">${Math.round(h.temperature)}°</text>`;
            if (typeof h.wind_speed === 'number') chart += `<g class="wv-wind">${typeof h.wind_bearing === 'number' ? arrow(h.wind_bearing, x - 12, 284, 7) : ''}<text x="${x - 2}" y="290">${Math.round(h.wind_speed)}</text></g>`;
        });
        const line = hours.map((h, i) => `${xs(i).toFixed(1)},${ty(h.temperature).toFixed(1)}`).join(' ');
        chart = `<polyline class="wv-line" points="${line}"/>` + hours.map((h, i) => i % 3 ? '' : `<circle class="wv-dot" cx="${xs(i)}" cy="${ty(h.temperature)}" r="3.5"/>`).join('') + chart
            + `<line class="wv-base" x1="${X0 - 14}" y1="262.5" x2="${X1 + 14}" y2="262.5"/>`;
        const hoursHtml = `<div class="wv-hours">
                <div class="wv-head"><span>Next 24 hours</span><span class="wv-sum${wet.length ? ' wet' : ''}">${esc(summary)}</span></div>
                <svg class="wv-chart" viewBox="0 0 ${W} ${H}" aria-label="Hourly forecast">${chart}</svg>
            </div>`;

        // ===== Next 7 days =====
        const dLo = Math.min(...days.map(d => d.templow ?? d.temperature)), dHi = Math.max(...days.map(d => d.temperature));
        const dSpan = Math.max(1, dHi - dLo);
        const rainOf = d => typeof d.precipitation === 'number' ? d.precipitation
            : hourly.filter(h => dayKey(new Date(h.datetime)) === dayKey(d.t)).reduce((s, h) => s + (h.precipitation || 0), 0);
        const rows = days.map((d, i) => {
            const low = d.templow ?? d.temperature, l = (low - dLo) / dSpan * 100, w = Math.max(4, (d.temperature - low) / dSpan * 100);
            const name = i === 0 && dayKey(d.t) === dayKey(now) ? 'Today' : d.t.toLocaleDateString([], { weekday: 'short' });
            return `<div class="wv-day">
                    <div class="wv-dn">${esc(name)}</div>
                    <div class="wv-di">${icon(d.condition)}</div>
                    <div class="wv-lo">${Math.round(low)}°</div>
                    <div class="wv-track"><div class="wv-range" style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></div></div>
                    <div class="wv-hi">${Math.round(d.temperature)}°</div>
                    <div class="wv-dr">${esc(inches(rainOf(d)))}</div>
                </div>`;
        }).join('');
        const daysHtml = `<div class="wv-days">
                <div class="wv-head"><span>Next ${days.length} days</span><span class="wv-sum">rain</span></div>
                <div class="wv-rows">${rows}</div>
                <button class="wv-done" data-act="done">Done</button>
            </div>`;

        this.el.innerHTML = nowHtml + hoursHtml + daysHtml;
    }
}
