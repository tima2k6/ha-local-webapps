export const config = {
    haUrl: HA_URL,                 // from js/ha-config.js (the only file holding the HA token)
    weatherApiKey: 'YOUR_OPENWEATHERMAP_API_KEY',
    longLivedAccessToken: HA_TOKEN,
    weatherLocation: {
        lat: 'YOUR_LATITUDE',
        lon: 'YOUR_LONGITUDE'
    },
    updateIntervals: {
        weather: 300000,
        calendar: 300000,
        ticker: 300000
    }
};
