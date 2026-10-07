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
- Night (`sun.sun` below the horizon): a dim clock and the temperature replace the weather and agenda; tags and timers show as by day
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
