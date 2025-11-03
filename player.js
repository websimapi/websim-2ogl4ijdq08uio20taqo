import { subscribeToGameState } from './database.js';
import { getPlayer, setPlayerPosition } from './world.js';

const POSITION_UPDATE_INTERVAL = 100; // 10 times per second

export async function initPlayer(room, hostUsername) {
    console.log(`Initializing Player, host is ${hostUsername}...`);

    // Attempt to load initial position from the database.
    const unsubscribe = subscribeToGameState(room, (gameState) => {
        if (gameState && gameState.slot_1) {
            const playersData = gameState.slot_1;
            const myData = playersData[room.clientId];
            if (myData && myData.position) {
                console.log("Found my last position, setting character to:", myData.position);
                setPlayerPosition(myData.position.x, myData.position.y, myData.position.z);
                unsubscribe(); // We only need this once on startup.
            }
        }
    });

    // Clean up subscription after a timeout if no data is found, to prevent memory leaks.
    setTimeout(() => {
        unsubscribe();
        console.log("Stopped listening for initial position.");
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

