export class Clock {
    constructor(timeContainer, dateContainer) {
        this.timeContainer = timeContainer;
        this.dateContainer = dateContainer;
    }

    updateTime() {
        const now = new Date();
        this.timeContainer.textContent = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        this.dateContainer.textContent = now.toLocaleDateString([], { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
        });
    }

    start() {
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
    }
} 