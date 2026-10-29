# HA Local Webapps

> **Where to edit:** change pages in this folder on Tim's PC, then run `./deploy.sh`. The copies on the file server (192.168.2.119) and inside Home Assistant (`config/www/webapps`) get overwritten by every deploy. See `READ ME FIRST - where to edit.txt`.

A collection of locally-hosted vanilla JS/HTML web apps for Home Assistant automation and display control. Served from an nginx web server on a Proxmox LXC at 192.168.2.119. All apps communicate directly with the HA REST API and MQTT broker.

---

## Apps

### 1. Liam's Bedtime (`bedtime.html`)

A mobile-optimized bedtime routine control panel. The primary interface for managing the phase-based bedtime routine system integrated across Home Assistant, Liam's Clock (ESP32-S3), and the LED Matrix Panel.

**Features:**
- Live phase display with MM:SS countdown timer (client-side tick, synced from HA every 2 seconds)
- Start / Skip / Pause / Resume / Cancel controls with confirmation dialog for cancel
- Drag-and-drop phase reordering (touch and mouse) with per-phase enable/disable toggles
- Per-phase duration steppers (Warning, Jammies, Books, Snuggle 1, Snuggle 2)
- Jump-to-phase selector
- Auto-start toggle with scheduled start time and live countdown to next start
- Liam's Clock screen on/off toggle
- Step dot progress indicator
- Starfield background, animated moon glow, amber/dark theme
- Saves phase order and slot configuration back to HA `input_select` helpers

**HA Entities Used:**
- `input_select.bedtime_routine_phase` — current phase
- `input_datetime.bedtime_phase_ends` — phase end timestamp
- `input_text.bedtime_pause_seconds` — pause state
- `sensor.bedtime_phase_time_remaining` — remaining seconds
- `input_boolean.bedtime_routine_enabled` — auto-start toggle
- `input_datetime.bedtime_routine_start_time` — scheduled start time
- `input_boolean.bedtime_warning_enabled` — warning phase toggle
- `input_number.bedtime_warning_delay` — warning duration (minutes)
- `input_number.bedtime_ready_delay` / `winddown_delay` / `snuggle1_delay` / `snuggle2_delay` — phase durations
- `input_select.bedtime_slot_2` through `slot_5` — phase order slots
- `input_select.bedtime_phase_request` — jump-to-phase
- `light.liams_clock_screen` — Liam's Clock display control
- Scripts: `bedtime_routine_start`, `bedtime_routine_skip_to_next_2`, `bedtime_routine_pause_2`, `bedtime_routine_resume_2`, `bedtime_routine_cancel_2`

---

### 2. LED Panel Control Center (`led-panel.html`)

A full control panel and live mirror for the 128×64 HUB75 LED matrix scoreboard. Displays a real-time canvas preview of the panel's current state and provides controls for all panel features.

**Features:**
- Live canvas mirror of the panel at 2.5-second sync intervals — renders idle clock, Zags scoreboard, Mariners scoreboard, bedtime, and message modes
- Message designer: text input, 8-color palette + custom color picker, text size (small/medium/large), image/icon selector (14 options)
- "Push to Display" sends color/size/image/text via MQTT in the correct order (attributes before text to prevent render flash)
- Display mode override buttons (Auto, Clock, Message, Notification, Zags, Mariners, Bedtime)
- Active screen toggles (Zags, Mariners)
- Freeze/unfreeze cycle, skip screen
- Per-screen duration steppers (Clock, Bedtime, Message, Mariners, Zags) — 5–120 second range
- Brightness slider
- Effects card: switch off score celebrations, weather icon animation, high/low cycling, message corner glow or the alert border flash without removing them
- Panel power on/off
- ESP32 reboot button
- Syncs all state from HA helpers and MQTT sensors on load and every 2.5 seconds

**HA Entities Used:**
- `sensor.led_matrix_panel_display_mode` — current mode from MQTT discovery
- `input_boolean.panel_power`, `input_boolean.panel_freeze_cycle`
- `input_boolean.show_zags_screen`, `input_boolean.show_mariners_screen`
- `input_number.panel_brightness`
- `input_select.panel_mode_override`
- `input_text.panel_message_input`
- `input_number.panel_message_red/green/blue`
- `input_select.panel_message_image`, `input_select.panel_message_size`
- `input_number.panel_duration_message/zags/idle/bedtime/mariners`
- `sensor.zags`, `weather.forecast_home` (condition and temperature)
- `input_datetime.mariners_opening_day`
- `input_boolean.panel_fx_celebrations|weather_animation|high_low_cycle|message_glow|alert_flash` — Effects card; the HA automation "Panel MQTT — Effects" relays them to `house/panel/fx/*`

**MQTT Topics Published:**
- `house/panel/message/red|green|blue|size|image|text`
- `house/panel/skip`, `house/panel/reboot`

---

### 3. HA Dashboard Screensaver (`index.html`)

A touchless fullscreen screensaver for the wall-mounted Galaxy Tab A9+ ("Quiet Hours" design). Dark neutral background, local street linework and nearby aircraft behind the clock, weather, agenda and status. Everything is sized from a 1280×800 layout to fit the 16:10 Galaxy Tab A9+ (1920×1200) and scales to any screen.

**Layout:**
- Left: date, clock (hour and minute, no seconds) and below it the weather: now plus today's high/low and tomorrow from `weather.forecast_home` (met.no, the same source as the LED panel)
- Right: the next three `calendar.family` events, each time above its name
- Bottom: static status tags from the ticker's sensors (Zoey's feeding, open windows and doors, trash night), centered, on exactly the old ticker's conditions: teal when routine, amber or red when something needs attention; running Alexa/Google Home timers on the right
- Night (10:00 PM to 6:15 AM, fixed times in `js/screensaver.js`, not the sun): a dim clock and the temperature replace the weather and agenda; tags and timers show as by day
- Burn-in guard: the whole layout shifts by up to ~12 px every 3 minutes

**Home insights:** daytime insights suggest closing a specific window or exterior door only when there is a reason: poor air, precipitation, strong wind, active heating/cooling in its room, heating paused by window detection, both adults away, or prolonged opening in cold weather (30 minutes, at most 50°F outside and at least 65°F inside). Physical contacts are explicitly listed in `HOME_OPENINGS`; interior doors, pet flaps and thermostat proxy sensors are excluded. Windows have a 15-minute grace period, front/patio doors 5 minutes. Unknown presence never counts as away. Snapshots older than two minutes suppress these insights; each qualifying insight appears for three minutes per half-hour and clears when closed. These lines rotate with other insights and follow the existing daytime layout.

**Flight backdrop:**
- The official tablet URL is `http://192.168.2.119/?v=20261012-weather-no-dot`. There are no tablet controls.
- After deploying, restart the tablet's screensaver (`switch.tim_s_tab_a9_screensaver` off, then on). It is a Fully Kiosk screensaver with its own long-lived page; `button.tim_s_tab_a9_load_start_url` only reloads the main page (the HA dashboard). Confirm in `/var/log/nginx/access.log` on .119 that 192.168.2.163 fetched the new `?v=` files.
- Existing HA Flightradar24 sensor updates every 10 seconds. WebSocket events redraw immediately; a 10-second fallback checks freshness. Aircraft glide continuously toward reported positions over the observed update interval plus two seconds of overlap (normally 12 seconds). Each update retargets from the currently displayed position; duplicate positions do not restart movement. First sightings, re-entry, and recovery after long gaps appear at the reported position immediately. This introduces a small display delay; positions are not extrapolated.
- Airline names replace flight numbers, with origin–destination airport codes beneath. If the airline is unknown, the label reads Aircraft or Helicopter. After an aircraft leaves, its icon and label disappear while its last observed trail fades out over two minutes; re-entry resumes its live marker. Helicopters identified by the feed use a helicopter silhouette with a distinct cabin, overhead rotor, tail boom, and landing skids; other aircraft use the airplane silhouette. Both rotate with heading and share the same styling and trails. Route labels and the medium-size HOME house icon and its left-side label use stronger contrast while retaining the quiet map styling. Local flight cues appear beside the route only when enough data is available: descending at least 300 ft/min below 12,000 ft toward a nearby destination yields Arriving; climbing at least 300 ft/min below 15,000 ft within 20 minutes of an actual departure yields Departing. The airport must be within 80 km of home and the aircraft within 60 km of that airport. These are inferred flight phases, not landing-time predictions. Icons scale smoothly with reported altitude: 1.6x at or below 1,000 ft, 1x at 10,000 ft, and 0.8x at or above 30,000 ft. Unknown altitude uses normal size. This uses reported altitude above sea level, not terrain clearance; labels retain their size and move aside for larger icons. Stale positions or paused tracking clear the aircraft.
- A slightly brighter muted "aircraft today" tally sits at the bottom-left and dims further at night. `sensor.flightradar24_planes_today` counts unique airborne flight IDs observed within the 8 km circle around home, independently of the tablet. Its trigger template in `ha/flight-daily-tally.yaml` is installed beneath HA's existing `template:` section; state and IDs are restored across HA restarts and reset on the local calendar day. Tracking outages cannot count unseen flights. Counting began on October 10, 2026 at about 8:21 PM Pacific, so that first day is partial. Update `radius_m` and the distance threshold together if the configured FR24 radius changes.
- Verify the tally with `python tools/verify-flight-tally.py` (read-only HA template fixtures), `node --test tests/flight-backdrop.test.cjs tests/screensaver-entry.test.cjs`, and `node tools/verify-flight-screensaver.mjs` (live day/night browser renders). The tablet screensaver URL is now `http://192.168.2.119/?v=20261012-weather-no-dot`.
- Local streets are cached in `data/local-flight-map.json`; refresh them with `python tools/fetch-flight-map.py`. The cache contains the home coordinates and is gitignored; deploy it locally after generating it. OpenStreetMap attribution appears on the display.
- Boats (`js/vessel-layer.js`) come from `sensor.nearby_vessels`, published by `vessel-bridge` on the Docker host (led-panel-workspace `bridges/vessel-bridge/`: aisstream.io AIS + WSDOT ferries). Only moving boats and docked ferries (dimmed) are drawn; boats jump between positions with no animation. The layer clears itself if the sensor is missing or older than 10 minutes, without touching the planes.
- Trains (`js/train-layer.js`) come from `sensor.nearby_trains`, published by `train-bridge` on the Docker host (led-panel-workspace `bridges/train-bridge/`: Amtraker + Sound Transit GTFS-realtime, no keys). Amtrak and Sounder are a labelled locomotive (`#train-car`: one body with a windshield and a car seam) rotated to their heading; Link trains are a locomotive + car (`#link-car`, scaled to the same size), also rotated, labelled with the line only ("1 Line"); they place their labels after Amtrak and Sounder. (Briefly small, dim and unlabelled; the user wanted them stronger, 2026-10-23.) Icons picked by the user 2026-10-23 (options "C" and "Link 4"). Labels place after planes and boats. No BNSF freight (no public feed). The rail lines themselves come from the map cache (`rail` = BNSF, long dashes; `light_rail` = Link, short dashes), drawn above the water so the shore line doesn't vanish under the coastline.
- Motion (2026-10-23): planes, boats and trains glide between reports in half-second steps (`glide()` in `js/flight-backdrop.js`, `GLIDE_STEP_MS`; one step a second was the safe rate after the 10/11 battery drain, two a second is on trial). A gliding marker's trail stops where its glide starts, so no line runs ahead of the icon. While HSM is armedNight (`sensor.hub_hsm_status`) markers jump and the map refreshes at most once a minute; waking the screen or an HSM change always refreshes at once.
- Layer switches (2026-10-23): 12 HA input_booleans, "Wall map planes / boats / trains / streets / tracks / lakes / rivers / trails / neighborhoods / weather effects / sun and moon / traffic labels" (`input_boolean.wall_map_*`). `js/map-layers.js` has its own websocket (`subscribe_entities`) and puts `hide-*` classes on `<body>`; CSS hides the layer, hidden boats/trains aren't fetched or drawn, and weather effects stop animating (ambience.js `Mood`). No HA connection or an `unavailable` switch: everything shows. The coastline always shows.
- Labels and trails (2026-10-23): the map cache now has `labels` (OSM towns/suburbs/neighbourhoods, lakes ≥300 m, bays; Lake Washington and Puget Sound placed by hand in `tools/fetch-flight-map.py`) and `trail` ways (named regional trails ≥2 km in total: Burke-Gilman, Interurban, Eastrail...). Labels are faint and placed biggest first, skipping any that would touch screen text or each other (`placeMapLabels`). Trails are fine dots.
- Road traffic (2026-10-24): `js/road-traffic.js` reads `sensor.road_traffic` (led-panel-workspace `bridges/traffic-bridge/`: WSDOT Traffic Flow, ~186 stations on I-5, I-405, SR-522, SR-9, SR-525, every 90 s). Main roads in the map cache carry their OSM `ref`/`oneway`; each stretch belongs to the nearest station on the same road and direction (one-way carriageways only take their own direction, within 900 m). Each direction is drawn 3 units to the right of travel (NB east of the road, SB west), so one jammed direction is one line on its side and both are two parallel lines. Only moderate or worse is drawn, in one muted red (#d9584e) that gets thicker and brighter for heavy and stop-and-go; free flow stays plain. SR-99 has no WSDOT stations here, and SR-522 only has them around Bothell/Kenmore. Switch: "Wall map road traffic".
- Rain radar (2026-10-24): `js/rain-radar.js` fetches the NWS NEXRAD mosaic from Iowa State Mesonet's n0q WMS (no key, CORS open, 5-min cache) for exactly the map box in EPSG:4326, so it lines up with the map's plain lat/lon layout. A canvas recolours it to one pale blue-white: grey clear-air returns are dropped, hue sets strength (blue light → red heavy, magenta heaviest, capped at 80%), then a 5 px blur softens the ~1 km radar cells once per image. Dry = nothing drawn. Refreshed every 5 min, no animation. It is its own `<img id="rain-radar">` layer under the map SVG, so gliding markers never repaint it (inside the SVG it drained the tablet on wet days, 2026-10-29); there is no falling-rain animation any more. Switch: "Wall map rain radar".
- Family (2026-10-24): `js/family-layer.js` draws `person.tim` / `person.emily` (companion-app GPS) only while away: a ring with the initial in the season accent (like HOME), labelled with the zone name or "Away". Someone beyond the map is pinned to the screen edge toward them, one line: "Emily · 10 mi ↓ · Work" (bottom edge pinned below the status line). Glides by day (jumps after 10+ min gaps), jumps at night. Switch: "Wall map family".
- Wind (2026-10-24): `js/wind-layer.js` draws faint streaks at hand-picked open-water points (Puget Sound, Lake Washington) pointing downwind, longer with speed, plus one "Wind SW 14 mph" label, from `weather.forecast_home` (allowed up to 3 h old). Under 3 mph draws nothing. Switch: "Wall map wind".
- Commutes (2026-10-24): `js/commute-layer.js` draws Emily's drive as a dashed line in the family accent: home → King's → hotel on weekday mornings while she's home (6:30–8:00), hotel → King's → home once she's at the hotel from 3:30 PM, with an "Emily · 16 min to work" label. Route shapes come from `data/commute-routes.json` (`tools/fetch-commute-routes.py`, OSRM, via King's; gitignored, scp'd to .119). Minutes are Waze legs added up (`sensor.waze_kings_commute` + `sensor.waze_kings_to_hotel`; `sensor.waze_hotel_to_kings` + `sensor.waze_kings_to_home`), polled by the existing Emily automations. The commute lines under the weather use the same legs (COMMUTES `legs`/`workLegs`). `?commute_preview=emily|emily-work` shows either. Switch: "Wall map commutes".
- Map colours: planes near-white with a season hint (`--plane`), boats (`--boat`, fall = sky blue) and trains (`--train`, fall = pink) from a fixed per-season table in index.html's CSS, picked by a tiny inline script from the date alone (independent of ambience.js and HA; `?season=` overrides), labels neutral grey with a dark halo. `--map-opacity` (`?map=`) dims only the streets; traffic is `--traffic-opacity` (.9 day, .55 night). A plane or boat whose label would land on the clock, weather, insights or agenda shows a dimmed icon without its label.
- The previous screensaver remains available at `screensaver-backup-20261009.html`, with frozen modules under `backups/screensaver-before-flight-trial-20261009/`.

**Ambience (`js/ambience.js`, 2026-10-09):** mood, not information.
- Accent by season: summer teal (the original), fall copper, winter blue, spring green; each new season eases in over its first 10 days. Fall is copper, not amber, because amber means "needs attention". Calm status tags stay teal all year.
- Golden hour: the street lines warm toward amber from 45 minutes before sunset to 25 after (`sun.sun`).
- Weather mood from `weather.forecast_home`'s current condition: faint rain streaks (rainy, pouring, hail), slow snow (snowy, snowy-rainy) or softened streets (fog). Day layout only; nothing animates when it's dry.
- Morning reveal: the streets draw outward from HOME when the day layout returns at 6:15.
- Holidays: a bat now and then on Halloween-week evenings, soft fireworks 9-10 PM on July 4 and just after midnight on New Year's, snow on Christmas Eve and Day, plus a "Happy ..." line on the day.
- Household birthdays (Liam, Emily, Tim, Zoey) and "Anniversary" from `calendar.family`: the clock takes a soft tint, a pinned "Happy birthday, Liam" line, and a short confetti shower on the hour. Other people's birthdays are already in the agenda.
- Sun/moon arc: a faint arc across the top with the sun at how far through the daylight it is, or the moon (in its real phase) through the night.
- Insights also mark firsts: "First frosty morning of the season", "First frost of the season likely tonight", "First 80° day of the year" (from the long-term statistics of `sensor.outdoor_temperature`, which start 2026-09-22) and "First snow of the season" (`input_datetime.first_snow_of_the_season`, stamped by the automation "Weather - First snow of the season").
- Previews by URL: `?season=winter|spring|summer|fall`, `?golden=1`, `?reveal=1`, `?mood=snow|fog`, `?holiday=halloween|july4|thanksgiving|christmas|newyear`, `?occasion=Liam` or `?occasion=anniversary`, `?first=frost|snow|hot`.

**Modules (`js/`):**
- `screensaver.js` — the page: clock, weather, agenda, night mode and drift; renders the ticker and timers as tags
- `ambience.js` — season accent, golden hour, weather mood, morning reveal, holidays, birthdays, the sun/moon arc
- `ticker.js` — HA WebSocket feed of the status sensors (subclassed by `screensaver.js` for its tags)
- `timers.js` — Alexa and Google Home timers from every speaker (subclassed by `screensaver.js` for its timer tag)

**Fonts:** Outfit (clock, temperatures) and Figtree (text) from Google Fonts.

**Configuration:**

Copy `js/config.example.js` to `js/config.js` and fill in your values:

```javascript
export const config = {
    haUrl: 'http://YOUR_HA_IP:8123',
    longLivedAccessToken: 'YOUR_HA_LONG_LIVED_TOKEN'
};
```

> ⚠️ `js/config.js` is gitignored. Never commit it with real credentials.

---

### 4. House Climate (`climate.html`)

One place to run the four heated rooms. **Served from Home Assistant** (`/config/www/webapps/climate.html`, opened as `/local/webapps/climate.html`): inside the HA app it borrows the app's own connection, so it works away from home, needs no token, and every change is made as the person using it. The nginx copy still works on the home network with the token. Deploy with `./deploy.sh`. Landscape on the wall tablet, one column on a phone. In HA, the **Climate** button in each view's nav row opens it in a fullscreen browser_mod popup (← closes it, so you never leave the dashboard); `/lovelace/climate` is the same page as a subview. `?embed` hides the page's own title inside HA; `#schedule` opens the Schedule tab.

**How the house works (and what the page shows):**
- **House** (`input_number.house_setpoint`) is the master dial. "HVAC - House setpoint applies to all rooms" sets each room to House + its balance, clamped 65-80, whenever House changes.
- The **schedule** (Wake / Day / Evening / Sleep) writes House. Sleep starts when HSM arms for Night, with the Sleep time as a late fallback; Away uses its own setback. Moving House by hand sets `input_boolean.climate_manual_override_active`, which holds until the next block; **Back to schedule now** clears it and runs the schedule automation (conditions still checked, so it never overrides Away).
- A **room** changed on the Now screen keeps that target until the next House change; the card says so and offers **Undo**. The page spots this by comparing the room's target with House + balance; no extra helpers.
- **Warmer or cooler rooms** (the `input_number.climate_offset_*` helpers) live on the Schedule tab: how many degrees each room always runs above or below House.
- **Room page** (`#room/living|bedroom|liam|office`): tap a room anywhere (its card on Now, its card on History, its chip on the HA Home dashboard) for that room's controls beside a big history chart (24 h / 3 days / 7 days), a plain-English summary ("Mostly 69–71°. The heater ran about 5 hours, mostly overnight.") and three numbers: heater time, usual range, how often it was within 1° of target. Tap or hover the chart for a readout. Charts are deliberately calm: smoothed temperature curve, the target as a soft zone, heater cycles merged into heating capsules.
- **Warm up** (room cards and House): +2° for 30 min / 1 hour / 2 hours, then back to whatever the schedule says at that moment. Runs in HA so it ends on time with the page closed: `script.climate_warm_up` raises the target and starts `timer.climate_boost_<house|living_room|bedroom|liam|office>`; "HVAC - Warm-up ends" (timer finished or cancelled = Undo) puts it back. While a timer runs, the House fan-out skips that room and the schedule leaves the House alone, so a schedule step can't cut it short. Shows "Warming up until 9:45 AM, then 70° · Undo".
- **What happened** (room page): the last 3 days of what changed the room and who: "6:32 AM · Emily set it to 73°", "8:00 AM · Schedule set 71°", "Paused — a door was left open". Built from the logbook: the House setpoint's own entries (schedule / Away / a person), the door-pause on/off entries, and lines written by the automation "HVAC - Log room changes made by people", which listens for a person's climate service calls (Versatile Thermostat drops the user from its state changes).
- **Suggestions** (Schedule tab): when the same hand change keeps happening (3 of the last 7 days) the page offers to make it the norm: "Make Wake 74°?" for the House, "Keep the Bedroom 1° warmer?" for a room. "Not now" hides it on that device for two weeks.
- **History tab** (`#history`): a House chart (setpoint against the average inside temperature) and one chart per room for the last 24 hours or 3 days. Each shows the room's temperature (the sensor its thermostat regulates on), its target as a step line, when its heater was actually on (a strip under the plot, from the thermostat's underlying switch/HeatStorm), hatched spans where the thermostat was off, and Night/Away bands from `sensor.hub_hsm_status`. Tap or hover for a readout. Targets come from the `sensor.*_thermostat_target` template helpers (blank while a thermostat is off); before those existed (2026-10-08) a room's target is worked out as House + its balance. The thermostats' own history isn't read: Versatile Thermostat logs every few seconds, several MB a day.
- Room cards show heating (with duty %), idle, off, or paused by an open window (Versatile Thermostat window manager) or an open front/patio door (the living room door automation).

**HA Entities Used:**
- `input_number.house_setpoint`, `input_boolean.climate_manual_override_active`, `sensor.hub_hsm_status`
- `climate.living_room_thermostat`, `climate.bedroom_thermostat`, `climate.liam_s_room_thermostat`, `climate.office_thermostat` (Versatile Thermostats)
- `input_number.climate_offset_living_room|bedroom|liam|office`
- `input_datetime.climate_wake|day|evening|sleep_time`, `input_number.climate_wake|day|evening|sleep_temp`, `input_number.climate_away_temp`
- `input_select.living_room_climate_restore_mode`, `binary_sensor.front_door_contact`, `binary_sensor.slider_door_sensor_contact`
- `sensor.outdoor_temperature`
- `automation.hvac_climate_schedule_with_smart_recovery` (triggered by Resume schedule)

---

## Inside Home Assistant (away from home)

`./deploy.sh` also copies `climate.html`, `led-panel.html` and `bedtime.html` (plus icons and `js/ha-app.js`) to `/config/www/webapps/`, and the dashboard opens them as `/local/webapps/<page>.html`. Served from HA's own address, they work wherever the HA app does — including away from home over https — and use the app's login instead of a stored token: `climate.html` borrows the app's connection directly; `led-panel.html` and `bedtime.html` load `js/ha-app.js`, which points `HA_URL` at the page's own origin and makes `HA_TOKEN` read the app's current access token (refreshing it before it expires). The nginx copies keep working on the home network with `js/ha-config.js`. `/local` is cached for 31 days, so bump `?v=` in the dashboard links after a deploy.

## Infrastructure

- **Server:** nginx on Proxmox LXC
- **Local URL:** `http://192.168.2.119`
- **Stack:** Vanilla HTML/CSS/JavaScript — no build step, no framework
- **HA communication:** Direct REST API calls with long-lived access token + MQTT publish via HA `mqtt.publish` service

## Security Notes

- All apps are local-network only — no public exposure
- HA tokens and API keys are stored in `js/config.js` (gitignored) and inline in `bedtime.html` / `led-panel.html`
- Keep this repo private
- For a cleaner setup, credentials could be refactored into a shared `config.js` similar to the screensaver pattern

The night weather line sits lower to keep its temperature degree symbol visually separate from the HOME map marker.

The night temperature/condition separator dot is removed so it cannot be mistaken for a map location.
