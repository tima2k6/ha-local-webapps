export class WeatherDisplay {
    constructor(apiKey, container, lat, lon) {
        this.apiKey = apiKey;
        this.container = container;
        this.lat = lat;
        this.lon = lon;
        this.units = 'imperial';
        this.weatherInterval = null;
    }

    async fetchWeather() {
        try {
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrent(),
                this.fetchForecast()
            ]);
            
            if (currentData && forecastData && forecastData.length > 0) {
                // Process current weather data
                const currentWeather = {
                    temp: Math.round(currentData.main.temp),
                    feelsLike: Math.round(currentData.main.feels_like),
                    description: this.capitalizeWords(currentData.weather[0].description),
                    icon: `https://openweathermap.org/img/wn/${currentData.weather[0].icon}@4x.png`
                };

                // Initialize with first forecast values instead of Infinity
                let highTemp = forecastData[0].main.temp;
                let lowTemp = forecastData[0].main.temp;
                let conditions = new Set();
                let weatherCounts = {};

                forecastData.forEach(forecast => {
                    if (forecast && forecast.main && typeof forecast.main.temp === 'number') {
                        const forecastTemp = forecast.main.temp;
                        highTemp = Math.max(highTemp, forecastTemp);
                        lowTemp = Math.min(lowTemp, forecastTemp);
                        const condition = forecast.weather[0].description;
                        conditions.add(this.capitalizeWords(condition));
                        
                        const weatherKey = `${condition}|${forecast.weather[0].icon}`;
                        weatherCounts[weatherKey] = (weatherCounts[weatherKey] || 0) + 1;
                    }
                });

                // Get most common weather condition and its icon
                const mostCommonWeather = Object.entries(weatherCounts)
                    .sort((a, b) => b[1] - a[1])[0][0]
                    .split('|');

                const forecastWeather = {
                    temp: `High ${Math.round(highTemp)}°F • Low ${Math.round(lowTemp)}°F`,
                    description: Array.from(conditions).slice(0, 2).join(', '),
                    icon: `https://openweathermap.org/img/wn/${mostCommonWeather[1]}@4x.png`
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

    async fetchCurrent() {
        try {
            const response = await fetch(this.buildUrl('weather'));
            return await response.json();
        } catch (error) {
            console.error('Current weather fetch error:', error);
            return null;
        }
    }

    async fetchForecast() {
        try {
            const response = await fetch(this.buildUrl('forecast'));
            const data = await response.json();
            
            // Get forecasts for next 24 hours
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setHours(now.getHours() + 24);
            
            console.log('Fetching forecasts between:', now, 'and', tomorrow);
            
            // Filter forecasts for next 24 hours
            const forecasts = data.list.filter(item => {
                const forecastDate = new Date(item.dt * 1000);
                return forecastDate >= now && forecastDate < tomorrow;
            });
            
            console.log('Found forecasts:', forecasts.length);
            console.log('First forecast:', forecasts[0]);
            
            return forecasts;
        } catch (error) {
            console.error('Forecast fetch error:', error);
            return null;
        }
    }

    buildUrl(type = 'weather') {
        return `https://api.openweathermap.org/data/2.5/${type}?lat=${this.lat}&lon=${this.lon}&units=${this.units}&appid=${this.apiKey}`;
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
                            <div class="feels-like">(Feels: ${currentWeather.feelsLike}°F)</div>
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
