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
- `sensor.zags`, `weather.forecast_home`, `sensor.weather_temperature`
- `input_datetime.mariners_opening_day`
- `input_boolean.panel_fx_celebrations|weather_animation|high_low_cycle|message_glow|alert_flash` — Effects card; the HA automation "Panel MQTT — Effects" relays them to `house/panel/fx/*`

**MQTT Topics Published:**
- `house/panel/message/red|green|blue|size|image|text`
- `house/panel/skip`, `house/panel/reboot`

---

### 3. HA Dashboard Screensaver (`index.html`)

A fullscreen kiosk/screensaver for a wall-mounted display. Black background, two-column layout — weather on the left, upcoming calendar events on the right — with a scrolling sensor ticker at the bottom. Uses custom typography (Protest Strike + Zain fonts, self-hosted) and smooth CSS fade transitions between weather and calendar states.

**Layout:**
- Top: large clock and date display
- Left column: current conditions + forecast (OpenWeatherMap API), animated weather icon, temperature, feels-like, details; fades between current and forecast views
- Right column: upcoming HA calendar events with animated fade cycling between events
- Bottom: full-width scrolling ticker fed by HA sensor data

**Modules (`js/`):**
- `clock.js` — live clock and date, updates every second
- `weather.js` — current + forecast conditions from OpenWeatherMap API; cycles between current and forecast on a timer
- `calendar.js` — upcoming calendar events from HA REST API; cycles through events with fade transitions
- `ticker.js` — horizontally scrolling ticker fed by HA sensor states

**Fonts:** Self-hosted in `/fonts/` — Protest Strike (headers) and Zain Light/Bold/Extrabold (body text). Not committed to the repo due to licensing.

**Configuration:**

Copy `js/config.example.js` to `js/config.js` and fill in your values:

```javascript
export const config = {
    haUrl: 'http://YOUR_HA_IP:8123',
    weatherApiKey: 'YOUR_OPENWEATHERMAP_API_KEY',
    longLivedAccessToken: 'YOUR_HA_LONG_LIVED_TOKEN',
    weatherLocation: {
        lat: 'YOUR_LATITUDE',
        lon: 'YOUR_LONGITUDE'
    },
    updateIntervals: {
        weather: 300000,   // 5 minutes
        calendar: 300000,
        ticker: 300000
    }
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
