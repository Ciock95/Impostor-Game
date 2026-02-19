const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const players = ['Player1', 'Player2', 'Player3'];
const sockets = [];
let roomId = null;

function connectPlayer(name) {
    return new Promise((resolve) => {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => {
            console.log(`${name} connected: ${socket.id}`);
            resolve(socket);
        });
        sockets.push(socket);
    });
}

async function runTest() {
    try {
        // 1. Connect Players
        const client1 = await connectPlayer(players[0]);
        const client2 = await connectPlayer(players[1]);
        const client3 = await connectPlayer(players[2]);

        // 2. Create Room
        client1.emit('create_room', { playerName: players[0] });

        await new Promise(resolve => {
            client1.on('room_joined', (data) => {
                roomId = data.roomId;
                console.log(`Room created: ${roomId}`);
                resolve();
            });
        });

        // 3. Join others
        client2.emit('join_room', { roomId, playerName: players[1] });
        client3.emit('join_room', { roomId, playerName: players[2] });

        // Wait for joins
        await new Promise(r => setTimeout(r, 1000));

        // 4. Start Game
        console.log('Starting game...');
        client1.emit('start_game', { roomId });

        // 5. Simulating Clue Phase
        // Wait for phase CLUE
        await new Promise(resolve => {
            const checkPhase = (data) => {
                if (data.phase === 'CLUE' || (data.gameState && data.gameState.phase === 'CLUE')) {
                    console.log('Phase is CLUE');
                    client1.off('room_update', checkPhase);
                    resolve();
                }
            };
            client1.on('room_update', checkPhase);
            client1.on('phase_change', (data) => {
                if (data.phase === 'CLUE') resolve();
            });
            // Also listen to initial game_started
            client1.on('game_started', () => {
                console.log('Game Started event received');
                // Wait a bit for transition to CLUE? 
                // Actually game_started -> SETUP -> 3s -> CLUE
            });
        });

        // Wait for Setup -> Clue transition (3s)
        console.log('Waiting for Clue phase...');
        await new Promise(r => setTimeout(r, 4000));

        // Submit Clues
        console.log('Submitting clues...');
        client1.emit('submit_clue', { roomId, clue: 'Clue1' });
        client2.emit('submit_clue', { roomId, clue: 'Clue2' });
        client3.emit('submit_clue', { roomId, clue: 'Clue3' });

        // Wait for Voting Phase
        await new Promise(resolve => {
            client1.on('phase_change', (data) => {
                if (data.phase === 'VOTE') {
                    console.log('Phase is VOTE');
                    resolve();
                }
            });
        });

        // Vote (Skip for simplicity, or vote random)
        console.log('Voting...');
        client1.emit('vote_player', { roomId, targetId: 'SKIP' });
        client2.emit('vote_player', { roomId, targetId: 'SKIP' });
        client3.emit('vote_player', { roomId, targetId: 'SKIP' });

        // Wait for Round End
        await new Promise(resolve => {
            client1.on('round_end', (data) => {
                console.log('Round End received:', data.result);
                resolve();
            });
        });

        console.log('Waiting 6 seconds for Next Round...');

        let nextRoundStarted = false;
        client1.on('room_update', (data) => {
            if (data.phase === 'COUNTDOWN') {
                console.log('SUCCESS: Phase changed to COUNTDOWN');
                nextRoundStarted = true;
            }
        });
        client1.on('timer_tick', (t) => {
            // console.log('Tick:', t);
        });

        await new Promise(r => setTimeout(r, 7000));

        if (nextRoundStarted) {
            console.log('TEST PASSED: Next round started.');
        } else {
            console.log('TEST FAILED: Next round did not start.');
        }

        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
