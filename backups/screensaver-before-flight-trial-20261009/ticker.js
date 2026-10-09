export class Ticker {
    constructor(haUrl, token, container) {
        this.haUrl = haUrl;
        this.token = token;
        this.container = container;
        this.ws = null;
        this.reconnectDelay = 5000;
        this.reconnectTimer = null;
        this.authFailed = false;
        // State management for different types of sensors/entities
        this.states = {
            // Pet Care
            feedingState: null,          // Zoey's feeding status

            // Waste Management
            wasteReminder: null,         // General waste collection reminder
            garbageCollection: null,     // Garbage collection date
            recyclingCollection: null,   // Recycling collection date
            trashOut: null,              // Whether trash has been taken out

            // Security & Access
            openWindowsCount: 0,         // Number of open windows
            exteriorDoorCount: 0,        // Number of open exterior doors
        };
        this.currentContent = '';
        this.setupWebSocket();
    }

    setupWebSocket() {
        if (this.authFailed) return;

        // Tear down any previous socket so handlers don't stack on reconnect
        if (this.ws) {
            this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
            try { this.ws.close(); } catch (e) { /* already closed */ }
        }

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
                this.reconnectDelay = 5000;  // reset backoff on success
                this.ws.send(JSON.stringify({
                    id: 1,
                    type: "get_states"
                }));
            }
            else if (data.type === "auth_invalid") {
                console.error('WebSocket: Auth rejected -', data.message);
                this.authFailed = true;      // stop the pointless retry loop
                this.ws.close();
            }
            // Handle initial state response
            else if (data.type === "result" && data.id === 1) {
                data.result.forEach(entity => {
                    this.processEntityState(entity.entity_id, entity.state, entity);
                });

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
                // new_state is null when an entity is removed
                const newState = data.event.data.new_state?.state ?? null;
                if (this.processEntityState(entityId, newState, data.event.data.new_state)) {
                    this.updateTicker();
                }
            }
        };

        this.ws.onclose = () => {
            if (this.authFailed) {
                console.error('WebSocket: Not reconnecting - check your access token');
                return;
            }
            console.log(`WebSocket: Disconnected, reconnecting in ${this.reconnectDelay / 1000}s...`);
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.setupWebSocket(), this.reconnectDelay);
            // Exponential backoff, capped at 60s
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        };
    }

    // Returns true if the tracked state actually changed. stateObj is the full
    // HA state (last_changed etc.) for subclasses that need it.
    processEntityState(entityId, state, stateObj) {
        let stateChanged = false;
        const raw = typeof state === 'string' ? state : '';

        switch (entityId) {
            // Pet Care Sensors
            case "sensor.zoey_feeding_status": {
                if (this.states.feedingState !== raw) {
                    this.states.feedingState = raw;
                    stateChanged = true;
                }
                break;
            }

            // Waste Management Sensors
            case "sensor.waste_collection_reminder": {
                const reminder = raw.toLowerCase() === 'true';
                if (this.states.wasteReminder !== reminder) {
                    this.states.wasteReminder = reminder;
                    stateChanged = true;
                }
                break;
            }
            case "sensor.garbage_pickup": {
                if (this.states.garbageCollection !== raw) {
                    this.states.garbageCollection = raw;
                    stateChanged = true;
                }
                break;
            }
            case "sensor.recycling_pickup": {
                if (this.states.recyclingCollection !== raw) {
                    this.states.recyclingCollection = raw;
                    stateChanged = true;
                }
                break;
            }
            case "input_boolean.trash_out": {
                const trashOut = raw.toLowerCase() === 'on';
                if (this.states.trashOut !== trashOut) {
                    this.states.trashOut = trashOut;
                    stateChanged = true;
                }
                break;
            }

            // Security & Access Sensors
            case "sensor.open_windows_count": {
                const openWindows = parseInt(raw, 10) || 0;
                if (this.states.openWindowsCount !== openWindows) {
                    this.states.openWindowsCount = openWindows;
                    stateChanged = true;
                }
                break;
            }
            case "sensor.exterior_door_count": {
                const exteriorDoors = parseInt(raw, 10) || 0;
                if (this.states.exteriorDoorCount !== exteriorDoors) {
                    this.states.exteriorDoorCount = exteriorDoors;
                    stateChanged = true;
                }
                break;
            }
        }

        return stateChanged;
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
                    const spacer = '<span style="display: inline-block; width: 100vw;"></span>';
                    tickerElement.innerHTML = `<span class="ticker-text">${newContent}</span>${spacer}<span class="ticker-text">${newContent}</span>`;

                    // Force reflow so scrollWidth is accurate
                    tickerElement.style.animation = 'none';
                    tickerElement.offsetHeight;

                    // Constant scroll speed regardless of how many messages are showing
                    const PIXELS_PER_SECOND = 120;
                    const travel = window.innerWidth + tickerElement.scrollWidth;
                    const duration = Math.max(travel / PIXELS_PER_SECOND, 15);
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