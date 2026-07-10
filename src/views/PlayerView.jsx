import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import mqtt from 'mqtt';
import { compressTokenImage, getHexDistance, pixelToHex } from '../utils';
import DiceRoller from '../components/DiceRoller';
import LocalMap from '../components/LocalMap';

const HEX_SIZE = 80;

function getHexPixel(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
}

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get('room');
  const navigate = useNavigate();
  
  const [activeHexes, setActiveHexes] = useState({});
  const [playerTokens, setPlayerTokens] = useState({});
  const [dmTokens, setDmTokens] = useState({});
  const [persistentPings, setPersistentPings] = useState({});
  const [persistentLocalPings, setPersistentLocalPings] = useState({});
  const [activePings, setActivePings] = useState([]);
  const [activeLocalPings, setActiveLocalPings] = useState([]);
  const [localCameraTarget, setLocalCameraTarget] = useState(null);
  const [incomingRoll, setIncomingRoll] = useState(null);
  
  const [cameraTarget, setCameraTarget] = useState({ q: 0, r: 0 });
  const [hasFocused, setHasFocused] = useState(false);
  const [status, setStatus] = useState(roomCode ? 'Connecting...' : 'Local Sync (This Computer Only)');
  const [campaignId, setCampaignId] = useState(null);
  const [memoryMap, setMemoryMap] = useState({});
  const [fogEnabled, setFogEnabled] = useState(true);
  
  const [mqttClient, setMqttClient] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, type: 'hex', x: 0, y: 0, q: 0, r: 0, targetId: null });
  const [viewMode, setViewMode] = useState('macro'); // 'macro' or 'local'
  const [activeLocalHex, setActiveLocalHex] = useState(null); // {q, r}

  // Player Identity
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerImage, setPlayerImage] = useState(null);
  const [playerColor, setPlayerColor] = useState("#55ff55");
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
      if (e.key === 'dnd-persistent-pings-local-sync' && e.newValue) setPersistentPings(JSON.parse(e.newValue));
      if (e.key === 'dnd-persistent-local-pings-local-sync' && e.newValue) setPersistentLocalPings(JSON.parse(e.newValue));
    };
    
    const m = localStorage.getItem('dnd-map-local-sync'); if (m) setActiveHexes(JSON.parse(m));
    const p = localStorage.getItem('dnd-players-local-sync'); if (p) setPlayerTokens(JSON.parse(p));
    const d = localStorage.getItem('dnd-dmtokens-local-sync'); if (d) setDmTokens(JSON.parse(d));
    const pp = localStorage.getItem('dnd-persistent-pings-local-sync'); if (pp) setPersistentPings(JSON.parse(pp));
    const plp = localStorage.getItem('dnd-persistent-local-pings-local-sync'); if (plp) setPersistentLocalPings(JSON.parse(plp));
    
    const handleStoragePing = (e) => {
      if (e.key === 'dnd-local-ping' && e.newValue) {
        const ping = JSON.parse(e.newValue);
        const pid = Date.now()+Math.random();
        setActivePings(prev => [...prev, { id: pid, q: ping.q, r: ping.r, color: ping.color }]);
        setTimeout(() => setActivePings(prev => prev.filter(p => p.id !== pid)), 1000);
      }
      if (e.key === 'dnd-local-force-focus' && e.newValue) {
        const event = JSON.parse(e.newValue);
        const pid = Date.now()+Math.random();
        setActivePings(prev => [...prev, { id: pid, q: event.q, r: event.r, color: event.color }]);
        setTimeout(() => setActivePings(prev => prev.filter(p => p.id !== pid)), 1000);
        setCameraTarget({ q: event.q, r: event.r });
      }
      if (e.key === 'dnd-local-local-ping' && e.newValue) {
        const ping = JSON.parse(e.newValue);
        const pid = Date.now()+Math.random();
        setActiveLocalPings(prev => [...prev, { id: pid, localX: ping.localX, localY: ping.localY, color: ping.color }]);
        setTimeout(() => setActiveLocalPings(prev => prev.filter(p => p.id !== pid)), 1000);
      }
      if (e.key === 'dnd-local-dice-roll' && e.newValue) {
        setIncomingRoll(JSON.parse(e.newValue));
      }
    };
    
    window.addEventListener('storage', handleStorage);
    window.addEventListener('storage', handleStoragePing);
    return () => {
       window.removeEventListener('storage', handleStorage);
       window.removeEventListener('storage', handleStoragePing);
    }
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
      client.subscribe(`dnd-room/${roomCode}/info`);
      client.subscribe(`dnd-room/${roomCode}/map`);
      client.subscribe(`dnd-room/${roomCode}/tokens`);
      client.subscribe(`dnd-room/${roomCode}/events`);
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
    });
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${roomCode}/closed`) {
        setStatus('DM has closed this room.');
        setActiveHexes({}); setPlayerTokens({}); setDmTokens({});
        client.end(); return;
      }
      
      if (topic === `dnd-room/${roomCode}/info`) {
        try {
           const info = JSON.parse(message.toString());
           if (info.campaignId) setCampaignId(info.campaignId);
        } catch (e) {}
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
          if (data.persistentPings) setPersistentPings(data.persistentPings);
          if (data.persistentLocalPings) setPersistentLocalPings(data.persistentLocalPings);
        } catch (e) {}
      }
      
      if (topic === `dnd-room/${roomCode}/events`) {
        try {
          const event = JSON.parse(message.toString());
          if (event.type === 'ping' || event.type === 'force_focus') {
            const newPing = { id: Date.now() + Math.random(), q: event.q, r: event.r, color: event.color || '#ff5555' };
            setActivePings(prev => [...prev, newPing]);
            setTimeout(() => { setActivePings(prev => prev.filter(p => p.id !== newPing.id)); }, 1000);
            if (event.type === 'force_focus') setCameraTarget({ q: event.q, r: event.r });
          } else if (event.type === 'local_ping' || event.type === 'local_force_focus') {
            const newPing = { id: Date.now() + Math.random(), localX: event.localX, localY: event.localY, color: event.color || '#ff5555' };
            setActiveLocalPings(prev => [...prev, newPing]);
            setTimeout(() => setActiveLocalPings(prev => prev.filter(p => p.id !== newPing.id)), 1000);
            if (event.type === 'local_force_focus') {
               setLocalCameraTarget({ localX: event.localX, localY: event.localY, _t: Date.now() });
            }
          } else if (event.type === 'dice_roll') {
            setIncomingRoll(event);
          }
        } catch(e) {}
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
  }, [roomCode, myPlayerId]);

  useEffect(() => {
    if (!campaignId) return;
    const storedName = localStorage.getItem(`dnd-player-name-${campaignId}`);
    const storedImage = localStorage.getItem(`dnd-player-image-${campaignId}`);
    const storedColor = localStorage.getItem(`dnd-player-color-${campaignId}`) || "#55ff55";
    if (!storedName || !storedImage) {
      setSetupModalOpen(true);
    } else {
      setPlayerName(storedName);
      setPlayerImage(storedImage);
      setPlayerColor(storedColor);
      if (mqttClientRef.current) {
        mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ 
          type: 'add_player_token', 
          playerId: myPlayerId, 
          name: storedName, 
          image: storedImage,
          color: storedColor
        }));
      }
    }
    try { const saved = localStorage.getItem(`dnd-memory-map-${campaignId}`); if (saved) setMemoryMap(JSON.parse(saved)); } catch (e) {}
  }, [campaignId, roomCode, myPlayerId]);

  useEffect(() => {
    setMemoryMap(prev => {
      const next = { ...prev };
      let hasChanges = false;
      const visionTokens = roomCode ? (playerTokens[myPlayerId] ? [playerTokens[myPlayerId]] : []) : Object.values(playerTokens);
      
      // Update memory for active hexes
      Object.values(activeHexes).forEach(hex => {
        let minD = Infinity;
        if (visionTokens.length === 0) { minD = roomCode ? Infinity : 0; }
        else { visionTokens.forEach(t => { const d = getHexDistance(t.q, t.r, hex.q, hex.r); if (d < minD) minD = d; }); }
        if (minD <= 2) {
          const key = `${hex.q},${hex.r}`;
          if (!next[key] || next[key].image !== hex.image) { next[key] = { ...hex }; hasChanges = true; }
        }
      });

      // Clear memory for removed hexes that are within sight
      Object.values(next).forEach(memHex => {
        const key = `${memHex.q},${memHex.r}`;
        if (!activeHexes[key]) {
          let minD = Infinity;
          if (visionTokens.length === 0) { minD = roomCode ? Infinity : 0; }
          else { visionTokens.forEach(t => { const d = getHexDistance(t.q, t.r, memHex.q, memHex.r); if (d < minD) minD = d; }); }
          if (minD <= 2) { delete next[key]; hasChanges = true; }
        }
      });

      if (hasChanges) {
        if (campaignId) localStorage.setItem(`dnd-memory-map-${campaignId}`, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [activeHexes, playerTokens, myPlayerId, roomCode, campaignId]);

  useEffect(() => {
    if (!roomCode || hasFocused || !playerTokens[myPlayerId]) return;
    setCameraTarget({ q: playerTokens[myPlayerId].q, r: playerTokens[myPlayerId].r });
    setHasFocused(true);
  }, [playerTokens, myPlayerId, hasFocused, roomCode]);

  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleActiveHexContextMenu = (e, q, r) => {
    if (!roomCode) return;
    e.preventDefault(); e.stopPropagation();
    setCameraTarget({ q, r });
    const hexPos = getHexPixel(q, r);
    setContextMenu({ visible: true, type: 'hex', gridX: hexPos.x + 20, gridY: hexPos.y, q, r });
  };
  
  const handlePlayerTokenContextMenu = (e, id) => {
    if (!roomCode || id !== myPlayerId) return;
    e.preventDefault(); e.stopPropagation();
    const currentCenter = getHexPixel(cameraTarget.q, cameraTarget.r);
    const gridX = e.clientX - window.innerWidth / 2 + currentCenter.x;
    const gridY = e.clientY - window.innerHeight / 2 + currentCenter.y;
    setContextMenu({ visible: true, type: 'player_token', gridX, gridY, targetId: id });
  };

  const handleTokenImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressTokenImage(file, (dataUrl) => {
       setPlayerImage(dataUrl);
    });
  };

  const handleRollBroadcast = (rollEvent) => {
    if (mqttClientRef.current && roomCode) {
      mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify(rollEvent));
    } else {
      localStorage.setItem('dnd-local-dice-roll', JSON.stringify({ ...rollEvent, _t: Date.now() }));
    }
  };

  const completeSetup = () => {
    if (!playerName || !playerImage) return alert("Please provide a name and token image");
    localStorage.setItem(`dnd-player-name-${campaignId}`, playerName);
    localStorage.setItem(`dnd-player-image-${campaignId}`, playerImage);
    localStorage.setItem(`dnd-player-color-${campaignId}`, playerColor);
    setSetupModalOpen(false);
    if (mqttClientRef.current) {
       mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ 
         type: 'add_player_token', 
         playerId: myPlayerId, 
         name: playerName, 
         image: playerImage,
         color: playerColor
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
      
      <div className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="status-badge" style={{ cursor: 'pointer', color: '#aaa', background: 'transparent', border: 'none' }} onClick={() => navigate('/')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="status-badge" style={{ color: roomCode ? '#55ff55' : 'gold' }}>
            {status}
          </div>
          {roomCode && (
             <div className="status-badge">
               Room: {roomCode}
             </div>
          )}
        </div>
        
        {!roomCode && (
          <button 
             className={`fog-toggle-btn ${fogEnabled ? 'active' : ''}`}
             onClick={() => setFogEnabled(!fogEnabled)}
             title={fogEnabled ? "Fog of War is Enabled" : "Fog of War is Disabled"}
          >
            <div className="fog-toggle-icon">
              {fogEnabled ? (
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
              ) : (
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </div>
            <span>Fog of War</span>
          </button>
        )}
      </div>

      {viewMode === 'local' && activeLocalHex ? (
        <LocalMap 
          hex={activeHexes[`${activeLocalHex.q},${activeLocalHex.r}`] || { q: activeLocalHex.q, r: activeLocalHex.r }}
          playerTokens={Object.entries(playerTokens).map(([id, t]) => ({ id, ...t })).filter(t => t.q === activeLocalHex.q && t.r === activeLocalHex.r)}
          dmTokens={Object.entries(dmTokens).map(([id, t]) => ({ id, ...t })).filter(t => t.q === activeLocalHex.q && t.r === activeLocalHex.r)}
          isDM={false}
          onUpdatePlayerToken={(id, updates) => {
            if (id !== myPlayerId) return; // Players can only drag their own token
            setPlayerTokens(prev => {
               const next = { ...prev, [id]: { ...prev[id], ...updates } };
               if (mqttClientRef.current && roomCode) {
                 mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ type: 'move_player', playerId: id, ...updates }));
               }
               return next;
            });
          }}
          onUpdateDmToken={() => {}} // Players cannot update DM tokens
          onUpdateLocalImage={() => {}} // Players cannot update images
          onLocalPing={(lx, ly) => {
             const pid = Date.now() + Math.random();
             setActiveLocalPings(prev => [...prev, { id: pid, localX: lx, localY: ly, color: playerColor }]);
             setTimeout(() => setActiveLocalPings(prev => prev.filter(p => p.id !== pid)), 1000);
             if (mqttClientRef.current && roomCode) {
               mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ type: 'local_ping', localX: lx, localY: ly, color: playerColor }));
             } else {
               localStorage.setItem('dnd-local-local-ping', JSON.stringify({ localX: lx, localY: ly, color: playerColor, _t: Date.now() }));
             }
          }}
          activeLocalPings={activeLocalPings}
          persistentLocalPings={persistentLocalPings}
          localCameraTarget={localCameraTarget}
          onExit={() => { setViewMode('macro'); setActiveLocalHex(null); }}
        />
      ) : (
      <div className="hex-grid-container">
        <div className="hex-grid" style={{ transform: `translate(${-centerPos.x}px, ${-centerPos.y}px)` }}>
          {(fogEnabled ? Object.values(memoryMap) : Object.values(activeHexes)).map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            
            let minD = Infinity;
            if (!fogEnabled) {
               minD = 0;
            } else {
               const visionTokens = roomCode ? (playerTokens[myPlayerId] ? [playerTokens[myPlayerId]] : []) : Object.values(playerTokens);
               if (visionTokens.length === 0) minD = roomCode ? Infinity : 0;
               else visionTokens.forEach(t => { const d = getHexDistance(t.q, t.r, hex.q, hex.r); if (d < minD) minD = d; });
            }
            
            let fogClass = 'fog-heavy';
            if (minD === 0) fogClass = 'fog-clear';
            else if (minD === 1) fogClass = 'fog-light';
            else if (minD === 2) fogClass = 'fog-medium';
            
            return (
              <div 
                key={`memory-${hex.q}-${hex.r}`} 
                className={`hex-wrap hex-active ${fogClass}`}
                style={{ left: pos.x, top: pos.y, backgroundImage: hex.image ? `url(${hex.image})` : 'none', zIndex: 1 }}
                onClick={(e) => {
                  if (e.altKey) {
                     const pid = Date.now() + Math.random();
                     setActivePings(prev => [...prev, { id: pid, q: hex.q, r: hex.r, color: playerColor }]);
                     setTimeout(() => setActivePings(prev => prev.filter(p => p.id !== pid)), 1000);
                     
                     if (mqttClientRef.current && roomCode) {
                        mqttClientRef.current.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ type: 'ping', q: hex.q, r: hex.r, color: playerColor }));
                     } else {
                        localStorage.setItem('dnd-local-ping', JSON.stringify({ q: hex.q, r: hex.r, color: playerColor, _t: Date.now() }));
                     }
                  } else {
                     setCameraTarget({ q: hex.q, r: hex.r });
                  }
                }}
                onContextMenu={(e) => handleActiveHexContextMenu(e, hex.q, hex.r)}
              />
            );
          })}

          {/* DM Tokens */}
          {Object.entries(dmTokens).map(([id, t]) => {
            const h = pixelToHex(t.x, t.y);
            let minD = Infinity;
            if (!fogEnabled) {
               minD = 0;
            } else {
               const visionTokens = roomCode ? (playerTokens[myPlayerId] ? [playerTokens[myPlayerId]] : []) : Object.values(playerTokens);
               if (visionTokens.length === 0) minD = roomCode ? Infinity : 0;
               else visionTokens.forEach(pt => { const d = getHexDistance(pt.q, pt.r, h.q, h.r); if (d < minD) minD = d; });
            }
            
            if (minD >= 3) return null;
            
            return (
              <div key={id} style={{ position: 'absolute', left: t.x, top: t.y, transform: 'translate(-50%, -50%)', zIndex: 10 }}>
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
                  <img src={t.image} title={t.name} width={64} height={64} style={{ borderRadius: '50%', border: `3px solid ${t.color || '#55ff55'}`, pointerEvents: 'none', objectFit: 'cover', background: '#222', boxShadow: t.id === myPlayerId ? `0 0 12px ${t.color || '#55ff55'}` : 'none' }} />
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
                    <img src={t.image} title={t.name} width={48} height={48} style={{ borderRadius: '50%', border: `3px solid ${t.color || '#55ff55'}`, pointerEvents: 'none', objectFit: 'cover', background: '#222', boxShadow: t.id === myPlayerId ? `0 0 12px ${t.color || '#55ff55'}` : 'none' }} />
                  </div>
                );
              });
            }
          })}

          {/* Active Pings */}
          {activePings.map(p => {
             const pos = getHexPixel(p.q, p.r);
             return <div key={p.id} className="ping-circle" style={{ left: pos.x, top: pos.y, '--ping-color': p.color }} />
          })}

          {/* Persistent Pings */}
          {Object.entries(persistentPings).map(([key, p]) => {
             const [q, r] = key.split(',').map(Number);
             const pos = getHexPixel(q, r);
             return (
               <React.Fragment key={`pp-${key}`}>
                 <div className="persistent-ping" style={{ left: pos.x, top: pos.y, '--ping-color': p.color, '--ping-speed': p.speed || '2s' }} />
               </React.Fragment>
             );
          })}
          
          {contextMenu.visible && (
            <div className="context-menu" style={{ position: 'absolute', left: contextMenu.gridX, top: contextMenu.gridY, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
              {contextMenu.type === 'hex' && (
                <>
                  {playerTokens[myPlayerId] && playerTokens[myPlayerId].q === contextMenu.q && playerTokens[myPlayerId].r === contextMenu.r && (
                    <button onClick={() => {
                      setActiveLocalHex({ q: contextMenu.q, r: contextMenu.r });
                      setViewMode('local');
                      setContextMenu({ ...contextMenu, visible: false });
                    }}>Enter Local Map</button>
                  )}
                  <button onClick={() => {
                    if (mqttClient) {
                       mqttClient.publish(`dnd-room/${roomCode}/action`, JSON.stringify({ type: 'move_player', playerId: myPlayerId, q: contextMenu.q, r: contextMenu.r }));
                    }
                    setContextMenu({ ...contextMenu, visible: false });
                  }}>Move My Token Here</button>
                </>
              )}
              {contextMenu.type === 'player_token' && (
                <button onClick={() => {
                  setSetupModalOpen(true);
                  setContextMenu({ ...contextMenu, visible: false });
                }}>Edit Character Profile</button>
              )}
            </div>
          )}
        </div>
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
            <div className="input-group">
              <label>Signature Color (Border & Ping)</label>
              <input type="color" value={playerColor} onChange={e => setPlayerColor(e.target.value)} style={{ width: '100%', height: '40px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </div>
            {playerImage && (
               <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                 <img src={playerImage} width={80} height={80} style={{ borderRadius: '50%', border: `3px solid ${playerColor}`, objectFit: 'cover', boxShadow: `0 0 16px ${playerColor}` }} />
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
      
      <DiceRoller 
        playerColor={playerColor} 
        playerName={playerName || 'Player'} 
        onRollBroadcast={handleRollBroadcast} 
        incomingRoll={incomingRoll}
        hideControls={true}
      />
      
    </div>
  );
}
