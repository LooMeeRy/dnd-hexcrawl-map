import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import mqtt from 'mqtt';
import { compressTokenImage } from '../utils';

const HEX_SIZE = 80;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

const directions = [
  {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1},
  {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
];

function getHexPixel(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
}

export default function DMMapEditor() {
  const { campaignId } = useParams();
  const navigate = useNavigate();

  // Maps
  const [activeHexes, setActiveHexes] = useState(() => {
    const saved = localStorage.getItem(`dnd-map-${campaignId}`);
    return saved ? JSON.parse(saved) : { "0,0": { q: 0, r: 0, image: null } };
  });
  
  // Tokens
  const [playerTokens, setPlayerTokens] = useState(() => {
    const saved = localStorage.getItem(`dnd-players-${campaignId}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [dmTokens, setDmTokens] = useState(() => {
    const saved = localStorage.getItem(`dnd-dmtokens-${campaignId}`);
    return saved ? JSON.parse(saved) : {};
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [targetCoord, setTargetCoord] = useState(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  
  // DM Marker Modal
  const [markerModalOpen, setMarkerModalOpen] = useState(false);
  const [markerCoord, setMarkerCoord] = useState(null);

  const [cameraTarget, setCameraTarget] = useState({ q: 0, r: 0 });
  const [contextMenu, setContextMenu] = useState({ visible: false, type: 'hex', x: 0, y: 0, q: 0, r: 0, targetId: null });
  const [movingPlayerTokenId, setMovingPlayerTokenId] = useState(null);
  
  const [roomCode, setRoomCode] = useState(null);
  const [mqttClient, setMqttClient] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [players, setPlayers] = useState({});
  
  const activeHexesRef = useRef(activeHexes);
  const playerTokensRef = useRef(playerTokens);
  const dmTokensRef = useRef(dmTokens);

  useEffect(() => { activeHexesRef.current = activeHexes; }, [activeHexes]);
  useEffect(() => { playerTokensRef.current = playerTokens; }, [playerTokens]);
  useEffect(() => { dmTokensRef.current = dmTokens; }, [dmTokens]);

  // Save to Local Storage & MQTT Publish Maps + Tokens
  useEffect(() => {
    localStorage.setItem(`dnd-map-${campaignId}`, JSON.stringify(activeHexes));
    localStorage.setItem(`dnd-players-${campaignId}`, JSON.stringify(playerTokens));
    localStorage.setItem(`dnd-dmtokens-${campaignId}`, JSON.stringify(dmTokens));
    
    // Master sync file for Local mode
    localStorage.setItem('dnd-map-local-sync', JSON.stringify(activeHexes));
    localStorage.setItem('dnd-players-local-sync', JSON.stringify(playerTokens));
    localStorage.setItem('dnd-dmtokens-local-sync', JSON.stringify(dmTokens));
    
    if (mqttClient && roomCode) {
      mqttClient.publish(`dnd-room/${roomCode}/map`, JSON.stringify(activeHexes));
      mqttClient.publish(`dnd-room/${roomCode}/tokens`, JSON.stringify({ players: playerTokens, dmTokens }));
    }
  }, [activeHexes, playerTokens, dmTokens, mqttClient, roomCode, campaignId]);

  const startOnline = () => {
    if (mqttClient || isConnecting) return;
    setIsConnecting(true);
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    
    client.on('connect', () => {
      setIsConnecting(false);
      setRoomCode(code);
      setMqttClient(client);
      setPlayers({});
      client.subscribe(`dnd-room/${code}/request`);
      client.subscribe(`dnd-room/${code}/ping`);
      client.subscribe(`dnd-room/${code}/action`);
      
      client.publish(`dnd-room/${code}/info`, JSON.stringify({ campaignId }));
      client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
      client.publish(`dnd-room/${code}/tokens`, JSON.stringify({ players: playerTokensRef.current, dmTokens: dmTokensRef.current }));
    });
    
    client.on('error', () => setIsConnecting(false));
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${code}/request`) {
        client.publish(`dnd-room/${code}/info`, JSON.stringify({ campaignId }));
        client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
        client.publish(`dnd-room/${code}/tokens`, JSON.stringify({ players: playerTokensRef.current, dmTokens: dmTokensRef.current }));
      }
      if (topic === `dnd-room/${code}/ping`) {
        const pid = message.toString();
        setPlayers(prev => ({ ...prev, [pid]: Date.now() }));
      }
      if (topic === `dnd-room/${code}/action`) {
        try {
          const action = JSON.parse(message.toString());
          if (action.type === 'add_player_token' || action.type === 'change_player_image') {
            setPlayerTokens(prev => ({ ...prev, [action.playerId]: { ...prev[action.playerId], image: action.image, name: action.name, q: action.q || 0, r: action.r || 0 } }));
          }
          if (action.type === 'move_player') {
            setPlayerTokens(prev => {
              if (!prev[action.playerId]) return prev;
              return { ...prev, [action.playerId]: { ...prev[action.playerId], q: action.q, r: action.r } };
            });
          }
        } catch(e){}
      }
    });
  };

  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setPlayers(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, time] of Object.entries(next)) {
          if (now - time > 5000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [roomCode]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (mqttClient && roomCode) {
        mqttClient.publish(`dnd-room/${roomCode}/closed`, 'closed');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (mqttClient && roomCode) {
        mqttClient.publish(`dnd-room/${roomCode}/closed`, 'closed');
      }
    };
  }, [mqttClient, roomCode]);

  const stopOnline = () => {
    if (!mqttClient) return;
    mqttClient.publish(`dnd-room/${roomCode}/closed`, 'closed');
    mqttClient.end();
    setMqttClient(null);
    setRoomCode(null);
    setPlayers({});
    setIsConnecting(false);
  };

  const ghostHexes = useMemo(() => {
    const ghosts = {};
    Object.values(activeHexes).forEach(hex => {
      directions.forEach(d => {
        const nq = hex.q + d.q;
        const nr = hex.r + d.r;
        const key = `${nq},${nr}`;
        if (!activeHexes[key]) ghosts[key] = { q: nq, r: nr };
      });
    });
    return Object.values(ghosts);
  }, [activeHexes]);

  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // --- Context Menus ---
  const handleActiveHexContextMenu = (e, q, r) => {
    e.preventDefault(); e.stopPropagation();
    setCameraTarget({ q, r });
    setContextMenu({ visible: true, type: 'hex', x: e.clientX, y: e.clientY, q, r });
  };
  const handleDmTokenContextMenu = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ visible: true, type: 'dm_token', x: e.clientX, y: e.clientY, targetId: id });
  };
  const handlePlayerTokenContextMenu = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ visible: true, type: 'player_token', x: e.clientX, y: e.clientY, targetId: id });
  };

  // --- Map Editor Logic ---
  const handleGhostHexClick = (q, r) => {
    setTargetCoord({ q, r }); setIsEditingExisting(false);
    setImageUrl(""); setImageFile(null); setModalOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageUrl("");
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        if (width > height) {
          if (width > 256) { height *= 256 / width; width = 256; }
        } else {
          if (height > 256) { width *= 256 / height; height = 256; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        setImageFile(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const applyImage = () => {
    if (!targetCoord) return;
    let finalUrl = imageFile || imageUrl.trim() || (isEditingExisting ? activeHexes[`${targetCoord.q},${targetCoord.r}`]?.image : null);
    setActiveHexes(prev => ({
      ...prev, [`${targetCoord.q},${targetCoord.r}`]: { q: targetCoord.q, r: targetCoord.r, image: finalUrl }
    }));
    if (!isEditingExisting) setCameraTarget({ q: targetCoord.q, r: targetCoord.r });
    setModalOpen(false); setTargetCoord(null);
  };

  const handleDeleteHex = () => {
    const newHexes = { ...activeHexes };
    delete newHexes[`${contextMenu.q},${contextMenu.r}`];
    if (Object.keys(newHexes).length === 0) { alert("Cannot delete the last remaining zone."); return; }
    setActiveHexes(newHexes);
  };

  // --- DM Marker Logic ---
  const handleMarkerUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressTokenImage(file, (dataUrl) => {
       const pos = getHexPixel(markerCoord.q, markerCoord.r);
       const id = Math.random().toString(36).substring(2, 9);
       setDmTokens(prev => ({ ...prev, [id]: { id, x: pos.x, y: pos.y, image: dataUrl } }));
       setMarkerModalOpen(false);
    });
  };

  // Drag State for DM Tokens
  const [dragState, setDragState] = useState(null);
  
  const handleDmTokenMouseDown = (e, id) => {
    e.stopPropagation();
    setDragState({ id, startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
  };
  
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (dragState) setDragState(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
    };
    const handleGlobalMouseUp = () => {
      if (dragState) {
         const dx = dragState.currentX - dragState.startX;
         const dy = dragState.currentY - dragState.startY;
         setDmTokens(prev => {
            const t = prev[dragState.id];
            return { ...prev, [dragState.id]: { ...t, x: t.x + dx, y: t.y + dy } };
         });
         setDragState(null);
      }
    };
    if (dragState) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragState]);

  // Group Player Tokens
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
        <button className="status-badge" style={{ cursor: 'pointer', color: '#aaa', background: 'transparent', border: 'none' }} onClick={() => navigate('/dm')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="status-badge">DM View</div>
        {!roomCode ? (
          <button className="status-badge" style={{ cursor: isConnecting ? 'not-allowed' : 'pointer', color: isConnecting ? '#888' : 'white' }} onClick={startOnline} disabled={isConnecting}>
            {isConnecting ? 'Starting Room...' : 'Go Online (Host)'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="status-badge online">
              Room: {roomCode} | Players Connected: {Object.keys(players).length > 0 ? Object.keys(players).length : 'Waiting...'}
            </div>
            <button className="status-badge" style={{ cursor: 'pointer', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.3)' }} onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/player?room=${roomCode}`);
              alert("Invite Link Copied to Clipboard!");
            }}>
              Copy Link
            </button>
            <button className="status-badge" style={{ cursor: 'pointer', color: '#ff5555', borderColor: 'rgba(255, 85, 85, 0.3)' }} onClick={stopOnline}>
              Close Room
            </button>
          </div>
        )}
      </div>

      <div className="hex-grid-container">
        <div className="hex-grid" style={{ transform: `translate(${-centerPos.x}px, ${-centerPos.y}px)` }}>
          {/* Hexes */}
          {Object.values(activeHexes).map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            return (
              <div 
                key={`active-${hex.q}-${hex.r}`} className="hex-wrap hex-active"
                style={{ left: pos.x, top: pos.y, backgroundImage: hex.image ? `url(${hex.image})` : 'none', zIndex: 1 }}
                onClick={() => setCameraTarget({ q: hex.q, r: hex.r })}
                onContextMenu={(e) => handleActiveHexContextMenu(e, hex.q, hex.r)}
              />
            );
          })}
          {ghostHexes.map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            return (
              <div 
                key={`ghost-${hex.q}-${hex.r}`} className="hex-wrap hex-ghost"
                style={{ left: pos.x, top: pos.y, zIndex: 1 }} onClick={() => handleGhostHexClick(hex.q, hex.r)}
              >+</div>
            );
          })}

          {/* DM Tokens */}
          {Object.entries(dmTokens).map(([id, t]) => {
            const isDragging = dragState?.id === id;
            const dx = isDragging ? dragState.currentX - dragState.startX : 0;
            const dy = isDragging ? dragState.currentY - dragState.startY : 0;
            return (
              <div 
                key={id}
                style={{ position: 'absolute', left: t.x + dx, top: t.y + dy, transform: 'translate(-50%, -50%)', zIndex: 10, cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={e => handleDmTokenMouseDown(e, id)}
                onContextMenu={e => handleDmTokenContextMenu(e, id)}
              >
                <img src={t.image} width={t.size || 64} height={t.size || 64} style={{ borderRadius: '50%', border: '2px dashed rgba(255,85,85,0.8)', pointerEvents: 'none', objectFit: 'cover' }} />
              </div>
            );
          })}

          {/* Player Tokens */}
          {Object.entries(playerGroups).flatMap(([key, tokens]) => {
            const [q, r] = key.split(',').map(Number);
            const pos = getHexPixel(q, r);
            
            if (tokens.length === 1) {
              const t = tokens[0];
              return (
                <div key={t.id} style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: 20 }}
                     onContextMenu={e => handlePlayerTokenContextMenu(e, t.id)}>
                  <img src={t.image} title={t.name} width={64} height={64} style={{ borderRadius: '50%', border: '3px solid gold', pointerEvents: 'none', objectFit: 'cover', background: '#222' }} />
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
                    <img src={t.image} title={t.name} width={48} height={48} style={{ borderRadius: '50%', border: '3px solid gold', pointerEvents: 'none', objectFit: 'cover', background: '#222' }} />
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
            <>
              {movingPlayerTokenId && (
                <button style={{ color: '#55ff55' }} onClick={() => {
                  setPlayerTokens(prev => ({ ...prev, [movingPlayerTokenId]: { ...prev[movingPlayerTokenId], q: contextMenu.q, r: contextMenu.r } }));
                  setMovingPlayerTokenId(null);
                  setContextMenu({ ...contextMenu, visible: false });
                }}>Move Selected Player Here</button>
              )}
              <button onClick={() => { setMarkerCoord({ q: contextMenu.q, r: contextMenu.r }); setMarkerModalOpen(true); setContextMenu({ ...contextMenu, visible: false }); }}>Add DM Marker</button>
              <button onClick={() => { setTargetCoord({ q: contextMenu.q, r: contextMenu.r }); setIsEditingExisting(true); setImageUrl(""); setImageFile(null); setModalOpen(true); setContextMenu({ ...contextMenu, visible: false }); }}>Change Map Image</button>
              <button className="danger-menu-item" onClick={() => { handleDeleteHex(); setContextMenu({ ...contextMenu, visible: false }); }}>Delete Zone</button>
            </>
          )}
          {contextMenu.type === 'dm_token' && (
            <>
              <button onClick={() => {
                setDmTokens(prev => {
                  const t = prev[contextMenu.targetId];
                  return { ...prev, [contextMenu.targetId]: { ...t, size: (t.size || 64) * 1.25 } };
                });
              }}>Increase Size (+)</button>
              <button onClick={() => {
                setDmTokens(prev => {
                  const t = prev[contextMenu.targetId];
                  return { ...prev, [contextMenu.targetId]: { ...t, size: Math.max(16, (t.size || 64) * 0.8) } };
                });
              }}>Decrease Size (-)</button>
              <button className="danger-menu-item" onClick={() => {
                const nt = {...dmTokens}; delete nt[contextMenu.targetId]; setDmTokens(nt);
                setContextMenu({ ...contextMenu, visible: false });
              }}>Delete Marker</button>
            </>
          )}
          {contextMenu.type === 'player_token' && (
            <>
              <button onClick={() => { setMovingPlayerTokenId(contextMenu.targetId); setContextMenu({ ...contextMenu, visible: false }); }}>Move Player</button>
            </>
          )}
        </div>
      )}

      {/* Hex Image Modal */}
      <div className={`image-modal ${modalOpen ? '' : 'hidden'}`}>
        <div className="modal-shell">
          <div className="modal-content">
            <h3>{isEditingExisting ? 'Edit Hex Image' : 'New Region Image'}</h3>
            <p>{isEditingExisting ? 'Update the image for this region.' : 'Add an image to unlock this new region.'}</p>
            <div className="input-group">
              <label>Upload File (Max 256x256 auto-compress)</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} />
            </div>
            <div className="input-group">
              <label>Or Image URL</label>
              <input type="text" placeholder="https://..." value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} />
            </div>
            <div className="action-buttons">
              <button className="primary-btn" onClick={applyImage}>
                <span>{isEditingExisting ? 'Apply Changes' : 'Apply & Unlock'}</span>
              </button>
              <button className="ghost-btn" onClick={() => { setModalOpen(false); setTargetCoord(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      </div>

      {/* DM Marker Modal */}
      <div className={`image-modal ${markerModalOpen ? '' : 'hidden'}`}>
        <div className="modal-shell">
          <div className="modal-content">
            <h3>Add DM Marker</h3>
            <p>Upload a sticker or monster token. You can drag it anywhere later.</p>
            <div className="input-group">
              <label>Upload Marker Image</label>
              <input type="file" accept="image/*" onChange={handleMarkerUpload} />
            </div>
            <div className="action-buttons">
              <button className="ghost-btn" onClick={() => setMarkerModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
