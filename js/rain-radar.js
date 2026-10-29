// Rain radar on the flight map: the NWS NEXRAD mosaic (Iowa State Mesonet's n0q WMS, no key,
// CORS open, rebuilt every 5 min) fetched for exactly the map's box, in the same plain lat/lon
// layout as the map, so it needs no tile maths. Recoloured on a canvas to one soft tone: the radar's
// rainbow scale (grey noise -> blue -> green -> yellow -> red -> magenta) becomes opacity, so heavy
// rain is more solid, not a new colour. A faint wash plus short slanted streaks, so it reads as
// rain and not cloud (2026-10-24). Nothing is drawn when there is no rain. No animation.
const URL_BASE = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi';
const REFRESH_MS = 5 * 60e3;
const SIZE = [640, 400];                       // half the map's 1280 x 800: radar is coarse anyway
const TONE = [207, 227, 242];                  // pale blue-white
const WASH = .4;                               // the soft fill under the streaks

// Short streaks slanting like falling rain, on a staggered grid with a fixed jitter (the same every
// refresh, so the pattern never shimmers). Drawn once; each radar image cuts it to where it rains.
function streaks() {
    const c = document.createElement('canvas');
    [c.width, c.height] = SIZE;
    const g = c.getContext('2d');
    g.strokeStyle = `rgb(${TONE})`;
    g.lineWidth = 1;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = 0, row = 0; y < SIZE[1] + 8; y += 7, row++) {
        for (let x = (row % 2) * 4; x < SIZE[0] + 8; x += 8) {
            const j = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const jx = (j - Math.floor(j)) * 4 - 2, jy = (j * 7 - Math.floor(j * 7)) * 3;
            g.moveTo(x + jx, y + jy);
            g.lineTo(x + jx - 1.6, y + jy + 5);
        }
    }
    g.stroke();
    return c;
}

export function radarUrl(box, size = SIZE) {
    const [south, west, north, east] = box;
    const q = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'nexrad-n0q-900913', STYLES: '',
        SRS: 'EPSG:4326', BBOX: [west, south, east, north].join(','), WIDTH: size[0], HEIGHT: size[1], FORMAT: 'image/png', TRANSPARENT: 'TRUE' });
    return `${URL_BASE}?${q}`;
}

// One radar pixel -> alpha 0..255 for the soft tone. Grey (low saturation) and the scale's slate blue
// (hue 198-280°: clear-air, insects, below anything that falls; 2026-10-24 a clear night showed
// 31k slate and steel-blue pixels as haze) are dropped. Rain starts at cyan: the hue sets the strength,
// cyan (~190°) light, red (0°) heavy, magenta/purple (>280°) heaviest.
export function rainAlpha(r, g, b, a) {
    if (a < 40) return 0;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0 || d / max < .3) return 0;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h >= 198 && h <= 280) return 0;
    const strength = h > 280 ? 1 : Math.max(0, Math.min(1, (198 - h) / 198));
    return Math.round(255 * (.18 + .62 * strength));
}

export class RainRadar {
    // image: the <img id="rain-radar"> under #flight-map, its own layer so the gliding markers never
    // repaint it (2026-10-29: inside the map SVG it drained the tablet on wet days); getBox: the map's
    // current [south, west, north, east].
    constructor(image, getBox) {
        Object.assign(this, { image, getBox });
        this.canvas = document.createElement('canvas');
        [this.canvas.width, this.canvas.height] = SIZE;
        // Radar cells are ~1 km, hard-edged blocks at this scale: soften them once per image here
        // (a CSS blur on the live layer would repaint with every glide step).
        this.soft = document.createElement('canvas');
        [this.soft.width, this.soft.height] = SIZE;
        this.streaks = streaks();
        this.rain = document.createElement('canvas');
        [this.rain.width, this.rain.height] = SIZE;
    }

    hidden() { return document.body.classList.contains('hide-radar'); }

    start() {
        const tick = () => this.refresh();
        setTimeout(tick, 3000);                    // let the map find its box first
        setInterval(tick, REFRESH_MS);
        document.addEventListener('map-layers', tick);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        return this;
    }

    async refresh() {
        const box = this.getBox();
        if (!box || document.hidden) return;
        if (this.hidden()) { this.show(null); return; }
        try {
            const response = await fetch(radarUrl(box), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bitmap = await createImageBitmap(await response.blob());
            const c = this.canvas.getContext('2d', { willReadFrequently: true });
            c.clearRect(0, 0, ...SIZE);
            c.drawImage(bitmap, 0, 0, ...SIZE);
            const img = c.getImageData(0, 0, ...SIZE), px = img.data;
            let rain = 0;
            for (let i = 0; i < px.length; i += 4) {
                const alpha = rainAlpha(px[i], px[i + 1], px[i + 2], px[i + 3]);
                if (alpha) rain++;
                px[i] = TONE[0]; px[i + 1] = TONE[1]; px[i + 2] = TONE[2]; px[i + 3] = alpha;
            }
            if (!rain) { this.show(null); return; }        // dry: leave the map untouched
            c.putImageData(img, 0, 0);
            // Streaks cut to the rain (lightly softened edges), heavier rain = brighter streaks
            const streak = this.rain.getContext('2d');
            streak.globalCompositeOperation = 'source-over';
            streak.clearRect(0, 0, ...SIZE);
            streak.filter = 'blur(1.5px)';
            streak.drawImage(this.canvas, 0, 0);
            streak.filter = 'none';
            streak.globalCompositeOperation = 'source-in';
            streak.drawImage(this.streaks, 0, 0);
            const soft = this.soft.getContext('2d');
            soft.clearRect(0, 0, ...SIZE);
            soft.filter = 'blur(5px)';
            soft.globalAlpha = WASH;
            soft.drawImage(this.canvas, 0, 0);
            soft.filter = 'none';
            soft.globalAlpha = 1;
            soft.drawImage(this.rain, 0, 0);
            this.show(this.soft.toDataURL('image/png'), rain);
        } catch (error) {
            this.show(null);
            this.image.dataset.radar = error.message;
        }
    }

    show(dataUrl, rain = 0) {
        if (dataUrl) this.image.src = dataUrl;
        else this.image.removeAttribute('src');
        this.image.dataset.radar = dataUrl ? `${rain} px` : 'dry';
    }
}
