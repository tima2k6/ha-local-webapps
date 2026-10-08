// Inside the Home Assistant app — the page served from /local/webapps/ and opened
// in a dashboard popup or iframe — use the app's own login instead of the
// long-lived token in js/ha-config.js:
//   HA_URL   = this page's own origin, so it works away from home (https too)
//   HA_TOKEN = the app's current access token, read fresh on every use
// The app refreshes its token when it needs to; a page that only makes REST
// calls doesn't trigger that, so this refreshes it a few minutes before expiry.
// Anywhere else (the nginx copy on the home network, a parent on another origin)
// this does nothing and js/ha-config.js provides HA_URL / HA_TOKEN as before.
(() => {
    const appHass = () => {
        try {
            return window.parent !== window ? window.parent.document.querySelector('home-assistant')?.hass : null;
        } catch (_) { return null; }        // parent on another origin
    };
    const hass = appHass();
    if (!hass || !hass.auth) return;

    Object.defineProperty(window, 'HA_URL', { value: location.origin });
    Object.defineProperty(window, 'HA_TOKEN', { get: () => appHass()?.auth?.data?.access_token || '' });
    window.HA_IN_APP = true;

    const keepFresh = () => {
        const auth = appHass()?.auth;
        if (auth?.data?.expires && auth.data.expires - Date.now() < 5 * 60e3) auth.refreshAccessToken().catch(() => {});
    };
    keepFresh();
    setInterval(keepFresh, 60e3);
})();
