import { getGameStateRecord, subscribeToGameState } from './database.js';
import { getPlayer, setPlayerPosition } from './world.js';

const POSITION_UPDATE_INTERVAL = 100; // 10 times per second

export async function initPlayer(room, hostUsername) {
    console.log(`Initializing Player, host is ${hostUsername}...`);

    let initialPositionSet = false;

    // First, try a one-time fetch to set the position immediately if possible.
    // This helps prevent sending an initial (0,0,0) position to the host.
    const initialRecord = await getGameStateRecord(room);
    if (initialRecord && initialRecord.slot_1) {
        const playersData = initialRecord.slot_1;
        const myData = playersData[room.clientId];
        if (myData && myData.position) {
            console.log("Found initial position on first fetch, setting character to:", myData.position);
            setPlayerPosition(myData.position.x, myData.position.y, myData.position.z);
            initialPositionSet = true;
        }
    }

    // Subscribe for any updates that might have been missed or for the very first load.
    const unsubscribe = subscribeToGameState(room, (gameState) => {
        if (initialPositionSet) {
            unsubscribe();
            return;
        }
        if (gameState && gameState.slot_1) {
            const playersData = gameState.slot_1;
            const myData = playersData[room.clientId];
            if (myData && myData.position) {
                console.log("Found my last position via subscription, setting character to:", myData.position);
                setPlayerPosition(myData.position.x, myData.position.y, myData.position.z);
                initialPositionSet = true;
                unsubscribe(); // We only need this once on startup.
            }
        }
    });

    // Clean up subscription after a timeout if no data is found, to prevent memory leaks.
    setTimeout(() => {
        if (!initialPositionSet) {
            console.log("Stopped listening for initial position after timeout.");
            unsubscribe();
        }
    }, 10000);

    // Listen for messages from the host, like position corrections.
    room.onmessage = (event) => {
        const { data } = event;
        if (data.type === 'position_correction') {
            console.log('Received position correction from host:', data.position);
            setPlayerPosition(data.position.x, data.position.y, data.position.z);
        }
    };

    // Send position updates to the host periodically
    setInterval(() => {
        const player = getPlayer();
        if (player) {
            room.send({
                type: 'player_position_update',
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                }
            });
        }
    }, POSITION_UPDATE_INTERVAL);
}