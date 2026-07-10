import React, { useState, useRef, useEffect } from 'react';

export default function LocalMap({ 
  hex, // {q, r, image, localImage}
  playerTokens, // Array of player tokens in this hex
  dmTokens, // Array of dm tokens in this hex
  onUpdatePlayerToken, 
  onUpdateDmToken, 
  onExit,
  isDM,
  onUpdateLocalImage,
  onLocalPing,
  activeLocalPings = []
}) {
  const [pan, setPan] = useState({ x: typeof window !== 'undefined' ? window.innerWidth / 2 - 800 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 - 800 : 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 1600, height: 1600 });
  const containerRef = useRef(null);

  // Dragging token
  const [dragToken, setDragToken] = useState(null); // { id, type: 'player' | 'dm', startX, startY, currentX, currentY }

  const GRID_SIZE = 80;

  useEffect(() => {
    if (hex.localImage) {
      const img = new Image();
      img.onload = () => {
        setMapDimensions({ width: img.width, height: img.height });
        if (typeof window !== 'undefined') {
          // Center the newly loaded map
          setPan({ x: window.innerWidth / 2 - img.width / 2, y: window.innerHeight / 2 - img.height / 2 });
        }
      };
      img.src = hex.localImage;
    } else {
      setMapDimensions({ width: 1600, height: 1600 });
      if (typeof window !== 'undefined') {
        setPan({ x: window.innerWidth / 2 - 800, y: window.innerHeight / 2 - 800 });
      }
    }
  }, [hex.localImage]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.altKey) {
      if (onLocalPing) onLocalPing(e.clientX - pan.x, e.clientY - pan.y);
      return;
    }
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (dragToken) {
      setDragToken(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
      return;
    }
    if (isPanning) {
      let newX = e.clientX - startPan.x;
      let newY = e.clientY - startPan.y;
      
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      
      const paddingX = screenW / 2;
      const paddingY = screenH / 2;
      
      const minX = paddingX - mapDimensions.width;
      const maxX = paddingX;
      const minY = paddingY - mapDimensions.height;
      const maxY = paddingY;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setPan({ x: newX, y: newY });
    }
  };

  const snapToGrid = (val) => Math.floor(val / GRID_SIZE) * GRID_SIZE + (GRID_SIZE / 2);

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
    if (dragToken) {
      const dx = dragToken.currentX - dragToken.startX;
      const dy = dragToken.currentY - dragToken.startY;
      
      if (dragToken.type === 'player') {
        const token = playerTokens.find(t => t.id === dragToken.id);
        if (token) {
          let nx = (token.localX ?? (mapDimensions.width / 2)) + dx;
          let ny = (token.localY ?? (mapDimensions.height / 2)) + dy;
          nx = Math.max(0, Math.min(mapDimensions.width, nx));
          ny = Math.max(0, Math.min(mapDimensions.height, ny));
          
          onUpdatePlayerToken(dragToken.id, { localX: snapToGrid(nx), localY: snapToGrid(ny) });
        }
      } else {
        const token = dmTokens.find(t => t.id === dragToken.id);
        if (token) {
          let nx = (token.localX ?? (mapDimensions.width / 2)) + dx;
          let ny = (token.localY ?? (mapDimensions.height / 2)) + dy;
          nx = Math.max(0, Math.min(mapDimensions.width, nx));
          ny = Math.max(0, Math.min(mapDimensions.height, ny));
          
          onUpdateDmToken(dragToken.id, { localX: snapToGrid(nx), localY: snapToGrid(ny) });
        }
      }
      setDragToken(null);
    }
  };

  const handleImageUpload = (e) => {
    if (!isDM) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1024;
        let w = img.width; let h = img.height;
        if (w > h) { 
          if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } 
        } else { 
          if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } 
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        onUpdateLocalImage(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div 
      className="local-map-container"
      ref={containerRef}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#111',
        overflow: 'hidden',
        zIndex: 50,
        cursor: isPanning ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        className="local-map-world"
        style={{
          position: 'absolute',
          left: pan.x,
          top: pan.y,
          width: mapDimensions.width,
          height: mapDimensions.height,
          backgroundColor: '#1a1a1a',
          boxShadow: '0 0 100px rgba(0,0,0,0.8)'
        }}
      >
        {hex.localImage && (
          <img 
            src={hex.localImage} 
            alt="Local Map Background" 
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
              opacity: 0.8,
              zIndex: 0
            }}
          />
        )}
        
        {/* Grid Overlay */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 5,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
        }} />

        {/* Local Pings */}
        {activeLocalPings.map(p => (
           <div key={p.id} className="ping-circle" style={{ left: p.localX, top: p.localY, '--ping-color': p.color }} />
        ))}

        {/* DM Tokens */}
        {dmTokens.map(t => {
          const isDragging = dragToken?.id === t.id && dragToken?.type === 'dm';
          const dx = isDragging ? dragToken.currentX - dragToken.startX : 0;
          const dy = isDragging ? dragToken.currentY - dragToken.startY : 0;
          let lx = (t.localX ?? (mapDimensions.width / 2)) + dx;
          let ly = (t.localY ?? (mapDimensions.height / 2)) + dy;
          
          if (!isDragging && (t.localX === undefined || t.localY === undefined)) {
            lx = snapToGrid(lx);
            ly = snapToGrid(ly);
          }
          
          return (
            <div 
              key={t.id}
              style={{
                position: 'absolute',
                left: lx, top: ly,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                cursor: isDM ? (isDragging ? 'grabbing' : 'grab') : 'default',
                transition: isDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out'
              }}
              onMouseDown={(e) => {
                if (!isDM) return;
                e.stopPropagation();
                setDragToken({ id: t.id, type: 'dm', startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
              }}
            >
              <img src={t.image} width={t.size || 64} height={t.size || 64} style={{ borderRadius: '50%', border: '2px dashed rgba(255,85,85,0.8)', pointerEvents: 'none', objectFit: 'cover' }} />
            </div>
          );
        })}

        {/* Player Tokens */}
        {playerTokens.map(t => {
          const isDragging = dragToken?.id === t.id && dragToken?.type === 'player';
          const dx = isDragging ? dragToken.currentX - dragToken.startX : 0;
          const dy = isDragging ? dragToken.currentY - dragToken.startY : 0;
          let lx = (t.localX ?? (mapDimensions.width / 2)) + dx;
          let ly = (t.localY ?? (mapDimensions.height / 2)) + dy;
          
          if (!isDragging && (t.localX === undefined || t.localY === undefined)) {
            lx = snapToGrid(lx);
            ly = snapToGrid(ly);
          }
          
          return (
            <div 
              key={t.id}
              style={{
                position: 'absolute',
                left: lx, top: ly,
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out'
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragToken({ id: t.id, type: 'player', startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
              }}
            >
              <img src={t.image} title={t.name} width={64} height={64} style={{ borderRadius: '50%', border: `3px solid ${t.color || 'gold'}`, pointerEvents: 'none', objectFit: 'cover', background: '#222' }} />
              <div style={{ position: 'absolute', bottom: '-24px', left: '50%', transform: 'translateX(-50%)', color: 'white', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {t.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* UI Overlay */}
      <div style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 100, display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button className="ghost-btn" onClick={onExit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Exit to World Map
        </button>

        {isDM && (
          <label className="status-badge" style={{ cursor: 'pointer', color: 'white', borderColor: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Upload Background
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </label>
        )}
      </div>
      
      <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 100 }}>
        <div className="status-badge">
          Local Map: Hex [{hex.q}, {hex.r}]
        </div>
      </div>
    </div>
  );
}
