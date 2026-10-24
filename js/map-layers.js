// Map layer switches: one HA input_boolean per layer ("Wall map planes", ...). Each switch that is
// off puts a hide-* class on <body>; index.html's CSS hides the layer, and the layers that do work
// (boats and trains skip drawing, weather effects stop animating) listen for the 'map-layers'
// event. Own websocket, separate from the flight map's, so the switches keep working if that one
// fails. Without HA (no connection yet, or an unknown switch) every layer shows.
export const LAYERS = {
    'input_boolean.wall_map_planes': 'hide-planes',
    'input_boolean.wall_map_boats': 'hide-boats',
    'input_boolean.wall_map_trains': 'hide-trains',
    'input_boolean.wall_map_streets': 'hide-streets',
    'input_boolean.wall_map_tracks': 'hide-tracks',
    'input_boolean.wall_map_lakes': 'hide-lakes',
    'input_boolean.wall_map_rivers': 'hide-rivers',
    'input_boolean.wall_map_trails': 'hide-trails',
    'input_boolean.wall_map_neighborhoods': 'hide-neighborhoods',
    'input_boolean.wall_map_weather_effects': 'hide-weather',
    'input_boolean.wall_map_sun_and_moon': 'hide-sky',
    'input_boolean.wall_map_traffic_labels': 'hide-labels',
    'input_boolean.wall_map_edge_fade': 'hide-fade',
    'input_boolean.wall_map_road_traffic': 'hide-roads',
    'input_boolean.wall_map_rain_radar': 'hide-radar',
};

export const hidden = layerClass => document.body.classList.contains(layerClass);

// subscribe_entities messages: "a" = full states added, "c" = changes ({ "+": { s } }).
export function statesFrom(event) {
    const out = {};
    for (const [id, s] of Object.entries(event?.a || {})) if (s?.s !== undefined) out[id] = s.s;
    for (const [id, c] of Object.entries(event?.c || {})) if (c?.['+']?.s !== undefined) out[id] = c['+'].s;
    return out;
}

export function apply(states, body = document.body) {
    let changed = false;
    for (const [id, state] of Object.entries(states)) {
        const cls = LAYERS[id];
        if (!cls) continue;
        const hide = state === 'off';
        if (body.classList.contains(cls) !== hide) { body.classList.toggle(cls, hide); changed = true; }
    }
    return changed;
}

export function startMapLayers(config) {
    let stopped = false;
    const connect = () => {
        if (stopped) return;
        const ws = new WebSocket(`${config.haUrl.replace(/^http/, 'ws')}/api/websocket`);
        ws.onmessage = ({ data }) => {
            const m = JSON.parse(data);
            if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: config.longLivedAccessToken }));
            if (m.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, type: 'subscribe_entities', entity_ids: Object.keys(LAYERS) }));
            if (m.type === 'auth_invalid') { stopped = true; ws.close(); }
            if (m.type === 'event' && m.id === 1 && apply(statesFrom(m.event)))
                document.dispatchEvent(new Event('map-layers'));
        };
        ws.onclose = () => { if (!stopped) setTimeout(connect, 5000); };
        ws.onerror = () => ws.close();
    };
    connect();
    window.addEventListener('pagehide', () => { stopped = true; }, { once: true });
}
