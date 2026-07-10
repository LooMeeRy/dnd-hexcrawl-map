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
  onUpdateLocalSettings,
  localCameraTarget
}) {
  const [pan, setPan] = useState({ x: typeof window !== 'undefined' ? window.innerWidth / 2 - 800 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 - 800 : 0 });
  const [zoom, setZoom] = useState(1);
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
      if (onLocalPing) onLocalPing((e.clientX - pan.x) / zoom, (e.clientY - pan.y) / zoom, mode);
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
      
      // Strict boundary: don't let map edges enter the screen if map is larger than screen.
      // If map is smaller than screen, keep it centered or allow limited panning.
      let minX, maxX, minY, maxY;
      
      const scaledWidth = mapDimensions.width * zoom;
      const scaledHeight = mapDimensions.height * zoom;

      if (scaledWidth > screenW) {
        minX = screenW - scaledWidth;
        maxX = 0;
      } else {
        minX = (screenW - scaledWidth) / 2;
        maxX = (screenW - scaledWidth) / 2;
      }

      if (scaledHeight > screenH) {
        minY = screenH - scaledHeight;
        maxY = 0;
      } else {
        minY = (screenH - scaledHeight) / 2;
        maxY = (screenH - scaledHeight) / 2;
      }

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setPan({ x: newX, y: newY });
    }
  };

  const handleWheel = (e) => {
    if (isSettingsOpen) return;
    
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    let newZoom = Math.max(0.2, Math.min(4, zoom + zoomDelta));
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    const pointX = (mouseX - pan.x) / zoom;
    const pointY = (mouseY - pan.y) / zoom;
    
    let newPanX = mouseX - pointX * newZoom;
    let newPanY = mouseY - pointY * newZoom;
    
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    
    let minX, maxX, minY, maxY;
    const scaledWidth = mapDimensions.width * newZoom;
    const scaledHeight = mapDimensions.height * newZoom;

    if (scaledWidth > screenW) {
      minX = screenW - scaledWidth;
      maxX = 0;
    } else {
      minX = (screenW - scaledWidth) / 2;
      maxX = (screenW - scaledWidth) / 2;
    }

    if (scaledHeight > screenH) {
      minY = screenH - scaledHeight;
      maxY = 0;
    } else {
      minY = (screenH - scaledHeight) / 2;
      maxY = (screenH - scaledHeight) / 2;
    }

    newPanX = Math.max(minX, Math.min(maxX, newPanX));
    newPanY = Math.max(minY, Math.min(maxY, newPanY));
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
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
          let nx = (token.localX ?? (mapDimensions.width / 2)) + dx / zoom;
          let ny = (token.localY ?? (mapDimensions.height / 2)) + dy / zoom;
          nx = Math.max(0, Math.min(mapDimensions.width, nx));
          ny = Math.max(0, Math.min(mapDimensions.height, ny));
          
          onUpdatePlayerToken(dragToken.id, { localX: snapToGrid(nx), localY: snapToGrid(ny) });
        }
      } else {
        const token = dmTokens.find(t => t.id === dragToken.id);
        if (token) {
          let nx = (token.localX ?? (mapDimensions.width / 2)) + dx / zoom;
          let ny = (token.localY ?? (mapDimensions.height / 2)) + dy / zoom;
          nx = Math.max(0, Math.min(mapDimensions.width, nx));
          ny = Math.max(0, Math.min(mapDimensions.height, ny));
          
          onUpdateDmToken(dragToken.id, { localX: snapToGrid(nx), localY: snapToGrid(ny) });
        }
      }
      setDragToken(null);
    }
  };

  useEffect(() => {
    if (localCameraTarget && typeof window !== 'undefined') {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      
      const targetZoom = Math.max(zoom, 1.5); // Zoom in if too far out
      
      const scaledWidth = mapDimensions.width * targetZoom;
      const scaledHeight = mapDimensions.height * targetZoom;
      
      let newPanX = (screenW / 2) - (localCameraTarget.localX * targetZoom);
      let newPanY = (screenH / 2) - (localCameraTarget.localY * targetZoom);
      
      let minX, maxX, minY, maxY;
      
      if (scaledWidth > screenW) {
        minX = screenW - scaledWidth;
        maxX = 0;
      } else {
        minX = (screenW - scaledWidth) / 2;
        maxX = (screenW - scaledWidth) / 2;
      }

      if (scaledHeight > screenH) {
        minY = screenH - scaledHeight;
        maxY = 0;
      } else {
        minY = (screenH - scaledHeight) / 2;
        maxY = (screenH - scaledHeight) / 2;
      }

      newPanX = Math.max(minX, Math.min(maxX, newPanX));
      newPanY = Math.max(minY, Math.min(maxY, newPanY));
      
      setZoom(targetZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  }, [localCameraTarget, mapDimensions]);

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
      onWheel={handleWheel}
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
          boxShadow: '0 0 100px rgba(0,0,0,0.8)',
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
          transition: isPanning ? 'none' : 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
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
             {isDM && pingMode === 'persistent' && (
               <div style={{ position: 'absolute', left: p.localX, top: p.localY, transform: 'translate(-50%, -50%)', zIndex: 100, cursor: 'pointer', background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: '4px', pointerEvents: 'auto' }} 
               onMouseDown={(e) => {
                   e.stopPropagation();
                   if (onLocalPing) {
                     // Hack to trigger deletion via onLocalPing 
                     // Wait, since persistentLocalPings are managed in the parent, we should pass a specific delete callback or handle it.
                     // The parent handles it in onLocalPing if mode is 'persistent' by toggling!
                     // If we pass the exact localX and localY, it will toggle it off.
                     onLocalPing(p.localX, p.localY, 'persistent');
                   }
               }}>
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
               </div>
             )}
           </React.Fragment>
        ))}

        {/* DM Tokens */}
        {dmTokens.map(t => {
          const isDragging = dragToken?.id === t.id && dragToken?.type === 'dm';
          const dx = isDragging ? dragToken.currentX - dragToken.startX : 0;
          const dy = isDragging ? dragToken.currentY - dragToken.startY : 0;
          let lx = (t.localX ?? (mapDimensions.width / 2)) + dx / zoom;
          let ly = (t.localY ?? (mapDimensions.height / 2)) + dy / zoom;
          
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
          let lx = (t.localX ?? (mapDimensions.width / 2)) + dx / zoom;
          let ly = (t.localY ?? (mapDimensions.height / 2)) + dy / zoom;
          
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
        <button className="ghost-btn danger-btn" onClick={onExit}>
           Exit Local Map
        </button>
        {isDM && (
          <>
            <div className="ghost-btn library-upload-btn-wrap" style={{ cursor: 'pointer' }}>
              Change Image
              <input type="file" accept="image/*" onChange={handleImageUpload} />
            </div>
            <button className="ghost-btn" onClick={() => setIsSettingsOpen(true)}>
              Map Size Settings
            </button>
          </>
        )}
      </div>
      
      {/* Settings Modal */}
      {isDM && isSettingsOpen && (
        <div className="image-modal">
          <div className="modal-shell">
            <div className="modal-content" style={{ zIndex: 200, display: 'flex', flexDirection: 'column', gap: '16px' }} onMouseDown={e => e.stopPropagation()}>
              <h3>Local Map Settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Width (in Squares):</label>
                <input type="number" className="room-input" value={gridWidth} onChange={e => setGridWidth(parseInt(e.target.value) || 1)} style={{ marginBottom: 0 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Height (in Squares):</label>
                <input type="number" className="room-input" value={gridHeight} onChange={e => setGridHeight(parseInt(e.target.value) || 1)} style={{ marginBottom: 0 }} />
              </div>
              <div className="action-buttons" style={{ marginTop: '8px' }}>
                <button className="primary-btn" onClick={() => {
                  if (onUpdateLocalSettings) {
                    onUpdateLocalSettings({ localWidth: gridWidth * GRID_SIZE, localHeight: gridHeight * GRID_SIZE });
                  }
                  setIsSettingsOpen(false);
                }}>Apply Size</button>
                <button className="ghost-btn" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
              </div>
            </div>
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
