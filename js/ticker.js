export class Ticker {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
    }

    async updateTicker() {
        const tickerElement = this.container.querySelector('.ticker-content');
        const currentMessages = tickerElement?.innerHTML || '';
        let tickerMessages = [];

        try {
            // Fetch Dog Feeding Status
            const feedingResponse = await fetch(`${this.haUrl}/api/states/sensor.zoey_feeding_status`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!feedingResponse.ok) throw new Error(`HTTP error! status: ${feedingResponse.status}`);

            const feedingData = await feedingResponse.json();
            if (feedingData.state !== 'unknown' && feedingData.state !== 'unavailable') {
                const status = feedingData.state === 'fed' ? 'has been Fed' : 'has NOT been fed';
                const color = feedingData.state === 'fed' ? '#4CAF50' : 'red';
                tickerMessages.push(`<span style="color: ${color};">Zoey ${status}</span>`);
                tickerMessages.push('<span style="margin: 0 2rem;"></span>');
            }

            // Fetch Waste Collection Reminder
            const wasteResponse = await fetch(`${this.haUrl}/api/states/sensor.waste_collection_reminder`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!wasteResponse.ok) throw new Error(`HTTP error! status: ${wasteResponse.status}`);

            const wasteData = await wasteResponse.json();
            const wasteValue = wasteData.state.toLowerCase() === 'true';

            if (wasteValue) {
                tickerMessages.push('<span style="color: orange;">Reminder: Trash collection day is soon.</span>');

                // Fetch Garbage Collection
                const garbageResponse = await fetch(`${this.haUrl}/api/states/sensor.garbage_collection`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                    }
                });

                if (!garbageResponse.ok) throw new Error(`HTTP error! status: ${garbageResponse.status}`);

                const garbageData = await garbageResponse.json();
                tickerMessages.push(`<span style="margin-left: 2rem;">Garbage Collection - ${garbageData.state}</span>`);

                // Fetch Recycling Collection
                const recyclingResponse = await fetch(`${this.haUrl}/api/states/sensor.recycling_collection`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                    }
                });

                if (!recyclingResponse.ok) throw new Error(`HTTP error! status: ${recyclingResponse.status}`);

                const recyclingData = await recyclingResponse.json();
                tickerMessages.push(`<span style="margin-left: 2rem;">Recycling Collection - ${recyclingData.state}</span>`);
            }

            // Add a spacer between messages if both exist
            if (tickerMessages.length > 0 && wasteValue) {
                tickerMessages.push('<span style="margin: 0 2rem;"></span>');
            }

            // Add Dog Doors Check
            const garageDoorResponse = await fetch(`${this.haUrl}/api/states/binary_sensor.dog_door_garage_contact`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            });
            const backyardDoorResponse = await fetch(`${this.haUrl}/api/states/binary_sensor.dog_door_backyard_contact`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!garageDoorResponse.ok || !backyardDoorResponse.ok) {
                throw new Error('Failed to fetch dog door states');
            }

            const garageDoorData = await garageDoorResponse.json();
            const backyardDoorData = await backyardDoorResponse.json();

            if (garageDoorData.state === 'on' && backyardDoorData.state === 'on') {
                tickerMessages.push('<span style="color: green;">Dog Doors are Open</span>');
            }

            // Add final spacer at the end of all messages if there are any messages
            if (tickerMessages.length > 0) {
                tickerMessages.push('<span style="margin: 0 2rem;"></span>');
            }
        } catch (error) {
            console.error('Ticker fetch error:', error);
            tickerMessages.push('<span>Error fetching data.</span>');
        }

        // Only update ticker content if messages changed
        const newContent = tickerMessages.join('');
        if (newContent !== currentMessages) {
            tickerElement.innerHTML = newContent;
            
            // Reset and start animation
            tickerElement.style.animation = 'none';
            tickerElement.offsetHeight; // Trigger reflow
            tickerElement.style.animation = 'tickerScroll 30s linear infinite';
        }
    }

    start(interval = 300000) {
        this.updateTicker();
        setInterval(() => this.updateTicker(), interval);
    }
} 