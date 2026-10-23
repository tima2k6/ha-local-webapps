const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = file => import(pathToFileURL(path.join(__dirname, '../js', file)).href);

test('train list keeps only real positions; Link is told apart from Amtrak and Sounder', async () => {
    const { validTrains, isLink } = await load('train-layer.js');
    const kept = validTrains([{ id: 'a', lat: 47.76, lon: -122.32 }, { id: 'b', lat: null, lon: -122.3 },
        { id: 'c', lat: 47.8, lon: 200 }, { id: 'd', lat: '47.81', lon: '-122.38' }]);
    assert.deepEqual(kept.map(t => t.id), ['a', 'd']);
    assert.equal(validTrains(undefined).length, 0);
    assert.equal(isLink({ kind: 'link' }), true);
    assert.equal(isLink({ kind: 'amtrak' }), false);
    assert.equal(isLink({ kind: 'sounder' }), false);
});

test('each season has its own fixed plane, boat and train colours, with boats and trains far apart', () => {
    const fs = require('node:fs');
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const hue = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    const apart = (a, b) => Math.abs(((hue(a) - hue(b)) % 360 + 540) % 360 - 180);
    for (const season of ['winter', 'spring', 'summer', 'fall']) {
        const rule = new RegExp(String.raw`\[data-season=${season}\]\{--plane:(#[0-9a-f]{6});--boat:(#[0-9a-f]{6});--train:(#[0-9a-f]{6})\}`).exec(html);
        assert.ok(rule, `no colour row for ${season}`);
        const [, plane, boat, train] = rule;
        // Dimmed on the map, hues 60° apart blurred together (fall mint vs sky blue, 2026-10-23).
        assert.ok(apart(boat, train) >= 80, `${season}: boat ${boat} and train ${train} too alike`);
        assert.ok(new Set([plane, boat, train]).size === 3, season);
    }
    // The season is picked on the page itself, not by ambience.js.
    assert.match(html, /dataset\.season\s*=/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../js/ambience.js'), 'utf8'), /setProperty\('--(plane|boat|train)'/);
});

test('labels placed by one layer are kept clear by the next', async () => {
    const { labelSide } = await load('flight-backdrop.js');
    // A boat label lands right of 600,300; a train at the same spot must go left, not on top.
    const taken = [];
    assert.equal(labelSide(taken, 600, 300, ['Walla Walla', 'Ferry']), 'right');
    assert.equal(labelSide(taken, 600, 300, ['Cascades 516', 'To Vancouver BC']), 'left');
});

test('markers glide by day in half-second steps, jump at night, on first sight and after a long gap', async () => {
    const { glide } = await load('flight-backdrop.js');
    const el = { style: {} }, item = {};
    assert.equal(glide(el, item, 100, 100, 0), null);                     // first sight: placed, no glide
    assert.equal(el.style.transitionDuration, '0ms');
    assert.deepEqual(glide(el, item, 110, 100, 15000, false, 60000), { x: 100, y: 100, reportedAt: 0 });
    assert.equal(el.style.transitionDuration, '17000ms');                 // gap + 2 s overlap
    assert.equal(el.style.transitionTimingFunction, 'steps(34, end)');    // two steps a second
    assert.equal(el.style.transform, 'translate(110px, 100px)');
    assert.equal(glide(el, item, 110, 100, 25000), undefined);            // same spot: the glide carries on
    assert.equal(glide(el, item, 120, 100, 40000, true), null);           // night: jump
    assert.equal(el.style.transitionDuration, '0ms');
    assert.equal(glide(el, item, 130, 100, 75000, false, 30000), null);   // 35 s gap is long for a plane
    assert.equal(glide(el, item, 600, 100, 85000), null);                 // a big jump never glides across the map
});

test('a gliding marker\'s trail stops where the glide starts: no line ahead of the icon', async () => {
    const { trailTo } = await load('flight-backdrop.js');
    const points = [[0, 0], [10, 0], [20, 0], [25, 0], [30, 0]];         // oldest first, ends at the new spot
    assert.deepEqual(trailTo(points, { x: 20, y: 0 }, 30, 0), [[0, 0], [10, 0], [20, 0], [20, 0]]);
    assert.deepEqual(trailTo(points, null, 30, 0), points);               // not gliding: trail as is
});

test('in HSM Night the map refreshes at most once a minute, but always on wake or an HSM change', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(__dirname, '../js/flight-backdrop.js'), 'utf8');
    assert.match(src, /const HSM_ENTITY = 'sensor\.hub_hsm_status'/);
    assert.match(src, /const NIGHT_REFRESH_MS = 60000/);
    assert.match(src, /if \(this\.night && !force && Date\.now\(\) - \(this\.lastRefresh \|\| 0\) < NIGHT_REFRESH_MS\) return;/);
    assert.match(src, /visibilitychange', \(\) => \{ if \(!document\.hidden\) this\.refresh\(true\); \}/);
    assert.match(src, /this\.refresh\(message\.event\?\.variables\?\.trigger\?\.entity_id === HSM_ENTITY\)/);
    assert.match(src, /this\.night = hsm\?\.state === 'armedNight'/);
});
