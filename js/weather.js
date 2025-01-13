export class WeatherDisplay {
    constructor(apiKey, container) {
        this.apiKey = apiKey;
        this.container = container;
        this.lat = '47.5673';
        this.lon = '-122.6327';
        this.units = 'imperial';
    }

    async fetchWeather() {
        try {
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrent(),
                this.fetchForecast()
            ]);
            
            if (currentData && forecastData) {
                this.updateDisplay(currentData, forecastData);
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
            
            // Get all forecasts for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            // Filter forecasts for today only
            const todaysForecasts = data.list.filter(item => {
                const forecastDate = new Date(item.dt * 1000);
                return forecastDate >= today && forecastDate < tomorrow;
            });

            return todaysForecasts;
        } catch (error) {
            console.error('Forecast fetch error:', error);
            return null;
        }
    }

    buildUrl(type = 'weather') {
        return `https://api.openweathermap.org/data/2.5/${type}?lat=${this.lat}&lon=${this.lon}&units=${this.units}&appid=${this.apiKey}`;
    }

    updateDisplay(currentData, forecastData) {
        const temp = Math.round(currentData.main.temp);
        const description = this.capitalizeWords(currentData.weather[0].description);
        const icon = currentData.weather[0].icon;
        const feelsLike = Math.round(currentData.main.feels_like);

        // Process forecast data
        let highTemp = -Infinity;
        let lowTemp = Infinity;
        let conditions = new Set();

        forecastData.forEach(forecast => {
            const forecastTemp = forecast.main.temp;
            highTemp = Math.max(highTemp, forecastTemp);
            lowTemp = Math.min(lowTemp, forecastTemp);
            conditions.add(this.capitalizeWords(forecast.weather[0].description));
        });

        // Convert conditions Set to Array and get unique values
        const uniqueConditions = Array.from(conditions);
        const forecastSummary = uniqueConditions.length > 2 
            ? uniqueConditions.slice(0, 2).join(', ') + ', Variable'
            : uniqueConditions.join(', ');

        // Add styles for the layout
        const style = document.createElement('style');
        style.textContent = `
            .weather-container {
                text-align: center;
            }
            .weather-columns {
                display: flex;
                justify-content: space-between;
                margin-top: 10px;
            }
            .weather-column {
                flex: 1;
                padding: 0 10px;
            }
            .weather-row {
                margin: 5px 0;
            }
        `;
        document.head.appendChild(style);

        this.container.innerHTML = `
            <div class="currently-header">Current Weather</div>
            <div class="current-weather-info">
                <div class="temp">${temp}°F</div>
                <div class="details">${description}</div>
                <div class="feels-like">Feels like ${feelsLike}°F</div>
            </div>
            <img class="current-weather-icon" src="https://openweathermap.org/img/wn/${icon}@4x.png" alt="${description}">
            <div class="forecast-header">Today's Weather</div>
            <div class="forecast-weather-info">
                <div class="temp">High ${Math.round(highTemp)}°F • Low ${Math.round(lowTemp)}°F</div>
                <div class="details">${forecastSummary}</div>
            </div>
        `;
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
