import React, { useState } from 'react';

const Lobby = ({ socket }) => {
    const [playerName, setPlayerName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [error, setError] = useState('');

    const handleCreate = () => {
        if (!playerName.trim()) return setError('Inserisci un nome');
        socket.emit('create_room', { playerName });
    };

    const handleJoin = () => {
        if (!playerName.trim()) return setError('Inserisci un nome');
        if (!roomId.trim()) return setError('Inserisci un ID stanza');
        socket.emit('join_room', { roomId, playerName });
    };

    return (
        <div className="flex flex-col items-center gap-6 p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                Benvenuto
            </h2>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <input
                type="text"
                placeholder="Il tuo nome"
                className="w-full p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-blue-500 transition-colors text-white"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
            />

            <div className="flex flex-col gap-3 w-full">
                <button
                    onClick={handleCreate}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-all transform hover:scale-105"
                >
                    Crea Nuova Stanza
                </button>

                <div className="flex items-center gap-2">
                    <div className="h-px bg-slate-600 flex-1"></div>
                    <span className="text-slate-400 text-sm">OPPURE</span>
                    <div className="h-px bg-slate-600 flex-1"></div>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="ID Stanza (es. ABCD)"
                        className="flex-1 p-3 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-purple-500 text-white uppercase"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                        maxLength={4}
                    />
                    <button
                        onClick={handleJoin}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded font-bold transition-all transform hover:scale-105"
                    >
                        Entra
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Lobby;
