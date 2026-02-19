import React from 'react';
import WordGrid from './WordGrid';
import CluePhase from './CluePhase';
import VotingPhase from './VotingPhase';
import StealLifePhase from './StealLifePhase';
import HeadToHead from './HeadToHead';

const Game = ({ socket, gameState, myRole, spectatorData }) => {
    const myPlayerId = socket.id;
    const isImposter = myRole?.role === 'IMPOSTOR';
    const isDead = gameState.players.find(p => p.id === myPlayerId)?.lives <= 0;
    const isSpectator = isDead || !!spectatorData;
    const [bonusMessage, setBonusMessage] = React.useState(null);
    const [guessResult, setGuessResult] = React.useState(null); // { success: boolean, word: string }
    const [lifeStolenData, setLifeStolenData] = React.useState(null); // { victimId: string, victimName: string }

    const handleWordClick = (index) => {
        if (isSpectator) return; // Spectators can't interact
        if (gameState.phase !== 'RESOLUTION') return;
        if (!isImposter) return;

        if (isImposter) { // Double check
            socket.emit('impostor_guess', { roomId: gameState.id, wordIndex: index });
        }
    };

    const handleRestart = () => {
        socket.emit('restart_round', { roomId: gameState.id });
    };

    React.useEffect(() => {
        socket.on('bonus_card_used', (data) => {
            // Show bonus message in UI instead of alert
            setBonusMessage(data.message);
            // Hide after 5 seconds
            setTimeout(() => setBonusMessage(null), 5000);
        });
        socket.on('impostor_guess_result', (data) => {
            setGuessResult(data);
            setTimeout(() => setGuessResult(null), 3000); // Hide after 3s (or let phase change handle it)
        });

        socket.on('life_stolen', (data) => {
            setLifeStolenData(data);
            setTimeout(() => setLifeStolenData(null), 1000); // Show for 1s
        });

        return () => {
            socket.off('bonus_card_used');
            socket.off('impostor_guess_result');
            socket.off('life_stolen');
        };
    }, [socket]);

    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">

            {/* Header Info */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">


                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-slate-700 rounded-lg text-sm font-mono text-slate-300 border border-slate-600">
                        ROOM: <span className="text-white font-bold text-lg">{gameState.id}</span>
                    </div>
                    {gameState.category && (
                        <div className="px-4 py-2 bg-blue-900/30 text-blue-300 rounded-lg border border-blue-800/50">
                            CATEGORIA: <span className="font-bold text-white uppercase ml-1">{gameState.category}</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mt-4 md:mt-0">
                    {gameState.phase === 'LOBBY' && gameState.players[0].id === myPlayerId && (
                        <>
                            <button
                                className="px-8 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg font-bold shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-all transform hover:scale-105"
                                onClick={() => socket.emit('start_game', { roomId: gameState.id })}
                            >
                                AVVIA PARTITA ({gameState.players.length})
                            </button>

                        </>
                    )}

                    {!isSpectator && myRole && (
                        <div className={`px-4 py-2 rounded-lg font-bold border ${isImposter ? 'bg-red-900/30 border-red-800 text-red-400' : 'bg-green-900/30 border-green-800 text-green-400'}`}>
                            {isImposter ? 'SEI L\'IMPOSTORE' : 'SEI INNOCENTE'}
                        </div>
                    )}
                    {isSpectator && (
                        <div className="px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-slate-400">
                            MODALITÀ SPETTATORE
                        </div>
                    )}
                </div>

                {/* BONUS CARD POPUP MSG */}
                {bonusMessage && (
                    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-yellow-600 border-2 border-yellow-400 text-white px-8 py-4 rounded-xl shadow-2xl z-50 animate-bounce text-xl font-bold">
                        🃏 {bonusMessage}
                    </div>
                )}

                {/* GUESS RESULT POPUP */}
                {guessResult && (
                    <>
                        {isImposter ? (
                            <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-12 py-8 rounded-2xl shadow-2xl z-50 text-center animate-bounce border-4 ${guessResult.success ? 'bg-green-600 border-green-400' : 'bg-red-600 border-red-400'}`}>
                                <h2 className="text-4xl font-black text-white mb-2 uppercase">
                                    {guessResult.success ? 'HAI INDOVINATO!' : (guessResult.isBonus ? 'ULTIMO TENTATIVO!' : 'SBAGLIATO!')}
                                </h2>
                                {!guessResult.success && !guessResult.isBonus && (
                                    <p className="text-xl text-white">La parola era: <span className="font-bold underline">{guessResult.word}</span></p>
                                )}
                                {!guessResult.success && guessResult.isBonus && (
                                    <p className="text-xl text-white">Hai ancora una possibilità!</p>
                                )}
                            </div>
                        ) : (
                            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-12 py-8 rounded-2xl shadow-2xl z-50 text-center animate-bounce border-4 bg-yellow-600 border-yellow-400">
                                <h2 className="text-3xl font-black text-white mb-2 uppercase">
                                    L'IMPOSTORE {guessResult.success ? 'HA INDOVINATO!' : 'HA SBAGLIATO!'}
                                </h2>
                                {guessResult.success && (
                                    <p className="text-xl text-white">Preparatevi al peggio...</p>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* LIFE STOLEN BANNER */}
                {lifeStolenData && (
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-ping-once">
                        {lifeStolenData.victimId === myPlayerId ? (
                            // VICTIM VIEW: RED SKULL
                            <div className="bg-red-600 border-4 border-red-800 rounded-full p-12 shadow-[0_0_50px_rgba(220,38,38,0.8)]">
                                <div className="text-9xl">💀</div>
                            </div>
                        ) : (
                            // OTHERS VIEW: YELLOW MSG
                            <div className="bg-yellow-600 border-4 border-yellow-400 px-8 py-6 rounded-2xl shadow-2xl text-center">
                                <div className="text-6xl mb-2">💀</div>
                                <h2 className="text-2xl font-bold text-white uppercase">
                                    A {lifeStolenData.victimName} è stata rubata una vita!
                                </h2>
                            </div>
                        )}
                    </div>
                )}

                {/* Spectator Banner */}
                {isSpectator && (
                    <div className="mt-4 p-3 bg-slate-900/80 border border-slate-700 rounded-lg text-center animate-pulse">
                        <span className="text-slate-400 font-bold">👻 SEI UNO SPETTATORE</span>
                        <p className="text-xs text-slate-500">Puoi vedere tutto, ma non puoi interagire.</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Stage */}
                <div className="lg:col-span-3">
                    {/* LOBBY PHASE */}
                    {gameState.phase === 'LOBBY' && (
                        <div className="h-96 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700 text-slate-400 gap-4">
                            <div className="animate-pulse text-4xl mb-4">⏳</div>
                            <p className="text-xl">In attesa dell'host per iniziare...</p>
                            <p className="text-sm text-slate-500">Servono almeno 3 giocatori.</p>
                        </div>
                    )}

                    {/* COUNTDOWN PHASE */}
                    {gameState.phase === 'COUNTDOWN' && (
                        <div className="h-96 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
                            <h2 className="text-4xl font-black text-white mb-8">LA PARTITA STA PER INIZIARE</h2>
                            <div className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-400 to-purple-600 animate-ping">
                                {gameState.timer}
                            </div>
                        </div>
                    )}

                    {/* SETUP PHASE */}
                    {gameState.phase === 'SETUP' && (
                        <div className="h-96 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
                            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4 animate-bounce">
                                {gameState.category}
                            </h2>
                            <p className="text-slate-400">Preparati...</p>
                        </div>
                    )}

                    {/* GAME PHASES */}
                    {/* GAME PHASES */}
                    {['CLUE', 'VOTE', 'STEAL_LIFE', 'RESOLUTION', 'ROUND_END', 'GAME_OVER'].includes(gameState.phase) && (
                        <div className="flex flex-col gap-6">
                            <WordGrid
                                words={gameState.words}
                                targetIndex={
                                    // Show target if: Round End, Game Over, Impostor (from role), Innocents (from role), OR Spectator (from secret data)
                                    (gameState.phase === 'ROUND_END' || gameState.phase === 'GAME_OVER')
                                        ? gameState.targetIndex
                                        : (isSpectator ? spectatorData?.targetIndex : myRole?.targetIndex)
                                }
                                role={myRole?.role}
                                onWordClick={handleWordClick}
                                gameState={gameState}
                                phase={gameState.phase}
                                spectatorImposterId={isSpectator ? spectatorData?.imposterId : null}
                            />
                            <div className="border-t border-slate-700 pt-6"></div>

                            {gameState.phase === 'CLUE' && !isSpectator && (
                                <CluePhase gameState={gameState} myPlayerId={myPlayerId} socket={socket} />
                            )}
                            {gameState.phase === 'CLUE' && isSpectator && (
                                <div className="text-center p-4 text-slate-500 italic">Osserva gli indizi...</div>
                            )}

                            {gameState.phase === 'VOTE' && !isSpectator && (
                                <VotingPhase gameState={gameState} myPlayerId={myPlayerId} socket={socket} />
                            )}
                            {gameState.phase === 'VOTE' && isSpectator && (
                                <div className="text-center p-4 text-slate-500 italic">Osserva la votazione...</div>
                            )}

                            {gameState.phase === 'STEAL_LIFE' && (
                                <StealLifePhase gameState={gameState} myPlayerId={myPlayerId} socket={socket} myRole={myRole} />
                            )}

                            {/* PHASE MESSAGE BANNER */}
                            {gameState.phase === 'RESOLUTION' && (
                                <div className="bg-red-900/50 border border-red-500/50 rounded-xl p-6 mb-6 text-center animate-pulse">
                                    <h2 className="text-3xl font-black text-red-500 mb-2">
                                        {isImposter
                                            ? "SEI STATO SCOPERTO!"
                                            : `${gameState.players.find(p => p.id === gameState.imposterId)?.name.toUpperCase()} È STATO SCOPERTO!`
                                        }
                                    </h2>
                                    {isImposter ? (
                                        <p className="text-red-300">Indovina la parola segreta per salvarti!</p>
                                    ) : (
                                        <p className="text-red-300">L'Impostore sta provando a indovinare la parola...</p>
                                    )}
                                </div>
                            )}

                            {/* Debugging Log */}
                            {console.log("Game Render Phase:", gameState.phase)}

                            {(gameState.phase === 'ROUND_END' || gameState.phase === 'GAME_OVER') && (
                                // For Round End we usually have lastRoundResult. For Game Over (from H2H) we might not.
                                // If Game Over, show regardless. If Round End, show if lastRoundResult exists.
                                (gameState.phase === 'GAME_OVER' || gameState.lastRoundResult) && (
                                    <div className="flex flex-col items-center justify-center p-8 bg-slate-900/90 rounded-xl border border-slate-700 shadow-2xl z-50">
                                        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
                                            {gameState.phase === 'GAME_OVER' ? 'FINE PARTITA' : 'FINE ROUND'}
                                        </h2>

                                        {gameState.lastRoundResult && (
                                            <div className="text-center mb-8">
                                                <p className="text-xl text-white mb-2">
                                                    Risultato: <span className="font-bold text-blue-400">{gameState.lastRoundResult.result.replace(/_/g, ' ')}</span>
                                                </p>
                                                <p className="text-slate-400">
                                                    La parola era: <span className="font-bold text-white text-2xl uppercase">{gameState.lastRoundResult.targetWord}</span>
                                                </p>
                                                <p className="text-sm text-slate-500 mt-2">
                                                    Impostore: {gameState.players.find(p => p.id === gameState.lastRoundResult.imposterId)?.name}
                                                </p>
                                            </div>
                                        )}

                                        <div className="w-full bg-slate-900 p-6 rounded-xl mb-6">
                                            <h3 className="text-lg font-bold mb-4 text-slate-400 uppercase tracking-wider">Vite Rimanenti</h3>
                                            <div className="space-y-3">
                                                {gameState.players.map(p => (
                                                    <div key={p.id} className="flex justify-between items-center">
                                                        <span className="font-bold">{p.name} {p.role === 'IMPOSTOR' && <span className="text-red-500 text-xs">(IMPOSTORE)</span>}</span>
                                                        <div className="flex gap-1">
                                                            {[...Array(3)].map((_, i) => (
                                                                <div key={i} className={`w-3 h-3 rounded-full ${i < p.lives ? 'bg-red-500' : 'bg-slate-700'}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {gameState.phase === 'GAME_OVER' ? (
                                            <div className="flex flex-col gap-4 w-full items-center">
                                                {myPlayerId === gameState.winnerId ? (
                                                    <div className="px-8 py-4 bg-green-600 border-4 border-green-400 rounded-2xl shadow-[0_0_50px_rgba(34,197,94,0.6)] animate-bounce text-center">
                                                        <h2 className="text-5xl font-black text-white uppercase tracking-widest drop-shadow-md">
                                                            🏆 HAI VINTO! 🏆
                                                        </h2>
                                                        <p className="text-green-100 mt-2 font-bold">Sei l'ultimo sopravvissuto!</p>
                                                    </div>
                                                ) : (
                                                    <div className="px-8 py-4 bg-red-600 border-4 border-red-400 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.6)] animate-pulse text-center">
                                                        <h2 className="text-5xl font-black text-white uppercase tracking-widest drop-shadow-md">
                                                            ☠️ HAI PERSO ☠️
                                                        </h2>
                                                        <p className="text-red-100 mt-2 font-bold">
                                                            Vincitore: {gameState.winner}
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="mt-8 text-center">
                                                    <p className="text-slate-400 animate-pulse">
                                                        Ritorno alla lobby per una nuova partita...
                                                    </p>
                                                    <div className="w-full h-1 bg-slate-700 mt-2 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 w-full animate-[shrink_10s_linear_forwards]"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center text-slate-500 animate-pulse">
                                                Prossimo round tra 5 secondi...
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    )}

                    {/* HEAD TO HEAD PHASE - Moved outside to ensure it renders */}
                    {gameState.phase === 'HEAD_TO_HEAD' && (
                        <HeadToHead
                            socket={socket}
                            gameState={gameState}
                            myPlayerId={myPlayerId}
                        />
                    )}
                </div>

                {/* Sidebar */}
                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit shadow-lg sticky top-24">
                    <h3 className="font-bold text-slate-300 mb-6 text-sm tracking-wider uppercase flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        Giocatori
                    </h3>
                    <ul className="space-y-3">
                        {gameState.players.map(p => {
                            // Determine role display for Spectator
                            let displayedRole = null;
                            if (isSpectator && spectatorData && p.lives > 0 && !p.isGhost) {
                                if (p.id === spectatorData.imposterId) {
                                    displayedRole = <span className="text-red-500 font-bold ml-2">[IMPOSTORE]</span>;
                                } else {
                                    displayedRole = <span className="text-green-500 font-bold ml-2">[INNOCENTE]</span>;
                                }
                            }

                            return (
                                <li key={p.id} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors">
                                    <div className={`
                             w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-inner
                             ${p.lives > 0 ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white' : 'bg-slate-600 text-slate-400 grayscale'}
                          `}>
                                        {p.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className={`font-medium ${p.id === myPlayerId ? 'text-blue-300' : 'text-slate-200'}`}>
                                                    {p.name} {p.id === myPlayerId && '(Tu)'}
                                                </span>
                                                {/* Show Role to Spectator */}
                                                {displayedRole && <div className="text-xs">{displayedRole}</div>}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {p.isHost && <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/30">HOST</span>}
                                                {p.hasBonusCard && <span className="text-xl animate-bounce" title="Bonus Card: Doppio tentativo!">🃏</span>}
                                            </div>
                                        </div>
                                        <div className="flex gap-1 mt-1">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className={`w-2 h-2 rounded-full ${i < p.lives ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-slate-600'}`}></div>
                                            ))}
                                        </div>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>
        </div >
    );
};

export default Game;
