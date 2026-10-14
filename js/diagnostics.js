// TEMPORARY (2026-10-14): the kiosk reports what it is actually drawing to
// sensor.screensaver_diagnostics, because desktop renders and the Fully screenshot
// (which shows the main page, not the screensaver) cannot show the tablet's map.
// Remove once the "streets invisible on the tablet" question is settled.
const ENTITY = 'sensor.screensaver_diagnostics';

function framesPerSecond() {
    return new Promise(resolve => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        setTimeout(() => resolve(frames), 1100);
    });
}

async function snapshot() {
    const roads = document.getElementById('local-roads');
    const roadMap = document.getElementById('road-map');
    const map = document.getElementById('flight-map');
    const circle = document.querySelector('#reveal-clip circle');
    const style = el => el ? getComputedStyle(el) : null;
    let bbox = null;
    try { const b = roads.getBBox(); bbox = [b.x, b.y, b.width, b.height].map(n => Math.round(n)); } catch { /* not rendered */ }
    const paths = [...(roads?.children || [])].map(p => ({
        kind: p.getAttribute('class'), dLength: (p.getAttribute('d') || '').length,
        stroke: style(p).stroke, strokeOpacity: style(p).strokeOpacity, strokeWidth: style(p).strokeWidth,
    }));
    return {
        at: new Date().toISOString(),
        visibility: document.visibilityState, focus: document.hasFocus(),
        rafPerSecond: await framesPerSecond(),
        viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
        bodyClass: document.body.className,
        streets: map?.dataset.streets, feed: map?.dataset.feed, feedStatus: map?.dataset.feedStatus, boats: map?.dataset.boats,
        planes: document.querySelectorAll('.live-aircraft').length,
        roadMapOpacity: style(roadMap)?.opacity, roadMapDisplay: style(roadMap)?.display,
        roadsClip: roads?.getAttribute('clip-path'), revealRadius: circle?.getAttribute('r') ?? null,
        roadsFilter: style(roads)?.filter, roadsBBox: bbox, paths,
        userAgent: navigator.userAgent.slice(0, 160),
    };
}

export function startDiagnostics(config) {
    const send = async reason => {
        try {
            const s = await snapshot();
            await fetch(`${config.haUrl}/api/states/${ENTITY}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.longLivedAccessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: reason, attributes: { friendly_name: 'Screensaver diagnostics', ...s } }),
            });
        } catch (e) { console.error('diagnostics', e); }
    };
    setTimeout(() => send('load'), 8000);
    setInterval(() => send('minute'), 60000);
    new MutationObserver(() => setTimeout(() => send('layout ' + (document.body.classList.contains('night') ? 'night' : 'day')), 9000))
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => send('visibility ' + document.visibilityState));
}
