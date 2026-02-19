const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { generateRoomId } = require('./utils');
const wordsData = require('./data/words.json');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for MVP. Improve for production.
        methods: ['GET', 'POST']
    }
});

// Game State Store
// rooms[roomId] = {
//   players: [{ id, name, role, lives, isGhost, socketId }],
//   phase: 'LOBBY' | 'SETUP' | 'CLUE' | 'VOTE' | 'RESOLUTION' | 'GAME_OVER',
//   category: null,
//   words: [],
//   targetIndex: null,
//   imposterIndex: null, // Index in players array? Or player ID?
//   currentTurnIndex: 0,
//   clues: [], // [{ playerName, text }]
//   votes: {}, // { voterId: suspectId }
//   timer: 0,
//   timerInterval: null
// }
//   timerInterval: null
// }
const rooms = {};

function getSafeRoom(room) {
    if (!room) return null;
    const { timerInterval, imposterId, targetIndex, ...safeRoom } = room;

    // Reveal Impostor ID in specific phases
    if (['RESOLUTION', 'STEAL_LIFE', 'ROUND_END', 'GAME_OVER', 'HEAD_TO_HEAD'].includes(room.phase)) {
        safeRoom.imposterId = imposterId;
    }

    // Phase-based masking
    if (room.phase === 'COUNTDOWN') {
        safeRoom.category = null;
        safeRoom.words = [];
    }

    // Sanitize players' secret roles unless game over or round end or H2H
    safeRoom.players = room.players.map(p => {
        const { role, ...safePlayer } = p;
        // Reveal roles only in specific phases
        if (['ROUND_END', 'GAME_OVER', 'RESOLUTION', 'STEAL_LIFE', 'HEAD_TO_HEAD'].includes(room.phase)) {
            return p; // Send full info (including role)
        }
        // Also reveal if it's the player themselves? No, client handles via 'your_role'
        return safePlayer;
    });

    return safeRoom;
}

const MAX_LIVES = 3;
const CLUE_TIME_LIMIT = 20;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ playerName }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            players: [{
                id: socket.id,
                name: playerName,
                role: null,
                lives: MAX_LIVES,
                hasBonusCard: false,
                isGhost: false,
                isHost: true
            }],
            phase: 'LOBBY',
            category: null,
            words: [],
            targetIndex: null,
            imposterId: null,
            currentTurnIndex: 0,
            clues: [],
            votes: {},
            timer: 0,
            timerInterval: null
        };
        socket.join(roomId);
        socket.emit('room_joined', { roomId, gameState: getSafeRoom(rooms[roomId]) });
        console.log(`Room ${roomId} created by ${playerName}`);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        const room = rooms[roomId.toUpperCase()];
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        if (room.phase !== 'LOBBY') {
            socket.emit('error', 'Game already started');
            return;
        }

        // Check name uniqueness
        if (room.players.some(p => p.name === playerName)) {
            socket.emit('error', 'Name already taken in this room');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            isHost: room.players.length === 0,
            lives: MAX_LIVES,
            isGhost: false,
            score: 0,
            role: null,
            votesReceived: 0,
            hasBonusCard: false,
            timesImpostor: 0 // Track frequency
        });
        socket.join(roomId.toUpperCase());
        io.to(roomId.toUpperCase()).emit('room_update', getSafeRoom(room));
        console.log(`${playerName} joined room ${roomId}`);
    });


    socket.on('start_game', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.players.length < 3) {
            socket.emit('error', 'Need at least 3 players');
            return;
        }

        startGame(roomId);
    });

    socket.on('disconnect', () => {
        // Handle disconnection - remove player or mark as disconnected
        // For MVP, maybe simple remove if in Lobby, else keep as ghost?
        console.log('User disconnected:', socket.id);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                if (room.phase === 'LOBBY') {
                    room.players.splice(playerIndex, 1);
                    if (room.players.length === 0) {
                        delete rooms[roomId];
                    } else {
                        io.to(roomId).emit('room_update', getSafeRoom(room));
                    }
                } else {
                    // In game, maybe mark as disconnected
                    // logic here
                }
            }
        }
    });

    // MISSING HANDLERS ADDED HERE
    socket.on('submit_clue', ({ roomId, clue }) => {
        handleClueSubmission(roomId, socket.id, clue);
    });

    socket.on('vote_player', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.phase !== 'VOTE') return;

        // Check if alive
        const voter = room.players.find(p => p.id === socket.id);
        if (!voter || voter.lives <= 0) return;

        // Record vote
        room.votes[socket.id] = targetId;
        checkVotingResult(roomId);
    });

    socket.on('impostor_guess', ({ roomId, wordIndex }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.phase !== 'RESOLUTION') return; // Should be RESOLUTION/LAST_CHANCE
        if (socket.id !== room.imposterId) return;

        const targetWord = room.words[room.targetIndex];
        const guessedWord = room.words[wordIndex];

        if (wordIndex === room.targetIndex) {
            // Impostor Wins (Correct Guess) -> Transition to STEAL_LIFE to choose victim
            room.phase = 'STEAL_LIFE';
            room.stealReason = 'WORD_GUESSED';

            // Emit Success Result
            io.to(roomId).emit('impostor_guess_result', { success: true, word: targetWord });

            setTimeout(() => {
                io.to(roomId).emit('phase_change', {
                    phase: 'STEAL_LIFE',
                    reason: 'WORD_GUESSED',
                    message: "Impostore ha indovinato! Ora sceglie chi eliminare."
                });
                io.to(roomId).emit('room_update', getSafeRoom(room));

                // Timer for Steal Life phase (10 seconds)
                room.timer = 10;
                io.to(roomId).emit('timer_tick', room.timer);
                if (room.timerInterval) clearInterval(room.timerInterval);
                room.timerInterval = setInterval(() => {
                    room.timer--;
                    if (room.timer <= 0) {
                        clearInterval(room.timerInterval);
                        // Time's up: Impostor Penalty
                        handleStealLife(roomId, room.imposterId, null);
                    } else {
                        io.to(roomId).emit('timer_tick', room.timer);
                    }
                }, 1000);
            }, 3000); // 3s delay to show "HAI INDOVINATO!"
        } else {
            // Incorrect Guess
            const imposter = room.players.find(p => p.id === room.imposterId);

            // Check Bonus Card
            if (imposter && imposter.hasBonusCard) {
                imposter.hasBonusCard = false;
                console.log(`[DEBUG] Impostor used Bonus Card. Room: ${roomId}`);

                // Emit Bonus specific failure (NO WORD REVEAL)
                io.to(roomId).emit('impostor_guess_result', { success: false, isBonus: true });

                io.to(roomId).emit('bonus_card_used', {
                    imposterId: room.imposterId,
                    message: "L'Impostore ha usato la CARTA BONUS! Ancora un tentativo!"
                });
                io.to(roomId).emit('room_update', getSafeRoom(room));
                return;
            }

            // Normal Incorrect Guess (Reveal Word)
            io.to(roomId).emit('impostor_guess_result', { success: false, word: targetWord });

            console.log(`[DEBUG] Impostor guess incorrect. Room: ${roomId}, ImpostorID: ${room.imposterId}, SocketID: ${socket.id}`);

            console.log(`[DEBUG] Impostor object found: ${imposter ? imposter.name : 'null'} (${imposter ? imposter.id : 'null'})`);

            if (imposter) {
                imposter.lives = Math.max(0, imposter.lives - 1);
                console.log(`[DEBUG] Impostor lives after penalty: ${imposter.lives}`);
            } else {
                console.error(`[ERROR] Impostor object not found for ID ${room.imposterId}`);
            }

            setTimeout(() => {
                io.to(roomId).emit('round_end', {
                    result: 'INNOCENTS_WIN',
                    reason: 'IMPOSTOR_FAILED',
                    imposterId: room.imposterId,
                    targetWord: room.words[room.targetIndex],
                    players: room.players
                });

                setTimeout(() => startNextRound(roomId), 5000);
            }, 3000); // 3s delay to show "SBAGLIATO!"
        }

        // Auto-start next round
        // This line is now inside the setTimeout above.
    });

    socket.on('restart_round', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        // Only host? Or anyone? Let's say Host.
        // if (!room.players.find(p => p.id === socket.id)?.isHost) return;

        startGame(roomId);
    });

    socket.on('steal_life', ({ roomId, targetId }) => {
        handleStealLife(roomId, socket.id, targetId);
    });

    socket.on('head_to_head_action', ({ roomId, buttonIndex }) => {
        handleHeadToHeadAction(roomId, socket.id, buttonIndex);
    });

    // DEBUG: Force Head to Head
    socket.on('debug_force_h2h', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            console.log(`[DEBUG] FORCING H2H for room ${roomId}`);
            // Revive first 2 players if needed
            if (room.players.length >= 2) {
                room.players.slice(0, 2).forEach(p => { p.lives = 1; p.isGhost = false; });
                room.players.slice(2).forEach(p => { p.lives = 0; p.isGhost = true; });
                startHeadToHead(roomId);
            }
        }
    });
});

function handleStealLife(roomId, imposterId, targetId) {
    const room = rooms[roomId];
    if (!room) return;

    // Validation
    if (room.phase !== 'STEAL_LIFE') return;
    if (imposterId !== room.imposterId) return;

    if (room.timerInterval) clearInterval(room.timerInterval);

    const innocents = room.players.filter(p => !p.isGhost && p.id !== room.imposterId);
    let victimId = targetId;

    // If targetId is null (timeout), Impostor loses a life
    if (!targetId) {
        const imposter = room.players.find(p => p.id === room.imposterId);
        if (imposter) {
            imposter.lives = Math.max(0, imposter.lives - 1);
        }

        // End round immediately
        io.to(roomId).emit('round_end', {
            result: 'INNOCENTS_WIN', // Technically Innocents win round if Impostor times out? Or just "Time Out"
            reason: 'STEAL_TIMEOUT',
            imposterId: room.imposterId,
            targetWord: room.words[room.targetIndex], // Need access to verify this var logic
            players: room.players
        });

        setTimeout(() => startNextRound(roomId), 5000);
        return;
    }

    const targetPlayer = room.players.find(p => p.id === targetId);
    if (!targetPlayer || targetPlayer.isGhost || targetPlayer.role === 'IMPOSTOR') {
        return; // Invalid target, ignore
    }

    // Deduct life
    const victim = room.players.find(p => p.id === victimId);
    if (victim) {
        victim.lives = Math.max(0, victim.lives - 1);

        // Emit life stolen event for UI feedback
        io.to(roomId).emit('life_stolen', {
            victimId: victim.id,
            victimName: victim.name
        });

        // CHECK IF VICTIM DIED -> SPECTATOR MODE
        if (victim.lives <= 0 && !victim.isGhost) {
            console.log(`[INFO] Player ${victim.name} eliminated. Sending spectator secrets.`);
            io.to(victim.id).emit('spectator_update', {
                targetIndex: room.targetIndex,
                imposterId: room.imposterId,
                words: room.words // Ensure they have the words if not already
            });
        }
    }

    // Add life to Impostor (as requested)
    const imposter = room.players.find(p => p.id === room.imposterId);
    let bonusAwarded = false;

    if (imposter) {
        // Bonus Card Logic: Only if ALREADY at max lives
        if (imposter.lives === MAX_LIVES) {
            imposter.hasBonusCard = true;
            bonusAwarded = true;
        }

        // Then add life (capped)
        imposter.lives = Math.min(MAX_LIVES, imposter.lives + 1);
    }

    // Determine reason based on stored state or default
    const reason = room.stealReason === 'WORD_GUESSED' ? 'WORD_GUESSED' : 'NO_MAJORITY';
    const targetWord = room.words[room.targetIndex];

    // Reset reason
    room.stealReason = null;

    io.to(roomId).emit('round_end', {
        result: 'IMPOSTOR_WIN',
        reason: reason, // 'NO_MAJORITY' or 'WORD_GUESSED'
        victimId: victimId,
        imposterId: room.imposterId,
        targetWord: targetWord, // Pass target word for display
        players: room.players,
        bonusAwarded
    });

    setTimeout(() => startNextRound(roomId), 5000);
}

function awardBonusCardIfEligible(room) {
    if (!room.imposterId) return false;
    const imposter = room.players.find(p => p.id === room.imposterId);
    if (imposter && imposter.lives === MAX_LIVES) {
        imposter.hasBonusCard = true;
        return true;
    }
    return false;
}

function startGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // 1. Select Category & Words
    const catIndex = Math.floor(Math.random() * wordsData.categories.length);
    const category = wordsData.categories[catIndex];
    room.category = category.name;
    room.words = [...category.words]; // Copy

    // 2. Select Target & Imposter
    room.targetIndex = Math.floor(Math.random() * 12);

    // Filter LIVING players for Impostor selection
    const livingPlayers = room.players.filter(p => !p.isGhost && p.lives > 0);
    if (livingPlayers.length < 1) return;

    // Weighted Selection: Prioritize players with LOWEST timesImpostor
    // 1. Find min count
    const minTimes = Math.min(...livingPlayers.map(p => p.timesImpostor || 0));

    // 2. Filter candidates who have this min count (or close to it?)
    // Let's be strict: only those with the absolute minimum get priority to balance it out perfectly.
    // However, to keep SOME unpredictability if everyone is equal, we just pick from the pool of "least played".
    let candidates = livingPlayers.filter(p => (p.timesImpostor || 0) === minTimes);

    // Fallback: If for some reason candidates is empty (shouldn't happen), use all living
    if (candidates.length === 0) candidates = livingPlayers;

    // 3. Pick Random Candidate
    const imposterIndex = Math.floor(Math.random() * candidates.length);
    let selectedPlayer = candidates[imposterIndex];

    // Avoid Streak (if possible): If selected was last imposter AND we have other options
    if (room.lastImposterId && candidates.length > 1 && selectedPlayer.id === room.lastImposterId) {
        const otherCandidates = candidates.filter(p => p.id !== room.lastImposterId);
        if (otherCandidates.length > 0) {
            console.log(`[INFO] Avoiding streak for ${selectedPlayer.name}`);
            selectedPlayer = otherCandidates[Math.floor(Math.random() * otherCandidates.length)];
        }
    }

    room.imposterId = selectedPlayer.id;
    room.lastImposterId = room.imposterId;

    // Increment Count
    selectedPlayer.timesImpostor = (selectedPlayer.timesImpostor || 0) + 1;
    console.log(`[INFO] New Impostor: ${selectedPlayer.name} (Times: ${selectedPlayer.timesImpostor})`);

    // 3. Assign Roles (internal state)
    // LIVING players get roles. DEAD players stay dead (spectators).
    room.players.forEach(p => {
        if (p.lives > 0 && !p.isGhost) {
            p.role = (p.id === room.imposterId) ? 'IMPOSTOR' : 'INNOCENT';
        } else {
            p.role = 'SPECTATOR'; // Or keep null/previous? Let's say SPECTATOR to be clear.
            // Or just ensure isGhost/lives is checked.
        }
        p.votesReceived = 0;
    });

    // 4. RANDOMIZE TURN ORDER (Shuffle Players)
    // Fisher-Yates Shuffle
    for (let i = room.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
    }

    // NOTIFY SPECTATORS OF NEW SECRETS
    const deadPlayers = room.players.filter(p => p.lives <= 0 || p.isGhost);
    deadPlayers.forEach(p => {
        io.to(p.id).emit('spectator_update', {
            targetIndex: room.targetIndex,
            imposterId: room.imposterId,
            words: room.words
        });
    });

    // 0. START COUNTDOWN
    room.phase = 'COUNTDOWN';
    io.to(roomId).emit('room_update', getSafeRoom(room));

    // RESET CLIENT ROLE STATE (Hide roles during countdown)
    room.players.forEach(p => {
        io.to(p.id).emit('your_role', null);
    });

    let countdown = 3; // 3 seconds as requested
    // Emit initial
    io.to(roomId).emit('timer_tick', countdown);

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            io.to(roomId).emit('timer_tick', countdown);
        } else {
            clearInterval(countdownInterval);
            // PROCEED TO SETUP
            proceedToSetup(roomId);
        }
    }, 1000);
}

function proceedToSetup(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.phase = 'SETUP';
    room.currentTurnIndex = -1;
    room.clues = [];
    room.votes = {};

    // Notify players of Setup (Words, etc.)
    io.to(roomId).emit('game_started', {
        phase: 'SETUP',
        category: room.category,
        words: room.words
    });

    // Send individual role info
    room.players.forEach(p => {
        const secretData = {
            role: p.role,
            targetIndex: (p.role === 'INNOCENT') ? room.targetIndex : null
        };
        io.to(p.id).emit('your_role', secretData);
    });

    // Delay before first turn
    setTimeout(() => {
        startCluePhase(roomId);
    }, 3000);
}

function startCluePhase(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.phase = 'CLUE';
    room.currentTurnIndex = -1;

    io.to(roomId).emit('room_update', getSafeRoom(room)); // Notify phase change
    nextTurn(roomId);
}

function nextTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.currentTurnIndex++;
    console.log(`[DEBUG] nextTurn: Room ${roomId}, Index ${room.currentTurnIndex}, Players ${room.players.length}`);

    // Check if all players have given clues or skipped
    if (room.currentTurnIndex >= room.players.length) {
        console.log(`[DEBUG] All players submitted. Starting Voting Phase for ${roomId}`);
        startVotingPhase(roomId);
        return;
    }

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.lives <= 0 || currentPlayer.isGhost) {
        console.log(`[DEBUG] Skipping dead/ghost player ${currentPlayer.name} (Index ${room.currentTurnIndex})`);
        nextTurn(roomId);
        return;
    }



    room.timer = CLUE_TIME_LIMIT;

    // Broadcast turn update mixed with room update or just room update?
    // Let's send room_update to ensure consistency
    io.to(roomId).emit('room_update', getSafeRoom(room));

    // Clear existing interval if any
    if (room.timerInterval) clearInterval(room.timerInterval);

    // Start Timer
    room.timerInterval = setInterval(() => {
        room.timer--;

        // GRACE PERIOD: Wait strictly passed 0 (e.g., -2) to allow network latency for final submission
        if (room.timer <= -2) {
            clearInterval(room.timerInterval);
            // Auto submit empty/default clue if strictly timed out
            handleClueSubmission(roomId, currentPlayer.id, "nessun indizio");
        } else {
            // Emit tick, but floor at 0 for display
            const displayTimer = Math.max(0, room.timer);
            io.to(roomId).emit('timer_tick', displayTimer);
        }
    }, 1000);
}

function handleClueSubmission(roomId, playerId, clueText) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);

    const player = room.players.find(p => p.id === playerId);
    if (player) {
        room.clues.push({
            playerId: player.id,
            playerName: player.name,
            text: clueText
        });

        io.to(roomId).emit('clue_submitted', {
            playerId: player.id,
            playerName: player.name,
            text: clueText
        });
    }

    nextTurn(roomId);
}

function startVotingPhase(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.phase = 'VOTE';
    room.votes = {};
    room.players.forEach(p => p.votesReceived = 0);

    io.to(roomId).emit('phase_change', { phase: 'VOTE', clues: room.clues });

    // START VOTING TIMER
    room.timer = 30; // 30 seconds for voting
    io.to(roomId).emit('timer_tick', room.timer);

    if (room.timerInterval) clearInterval(room.timerInterval);

    room.timerInterval = setInterval(() => {
        room.timer--;

        if (room.timer <= 0) {
            clearInterval(room.timerInterval);
            // Auto-resolve: Force vote SKIP for anyone who hasn't voted
            const livingPlayers = room.players.filter(p => !p.isGhost && p.lives > 0);
            livingPlayers.forEach(p => {
                if (!room.votes[p.id]) {
                    room.votes[p.id] = 'SKIP';
                }
            });
            resolveVotes(roomId);
        } else {
            const displayTimer = Math.max(0, room.timer);
            io.to(roomId).emit('timer_tick', displayTimer);
        }
    }, 1000);
}

function resolveVotes(roomId) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }

    const livingPlayers = room.players.filter(p => !p.isGhost && p.lives > 0);

    // Tally votes
    const voteCounts = {};
    Object.values(room.votes).forEach(targetId => {
        if (targetId === 'SKIP') return;
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    let electedId = null;

    for (const [targetId, count] of Object.entries(voteCounts)) {
        if (count > livingPlayers.length / 2) { // Absolute majority > 50%
            electedId = targetId;
            break;
        }
    }

    if (electedId && electedId === room.imposterId) {
        // Impostor Caught -> Last Chance
        room.phase = 'RESOLUTION';
        io.to(roomId).emit('impostor_caught', {
            imposterId: room.imposterId,
            message: "L'Impostore è stato scoperto! Ultima Chance."
        });
        io.to(roomId).emit('room_update', getSafeRoom(room)); // Update client with safe room data (revealing roles)
    } else {
        // Impostor NOT Caught (No Majority OR Innocent Voted) -> Impostor chooses victim
        room.phase = 'STEAL_LIFE';

        let reason = 'NO_MAJORITY';
        let votedName = null;

        if (electedId) {
            reason = 'INNOCENT_VOTED';
            const votedPlayer = room.players.find(p => p.id === electedId);
            votedName = votedPlayer ? votedPlayer.name : 'Unknown';
        }

        room.stealReason = reason;

        io.to(roomId).emit('phase_change', {
            phase: 'STEAL_LIFE',
            reason: reason,
            votedName: votedName
        });
        io.to(roomId).emit('room_update', getSafeRoom(room)); // Update client with safe room data (revealing roles)

        // Timer for Steal Life phase (10 seconds)
        room.timer = 10;
        io.to(roomId).emit('timer_tick', room.timer);
        if (room.timerInterval) clearInterval(room.timerInterval);
        room.timerInterval = setInterval(() => {
            room.timer--;
            if (room.timer <= 0) {
                clearInterval(room.timerInterval);
                // Time's up: Random kill as fallback
                handleStealLife(roomId, room.imposterId, null);
            } else {
                io.to(roomId).emit('timer_tick', room.timer);
            }
        }, 1000);
    }

    // In socket.on('impostor_guess')... I need to update that listener too.
}

function startNextRound(roomId) {
    const room = rooms[roomId];
    if (!room) {
        return;
    }

    // Check Game Over (Based on LIVING players)
    // Game continues as long as there are at least 3 players alive.
    // IF ONLY 2 LEFT -> HEAD TO HEAD MODE
    const livingPlayers = room.players.filter(p => !p.isGhost && p.lives > 0);

    if (livingPlayers.length < 2) {
        // Less than 2 players? Someone won already? Or error?
        // If 1 player left -> Winner!
        const winner = livingPlayers.length === 1 ? livingPlayers[0] : null;
        room.phase = 'GAME_OVER';
        io.to(roomId).emit('game_over', {
            players: room.players,
            winner: winner ? winner.name : 'Nessuno'
        });
        return;
    }

    if (livingPlayers.length === 2) {
        // HEAD TO HEAD MODE!
        startHeadToHead(roomId);
        return;
    }

    // Otherwise, rotate Roles / New Words for standard game (3+ players)
    startGame(roomId);
}

function startHeadToHead(roomId) {
    console.log(`[DEBUG] Starting HeadToHead for room ${roomId}`);
    const room = rooms[roomId];
    if (!room) return;

    // Clear any existing timer
    if (room.timerInterval) clearInterval(room.timerInterval);

    room.phase = 'HEAD_TO_HEAD';

    // reset turn index
    room.currentTurnIndex = 0;

    // Convert Bonus Cards to Lives
    // "Se i giocatori avevano ancora il bonus attivo, questo vale come una vita in più"
    // Also, "I giocatori hanno tante vite quante vite avevano nell'ultimo turno" -> Already in p.lives
    room.players.forEach(p => {
        if (p.lives > 0 && !p.isGhost) {
            if (p.hasBonusCard) {
                p.lives += 1;
                p.hasBonusCard = false; // Consumed
            }
        }
    });

    // SHUFFLE BUTTONS (0=Safe, 1=Danger, 2=Danger)
    // "2 di questi bottoni tolgono una vita, mentre un solo bottone non ha effetto"
    room.h2hButtons = [0, 1, 1].sort(() => Math.random() - 0.5); // 0=Safe, 1=Danger

    // Filter living players for the duel
    const duelists = room.players.filter(p => !p.isGhost && p.lives > 0);

    // Safety check for debugging: if < 2, just take the first two, revive if needed (FOR DEBUG ONLY)
    if (duelists.length < 2) {
        console.log("[DEBUG] H2H started with < 2 living players. Forcing 2 players alive for test.");
        // This should only happen in dev/test, but handles the edge case if transition logic was loose
        // But startNextRound should prevent this.
    }

    // Ensure data consistency
    room.duelists = duelists.map(p => p.id);

    // Notify
    io.to(roomId).emit('head_to_head_start', {
        players: room.players,
        turnPlayerId: duelists[0] ? duelists[0].id : null
    });

    io.to(roomId).emit('room_update', getSafeRoom(room));
}

function handleHeadToHeadAction(roomId, playerId, buttonIndex) {
    console.log(`[H2H_DEBUG] Action received. Room: ${roomId}, Player: ${playerId}, Button: ${buttonIndex}`);
    const room = rooms[roomId];
    if (!room) {
        console.log(`[H2H_DEBUG] Room ${roomId} not found`);
        return;
    }
    if (room.phase !== 'HEAD_TO_HEAD') {
        console.log(`[H2H_DEBUG] Wrong phase: ${room.phase}`);
        return;
    }

    const duelists = room.players.filter(p => !p.isGhost && p.lives > 0);
    // Check turn
    // We use room.currentTurnIndex to track which duelist's turn it is (0 or 1)
    const currentDuelist = duelists[room.currentTurnIndex % 2];

    if (!currentDuelist) {
        console.log(`[H2H_DEBUG] No current duelist found! TurnIdx: ${room.currentTurnIndex}`);
        return;
    }

    console.log(`[H2H_DEBUG] Current Turn Duelist: ${currentDuelist.name} (${currentDuelist.id}) vs Request Player: ${playerId}`);

    if (currentDuelist.id !== playerId) {
        console.log(`[H2H_DEBUG] Not player's turn.`);
        return;
    }

    // Check button index (0-2)
    if (buttonIndex < 0 || buttonIndex > 2) {
        console.log(`[H2H_DEBUG] Invalid button index: ${buttonIndex}`);
        return;
    }

    // Determine effect
    // room.h2hButtons contains the map. But wait, user presses "1 of 3 buttons".
    // Does the map shuffle *after* every press? Or is it fixed per turn?
    // "a turno devono premere solo 1 di 3 bottoni... Una volta premuto... si passa all'altro giocatore"
    // Implies shared state? Or resets?
    // Usually "Russian Roulette" implies taking turns on the SAME gun (state persists).
    // BUT "3 buttons" implies a UI choice.
    // If I press Button A and it's safe, does Button A remain pressed/disabled? 
    // "si passa all'altro giocatore" -> implied reset of options?
    // Let's assume RESET each turn to keep it simple and fair (pure luck each time).
    // "2 di questi bottoni tolgono una vita" -> Always 2/3 chance of danger.

    // We generated `h2hButtons` at start. We should regenerate it every turn?
    // Or is it "Find the safe button"?
    // If it's "Find the safe button", then if Player A misses (Danger), Player B has 1 Safe and 1 Danger left?
    // That changes odds.
    // Let's stick to: FRESH SHUFFLE EACH TURN. 2 Danger, 1 Safe.

    const isSafe = room.h2hButtons[buttonIndex] === 0;

    // Apply Effect
    if (!isSafe) {
        currentDuelist.lives -= 1;
    }

    // Emit Result
    io.to(roomId).emit('head_to_head_result', {
        playerId,
        buttonIndex,
        isSafe,
        lives: currentDuelist.lives
    });

    // Check Death
    if (currentDuelist.lives <= 0) {
        // Game Over! The OTHER player wins
        const winner = duelists.find(p => p.id !== currentDuelist.id);

        setTimeout(() => {
            room.phase = 'GAME_OVER';
            io.to(roomId).emit('game_over', {
                players: room.players,
                winner: winner.name,
                winnerId: winner.id // Send ID for client-side content
            });

            // Auto-restart to Lobby after 10 seconds
            setTimeout(() => {
                console.log(`[DEBUG] Auto-resetting room ${roomId} to LOBBY`);
                room.phase = 'LOBBY';
                room.category = null;
                room.words = [];
                room.targetIndex = null;
                room.imposterId = null;
                room.currentTurnIndex = 0;
                room.clues = [];
                room.votes = {};
                room.timer = 0;
                room.h2hButtons = [];
                if (room.timerInterval) clearInterval(room.timerInterval);
                room.timerInterval = null;

                // Reset players
                room.players.forEach(p => {
                    p.lives = MAX_LIVES;
                    p.role = null;
                    p.isGhost = false;
                    p.votesReceived = 0;
                    p.hasBonusCard = false;
                    // Score? Keep or reset? Usually reset for new game.
                    p.score = 0;
                    p.timesImpostor = 0; // optional
                });

                io.to(roomId).emit('room_update', getSafeRoom(room));
            }, 10000);

        }, 2000); // Delay to show explosion
        return;
    }

    // Next Turn
    room.currentTurnIndex++;
    // Shuffle buttons for next player
    room.h2hButtons = [0, 1, 1].sort(() => Math.random() - 0.5);

    const nextDuelist = duelists[room.currentTurnIndex % 2];

    setTimeout(() => {
        io.to(roomId).emit('head_to_head_turn', {
            turnPlayerId: nextDuelist.id
        });
        io.to(roomId).emit('room_update', getSafeRoom(room));
    }, 2000); // Delay for visual feedback


}

function checkVotingResult(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const livingPlayers = room.players.filter(p => !p.isGhost && p.lives > 0);
    const totalVotesCast = Object.keys(room.votes).length;

    // Check if everyone voted
    if (totalVotesCast >= livingPlayers.length) {
        // Everyone voted!
        // Dynamic Timer: If time > 5s, jump to 5s to speed up result but show "final 5s"
        if (room.timer > 5) {
            room.timer = 5;
            io.to(roomId).emit('timer_tick', room.timer);
            console.log(`[DEBUG] All voted in ${roomId}. Jumping timer to 5s.`);
        }
        // Don't return here! Logic continues to tally... 
        // WAIT! original logic had `if (totalVotesCast < livingPlayers.length) return;`
        // We want to WAIT for the timer to reach 0 for the reveal/result?
        // OR do we want to show result immediately? 
        // "timer passerà dal secondo corrente a 5 secondi".
        // So we just set timer to 5 and RETURN. The INTERVAL will handle the rest.
        return;
    }

    // If not everyone voted, just return/wait.
    return;
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
