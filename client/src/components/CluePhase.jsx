import React, { useState, useEffect } from 'react';

const CluePhase = ({ gameState, myPlayerId, socket }) => {
    const [clue, setClue] = useState('');
    const currentPlayerIndex = gameState.currentTurnIndex;
    const currentPlayer = gameState.players[currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === myPlayerId;
    const timer = gameState.timer;

    const submitClue = (e) => {
        e.preventDefault();
        if (!clue.trim()) return;
        socket.emit('submit_clue', { roomId: gameState.id, clue });
        setClue('');
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
            {/* Timer / Turn Info */}
            <div className="text-center p-4 bg-slate-800 rounded-xl border border-slate-700">
                {isMyTurn ? (
                    <div className="text-center mb-8 animate-pulse">
                        <h2 className="text-4xl font-black text-blue-400 mb-2">TOCCA A TE!</h2>
                        <p className="text-slate-400">Inserisci il tuo indizio...</p>
                    </div>
                ) : (
                    <div className="text-center mb-8">
                        <h2 className="text-xl text-slate-400">Turno di</h2>
                        <div className="text-3xl font-bold text-white mt-1">{currentPlayer?.name}</div>
                    </div>
                )}
                <div className={`text-4xl font-mono font-black ${timer < 5 ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>
                    {timer}s
                </div>
            </div>

            {/* Input Area */}
            {isMyTurn ? (
                <div className="w-full">
                    <form onSubmit={submitClue} className="flex gap-2 animate-fade-in-up">
                        <input
                            type="text"
                            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl p-4 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                            placeholder="Scrivi un indizio..."
                            value={clue}
                            onChange={(e) => setClue(e.target.value)}
                            maxLength={30}
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                        >
                            INVIA
                        </button>
                    </form>
                    <progress
                        className="w-full h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-slate-700 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500 mt-2"
                        value={timer}
                        max="60"
                    ></progress>
                </div>
            ) : (
                <div className="text-center p-4 text-slate-500 italic">
                    In attesa dell'indizio...
                </div>
            )}

            {/* Clue List History */}
            <div className="space-y-2 mt-4">
                <h4 className="text-sm uppercase tracking-wider text-slate-500 font-bold mb-2">Indizi precedenti</h4>
                {gameState.clues.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <span className="font-bold text-blue-400">{c.playerName}:</span>
                        <span className="text-slate-200">{c.text}</span>
                    </div>
                ))}
                {gameState.clues.length === 0 && <p className="text-slate-600 text-center text-sm py-4">Nessun indizio ancora.</p>}
            </div>
        </div>
    );
};

export default CluePhase;
