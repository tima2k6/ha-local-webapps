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
            const response = await fetch(this.buildUrl());
            const data = await response.json();
            this.updateDisplay(data);
        } catch (error) {
            console.error('Weather fetch error:', error);
            this.showError();
        }
    }

    buildUrl() {
        return `https://api.openweathermap.org/data/2.5/weather?lat=${this.lat}&lon=${this.lon}&units=${this.units}&appid=${this.apiKey}`;
    }

    updateDisplay(data) {
        const temp = Math.round(data.main.temp);
        const description = this.capitalizeWords(data.weather[0].description);
        const icon = data.weather[0].icon;
        const location = data.name;
        const feelsLike = Math.round(data.main.feels_like);

        this.container.innerHTML = `
            <img src="https://openweathermap.org/img/wn/${icon}@4x.png" alt="${description}">
            <div>${temp}°F • ${description}</div>
            <div>${location} • Feels Like ${feelsLike}°F</div>
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