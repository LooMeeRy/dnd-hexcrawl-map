import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import mqtt from 'mqtt';
import { compressTokenImage } from '../utils';

const HEX_SIZE = 80;

function getHexPixel(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
}

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get('room');
  
  const [activeHexes, setActiveHexes] = useState({});
  const [playerTokens, setPlayerTokens] = useState({});
  const [dmTokens, setDmTokens] = useState({});
  
  const [cameraTarget, setCameraTarget] = useState({ q: 0, r: 0 });
  const [status, setStatus] = useState(roomCode ? 'Connecting...' : 'Local Sync (This Computer Only)');
  
  const [mqttClient, setMqttClient] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, type: 'hex', x: 0, y: 0, q: 0, r: 0, targetId: null });

  // Player Identity
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('dnd-player-name') || "");
  const [playerImage, setPlayerImage] = useState(() => localStorage.getItem('dnd-player-image') || null);
  const [myPlayerId] = useState(() => {
    let pid = localStorage.getItem('dnd-player-id');
    if (!pid) { pid = Math.random().toString(36).substring(2, 9); localStorage.setItem('dnd-player-id', pid); }
    return pid;
  });

  const mqttClientRef = useRef(null);

  useEffect(() => {
    if (roomCode) return; 
    const handleStorage = (e) => {
      if (e.key === 'dnd-map-local-sync' && e.newValue) setActiveHexes(JSON.parse(e.newValue));
      if (e.key === 'dnd-players-local-sync' && e.newValue) setPlayerTokens(JSON.parse(e.newValue));
      if (e.key === 'dnd-dmtokens-local-sync' && e.newValue) setDmTokens(JSON.parse(e.newValue));
    };
    
    const m = localStorage.getItem('dnd-map-local-sync'); if (m) setActiveHexes(JSON.parse(m));
    const p = localStorage.getItem('dnd-players-local-sync'); if (p) setPlayerTokens(JSON.parse(p));
    const d = localStorage.getItem('dnd-dmtokens-local-sync'); if (d) setDmTokens(JSON.parse(d));
    
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    
    setStatus('Looking for DM...');
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    mqttClientRef.current = client;
    setMqttClient(client);
    
    let timeoutId;
    let pingInterval;
    
    client.on('connect', () => {
      client.subscribe(`dnd-room/${roomCode}/map`);
      client.subscribe(`dnd-room/${roomCode}/tokens`);
      client.subscribe(`dnd-room/${roomCode}/closed`);
      
      client.publish(`dnd-room/${roomCode}/request`, 'hello');
      
      pingInterval = setInterval(() => {
        client.publish(`dnd-room/${roomCode}/ping`, myPlayerId);
      }, 2000);
      
      timeoutId = setTimeout(() => {
        setStatus('Error: Room not found or DM is offline.');
        clearInterval(pingInterval);
        client.end();
      }, 4000);
      
      // Check if player needs to setup token
      if (!localStorage.getItem('dnd-player-name') || !localStorage.getItem('dnd-player-image')) {
        setSetupModalOpen(true);
      } else {
        // Broadcast identity so DM knows we are here
        client.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ 
          type: 'add_player_token', 
          playerId: myPlayerId, 
          name: localStorage.getItem('dnd-player-name'), 
          image: localStorage.getItem('dnd-player-image') 
        }));
      }
    });
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${roomCode}/closed`) {
        setStatus('DM has closed this room.');
        setActiveHexes({}); setPlayerTokens({}); setDmTokens({});
        client.end(); return;
      }
      
      if (topic === `dnd-room/${roomCode}/map`) {
        clearTimeout(timeoutId);
        setStatus(`Connected to Room: ${roomCode}`);
        try { setActiveHexes(JSON.parse(message.toString())); } catch (e) {}
      }
      if (topic === `dnd-room/${roomCode}/tokens`) {
        clearTimeout(timeoutId);
        try {
          const data = JSON.parse(message.toString());
          if (data.players) setPlayerTokens(data.players);
          if (data.dmTokens) setDmTokens(data.dmTokens);
        } catch (e) {}
      }
    });
    
    client.on('error', (err) => setStatus(`Connection Error: ${err.message}`));
    client.on('close', () => {
      if (status.includes('Connected')) setStatus('Connection lost. Reconnecting...');
    });
    
    return () => {
      clearTimeout(timeoutId);
      if (pingInterval) clearInterval(pingInterval);
      client.end();
    };
  }, [roomCode]);

  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleActiveHexContextMenu = (e, q, r) => {
    if (!roomCode) return;
    e.preventDefault(); e.stopPropagation();
    setCameraTarget({ q, r });
    setContextMenu({ visible: true, type: 'hex', x: e.clientX, y: e.clientY, q, r });
  };
  
  const handlePlayerTokenContextMenu = (e, id) => {
    if (!roomCode || id !== myPlayerId) return;
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ visible: true, type: 'player_token', x: e.clientX, y: e.clientY, targetId: id });
  };

  const handleTokenImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressTokenImage(file, (dataUrl) => {
       setPlayerImage(dataUrl);
    });
  };

  const completeSetup = () => {
    if (!playerName || !playerImage) return alert("Please provide a name and token image");
    localStorage.setItem('dnd-player-name', playerName);
    localStorage.setItem('dnd-player-image', playerImage);
    setSetupModalOpen(false);
    if (mqttClientRef.current) {
       mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ 
         type: 'add_player_token', 
         playerId: myPlayerId, 
         name: playerName, 
         image: playerImage,
         q: 0, r: 0 // Default spawn position, DM can move it later
       }));
    }
  };

  const hexesList = Object.values(activeHexes);
  
  const playerGroups = {};
  Object.entries(playerTokens).forEach(([id, t]) => {
     const k = `${t.q},${t.r}`;
     if (!playerGroups[k]) playerGroups[k] = [];
     playerGroups[k].push({ id, ...t });
  });

  const centerPos = getHexPixel(cameraTarget.q, cameraTarget.r);

  return (
    <div className="app-container">
      <div className="bg-glow"></div>
      
      <div className="app-header">
        <div className="status-badge">Player View {playerName && `(${playerName})`}</div>
        <div className={`status-badge ${roomCode && status.includes('Connected') ? 'online' : ''}`}>
          {status}
        </div>
      </div>

      <div className="hex-grid-container">
        <div className="hex-grid" style={{ transform: `translate(${-centerPos.x}px, ${-centerPos.y}px)` }}>
          {hexesList.map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            return (
              <div 
                key={`active-${hex.q}-${hex.r}`} 
                className="hex-wrap hex-active"
                style={{ left: pos.x, top: pos.y, backgroundImage: hex.image ? `url(${hex.image})` : 'none', zIndex: 1 }}
                onClick={() => setCameraTarget({ q: hex.q, r: hex.r })}
                onContextMenu={(e) => handleActiveHexContextMenu(e, hex.q, hex.r)}
              />
            );
          })}

          {/* DM Tokens */}
          {Object.entries(dmTokens).map(([id, t]) => (
            <div key={id} style={{ position: 'absolute', left: t.x, top: t.y, transform: 'translate(-50%, -50%)', zIndex: 10 }}>
              <img src={t.image} width={t.size || 64} height={t.size || 64} style={{ borderRadius: '50%', border: '2px dashed rgba(255,85,85,0.8)', pointerEvents: 'none', objectFit: 'cover' }} />
            </div>
          ))}

          {/* Player Tokens */}
          {Object.entries(playerGroups).flatMap(([key, tokens]) => {
            const [q, r] = key.split(',').map(Number);
            const pos = getHexPixel(q, r);
            
            if (tokens.length === 1) {
              const t = tokens[0];
              return (
                <div key={t.id} style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: 20 }}
                     onContextMenu={e => handlePlayerTokenContextMenu(e, t.id)}>
                  <img src={t.image} title={t.name} width={64} height={64} style={{ borderRadius: '50%', border: t.id === myPlayerId ? '3px solid #55ff55' : '3px solid gold', pointerEvents: 'none', objectFit: 'cover', background: '#222' }} />
                </div>
              );
            } else {
              return tokens.map((t, i) => {
                const angle = (Math.PI * 2 * i) / tokens.length;
                const radius = 24;
                const cx = pos.x + Math.cos(angle) * radius;
                const cy = pos.y + Math.sin(angle) * radius;
                return (
                  <div key={t.id} style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)', zIndex: 20 }}
                       onContextMenu={e => handlePlayerTokenContextMenu(e, t.id)}>
                    <img src={t.image} title={t.name} width={48} height={48} style={{ borderRadius: '50%', border: t.id === myPlayerId ? '3px solid #55ff55' : '3px solid gold', pointerEvents: 'none', objectFit: 'cover', background: '#222' }} />
                  </div>
                );
              });
            }
          })}
        </div>
      </div>

      {contextMenu.visible && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'hex' && (
            <button onClick={() => {
              if (mqttClient) {
                 mqttClient.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ type: 'move_player', playerId: myPlayerId, q: contextMenu.q, r: contextMenu.r }));
              }
              setContextMenu({ ...contextMenu, visible: false });
            }}>Move My Token Here</button>
          )}
          {contextMenu.type === 'player_token' && (
            <button onClick={() => {
              setSetupModalOpen(true);
              setContextMenu({ ...contextMenu, visible: false });
            }}>Change Token Image</button>
          )}
        </div>
      )}

      {/* Setup Modal */}
      <div className={`image-modal ${setupModalOpen ? '' : 'hidden'}`}>
        <div className="modal-shell">
          <div className="modal-content">
            <h3>Player Profile</h3>
            <p>Set up your character token for this campaign.</p>
            <div className="input-group">
              <label>Character Name</label>
              <input type="text" placeholder="e.g. Drizzt Do'Urden" value={playerName} onChange={e => setPlayerName(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Token Image (Auto-compress)</label>
              <input type="file" accept="image/*" onChange={handleTokenImageUpload} />
            </div>
            {playerImage && (
               <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                 <img src={playerImage} width={80} height={80} style={{ borderRadius: '50%', border: '3px solid #55ff55', objectFit: 'cover' }} />
               </div>
            )}
            <div className="action-buttons">
              <button className="primary-btn" onClick={completeSetup}>
                <span>Join Game</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
