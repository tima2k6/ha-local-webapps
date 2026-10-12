# Theater controller repair

The October 11 tests showed three concrete faults: video activities never explicitly selected TV HDMI 3 from the tuner, two automations sent competing delayed receiver input commands, and sensor input labels could identify the Apple TV as Xbox. Sleeping Apple TV after switching to native TV could also shut down the TV/receiver.

## Current behavior

- Master Activity Controller owns startup for Apple TV, Xbox, DVD, Echo, and Record Player. Request scripts and guarded device/input-sync automations request helpers; they do not duplicate receiver start commands.
- Video starts explicitly select the receiver's physical HDMI 3 input on the TV. Old Sony commands no longer depend on fixed CEC logical addresses.
- The repaired sensor YAML uses URI and discovered CEC names instead of trusting an HDMI port's title. Runtime REST sensors can retain cached definitions/attributes, so safety checks independently read Sony's playing-content response. A generic HDMI label cannot override a running activity without a matching observed CEC source.
- A video activity becomes active after device/TV checks and a Sony playing-content response confirms port 3. It remains None during startup. The receiver input is pressed once after the TV/ARC transition, without a second delayed selection that can override a newer request.
- Xbox power-on failure creates a notification and returns the theater to Off. It does not pretend a disconnected Xbox started. Xbox remote wake is still dependent on the console's remote/network configuration.
- New activity requests cancel older controller runs. Helper-off events only enter the controller when all request helpers are off, so cleanup from the previous activity cannot interrupt the next start.
- Echo and Record Player require the TV off and receiver on. Record Player plug power follows its helper.
- Native tuner takeover clears stale video helper/activity state without powering off the TV/receiver. Later Apple TV sleep cannot shut down that native-TV session.
- Off cancels pending startup, clears helpers, powers down controllable devices, waits for TV shutdown, and checks actual receiver power before pressing its toggle.
- `input_boolean.theater_dvd_owned` tracks the DVD power toggle issued by this controller. Leaving DVD or running Off sends one matching toggle. This tracks commands, not independently measured DVD power; manual remote changes can still desynchronize it.

## Repair tooling

The live repair used these narrowly scoped tools, with private backups under ignored `backups/theater-controller-repair/`:

1. `theater-current-config.mjs` snapshots the existing definitions.
2. `repair-sony-tv-routing.py` changes Sony REST payloads and input labeling. It refuses a repeat application.
3. `reload-theater-routing.mjs` checks HA configuration and reloads only REST commands/entities.
4. `repair-theater-controller.mjs` replaces duplicated startup ownership and updates request, sync, and Off paths. It refuses repeat controller installation.
5. `verify-theater-controller.mjs` checks physical-input response scenarios and configuration validity.
6. `add-theater-input-metadata.py` and `refine-theater-requests.mjs` expose raw input metadata and support native-TV takeover/repeated explicit requests.
7. `retry-theater-input-confirmation.mjs` retries transient Sony no-content responses within a fixed limit. `finalize-theater-input-sync.mjs` verifies native ownership directly through Sony, and `protect-theater-observed-source.mjs` prevents inferred labels from overriding a different running activity. `test-observed-theater-source.mjs` checks CEC address swaps without operating devices.

These tools write live configuration except for the snapshot utility. They are maintenance scripts for this house, not general-purpose installers. Physical acceptance testing lives in the companion firmware workspace and always ends Off.

## Limits

TV port and device-power confirmation do not independently prove audible output or every receiver input. Physical CEC routing dumps collected through ADB provide additional evidence during testing. DVD has no independent power sensor, and a disconnected Xbox cannot be remotely woken by changing HA bookkeeping.

## Acceptance results (October 11–12, 2026)

- Apple TV cold start and return from Record Player selected the actual Apple TV input and confirmed device/receiver/TV power.
- DVD selected HDMI 3; ADB reported receiver routing 0x3300. Its owned power toggle was balanced when leaving the activity.
- Echo and Record Player passed TV-off/receiver-on and helper/plug cleanup checks. Audible playback was not tested.
- The first Xbox request failed because Xbox Network reported the console disconnected; the controller cleared the request and shut down. After a physical controller start, a normal Xbox request succeeded: the console was on, drawing about 43 W, the TV reported Xbox, and the controller trace completed without errors. Continued remote wake still depends on console/network availability.
- Rapid Apple TV → Echo cancellation passed. Native tuner takeover bookkeeping and subsequent Apple TV sleep protection passed using direct Sony observations.
- Five template scenarios passed for both CEC logical-address assignments and ambiguous generic HDMI labels.
- The final state was verified Off: TV, receiver power sensor, Xbox, Apple TV, Record Player plug, activity helpers, and DVD ownership helper.

Raw captures and account/device context remain in ignored local backup/cache folders. These results verify the exercised paths, not every future HDMI handshake or manual-remote combination.

Additional October 12 testing reproduced a cold Apple TV start where Sony rejected the initial HDMI-selection command with HTTP 404. Content-read retries could not recover a command that never succeeded. `retry-theater-hdmi-selection.mjs` adds bounded retries of the selection command itself before confirming the observed input. The failed start correctly returned the system to Off. Xbox remote wake also remained intermittent in this round.

After that repair, eight physical repeat-request checks passed: initial and repeated Apple TV, DVD, and Echo requests; Off during Apple TV startup; and final shutdown. The recorded DVD power-button timestamp did not change on the repeated DVD request, and changed once when leaving DVD for Echo. Five observed-source/CEC-address scenarios also passed. Evidence: ignored firmware captures `activity-tests-20261012T072812Z` and `repeat-requests-20261012T073441Z`.

Four further physical regression checks passed: rapid Apple TV to Echo cancellation, native tuner takeover clearing stale video activity, Apple TV sleep preserving native TV/receiver power, and final Off. Evidence: `regressions-20261012T074142Z`. This brings the post-repair round to 12 passed physical checks and five passed source-identity scenarios. Xbox remote wake, audible playback, and independent DVD power feedback remain outside those successes.
