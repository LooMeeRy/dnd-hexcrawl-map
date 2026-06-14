import React, { useState, useEffect, useMemo, useRef } from 'react';
import mqtt from 'mqtt';

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

export default function DMView() {
  const [activeHexes, setActiveHexes] = useState(() => {
    const saved = localStorage.getItem('dnd-map');
    return saved ? JSON.parse(saved) : { "0,0": { q: 0, r: 0, image: null } };
  });
  
  const [modalOpen, setModalOpen] = useState(false);
  const [targetCoord, setTargetCoord] = useState(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [cameraTarget, setCameraTarget] = useState({ q: 0, r: 0 });
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, q: 0, r: 0 });
  
  const [roomCode, setRoomCode] = useState(null);
  const [mqttClient, setMqttClient] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  
  const activeHexesRef = useRef(activeHexes);
  useEffect(() => {
    activeHexesRef.current = activeHexes;
  }, [activeHexes]);

  useEffect(() => {
    localStorage.setItem('dnd-map', JSON.stringify(activeHexes));
    if (mqttClient && roomCode) {
      mqttClient.publish(`dnd-room/${roomCode}/map`, JSON.stringify(activeHexes));
    }
  }, [activeHexes, mqttClient, roomCode]);

  const startOnline = () => {
    if (mqttClient) return;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Connect to public EMQX broker over secure WebSockets
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    
    client.on('connect', () => {
      setRoomCode(code);
      setMqttClient(client);
      // Subscribe to player requests
      client.subscribe(`dnd-room/${code}/request`);
      // Broadcast initial state
      client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
    });
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${code}/request`) {
        // A player joined and requested the map
        setPlayerCount(prev => prev + 1);
        client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
      }
    });
  };

  const stopOnline = () => {
    if (!mqttClient) return;
    // Tell players the room is closed
    mqttClient.publish(`dnd-room/${roomCode}/closed`, 'closed');
    mqttClient.end();
    setMqttClient(null);
    setRoomCode(null);
    setPlayerCount(0);
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

  const handleActiveHexClick = (q, r) => setCameraTarget({ q, r });

  const handleActiveHexContextMenu = (e, q, r) => {
    e.preventDefault();
    setCameraTarget({ q, r });
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, q, r });
  };

  const handleGhostHexClick = (q, r) => {
    setTargetCoord({ q, r }); setIsEditingExisting(false);
    setImageUrl(""); setImageFile(null); setModalOpen(true);
  };

  const applyImage = () => {
    if (!targetCoord) return;
    let finalUrl = null;
    if (imageFile) finalUrl = URL.createObjectURL(imageFile);
    else if (imageUrl.trim() !== '') finalUrl = imageUrl.trim();
    else if (isEditingExisting) finalUrl = activeHexes[`${targetCoord.q},${targetCoord.r}`]?.image;
    
    setActiveHexes(prev => ({
      ...prev,
      [`${targetCoord.q},${targetCoord.r}`]: { q: targetCoord.q, r: targetCoord.r, image: finalUrl }
    }));
    
    if (!isEditingExisting) setCameraTarget({ q: targetCoord.q, r: targetCoord.r });
    closeModal();
  };

  const closeModal = () => { setModalOpen(false); setTargetCoord(null); };

  const handleEditFromMenu = () => {
    setTargetCoord({ q: contextMenu.q, r: contextMenu.r });
    setIsEditingExisting(true); setImageUrl(""); setImageFile(null); setModalOpen(true);
  };

  const handleDeleteFromMenu = () => {
    const newHexes = { ...activeHexes };
    delete newHexes[`${contextMenu.q},${contextMenu.r}`];
    if (Object.keys(newHexes).length === 0) {
      alert("Cannot delete the last remaining zone."); return;
    }
    setActiveHexes(newHexes);
  };

  const centerPos = getHexPixel(cameraTarget.q, cameraTarget.r);

  return (
    <div className="app-container">
      <div className="bg-glow"></div>
      
      <div className="app-header">
        <div className="status-badge">DM View</div>
        {!roomCode ? (
          <button className="status-badge" style={{ cursor: 'pointer', color: 'white' }} onClick={startOnline}>
            Go Online (Host)
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="status-badge online">
              Room: {roomCode} | Players Connected: {playerCount > 0 ? playerCount : 'Waiting...'}
            </div>
            <button className="status-badge" style={{ cursor: 'pointer', color: '#ff5555', borderColor: 'rgba(255, 85, 85, 0.3)' }} onClick={stopOnline}>
              Close Room
            </button>
          </div>
        )}
      </div>

      <div className="hex-grid-container">
        <div className="hex-grid" style={{ transform: `translate(${-centerPos.x}px, ${-centerPos.y}px)` }}>
          {Object.values(activeHexes).map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            return (
              <div 
                key={`active-${hex.q}-${hex.r}`} className="hex-wrap hex-active"
                style={{ left: pos.x, top: pos.y, backgroundImage: hex.image ? `url(${hex.image})` : 'none' }}
                onClick={() => handleActiveHexClick(hex.q, hex.r)}
                onContextMenu={(e) => handleActiveHexContextMenu(e, hex.q, hex.r)}
              />
            );
          })}
          {ghostHexes.map(hex => {
            const pos = getHexPixel(hex.q, hex.r);
            return (
              <div 
                key={`ghost-${hex.q}-${hex.r}`} className="hex-wrap hex-ghost"
                style={{ left: pos.x, top: pos.y }} onClick={() => handleGhostHexClick(hex.q, hex.r)}
              >+</div>
            );
          })}
        </div>
      </div>

      {contextMenu.visible && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { handleEditFromMenu(); setContextMenu({ ...contextMenu, visible: false }); }}>Change Image</button>
          <button className="danger-menu-item" onClick={() => { handleDeleteFromMenu(); setContextMenu({ ...contextMenu, visible: false }); }}>Delete Zone</button>
        </div>
      )}

      <div className={`image-modal ${modalOpen ? '' : 'hidden'}`}>
        <div className="modal-shell">
          <div className="modal-content">
            <h3>{isEditingExisting ? 'Edit Hex Image' : 'New Region Image'}</h3>
            <p>{isEditingExisting ? 'Update the image for this region.' : 'Add an image to unlock this new region.'}</p>
            <div className="input-group">
              <label>Upload File</label>
              <input type="file" accept="image/*" onChange={e => { setImageFile(e.target.files[0]); setImageUrl(""); }} />
            </div>
            <div className="input-group">
              <label>Or Image URL</label>
              <input type="text" placeholder="https://..." value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} />
            </div>
            <div className="action-buttons">
              <button className="primary-btn" onClick={applyImage}>
                <span>{isEditingExisting ? 'Apply Changes' : 'Apply & Unlock'}</span>
                <div className="btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
              </button>
              <button className="ghost-btn" onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
