# Activity stats

Installed on Home (v2), beneath the existing media control card. Uses the 15 existing `sensor.<activity>_time_today|this_week|this_month` entities for Apple TV (displayed as TV), DVD, Xbox, Echo, and record player.

The card shows combined totals, each activity's durations, and selectable pie charts for each calendar period. Totals round after summing hours. Unavailable data is marked with a dash and prevents displaying an incomplete combined total; charts show available activity data with a notice. Zero-use periods have an explicit empty-state message.

Source: `tools/activity-stats-card.mjs`. Apply with `node tools/install-activity-stats.mjs`; this backs up the live dashboard locally and replaces only the Activity stats card. No HA restart is needed. Run `node tools/verify-activity-stats.mjs` to render all three tabs using HA's installed cards. PNG previews and verification results are saved here. Browser authentication stays in memory.
