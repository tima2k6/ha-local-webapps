export class Ticker {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.ws = null;
        this.states = {
            feedingState: null,
            wasteReminder: null,
            garbageCollection: null,
            recyclingCollection: null,
            garageDoor: null,
            backyardDoor: null
        };
        this.setupWebSocket();
    }

    setupWebSocket() {
        const wsUrl = this.haUrl.replace(/^http/, 'ws');
        this.ws = new WebSocket(`${wsUrl}/api/websocket`);

        this.ws.onopen = () => {
            console.log('WebSocket: Connected');
            this.ws.send(JSON.stringify({
                type: "auth",
                access_token: this.token
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "auth_ok") {
                console.log('WebSocket: Authenticated');
                this.ws.send(JSON.stringify({
                    id: 1,
                    type: "get_states"
                }));
            } 
            else if (data.type === "result" && data.id === 1) {
                // Process initial states
                data.result.forEach(entity => {
                    this.processEntityState(entity.entity_id, entity.state);
                });
                
                // Subscribe to all relevant entities
                this.ws.send(JSON.stringify({
                    id: 2,
                    type: "subscribe_events",
                    event_type: "state_changed"
                }));
                
                this.updateTicker();
            }
            else if (data.type === "event" && 
                     data.event?.event_type === "state_changed") {
                const entityId = data.event.data.entity_id;
                const newState = data.event.data.new_state.state;
                this.processEntityState(entityId, newState);
                this.updateTicker();
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket: Disconnected, reconnecting...');
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    processEntityState(entityId, state) {
        switch(entityId) {
            case "sensor.zoey_feeding_status":
                this.states.feedingState = state;
                break;
            case "sensor.waste_collection_reminder":
                this.states.wasteReminder = state.toLowerCase() === 'true';
                break;
            case "sensor.garbage_collection":
                this.states.garbageCollection = state;
                break;
            case "sensor.recycling_collection":
                this.states.recyclingCollection = state;
                break;
            case "binary_sensor.dog_door_garage_contact":
                this.states.garageDoor = state;
                break;
            case "binary_sensor.dog_door_backyard_contact":
                this.states.backyardDoor = state;
                break;
        }
    }

    async updateTicker() {
        const tickerElement = this.container.querySelector('.ticker-content');
        if (!tickerElement) {
            console.error('Ticker element not found!');
            return;
        }
        const currentMessages = tickerElement.innerHTML || '';
        let tickerMessages = [];

        try {
            // Handle dog feeding status
            if (this.states.feedingState) {
                if (this.states.feedingState === 'fed') {
                    tickerMessages.push('<span style="color: #4CAF50;">Zoey has been Fed</span>');
                } else if (this.states.feedingState === 'not-fed') {
                    tickerMessages.push('<span style="color: red;">Zoey has NOT been Fed</span>');
                } else if (this.states.feedingState === 'overdue') {
                    tickerMessages.push('<span style="color: orange;">Zoey is overdue for feeding!</span>');
                } else if (this.states.feedingState === 'outside-feeding-time') {
                    console.log('Skipping dog feeding messages: Outside feeding time');
                } else {
                    tickerMessages.push('<span style="color: gray;">Feeding status is unknown.</span>');
                }

                if (this.states.feedingState !== 'outside-feeding-time') {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
            }

            // Handle Waste Collection
            if (this.states.wasteReminder) {
                tickerMessages.push('<span style="color: orange;">Reminder: Trash pickup is soon!</span>');
                
                if (this.states.garbageCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Trash: ${this.states.garbageCollection}</span>`);
                }
                
                if (this.states.recyclingCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Recycling: ${this.states.recyclingCollection}</span>`);
                }
            }

            // Add a spacer between messages if both exist
            if (tickerMessages.length > 0 && this.states.wasteReminder) {
                tickerMessages.push('<span style="margin: 0 2rem;"></span>');
            }

            // Handle Dog Doors
            if (this.states.garageDoor === 'on' && this.states.backyardDoor === 'on') {
                tickerMessages.push('<span style="color: green;">Dog Doors are Open</span>');
            }

            // Add final spacer
            if (tickerMessages.length > 0) {
                tickerMessages.push('<span style="margin: 0 2rem;"></span>');
            }
        } catch (error) {
            console.error('Ticker update error:', error);
            tickerMessages.push('<span>Error updating ticker.</span>');
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

    start() {
        this.updateTicker();
    }
} 