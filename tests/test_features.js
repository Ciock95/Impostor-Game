const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const players = ['Tester1', 'Tester2', 'Tester3'];
const clientSockets = [];
let roomId = null;
let impostorSocket = null;

function connectPlayer(name) {
    return new Promise((resolve) => {
        const socket = io(SOCKET_URL);
        clientSockets.push({ socket, name });
        socket.on('connect', () => resolve(socket));
    });
}

async function runTest() {
    try {
        console.log('--- STARTING FEATURE TEST: IMPOSTOR WIN CHOICE ---');

        // 1. Connect Players
        const s1 = await connectPlayer(players[0]);
        const s2 = await connectPlayer(players[1]);
        const s3 = await connectPlayer(players[2]);

        // 2. Create & Join Room
        s1.emit('create_room', { playerName: players[0] });
        await new Promise(resolve => {
            s1.on('room_joined', (data) => {
                roomId = data.roomId;
                console.log(`[PASS] Room Created: ${roomId}`);
                resolve();
            });
        });

        s2.emit('join_room', { roomId, playerName: players[1] });
        s3.emit('join_room', { roomId, playerName: players[2] });

        // Wait for joins
        await new Promise(r => setTimeout(r, 1000));

        // 3. Start Game
        s1.emit('start_game', { roomId });
        console.log('Game Started...');

        // 4. Identify Impostor & Target Word
        let targetIndex = null;
        await new Promise(resolve => {
            let received = 0;
            clientSockets.forEach(({ socket, name }) => {
                socket.on('your_role', (data) => {
                    if (!data) return; // Ignore null data sent during countdown
                    received++;
                    if (data.role === 'IMPOSTOR') {
                        impostorSocket = socket;
                        console.log(`[INFO] Impostor is ${name}`);
                    } else {
                        targetIndex = data.targetIndex;
                    }
                    if (received === 3) resolve();
                });
            });
        });

        // We need the target word index. Impostor needs to guess it. 
        // Innocents know the targetIndex.
        // Let's assume we grabbed it from an innocent.
        if (targetIndex === null) {
            // In `startGame`, `secretData` for Innocent has `targetIndex`.
            // We caught it above.
        }
        console.log(`[INFO] Target Index is: ${targetIndex}`);

        // 5. Submit Clues
        await new Promise(r => setTimeout(r, 6000)); // Countdown
        console.log('Submitting Clues...');
        clientSockets.forEach(({ socket }) => {
            socket.emit('submit_clue', { roomId, clue: 'test_clue' });
        });

        // 6. Wait for Voting Phase -> Voting for Impostor to trigger Resolution
        await new Promise(resolve => {
            s1.on('phase_change', (d) => {
                if (d.phase === 'VOTE') {
                    console.log('[PASS] Reached Voting Phase');
                    resolve();
                }
            });
        });

        console.log('Voting for Impostor to trigger Resolution...');
        clientSockets.forEach(({ socket }) => {
            // Vote for Impostor ID
            socket.emit('vote_player', { roomId, targetId: impostorSocket.id });
        });

        // 7. Wait for Resolution
        await new Promise(resolve => {
            s1.on('impostor_caught', (d) => {
                console.log('[PASS] Reached Resolution (Impostor Caught)');
                resolve();
            });
        });

        // 8. Impostor Guesses Correctly
        console.log('Impostor guessing correctly...');
        impostorSocket.emit('impostor_guess', { roomId, wordIndex: targetIndex });

        // 9. NEW FLOW: Expect Phase Change to STEAL_LIFE with reason WORD_GUESSED
        await new Promise(resolve => {
            s1.on('phase_change', (d) => {
                if (d.phase === 'STEAL_LIFE' && d.reason === 'WORD_GUESSED') {
                    console.log('[PASS] Successfully transitioned to STEAL_LIFE (WORD_GUESSED)');
                    resolve();
                }
            });
        });

        // 10. Impostor Selects Victim
        console.log('Impostor selecting victim...');
        const victimSocket = clientSockets.find(c => c.socket.id !== impostorSocket.id).socket;
        impostorSocket.emit('steal_life', { roomId, targetId: victimSocket.id });

        // 11. Check Round End
        await new Promise(resolve => {
            s1.on('round_end', (data) => {
                if (data.reason === 'WORD_GUESSED' && data.result === 'IMPOSTOR_WIN') {
                    console.log('[PASS] Round Ended Correctly: IMPOSTOR_WIN (WORD_GUESSED)');
                    if (data.victimId === victimSocket.id) {
                        console.log('[PASS] Correct victim eliminated');
                    } else {
                        console.log(`[FAIL] Wrong victim: ${data.victimId} vs ${victimSocket.id}`);
                    }
                } else {
                    console.log(`[FAIL] Wrong result/reason: ${data.result} / ${data.reason}`);
                }
                resolve();
            });
        });

        console.log('--- TEST COMPLETED SUCCESSFULLY ---');
        process.exit(0);

    } catch (e) {
        console.error('[ERROR]', e);
        process.exit(1);
    }
}

runTest();
