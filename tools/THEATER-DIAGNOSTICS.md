# Theater diagnostics and October 2026 guardrail repairs

The companion `led-panel-workspace` repository has VS Code TV tasks and an ADB reader at `firmware/tools/tv-diagnostics.py`. See its `TV-DIAGNOSTICS.md` for TV authorization, snapshots, and bounded log captures.

This directory provides the Home Assistant side:

- `audit-theater-guardrails.mjs`: read accessible automation and script definitions and save the related inventory.
- `check-theater-references.mjs`: check the saved inventory against live entities and registered services.
- `theater-test-ha.mjs state`: read current theater states.
- `theater-test-ha.mjs evidence <UTC-start>`: export relevant logbook events and automation traces.
- `theater-test-inspect.mjs`: save a starting-state snapshot and inspect related service availability.
- `inspect-xbox-incident.mjs`: read the October 11, 2026 22:13 incident window.

These tools use the existing local `js/ha-config.js` credentials through `activity-stats-ha.mjs`; credentials and evidence are excluded from Git. Run these commands with this repository as the working directory.

`theater-test-ha.mjs activity`, `press`, `restore`, and `dvd_power_restore` are physical control commands. The companion `test-tv-inputs.py` and `test-theater-activities.py` also switch real devices. Run them only when those tests are requested and the household is ready for interruptions. The existing test restoration assumes the captured FOX13/no-activity baseline; change the restoration before testing a different baseline. DVD has only a power toggle, so its physical power cannot be independently confirmed.

`fix-xbox-remote-sync.mjs` and `repair-theater-guardrails.mjs` are one-time, device-specific repair scripts for this incident. They write live automation definitions and now refuse repeat application when their guards are already present. The broader repair uses a saved audit, checks live definitions before each write, and saves before/after copies. Do not run repairs merely to inspect or test.

`verify-theater-guardrails.mjs` evaluates scenarios using the saved repaired configurations and Home Assistant's template renderer. It does not execute device actions. A fresh checkout needs the local audit/repair artifacts before running this verifier.

The activity tests found remaining issues: video starts do not select the TV's HDMI input from its tuner; Xbox remote start can fail while HA still claims the activity; physical input labels can disagree with CEC routing; and overlapping automations can issue competing delayed receiver commands. Successful service calls and completed traces do not certify that the expected physical screen or audio output was reached.
