export const config = {
    haUrl: 'http://YOUR_HA_IP:8123',
    weatherApiKey: 'YOUR_OPENWEATHERMAP_API_KEY',
    longLivedAccessToken: 'YOUR_HA_LONG_LIVED_TOKEN',
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
