import { PLAYER_DATA_SLOT, WORLD_DATA_SLOT } from './shared.js';
const COLLECTION_NAME = 'retroverse_state_v1';

export async function getGameStateRecord(room) {
    // This might be empty on first load until the collection is synced.
    // getList() is sorted newest to oldest, we want the oldest, so we reverse.
    const records = room.collection(COLLECTION_NAME).getList().slice().reverse();
    if (records.length > 0) {
        if (records.length > 1) {
            console.warn("Multiple game state records found. Using the oldest one:", records[0]);
        }
        return records[0];
    }
    return null;
}

export function initializeDatabase(room) {
    return new Promise(resolve => {
        console.log("Host is checking for existing game state...");

        let resolved = false;

        const unsubscribe = room.collection(COLLECTION_NAME).subscribe(async (records) => {
            if (resolved) return;

            if (records && records.length > 0) {
                resolved = true;
                unsubscribe();
                const recordToUse = records.slice().reverse()[0]; // get oldest
                console.log("Game state found. Using existing record:", recordToUse);
                if (records.length > 1) {
                    console.warn(`Found ${records.length} records, but will only use the oldest one.`);
                }
                resolve(recordToUse);
            }
        });

        // Set a timeout. If after this time no records have been found via the subscription,
        // we assume we are the first and should create the record.
        setTimeout(async () => {
            if (resolved) return;

            const currentRecords = room.collection(COLLECTION_NAME).getList();
            if (currentRecords.length === 0) {
                resolved = true;
                unsubscribe();
                console.log("No game state found after timeout. Creating the single master record.");
                const initialState = {};
                for (let i = 0; i < 10; i++) {
                    initialState[`slot_${i}`] = {};
                }
                try {
                    const newRecord = await room.collection(COLLECTION_NAME).create(initialState);
                    console.log("Game state created:", newRecord);
                    resolve(newRecord);
                } catch (e) {
                    console.error("Failed to create game state:", e);
                    // It's possible another client created it in the meantime. Re-fetch.
                    const record = await getGameStateRecord(room);
                    resolve(record);
                }
            } else if (!resolved) {
                // This case is for when getList has records, but the subscriber hasn't fired yet.
                // It's a fallback to prevent duplicate creation.
                resolved = true;
                unsubscribe();
                const recordToUse = currentRecords.slice().reverse()[0]; // get oldest
                console.log("Game state found via getList fallback. Using existing record:", recordToUse);
                resolve(recordToUse);
            }
        }, 5000); // 5-second timeout before creating.
    });
}

export async function updateSlot(room, recordId, slotIndex, data) {
    if (slotIndex < 0 || slotIndex >= 10) {
        console.error(`Invalid slot index: ${slotIndex}`);
        return;
    }
    const payload = {
        [`slot_${slotIndex}`]: data
    };
    try {
        await room.collection(COLLECTION_NAME).update(recordId, payload);
    } catch (e) {
        console.error(`Failed to update slot ${slotIndex}:`, e);
    }
}

export async function updatePlayersData(room, recordId, playersData) {
    await updateSlot(room, recordId, PLAYER_DATA_SLOT, playersData);
}

export async function updateWorldData(room, recordId, worldData) {
    await updateSlot(room, recordId, WORLD_DATA_SLOT, worldData);
}


export function subscribeToGameState(room, callback) {
    // We only care about the oldest record.
    return room.collection(COLLECTION_NAME).subscribe(records => {
        if (records && records.length > 0) {
            // getList is newest to oldest, we want the single master record which should be the oldest.
            const recordToUse = records.slice().reverse()[0];
            callback(recordToUse);
        } else {
            callback(null);
        }
    });
}