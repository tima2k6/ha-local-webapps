Previous screensaver backup — 2026-10-09

Tablet: TIM's Tab A9+ (Fully Kiosk)
Active screensaver: http://192.168.2.119/?v=20261009-official-1
Preserved backup: http://192.168.2.119/screensaver-backup-20261009.html
Original screensaver URL: http://192.168.2.119/?v=20261005

The backup HTML references the frozen screensaver.js, ticker.js, and timers.js
in this directory, using the existing server configuration for HA access.
The root screensaver now uses the flight backdrop. The normal HA dashboard is unchanged.

To restore through HA: fully_kiosk.set_config with device_id from
 tablet-screensaver-settings.json, key screensaverWallpaperURL, and the
backup URL above. Stop and start the screensaver through Fully Kiosk.
Only the flight feed's scan interval was changed earlier, from 120 to 10 seconds.
No on-screen buttons or sliders are present in the flight screensaver.
