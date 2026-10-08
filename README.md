# HA Local Webapps

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

A fullscreen kiosk/screensaver for a wall-mounted OLED display ("Quiet Hours" design). Pure black background, light warm grey text and one teal accent, sized to read from across the room. Everything is sized from a 1280×800 layout to fit the 16:10 Galaxy Tab A9+ (1920×1200) and scales to any screen.

**Layout:**
- Left: date, clock (hour and minute, no seconds) and below it the weather: now plus today's high/low and tomorrow from `weather.forecast_home` (met.no, the same source as the LED panel)
- Right: the next three `calendar.family` events, each time above its name
- Bottom: static status tags from the ticker's sensors (Zoey's feeding, open windows and doors, trash night), centered, on exactly the old ticker's conditions: teal when routine, amber or red when something needs attention; running Alexa/Google Home timers on the right
- Night (10:00 PM to 6:30 AM, fixed times in `js/screensaver.js`, not the sun): a dim clock and the temperature replace the weather and agenda; tags and timers show as by day
- Burn-in guard: the whole layout shifts by up to ~12 px every 3 minutes

**Modules (`js/`):**
- `screensaver.js` — the page: clock, weather, agenda, night mode and drift; renders the ticker and timers as tags
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
