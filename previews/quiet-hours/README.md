# Quiet Hours Preview

Three redesigned Home Assistant views inspired by the screensaver, created
2026-10-09. This replaces the first preview, which only restyled the existing layout.
It appears as **Quiet Hours Preview** in the sidebar.

Open: http://192.168.2.125:8123/quiet-hours-preview/overview

Overview centers the family agenda, household status, room summaries, and everyday
destinations. Liam centers bedtime, lights, rewards, and music. Network centers
connection health, infrastructure, devices, and maintenance.

Each view is a native custom HA card in a panel layout. Its own navigation replaces
HA's header/sidebar in this preview. The **Original dashboard** footer link returns
to the existing interface. Controls are live, using the current HA user's connection;
the custom element contains no credentials. Automations and the original dashboard
are unchanged. Original entity/service bindings remain in grouped detail sheets and
**All controls**. Embedded Climate, Bedtime, and LED pages retain their current styling.

- `dashboard.json`: configuration saved using Home Assistant's WebSocket API.
- `theme.yaml`: separate theme installed in `/config/themes/quiet-hours-preview/`.
- `../../js/quiet-hours-dashboard.js` and `.css`: UI source deployed into
  `/config/www/quiet-hours-preview/`; registered as a Lovelace module resource.
- `../../tools/quiet-hours-redesign.mjs`: builds redesigned views and verifies
  preservation of original entity/service bindings.
- `../../tools/quiet-hours-preview.mjs --redesign`: backs up the existing preview,
  deploys UI files, and replaces only the preview dashboard.

Bump the resource and stylesheet version strings after subsequent UI changes to
avoid HA's `/local` cache. No git commit or screensaver-host deployment is performed.

Verified: theme loaded, saved configuration matches, original dashboard unchanged,
original entity/service bindings preserved, preview navigation uses preview views.
`node tools/verify-quiet-hours.mjs` checks all three layouts at 1280px and 390px:
overflow, detail links, directory navigation, simulated light/bedtime actions,
paused routine state, star-bank totals, and unavailable network status.

`node tools/verify-quiet-hours.mjs --live` checks actual HA rendering, connection,
and a native detail sheet per view. Authentication stays in browser memory and no
device actions are performed. Screenshots and verification results are in this folder.
Local state snapshots and the isolated browser profile are gitignored.

To remove the sample, delete **Quiet Hours Preview** in Settings → Dashboards.
Its resource and UI files in `/config/www/quiet-hours-preview/` can then be removed,
along with `/config/themes/quiet-hours-preview/`, followed by a theme reload.
The existing dashboard remains in **Overview**.
