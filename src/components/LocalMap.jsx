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
  activeLocalPings = [],
  persistentLocalPings = {},
  pingMode = 'none',
  onSetPingMode,
  onUpdateLocalSettings
}) {
  const [pan, setPan] = useState({ x: typeof window !== 'undefined' ? window.innerWidth / 2 - 800 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 - 800 : 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [mapDimensions, setMapDimensions] = useState({ width: 1600, height: 1600 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(20);
  const [gridHeight, setGridHeight] = useState(20);
  const containerRef = useRef(null);

  // Dragging token
  const [dragToken, setDragToken] = useState(null); // { id, type: 'player' | 'dm', startX, startY, currentX, currentY }

  const GRID_SIZE = 80;

  useEffect(() => {
    if (hex.localWidth && hex.localHeight) {
      setMapDimensions({ width: hex.localWidth, height: hex.localHeight });
      setGridWidth(Math.round(hex.localWidth / GRID_SIZE));
      setGridHeight(Math.round(hex.localHeight / GRID_SIZE));
    } else if (hex.localImage) {
      const img = new Image();
      img.onload = () => {
        setMapDimensions({ width: img.width, height: img.height });
        setGridWidth(Math.round(img.width / GRID_SIZE));
        setGridHeight(Math.round(img.height / GRID_SIZE));
        if (typeof window !== 'undefined') {
          setPan({ x: window.innerWidth / 2 - img.width / 2, y: window.innerHeight / 2 - img.height / 2 });
        }
      };
      img.src = hex.localImage;
    } else {
      setMapDimensions({ width: 1600, height: 1600 });
      setGridWidth(20);
      setGridHeight(20);
      if (typeof window !== 'undefined') {
        setPan({ x: window.innerWidth / 2 - 800, y: window.innerHeight / 2 - 800 });
      }
    }
  }, [hex.localImage, hex.localWidth, hex.localHeight]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.altKey || pingMode !== 'none') {
      const mode = (e.altKey && pingMode === 'none') ? 'normal' : pingMode;
      if (onLocalPing) onLocalPing(e.clientX - pan.x, e.clientY - pan.y, mode);
      if (!e.altKey && onSetPingMode) onSetPingMode('none');
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

        {/* Persistent Local Pings */}
        {Object.entries(persistentLocalPings || {}).map(([key, p]) => (
           <React.Fragment key={`pp-${key}`}>
             <div className="persistent-ping" style={{ left: p.localX, top: p.localY, '--ping-color': p.color, '--ping-speed': p.speed || '2s' }} />
             <div className="persistent-ping-core" style={{ left: p.localX, top: p.localY, '--ping-color': p.color }} />
           </React.Fragment>
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

      {/* Header UI */}
      <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 100, display: 'flex', gap: '12px' }}>
        <button className="status-badge" style={{ cursor: 'pointer', color: '#ff5555', background: 'transparent', border: '1px solid rgba(255,85,85,0.3)' }} onClick={onExit}>
           Exit Local Map
        </button>
        {isDM && (
          <>
            <div className="status-badge library-upload-btn-wrap" style={{ cursor: 'pointer', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
              Change Image
              <input type="file" accept="image/*" onChange={handleImageUpload} />
            </div>
            <button className="status-badge" style={{ cursor: 'pointer', color: '#ccc', border: '1px solid rgba(255,255,255,0.2)' }} onClick={() => setIsSettingsOpen(true)}>
              Map Size Settings
            </button>
          </>
        )}
      </div>
      
      {/* Settings Modal */}
      {isDM && isSettingsOpen && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(15,15,15,0.95)', padding: '24px', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: '16px',
          width: '320px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)'
        }} onMouseDown={e => e.stopPropagation()}>
          <h3 style={{ margin: 0, color: '#fff' }}>Local Map Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Width (in Squares):</label>
            <input type="number" className="room-input" value={gridWidth} onChange={e => setGridWidth(parseInt(e.target.value) || 1)} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Height (in Squares):</label>
            <input type="number" className="room-input" value={gridHeight} onChange={e => setGridHeight(parseInt(e.target.value) || 1)} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setIsSettingsOpen(false)}>Cancel</button>
            <button style={{ flex: 1, padding: '10px', background: 'rgba(85,255,85,0.2)', border: '1px solid rgba(85,255,85,0.5)', color: '#55ff55', borderRadius: '8px', cursor: 'pointer' }} onClick={() => {
              if (onUpdateLocalSettings) {
                onUpdateLocalSettings({ localWidth: gridWidth * GRID_SIZE, localHeight: gridHeight * GRID_SIZE });
              }
              setIsSettingsOpen(false);
            }}>Apply Size</button>
          </div>
        </div>
      )}
      
      <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 100 }}>
        <div className="status-badge">
          Local Map: Hex [{hex.q}, {hex.r}]
        </div>
      </div>
    </div>
  );
}
