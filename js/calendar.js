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

            const response = await fetch(
                `${this.haUrl}/api/calendars/calendar.family?start=${start}&end=${endStr}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const events = await response.json();
            if (events && events.length > 0) {
                events.sort(
                    (a, b) =>
                        new Date(a.start.dateTime || a.start.date) -
                        new Date(b.start.dateTime || b.start.date)
                );
                this.updateEvents(events);
            } else {
                this.container.innerHTML = '<div class="no-events">No upcoming events</div>';
                this.clearCarousel();
            }
        } catch (error) {
            console.error("Calendar fetch error:", error);
            this.container.innerHTML = `<div class="error-message">Error fetching calendar: ${error.message}</div>`;
            this.clearCarousel();
        }
    }

    updateEvents(events) {
        // Clear and re-render events
        this.container.innerHTML = events
            .map(
                (event, index) => `
                <div class="event ${index === 0 ? "active" : "hidden"}">
                    ${event.summary || "Unnamed Event"}:
                    ${new Date(event.start.dateTime || event.start.date).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </div>
            `
            )
            .join("");

        this.startCarousel(); // Restart carousel with new events
    }

    startCarousel() {
        const eventElements = Array.from(this.container.querySelectorAll('.event'));
    
        // Clear any existing interval
        if (this.eventInterval) {
            clearInterval(this.eventInterval);
        }
    
        if (eventElements.length > 0) {
            this.currentEvent = 0;
    
            // Initialize carousel: show the first event
            eventElements.forEach((el, index) => {
                el.classList.toggle('active', index === 0);
                el.classList.toggle('hidden', index !== 0);
            });
    
            // Rotate events
            this.eventInterval = setInterval(() => {
                // Hide current event
                eventElements[this.currentEvent].classList.remove('active');
                eventElements[this.currentEvent].classList.add('hidden');
    
                // Move to the next event
                this.currentEvent = (this.currentEvent + 1) % eventElements.length;
    
                // Show next event
                eventElements[this.currentEvent].classList.remove('hidden');
                eventElements[this.currentEvent].classList.add('active');
            }, 5000); // Rotate every 5 seconds
        }
    }
    

    clearCarousel() {
        if (this.eventInterval) {
            clearInterval(this.eventInterval);
            this.eventInterval = null;
        }
    }

    start(fetchInterval = 300000) {
        this.fetchCalendar();
        setInterval(() => this.fetchCalendar(), fetchInterval);
    }
}
