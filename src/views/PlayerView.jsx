import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import mqtt from 'mqtt';

const HEX_SIZE = 80;

function getHexPixel(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 3 / 2 * r;
  return { x, y };
}

export default function PlayerView() {
  const [searchParams] = useSearchParams();
  const roomCode = searchParams.get('room');
  
  const [activeHexes, setActiveHexes] = useState(() => {
    if (roomCode) return {};
    const saved = localStorage.getItem('dnd-map-local-sync');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [cameraTarget, setCameraTarget] = useState({ q: 0, r: 0 });
  const [status, setStatus] = useState(roomCode ? 'Connecting...' : 'Local Sync (This Computer Only)');

  useEffect(() => {
    if (roomCode) return; 
    const handleStorage = (e) => {
      if (e.key === 'dnd-map-local-sync' && e.newValue) {
        setActiveHexes(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    
    setStatus('Looking for DM...');
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    let timeoutId;
    let pingInterval;
    
    client.on('connect', () => {
      const playerId = Math.random().toString(36).substring(2, 9);
      
      // Subscribe to map updates and room closure
      client.subscribe(`dnd-room/${roomCode}/map`);
      client.subscribe(`dnd-room/${roomCode}/closed`);
      
      // Request map from DM
      client.publish(`dnd-room/${roomCode}/request`, 'hello');
      
      // Start Heartbeat
      pingInterval = setInterval(() => {
        client.publish(`dnd-room/${roomCode}/ping`, playerId);
      }, 2000);
      
      // If we don't hear back in 4 seconds, the room doesn't exist
      timeoutId = setTimeout(() => {
        setStatus('Error: Room not found or DM is offline.');
        clearInterval(pingInterval);
        client.end();
      }, 4000);
    });
    
    client.on('message', (topic, message) => {
      if (topic === `dnd-room/${roomCode}/closed`) {
        setStatus('DM has closed this room.');
        setActiveHexes({});
        client.end();
        return;
      }
      
      if (topic === `dnd-room/${roomCode}/map`) {
        clearTimeout(timeoutId);
        setStatus(`Connected to Room: ${roomCode}`);
        try {
          const newHexes = JSON.parse(message.toString());
          setActiveHexes(newHexes);
        } catch (e) {
          console.error("Data parse error:", e);
        }
      }
    });
    
    client.on('error', (err) => {
      setStatus(`Connection Error: ${err.message}`);
    });
    
    client.on('close', () => {
      if (status.includes('Connected')) {
        setStatus('Connection lost. Reconnecting...');
      }
    });
    
    return () => {
      clearTimeout(timeoutId);
      if (pingInterval) clearInterval(pingInterval);
      client.end();
    };
  }, [roomCode]);

  // Read-only hexes list
  const hexesList = Object.values(activeHexes);
  
  // If there's only 1 hex, focus it. If map updates, optionally auto-focus the latest? 
  // Let's just let player click to move around freely without forcing focus on update.
  
  const centerPos = getHexPixel(cameraTarget.q, cameraTarget.r);

  return (
    <div className="app-container">
      <div className="bg-glow"></div>
      
      <div className="app-header">
        <div className="status-badge">Player View</div>
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
                style={{ left: pos.x, top: pos.y, backgroundImage: hex.image ? `url(${hex.image})` : 'none' }}
                onClick={() => setCameraTarget({ q: hex.q, r: hex.r })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
