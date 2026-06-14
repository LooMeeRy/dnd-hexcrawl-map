import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

export default function DMMapEditor() {
  const { campaignId } = useParams();
  const navigate = useNavigate();

  const [activeHexes, setActiveHexes] = useState(() => {
    const saved = localStorage.getItem(`dnd-map-${campaignId}`);
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [players, setPlayers] = useState({});
  
  const activeHexesRef = useRef(activeHexes);
  useEffect(() => {
    activeHexesRef.current = activeHexes;
  }, [activeHexes]);

  useEffect(() => {
    localStorage.setItem(`dnd-map-${campaignId}`, JSON.stringify(activeHexes));
    localStorage.setItem('dnd-map-local-sync', JSON.stringify(activeHexes)); // Master sync file for Local mode
    
    if (mqttClient && roomCode) {
      mqttClient.publish(`dnd-room/${roomCode}/map`, JSON.stringify(activeHexes));
    }
  }, [activeHexes, mqttClient, roomCode, campaignId]);

  const startOnline = () => {
    if (mqttClient || isConnecting) return;
    setIsConnecting(true);
    
    // Generate 5-character alphanumeric code
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // Connect to public EMQX broker over secure WebSockets
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    
    client.on('connect', () => {
      setIsConnecting(false);
      setRoomCode(code);
      setMqttClient(client);
      setPlayers({});
      // Subscribe to player requests and pings
      client.subscribe(`dnd-room/${code}/request`);
      client.subscribe(`dnd-room/${code}/ping`);
      // Broadcast initial state
      client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
    });
    
    client.on('error', () => {
      setIsConnecting(false);
    });
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${code}/request`) {
        // A player joined and requested the map
        client.publish(`dnd-room/${code}/map`, JSON.stringify(activeHexesRef.current));
      }
      if (topic === `dnd-room/${code}/ping`) {
        const pid = message.toString();
        setPlayers(prev => ({ ...prev, [pid]: Date.now() }));
      }
    });
  };

  // Heartbeat cleanup for disconnected players
  useEffect(() => {
    if (!roomCode) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setPlayers(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, time] of Object.entries(next)) {
          if (now - time > 5000) { // 5 seconds timeout
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [roomCode]);

  const stopOnline = () => {
    if (!mqttClient) return;
    // Tell players the room is closed
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageUrl("");
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to WebP or JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setImageFile(dataUrl); // we store the base64 string in imageFile state temporarily
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const applyImage = () => {
    if (!targetCoord) return;
    let finalUrl = null;
    if (imageFile) finalUrl = imageFile; // already a base64 string
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
