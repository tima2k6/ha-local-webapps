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
            backyardDoor: null,
            trashOut: null
        };
        this.currentContent = '';
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
                
                // Subscribe to all relevant entities (including input_boolean.trash_out)
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
        let stateChanged = false;
        
        switch(entityId) {
            case "sensor.zoey_feeding_status":
                if (this.states.feedingState !== state) {
                    this.states.feedingState = state;
                    stateChanged = true;
                }
                break;
            case "sensor.waste_collection_reminder":
                const newState = state.toLowerCase() === 'true';
                if (this.states.wasteReminder !== newState) {
                    this.states.wasteReminder = newState;
                    stateChanged = true;
                }
                break;
            case "sensor.garbage_collection":
                if (this.states.garbageCollection !== state) {
                    this.states.garbageCollection = state;
                    stateChanged = true;
                }
                break;
            case "sensor.recycling_collection":
                if (this.states.recyclingCollection !== state) {
                    this.states.recyclingCollection = state;
                    stateChanged = true;
                }
                break;
            case "binary_sensor.dog_door_garage_contact":
                if (this.states.garageDoor !== state) {
                    this.states.garageDoor = state;
                    stateChanged = true;
                }
                break;
            case "binary_sensor.dog_door_backyard_contact":
                if (this.states.backyardDoor !== state) {
                    this.states.backyardDoor = state;
                    stateChanged = true;
                }
                break;
            case "input_boolean.trash_out":
                const newTrashState = state.toLowerCase() === 'on';
                if (this.states.trashOut !== newTrashState) {
                    this.states.trashOut = newTrashState;
                    stateChanged = true;
                }
                break;
        }

        // Only update ticker if state actually changed
        if (stateChanged) {
            this.updateTicker();
        }
    }

    async updateTicker() {
        const tickerElement = this.container.querySelector('.ticker-content');
        if (!tickerElement) {
            console.error('Ticker element not found!');
            return;
        }

        let tickerMessages = [];

        try {
            // Build messages
            if (this.states.feedingState && this.states.feedingState !== 'outside-feeding-time') {
                if (this.states.feedingState === 'fed') {
                    tickerMessages.push('<span style="color: limegreen;">Zoey\'s been fed</span>');
                } else if (this.states.feedingState === 'not-fed') {
                    tickerMessages.push('<span style="color: orangered;">Zoey has NOT been fed</span>');
                } else if (this.states.feedingState === 'overdue') {
                    tickerMessages.push('<span style="color: orange;">Zoey\'s probably hungry!</span>');
                }
            }

            if (this.states.wasteReminder && !this.states.trashOut) {
                if (tickerMessages.length > 0) {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
                tickerMessages.push('<span style="color: orange;">Reminder: Trash pickup is soon!</span>');
                
                if (this.states.garbageCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Trash: ${this.states.garbageCollection}</span>`);
                }
                
                if (this.states.recyclingCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Recycling: ${this.states.recyclingCollection}</span>`);
                }
            }

            if (this.states.garageDoor === 'on' && this.states.backyardDoor === 'on') {
                if (tickerMessages.length > 0) {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
                tickerMessages.push('<span style="color: #16F529";">Both Dog Doors are open</span>');
            }

            const newContent = tickerMessages.join('');

            // Only update if content actually changed
            if (newContent !== this.currentContent) {
                console.log('Content changed, updating ticker');
                this.currentContent = newContent;

                if (newContent === '') {
                    tickerElement.innerHTML = '';
                    tickerElement.style.removeProperty('animation');
                } else {
                    tickerElement.innerHTML = newContent;
                    // Force reflow
                    tickerElement.style.animation = 'none';
                    tickerElement.offsetHeight;
                    // Set animation with fixed duration
                    tickerElement.style.animation = 'tickerScroll 15s linear infinite';
                }
            }
        } catch (error) {
            console.error('Ticker update error:', error);
        }
    }

    start() {
        this.updateTicker();
    }
}