export class Ticker {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.ws = null;
        // State management for different types of sensors/entities
        this.states = {
            // Pet Care
            feedingState: null,          // Zoey's feeding status
            
            // Waste Management
            wasteReminder: null,         // General waste collection reminder
            garbageCollection: null,     // Garbage collection date
            recyclingCollection: null,    // Recycling collection date
            trashOut: null,              // Whether trash has been taken out
            
            // Security & Access
            
            openWindowsCount: 0,         // Number of open windows
            exteriorDoorCount: 0,        // Number of open exterior doors
           
        };
        this.currentContent = '';
        this.setupWebSocket();
    }

    setupWebSocket() {
        // Initialize WebSocket connection
        const wsUrl = this.haUrl.replace(/^http/, 'ws');
        this.ws = new WebSocket(`${wsUrl}/api/websocket`);

        // WebSocket Event Handlers
        this.ws.onopen = () => {
            console.log('WebSocket: Connected');
            // Authenticate with Home Assistant
            this.ws.send(JSON.stringify({
                type: "auth",
                access_token: this.token
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            // Handle authentication response
            if (data.type === "auth_ok") {
                console.log('WebSocket: Authenticated');
                // Request initial states after authentication
                this.ws.send(JSON.stringify({
                    id: 1,
                    type: "get_states"
                }));
            } 
            // Handle initial state response
            else if (data.type === "result" && data.id === 1) {
                // Process initial states
                data.result.forEach(entity => {
                    this.processEntityState(entity.entity_id, entity.state);
                });
                
                // Subscribe to state change events
                this.ws.send(JSON.stringify({
                    id: 2,
                    type: "subscribe_events",
                    event_type: "state_changed"
                }));
                
                this.updateTicker();
            }
            // Handle state change events
            else if (data.type === "event" && 
                     data.event?.event_type === "state_changed") {
                const entityId = data.event.data.entity_id;
                const newState = data.event.data.new_state.state;
                this.processEntityState(entityId, newState);
                this.updateTicker();
            }
        };

        // Handle connection failures
        this.ws.onclose = () => {
            console.log('WebSocket: Disconnected, reconnecting...');
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    processEntityState(entityId, state) {
        let stateChanged = false;
        
        switch(entityId) {
            // Pet Care Sensors
            case "sensor.zoey_feeding_status":
                if (this.states.feedingState !== state) {
                    this.states.feedingState = state;
                    stateChanged = true;
                }
                break;

            // Waste Management Sensors
            case "sensor.waste_collection_reminder":
                const newState = state.toLowerCase() === 'true';
                if (this.states.wasteReminder !== newState) {
                    this.states.wasteReminder = newState;
                    stateChanged = true;
                }
                break;
            case "sensor.garbage_pickup":
                if (this.states.garbageCollection !== state) {
                    this.states.garbageCollection = state;
                    stateChanged = true;
                }
                break;
            case "sensor.recycling_pickup":
                if (this.states.recyclingCollection !== state) {
                    this.states.recyclingCollection = state;
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

            // Security & Access Sensors
            
            case "sensor.open_windows_count":
                const openWindows = parseInt(state, 10) || 0;
                if (this.states.openWindowsCount !== openWindows) {
                    this.states.openWindowsCount = openWindows;
                    stateChanged = true;
                }
                break;
            case "sensor.exterior_door_count":
                const exteriorDoors = parseInt(state, 10) || 0;
                if (this.states.exteriorDoorCount !== exteriorDoors) {
                    this.states.exteriorDoorCount = exteriorDoors;
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
            // Pet Care Messages
            if (this.states.feedingState && this.states.feedingState !== 'outside-feeding-time') {
                if (this.states.feedingState === 'fed') {
                    tickerMessages.push('<span style="color: #16F529;">Zoey\'s been fed</span>');
                } else if (this.states.feedingState === 'not-fed') {
                    tickerMessages.push('<span style="color: #FF2400;">Zoey has NOT been fed</span>');
                } else if (this.states.feedingState === 'overdue') {
                    tickerMessages.push('<span style="color: orange;">Zoey\'s probably hungry!</span>');
                }
            }

            // Waste Management Messages
            if (this.states.wasteReminder && !this.states.trashOut) {
                if (tickerMessages.length > 0) {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
                tickerMessages.push('<span style="color: orange;">Reminder: </span>');
                
                if (this.states.garbageCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Trash: ${this.states.garbageCollection}</span>`);
                }
                
                if (this.states.recyclingCollection) {
                    tickerMessages.push(`<span style="margin-left: 2rem;">Recycling: ${this.states.recyclingCollection}</span>`);
                }
            }


            

            if (this.states.openWindowsCount > 0) {
                if (tickerMessages.length > 0) {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
                tickerMessages.push(`<span style="color: yellow;">Open Windows: ${this.states.openWindowsCount}</span>`);
            }

            if (this.states.exteriorDoorCount > 0) {
                if (tickerMessages.length > 0) {
                    tickerMessages.push('<span style="margin: 0 2rem;"></span>');
                }
                tickerMessages.push(`<span style="color: yellow;">Open Exterior Doors: ${this.states.exteriorDoorCount}</span>`);
            }

            

            // Ticker Display Logic
            const newContent = tickerMessages.join('');

            // Only update if content actually changed
            if (newContent !== this.currentContent) {
                console.log('Content changed, updating ticker');
                this.currentContent = newContent;

                if (newContent !== '') {
                    // Create duplicated content with proper spacing
                    const spacer = '<span style="display: inline-block; width: 100vw;"></span>';
                    tickerElement.innerHTML = `<span class="ticker-text">${newContent}</span>${spacer}<span class="ticker-text">${newContent}</span>`;
                    
                    // Force reflow to measure content
                    tickerElement.style.animation = 'none';
                    tickerElement.offsetHeight;
                    
                    // Calculate animation duration - faster scroll speed
                    const duration = Math.max(window.innerWidth / 50, 20); // pixels per second, minimum 20s
                    tickerElement.style.animation = `tickerScroll ${duration}s linear infinite`;
                } else {
                    tickerElement.innerHTML = '';
                    tickerElement.style.removeProperty('animation');
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
