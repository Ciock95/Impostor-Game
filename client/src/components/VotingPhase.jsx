import React, { useState } from 'react';

const VotingPhase = ({ gameState, myPlayerId, socket }) => {
    const [votedId, setVotedId] = useState(null);

    const handleVote = (targetId) => {
        if (votedId) return; // Already voted locally (server also checks)
        setVotedId(targetId);
        socket.emit('vote_player', { roomId: gameState.id, targetId });
    };

    const me = gameState.players.find(p => p.id === myPlayerId);
    const isSpectator = me?.lives <= 0 || me?.isGhost;
    const livingPlayers = gameState.players.filter(p => !p.isGhost && p.lives > 0);
    const totalVotes = Object.keys(gameState.votes).length;

    return (
        <div className="w-full max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500">
                {isSpectator ? "SPETTATORE - Chi voteranno?" : "CHI È L'IMPOSTORE?"}
            </h2>

            {/* Voting Status List */}
            <div className="flex flex-wrap justify-center gap-4 mb-8 px-4">
                {livingPlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                        <span className={`text-sm font-bold ${p.id === myPlayerId ? 'text-blue-400' : 'text-slate-300'}`}>
                            {p.name}
                        </span>
                        {p.hasVoted ? (
                            <span className="text-green-500 font-bold">✓</span>
                        ) : (
                            <span className="text-slate-600 animate-pulse">●</span>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex justify-center mb-8">
                <div className={`text-3xl font-mono font-black ${gameState.timer < 10 ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>
                    {gameState.timer}s
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {livingPlayers.map(p => {
                    // Find clue for this player
                    const playerClue = gameState.clues.find(c => c.playerId === p.id)?.text || "Nessun indizio";
                    const isMe = p.id === myPlayerId;
                    const isSelected = votedId === p.id;

                    return (
                        <div
                            key={p.id}
                            className={`
                            relative p-6 rounded-xl border-2 transition-all duration-300
                            ${isSelected
                                    ? 'bg-red-500/20 border-red-500 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                                    : 'bg-slate-800 border-slate-700 hover:border-slate-500'}
                            ${!votedId && !isMe && !isSpectator ? 'cursor-pointer hover:bg-slate-750' : ''}
                            ${isMe || isSpectator ? 'opacity-75' : ''}
                        `}
                            onClick={() => !votedId && !isMe && !isSpectator && handleVote(p.id)}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center font-bold text-lg">
                                    {p.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">{p.name}</h3>
                                    {isMe && <span className="text-xs text-blue-400 font-mono">(TU)</span>}
                                </div>
                            </div>

                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50 italic text-slate-300 text-center">
                                "{playerClue}"
                            </div>

                            {isSelected && (
                                <div className="absolute -top-3 -right-3 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                                    VOTATO
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Skip Button - Hide for Spectators */}
                {!isSpectator && (
                    <div
                        className={`
                        p-6 rounded-xl border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer transition-all
                        ${votedId === 'SKIP'
                                ? 'bg-slate-700 border-slate-500 text-white'
                                : 'text-slate-500 hover:text-slate-300 hover:border-slate-400'}
                    `}
                        onClick={() => !votedId && handleVote('SKIP')}
                    >
                        <span className="font-bold text-xl uppercase tracking-widest">SKIP</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VotingPhase;
