import React from 'react';

const StealLifePhase = ({ gameState, myPlayerId, socket, myRole }) => {
    // const [selectedId, setSelectedId] = React.useState(null); // Removed state
    const me = gameState.players.find(p => p.id === myPlayerId);
    const isImposter = (myRole?.role === 'IMPOSTOR') || (me?.role === 'IMPOSTOR');
    const livingInnocents = gameState.players.filter(p => !p.isGhost && p.role !== 'IMPOSTOR');

    const handleSteal = (targetId) => {
        if (!isImposter) return;
        // Immediate action without confirmation as requested
        socket.emit('steal_life', { roomId: gameState.id, targetId });
    };

    if (!isImposter) {
        return (
            <div className="w-full max-w-4xl mx-auto text-center p-12 bg-slate-800/50 rounded-xl border border-slate-700">
                <h2 className="text-3xl font-bold text-red-500 mb-6 animate-pulse">
                    {gameState.reason === 'WORD_GUESSED'
                        ? 'L\'IMPOSTORE HA INDOVINATO!'
                        : gameState.reason === 'INNOCENT_VOTED'
                            ? `INNOCENTE ESPULSO: ${gameState.votedName?.toUpperCase()}!`
                            : `${gameState.players.find(p => p.role === 'IMPOSTOR')?.name.toUpperCase()} SI È SALVATO!`}
                </h2>
                <p className="text-xl text-slate-300">
                    L'Impostore sta scegliendo una vittima...
                </p>
                <div className="mt-8 text-6xl animate-bounce">🔪</div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600">
                {gameState.reason === 'WORD_GUESSED'
                    ? 'HAI VINTO IL ROUND! ORA FINISCILI.'
                    : gameState.reason === 'INNOCENT_VOTED'
                        ? 'HANNO VOTATO UN INNOCENTE! PUNISCILI.'
                        : 'SCEGLI LA TUA VITTIMA'}
            </h2>

            <p className="text-center text-slate-400 mb-8">
                {gameState.reason === 'WORD_GUESSED'
                    ? "Hai indovinato la parola segreta! Clicca su un innocente per eliminarlo."
                    : gameState.reason === 'INNOCENT_VOTED'
                        ? `Gli innocenti hanno sbagliato espellendo ${gameState.votedName}. Approfittane per rubare una vita!`
                        : "Nessuno è stato espulso. Clicca su un innocente per rubargli una vita."}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {livingInnocents.map(p => (
                    <div
                        key={p.id}
                        className="
                            relative p-6 rounded-xl border-2 border-slate-700 bg-slate-800 
                            hover:border-red-500 hover:bg-red-900/10 hover:scale-105 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]
                            cursor-pointer transition-all duration-300 group
                        "
                        onClick={() => handleSteal(p.id)}
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center font-bold text-lg group-hover:bg-red-600 transition-colors">
                                {p.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-white group-hover:text-red-400">{p.name}</h3>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className={`w-2 h-2 rounded-full ${i < p.lives ? 'bg-red-500' : 'bg-slate-600'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="absolute top-1/2 right-4 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-2xl">
                            ☠️
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StealLifePhase;
