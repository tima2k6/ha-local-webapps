export class CalendarDisplay {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.currentEvent = 0;
        this.eventInterval = null;
    }

    async fetchCalendar() {
        try {
            const start = new Date().toISOString();
            const end = new Date();
            end.setDate(end.getDate() + 7);
            const endStr = end.toISOString();

            const response = await fetch(`${this.haUrl}/api/calendars/calendar.family?start=${start}&end=${endStr}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const events = await response.json();
            if (events && events.length > 0) {
                events.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
                this.displayEvents(events);
            } else {
                this.container.textContent = 'No upcoming events';
            }
        } catch (error) {
            console.error('Calendar fetch error:', error);
            this.container.textContent = `Error fetching calendar data: ${error.message}`;
        }
    }

    displayEvents(events) {
        this.container.innerHTML = events
            .map((event, index) => `
                <div class="event ${index === 0 ? 'active' : ''}">
                    ${event.summary || 'Unnamed Event'}: 
                    ${new Date(event.start.dateTime || event.start.date).toLocaleString([], {
                        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                </div>
            `).join('');

        // Clear any existing interval
        if (this.eventInterval) {
            clearInterval(this.eventInterval);
        }

        const eventElements = this.container.querySelectorAll('.event');
        this.currentEvent = 0;

        this.eventInterval = setInterval(() => {
            eventElements[this.currentEvent].classList.remove('active');
            this.currentEvent = (this.currentEvent + 1) % eventElements.length;
            eventElements[this.currentEvent].classList.add('active');
        }, 5000);
    }

    start(interval = 300000) {
        this.fetchCalendar();
        setInterval(() => this.fetchCalendar(), interval);
    }
} 