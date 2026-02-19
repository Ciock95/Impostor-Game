import React, { useState, useEffect } from 'react';

export default function HeadToHead({ socket, gameState, myPlayerId }) {
    const [buttonsDisabled, setButtonsDisabled] = useState(false);
    const [feedback, setFeedback] = useState(null); // { index, isSafe, wasMyAction }
    const [lastActionPlayerId, setLastActionPlayerId] = useState(null);

    useEffect(() => {
        // Reset feedback on new turn
        const handleTurn = () => {
            setFeedback(null);
            setButtonsDisabled(false);
            setLastActionPlayerId(null);
        };

        const handleResult = (data) => {
            // data: { playerId, buttonIndex, isSafe, lives }
            setFeedback({
                index: data.buttonIndex,
                isSafe: data.isSafe,
                wasMyAction: data.playerId === myPlayerId
            });
            setLastActionPlayerId(data.playerId);
            setButtonsDisabled(true); // Disable until next turn/reset
        };

        socket.on('head_to_head_turn', handleTurn);
        socket.on('head_to_head_result', handleResult);

        return () => {
            socket.off('head_to_head_turn', handleTurn);
            socket.off('head_to_head_result', handleResult);
        };
    }, [socket, myPlayerId]);

    // Derived State
    const duelists = gameState.players.filter(p => !p.isGhost && p.lives > 0);
    // Safety check: if duelists < 2, we might be in transition or game over
    if (duelists.length < 2) {
        return <div className="text-white text-center">Caricamento Testa a Testa... (Attesa Giocatori)</div>;
    }

    const currentTurnPlayer = duelists[gameState.currentTurnIndex % 2];
    const isDuelist = duelists.some(p => p.id === myPlayerId);
    const myTurn = isDuelist && currentTurnPlayer?.id === myPlayerId;
    const isSpectator = !isDuelist;

    const handleButtonClick = (index) => {
        if (!myTurn || buttonsDisabled) return;
        socket.emit('head_to_head_action', { roomId: gameState.id, buttonIndex: index });
        setButtonsDisabled(true); // Prevent double clicks
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 w-full max-w-5xl mx-auto">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 uppercase tracking-widest drop-shadow-md">
                    TESTA A TESTA
                </h2>
                <p className="text-slate-400 mt-2">
                    {isSpectator ? "Goditi lo spettacolo del duello finale!" : "Sopravvivi. 2 pulsanti sono letali, 1 è salvo."}
                </p>
                {isSpectator && (
                    <div className="mt-2 px-3 py-1 bg-slate-800 rounded-full inline-block text-xs font-mono text-slate-500 border border-slate-700">
                        MODALITÀ SPETTATORE
                    </div>
                )}
            </div>

            {/* Duelists Display */}
            <div className="flex items-center justify-center gap-12 w-full">
                {duelists.map((p, i) => {
                    const isTurn = p.id === currentTurnPlayer?.id;
                    const didLastAction = p.id === lastActionPlayerId;

                    return (
                        <div key={p.id} className={`flex flex-col items-center transition-all duration-500 ${isTurn ? 'scale-110 opacity-100 z-10' : 'scale-90 opacity-60 grayscale'}`}>
                            {/* Avatar */}
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold shadow-[0_0_20px_rgba(0,0,0,0.5)] mb-4 border-4 ${isTurn ? 'border-yellow-400 bg-gradient-to-br from-purple-600 to-indigo-600' : 'border-slate-600 bg-slate-700'}`}>
                                {p.name.substring(0, 2).toUpperCase()}
                            </div>

                            {/* Name & Lives */}
                            <div className="text-center">
                                <h3 className={`font-bold text-xl ${isTurn ? 'text-yellow-400' : 'text-slate-300'}`}>{p.name}</h3>
                                <div className="flex gap-2 justify-center mt-2">
                                    {[...Array(p.lives)].map((_, li) => (
                                        <span key={li} className={`text-2xl drop-shadow-[0_0_5px_rgba(239,68,68,0.8)] ${didLastAction && feedback && !feedback.isSafe && li === p.lives ? 'animate-ping' : ''}`}>
                                            ❤️
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Turn Indicator / Status */}
                            {isTurn && !feedback && (
                                <div className="mt-4 px-4 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs font-bold border border-yellow-500/50 animate-pulse">
                                    È IL SUO TURNO
                                </div>
                            )}

                            {/* Action Feedback Indicator */}
                            {didLastAction && feedback && (
                                <div className={`mt-4 px-4 py-1 rounded-full text-xs font-bold border animate-bounce ${feedback.isSafe ? 'bg-green-500/20 text-green-500 border-green-500/50' : 'bg-red-500/20 text-red-500 border-red-500/50'}`}>
                                    {feedback.isSafe ? 'SALVO!' : 'COLPITO!'}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ACTION AREA - BUTTONS */}
            <div className="relative mt-8">
                <div className="flex gap-6">
                    {[0, 1, 2].map((btnIndex) => {
                        // Determine visual state based on feedback
                        let btnStyle = "bg-slate-700 border-slate-600";
                        let btnContent = "❓";
                        let hoverStyle = isDuelist && myTurn && !feedback ? "hover:bg-slate-600 cursor-pointer hover:-translate-y-2 hover:shadow-xl active:translate-y-0" : "cursor-default opacity-80";


                        // If feedback exists for this button
                        if (feedback && feedback.index === btnIndex) {
                            if (feedback.isSafe) {
                                btnStyle = "bg-green-600 border-green-400 shadow-[0_0_30px_rgba(34,197,94,0.6)] scale-110";
                                btnContent = "🛡️";
                            } else {
                                btnStyle = "bg-red-600 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.6)] scale-110";
                                btnContent = "💥";
                            }
                            hoverStyle = ""; // No hover when revealed
                        }

                        // Disabled logic
                        const isClickable = myTurn && !buttonsDisabled && !feedback;

                        return (
                            <button
                                key={btnIndex}
                                onClick={() => handleButtonClick(btnIndex)}
                                disabled={!isClickable}
                                className={`
                                    w-32 h-32 rounded-2xl border-4 text-5xl flex items-center justify-center transition-all duration-300
                                    ${btnStyle}
                                    ${hoverStyle}
                                    ${!feedback && myTurn ? 'animate-bounce-subtle' : ''}
                                `}
                            >
                                {btnContent}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Instruction Footer */}
            {isDuelist && (
                <>
                    {myTurn && !feedback && (
                        <p className="text-xl text-white font-bold animate-pulse mt-4">
                            👇 TOCCA A TE! SCEGLI UN PULSANTE
                        </p>
                    )}
                    {!myTurn && !feedback && (
                        <p className="text-slate-500 mt-4">
                            In attesa dell'avversario...
                        </p>
                    )}
                </>
            )}
            {isSpectator && (
                <p className="text-slate-500 mt-4 italic">
                    Osserva attentamente...
                </p>
            )}

            {/* DEBUG FOOTER */}
            <div className="fixed bottom-0 left-0 w-full bg-black/80 text-xs text-slate-500 p-1 flex justify-between px-4 font-mono pointer-events-none">
                <span>MyID: {myPlayerId?.substring(0, 4)}</span>
                <span>Duelists: {duelists.length}</span>
                <span>TurnIdx: {gameState.currentTurnIndex}</span>
                <span>TurnPlayer: {currentTurnPlayer?.name} ({currentTurnPlayer?.id?.substring(0, 4)})</span>
                <span>IsMyTurn: {myTurn ? 'YES' : 'NO'}</span>
                <span>Disabled: {buttonsDisabled ? 'YES' : 'NO'}</span>
            </div>
        </div>
    );
}
