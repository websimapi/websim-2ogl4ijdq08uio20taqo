import { initializeDatabase, subscribeToGameState, updatePlayersData, updateWorldData } from './database.js';
import { getPlayer } from './world.js';

const UPDATE_INTERVAL = 200; // 5 times per second

export async function initHost(room, dataDisplayEl) {
    console.log("Initializing Host...");
    const gameStateRecord = await initializeDatabase(room);
    if (!gameStateRecord) {
        dataDisplayEl.textContent = "Error: Could not initialize or find game state record.";
        return;
    }

    const recordId = gameStateRecord.id;
    let playersData = gameStateRecord.slot_1 || {};
    
    // Initialize world data if it doesn't exist
    if (!gameStateRecord.slot_0 || gameStateRecord.slot_0.seed === undefined) {
        await updateWorldData(room, recordId, { seed: 0 });
    }

    subscribeToGameState(room, (state) => {
        if (state) {
            dataDisplayEl.textContent = JSON.stringify(state, null, 2);
        } else {
            dataDisplayEl.textContent = "Waiting for game state...";
        }
    });

    function cleanDisconnectedPlayers() {
        const connectedClientIds = Object.keys(room.peers);
        // Add host to connected clients to not remove self
        if (!connectedClientIds.includes(room.clientId)) {
            connectedClientIds.push(room.clientId);
        }
        let updated = false;
        for (const clientId in playersData) {
            if (!connectedClientIds.includes(clientId)) {
                console.log(`Player ${playersData[clientId]?.username} (${clientId}) disconnected. Removing from data.`);
                delete playersData[clientId];
                updated = true;
            }
        }
        if (updated) {
            updatePlayersData(room, recordId, playersData);
        }
    }
    
    room.subscribePresence(() => {
        cleanDisconnectedPlayers();
    });
    cleanDisconnectedPlayers();


    // Main update loop for host
    setInterval(() => {
        // Update host's own data
        const hostPlayer = getPlayer();
        if (hostPlayer) {
            playersData[room.clientId] = {
                username: room.peers[room.clientId]?.username || 'HOST',
                position: {
                    x: hostPlayer.position.x,
                    y: hostPlayer.position.y,
                    z: hostPlayer.position.z,
                },
                timestamp: new Date().toISOString()
            };
        }

        // Persist the collected player data
        updatePlayersData(room, recordId, playersData);

    }, UPDATE_INTERVAL);

    // Listen for player messages
    room.onmessage = (event) => {
        const { data, clientId } = event;
        const { type, position } = data;

        if (clientId === room.clientId) return;

        if (type === 'player_position_update') {
            // ALWAYS trust the host's version of player data first.
            const lastKnownPosition = playersData[clientId]?.position;
            
            // If we have a record of this player and their position is drastically different,
            // send a correction. This can happen on first connect if they spawn at 0,0,0
            // before their client has loaded the correct position from the DB.
            if (lastKnownPosition) {
                const clientPos = {x: position.x, y: position.y, z: position.z};
                const distance = Math.sqrt(
                    Math.pow(clientPos.x - lastKnownPosition.x, 2) +
                    Math.pow(clientPos.y - lastKnownPosition.y, 2) +
                    Math.pow(clientPos.z - lastKnownPosition.z, 2)
                );

                if (distance > 5.0) { // If more than 5 units away, correct them
                     console.log(`Correcting position for ${room.peers[clientId]?.username}. DB: ${JSON.stringify(lastKnownPosition)}, Client: ${JSON.stringify(clientPos)}`);
                     room.sendTo(clientId, {
                        type: 'position_correction',
                        position: lastKnownPosition
                     });
                     // Do not update playersData with this incorrect position.
                     // Wait for their next update after they've corrected themselves.
                     return;
                }
            }

            playersData[clientId] = {
                username: room.peers[clientId]?.username,
                position,
                timestamp: new Date().toISOString()
            };
        }
    };
}