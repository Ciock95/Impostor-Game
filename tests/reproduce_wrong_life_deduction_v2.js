const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const players = ['Player1', 'Player2', 'Player3'];
const clientSockets = [];
let roomId = null;
let impostorSocket = null;
let impostorName = null;

function connectPlayer(name) {
    return new Promise((resolve) => {
        const socket = io(SOCKET_URL);
        socket.on('connect', () => {
            // console.log(`${name} connected`);
        });
        clientSockets.push({ socket, name });
        resolve(socket);
    });
}

async function runTest() {
    try {
        const s1 = await connectPlayer(players[0]);
        const s2 = await connectPlayer(players[1]);
        const s3 = await connectPlayer(players[2]);

        // Create
        s1.emit('create_room', { playerName: players[0] });
        await new Promise(resolve => {
            s1.on('room_joined', (data) => {
                roomId = data.roomId;
                console.log(`Room: ${roomId}`);
                resolve();
            });
        });

        // Join
        s2.emit('join_room', { roomId, playerName: players[1] });
        s3.emit('join_room', { roomId, playerName: players[2] });
        await new Promise(r => setTimeout(r, 1000));

        // Start
        console.log('Starting...');
        s1.emit('start_game', { roomId });

        // Identify Impostor
        await new Promise(resolve => {
            let rolesReceived = 0;
            clientSockets.forEach(({ socket, name }) => {
                socket.on('your_role', (roleData) => {
                    rolesReceived++;
                    if (roleData.role === 'IMPOSTOR') {
                        impostorSocket = socket;
                        impostorName = name;
                        console.log(`IMPOSTOR IS: ${name} (${socket.id})`);
                        // Force check that we preserve this ID
                    }
                    if (rolesReceived === 3) resolve();
                });
            });
        });

        // Wait for Clue
        await new Promise(r => setTimeout(r, 4000));

        // Submit Clues
        clientSockets.forEach(({ socket }) => {
            socket.emit('submit_clue', { roomId, clue: 'test' });
        });

        // Wait for Vote
        await new Promise(resolve => {
            s1.on('phase_change', (d) => { if (d.phase === 'VOTE') resolve(); });
        });

        console.log('Voting for Impostor...');
        clientSockets.forEach(({ socket }) => {
            // Vote for the impostor's ID
            socket.emit('vote_player', { roomId, targetId: impostorSocket.id });
        });

        // Wait for RESOLUTION (Impostor Caught)
        await new Promise(resolve => {
            s1.on('impostor_caught', () => {
                console.log('Impostor caught!');
                resolve();
            });
        });

        // Impostor Guesses Incorrectly
        console.log('Impostor guessing wrong word (index 100)...');
        // Assuming target is not 100.
        impostorSocket.emit('impostor_guess', { roomId, wordIndex: 100 });

        // Check Round End
        await new Promise(resolve => {
            s1.on('round_end', (data) => {
                console.log('Round End Reason:', data.reason);

                // Assertions
                const players = data.players;
                const impostorP = players.find(p => p.id === impostorSocket.id);
                const hostP = players.find(p => p.id === s1.id);

                console.log(`Impostor Lives: ${impostorP.lives}`);
                console.log(`Host Lives: ${hostP.lives}`);

                if (impostorP.lives === 2) {
                    console.log('TEST PASSED: Impostor lost a life.');
                } else {
                    console.log('TEST FAILED: Impostor did not lose 1 life (started with 3).');
                }

                if (hostP.id !== impostorP.id && hostP.lives !== 3) {
                    console.log('TEST FAILED: Host lost a life but was not impostor!');
                }

                resolve();
            });
        });

        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
