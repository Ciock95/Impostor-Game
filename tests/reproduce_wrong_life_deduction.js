const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const players = ['HostPlayer', 'Player2', 'ImpostorPlayer'];
const sockets = [];
let roomId = null;
let impostorId = null;

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
        const client1 = await connectPlayer(players[0]);
        const client2 = await connectPlayer(players[1]);
        const client3 = await connectPlayer(players[2]);

        // Create & Join
        client1.emit('create_room', { playerName: players[0] });

        await new Promise(resolve => {
            client1.on('room_joined', (data) => {
                roomId = data.roomId;
                console.log(`Room created: ${roomId}`);
                resolve();
            });
        });

        client2.emit('join_room', { roomId, playerName: players[1] });
        client3.emit('join_room', { roomId, playerName: players[2] });

        await new Promise(r => setTimeout(r, 1000));

        // Start Game
        console.log('Starting game...');
        client1.emit('start_game', { roomId });

        // Get Roles
        let myRole3 = null;
        await new Promise(resolve => {
            let count = 0;
            const check = () => { count++; if (count === 3) resolve(); };
            client1.on('your_role', check);
            client2.on('your_role', check);
            client3.on('your_role', (data) => {
                myRole3 = data;
                check();
            });
        });

        // Wait for Setup -> Clue
        await new Promise(r => setTimeout(r, 4000));

        // Submit Clues
        client1.emit('submit_clue', { roomId, clue: 'C1' });
        client2.emit('submit_clue', { roomId, clue: 'C2' });
        client3.emit('submit_clue', { roomId, clue: 'C3' });

        // Wait for Vote
        await new Promise(resolve => {
            client1.on('phase_change', (d) => { if (d.phase === 'VOTE') resolve(); });
        });

        // Cheat: Find who is impostor.
        // We can't know for sure in client, but let's assume we can trigger the scenario by luck or by reading logs.
        // Actually, for this test, let's just make EVERYONE vote for Player 3 (ImpostorPlayer) and hope he is the impostor.
        // Wait, if he is NOT the impostor, the test fails to reproduce the specific scenario.
        // I need to force Player 3 to be Impostor? No, server is random.
        // I can Read Server Logs to know who is impostor? No, I can't read logs programmatically easily here.

        // Alternative: The test script acts as a "God" client? No.
        // I will just play one round. If Player 3 is NOT impostor, I retry? 
        // Or I can just check the 'impostor_caught' event which tells me the ID.

        console.log('Voting for everyone to catch someone...');
        // We need to catch the REAL impostor.
        // In the game, players see clues. Here we don't know who is impostor.
        // But the server emits 'your_role' to each socket.
        // I can capture 'your_role' in the setup phase!

        // I need to listen to 'your_role' on all clients.

    } catch (e) { console.error(e); }
}
// Rewriting the script to be smarter
