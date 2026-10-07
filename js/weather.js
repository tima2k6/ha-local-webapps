// weather.js — current conditions and today's forecast from weather.forecast_home
// (met.no) through the HA REST API, the same source as the LED panel's idle screen.

// HA condition → OpenWeatherMap icon code (the icon images are the same ones the
// screensaver always used; only the data source changed)
const ICONS = {
    'sunny': '01', 'clear-night': '01', 'partlycloudy': '02', 'cloudy': '04',
    'fog': '50', 'rainy': '10', 'pouring': '09', 'lightning': '11',
    'lightning-rainy': '11', 'snowy': '13', 'snowy-rainy': '13', 'hail': '13',
    'windy': '03', 'windy-variant': '04', 'exceptional': '50'
};

const LABELS = {
    'clear-night': 'Clear', 'partlycloudy': 'Partly Cloudy', 'lightning': 'Thunder',
    'lightning-rainy': 'Thunderstorms', 'snowy-rainy': 'Sleet', 'pouring': 'Heavy Rain',
    'rainy': 'Rain', 'snowy': 'Snow', 'windy-variant': 'Windy', 'exceptional': 'Severe Weather'
};

export class WeatherDisplay {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.entity = 'weather.forecast_home';
        this.weatherInterval = null;
    }

    async fetchWeather() {
        try {
            const [current, sun, forecast] = await Promise.all([
                this.fetchState(this.entity),
                this.fetchState('sun.sun'),
                this.fetchForecast()
            ]);

            if (current && forecast) {
                const night = sun?.state === 'below_horizon';

                const currentWeather = {
                    temp: Math.round(current.attributes.temperature),
                    description: this.label(current.state),
                    icon: this.iconUrl(current.state, night)
                };

                const forecastWeather = {
                    temp: `High ${Math.round(forecast.temperature)}°F • Low ${Math.round(forecast.templow)}°F`,
                    description: this.label(forecast.condition),
                    icon: this.iconUrl(forecast.condition, false)
                };

                this.updateDisplay(currentWeather, forecastWeather);
            } else {
                this.showError();
            }
        } catch (error) {
            console.error('Weather fetch error:', error);
            this.showError();
        }
    }

    async fetchState(entityId) {
        try {
            const response = await fetch(`${this.haUrl}/api/states/${entityId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`State fetch error (${entityId}):`, error);
            return null;
        }
    }

    // Today's daily forecast (high, low, condition)
    async fetchForecast() {
        try {
            const response = await fetch(`${this.haUrl}/api/services/weather/get_forecasts?return_response`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ entity_id: this.entity, type: 'daily' })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data.service_response?.[this.entity]?.forecast?.[0] || null;
        } catch (error) {
            console.error('Forecast fetch error:', error);
            return null;
        }
    }

    iconUrl(condition, night) {
        const code = ICONS[condition] || '03';
        const suffix = condition === 'clear-night' || night ? 'n' : 'd';
        return `https://openweathermap.org/img/wn/${code}${suffix}@4x.png`;
    }

    label(condition) {
        return LABELS[condition] || this.capitalizeWords(condition || '');
    }

    updateDisplay(currentWeather, forecastWeather) {
        const html = `
            <div class="weather-header">Weather</div>
            <div class="weather-content">
                <div class="weather-section active" id="current-weather">
                    <div class="currently-header">Currently</div>
                    <img class="current-weather-icon" src="${currentWeather.icon}" alt="Weather icon">
                    <div class="current-weather-info">
                        <div class="temp-line">
                            <div class="temp">${currentWeather.temp}°F</div>
                        </div>
                        <div class="details">${currentWeather.description}</div>
                    </div>
                </div>
                <div class="weather-section hidden" id="forecast-weather">
                    <div class="forecast-header">Today's Forecast</div>
                    <img class="current-weather-icon" src="${forecastWeather.icon}" alt="Forecast icon">
                    <div class="forecast-weather-info">
                        <div class="temp">${forecastWeather.temp}</div>
                        <div class="details">${forecastWeather.description}</div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.startWeatherCarousel();
    }

    startWeatherCarousel() {
        const sections = Array.from(this.container.querySelectorAll('.weather-section'));

        if (this.weatherInterval) {
            clearInterval(this.weatherInterval);
        }

        if (sections.length > 0) {
            let currentSection = 0;

            this.weatherInterval = setInterval(() => {
                const prevSection = sections[currentSection];
                currentSection = (currentSection + 1) % sections.length;
                const nextSection = sections[currentSection];

                // Fade out previous section
                prevSection.classList.remove('active');
                prevSection.classList.add('hidden');

                // Show next section immediately
                nextSection.classList.remove('hidden');
                nextSection.classList.add('active');

            }, 10000); // Match calendar interval timing
        }
    }

    clearWeatherCarousel() {
        if (this.weatherInterval) {
            clearInterval(this.weatherInterval);
            this.weatherInterval = null;
        }
    }

    capitalizeWords(str) {
        return str.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    showError() {
        this.container.textContent = 'Unable to fetch weather data.';
    }

    start(interval = 300000) {
        this.fetchWeather();
        setInterval(() => this.fetchWeather(), interval);
    }
}
