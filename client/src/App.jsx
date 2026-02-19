import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import Game from './components/Game';

// Connect to server (ensure URL matches server port)
// Connect to server (ensure URL matches server port)
// In dev mode (npm run dev), default to localhost. In prod, default to Render.
const defaultUrl = import.meta.env.DEV ? 'http://localhost:3000' : 'https://impostor-server-npkq.onrender.com';
let serverUrl = import.meta.env.VITE_SERVER_URL || defaultUrl;

// Normalize URL: Ensure protocol and domain
if (!serverUrl.includes('://')) {
  serverUrl = `https://${serverUrl}`;
}
if (!serverUrl.includes('.') && !serverUrl.includes('localhost')) {
  serverUrl += '.onrender.com';
}

const socket = io(serverUrl);

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [spectatorData, setSpectatorData] = useState(null); // Secrets for dead players
  const [errorMSG, setErrorMSG] = useState('');

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => {
      console.error("Connection error:", err);
      setErrorMSG(`Conn Error: ${err.message}`);
    });

    socket.on('room_joined', ({ roomId, gameState }) => {
      setGameState(gameState);
      // Wait for 'your_role' event separately
    });

    socket.on('room_update', (newGameState) => {
      console.log("[DEBUG] room_update received. Phase:", newGameState.phase);
      if (newGameState.phase === 'LOBBY') {
        setMyRole(null); // Reset role when returning to lobby
        setSpectatorData(null); // Reset spectator data
      }
      setGameState(newGameState);
    });

    socket.on('game_started', (update) => {
      setGameState(prev => ({ ...prev, ...update }));
      setSpectatorData(null); // Reset spectator data on new game
    });

    socket.on('head_to_head_start', (data) => {
      console.log("[DEBUG] HEAD TO HEAD STARTED", data);
      // Force phase update immediately to ensure UI switches
      setGameState(prev => prev ? ({ ...prev, phase: 'HEAD_TO_HEAD', ...data }) : prev);
    });

    socket.on('timer_tick', (timer) => {
      setGameState(prev => prev ? ({ ...prev, timer }) : prev);
    });

    socket.on('phase_change', (data) => {
      console.log("[DEBUG] phase_change:", data);
      setGameState(prev => prev ? ({ ...prev, ...data }) : prev);
    });

    socket.on('your_role', (roleData) => {
      setMyRole(roleData);
    });

    socket.on('spectator_update', (data) => {
      console.log("Became a spectator!", data);
      setSpectatorData(data);
    });

    socket.on('impostor_caught', (data) => {
      setGameState(prev => prev ? ({ ...prev, phase: 'RESOLUTION', ...data }) : prev);
    });

    socket.on('round_end', (data) => {
      setGameState(prev => prev ? ({ ...prev, phase: 'ROUND_END', ...data }) : prev);
    });

    socket.on('game_over', (data) => {
      setGameState(prev => prev ? ({ ...prev, phase: 'GAME_OVER', ...data }) : prev);
    });

    socket.on('error', (msg) => {
      alert(msg); // Check generic error handling
      setErrorMSG(msg);
      setTimeout(() => setErrorMSG(''), 3000);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_joined');
      socket.off('room_update');
      socket.off('game_started');
      socket.off('head_to_head_start'); // Clean up new listener
      socket.off('your_role');
      socket.off('error');
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white flex flex-col">
      {/* Header / Logo */}
      <header className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 backdrop-blur-md sticky top-0 z-10">
        <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          THE 12TH WORD
        </h1>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} shadow-[0_0_10px_rgba(0,255,0,0.5)]`}></div>
          <span className="text-xs text-slate-400 font-mono">
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </header>

      {/* Error Toast */}
      {errorMSG && (
        <div className="fixed top-20 right-4 bg-red-500/90 text-white px-6 py-3 rounded shadow-lg animate-bounce z-50">
          {errorMSG}
        </div>
      )}

      {/* DEBUG INFO */}
      <div className="fixed bottom-2 right-2 text-[10px] text-slate-500 font-mono z-50 bg-black/80 p-2 rounded">
        Target: {serverUrl} <br />
        Connected: {isConnected ? 'YES' : 'NO'}
      </div>

      <main className="flex-1 flex items-center justify-center p-4">
        {!gameState ? (
          <Lobby socket={socket} />
        ) : (
          <Game socket={socket} gameState={gameState} myRole={myRole} spectatorData={spectatorData} />
        )}
      </main>
    </div>
  );
}

export default App;
