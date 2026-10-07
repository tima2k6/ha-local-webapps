export const config = {
    haUrl: HA_URL,                 // from js/ha-config.js (the only file holding the HA token)
    longLivedAccessToken: HA_TOKEN,
    updateIntervals: {
        weather: 300000,
        calendar: 300000,
        ticker: 300000
    }
};
