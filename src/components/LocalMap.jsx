import React, { useState, useRef, useEffect } from 'react';

export default function LocalMap({ 
  hex, // {q, r, image, localImage}
  playerTokens, // Array of player tokens in this hex
  dmTokens, // Array of dm tokens in this hex
  onUpdatePlayerToken, 
  onUpdateDmToken, 
  onExit,
  isDM,
  onUpdateLocalImage
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Dragging token
  const [dragToken, setDragToken] = useState(null); // { id, type: 'player' | 'dm', startX, startY, currentX, currentY }

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (dragToken) {
      setDragToken(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
      return;
    }
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) setIsPanning(false);
    if (dragToken) {
      const dx = dragToken.currentX - dragToken.startX;
      const dy = dragToken.currentY - dragToken.startY;
      
      if (dragToken.type === 'player') {
        const token = playerTokens.find(t => t.id === dragToken.id);
        if (token) {
          onUpdatePlayerToken(dragToken.id, { 
            localX: (token.localX || 0) + dx, 
            localY: (token.localY || 0) + dy 
          });
        }
      } else {
        const token = dmTokens.find(t => t.id === dragToken.id);
        if (token) {
          onUpdateDmToken(dragToken.id, { 
            localX: (token.localX || 0) + dx, 
            localY: (token.localY || 0) + dy 
          });
        }
      }
      setDragToken(null);
    }
  };

  // Image Upload for DM
  const handleImageUpload = (e) => {
    if (!isDM) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      onUpdateLocalImage(event.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // The center of our infinite canvas is virtually at 0,0.
  // We offset it so 0,0 is in the middle of the screen.
  const screenCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500;
  const screenCenterY = typeof window !== 'undefined' ? window.innerHeight / 2 : 500;

  return (
    <div 
      className="local-map-container"
      ref={containerRef}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#1a1a1a',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        backgroundPosition: `${pan.x}px ${pan.y}px`,
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
          left: screenCenterX + pan.x,
          top: screenCenterY + pan.y,
        }}
      >
        {/* Background Image if set */}
        {hex.localImage && (
          <img 
            src={hex.localImage} 
            alt="Local Map Background" 
            style={{
              position: 'absolute',
              transform: 'translate(-50%, -50%)',
              maxWidth: 'none',
              pointerEvents: 'none',
              opacity: 0.8,
              zIndex: 0
            }}
          />
        )}

        {/* DM Tokens */}
        {dmTokens.map(t => {
          const isDragging = dragToken?.id === t.id && dragToken?.type === 'dm';
          const dx = isDragging ? dragToken.currentX - dragToken.startX : 0;
          const dy = isDragging ? dragToken.currentY - dragToken.startY : 0;
          const lx = (t.localX || 0) + dx;
          const ly = (t.localY || 0) + dy;
          
          return (
            <div 
              key={t.id}
              style={{
                position: 'absolute',
                left: lx, top: ly,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                cursor: isDM ? (isDragging ? 'grabbing' : 'grab') : 'default'
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
          const lx = (t.localX || 0) + dx;
          const ly = (t.localY || 0) + dy;
          // Determine if this user can drag this token.
          // For now, DM can drag any, Player can drag their own?
          // Since we just pass onUpdatePlayerToken, let's assume the parent handles permissions, or we just allow it if they can fire the event.
          // If this is PlayerView, they shouldn't drag other players unless allowed. We'll rely on the parent or just let them drag.
          
          return (
            <div 
              key={t.id}
              style={{
                position: 'absolute',
                left: lx, top: ly,
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                cursor: isDragging ? 'grabbing' : 'grab'
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
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 100, display: 'flex', gap: '12px' }}>
        <button 
          onClick={onExit}
          style={{
            padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(20,20,20,0.8)', color: 'white', cursor: 'pointer',
            backdropFilter: 'blur(10px)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Exit to World Map
        </button>

        {isDM && (
          <label style={{
            padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer',
            backdropFilter: 'blur(10px)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Upload Background
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </label>
        )}
      </div>
      
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100 }}>
        <div className="status-badge" style={{ background: 'rgba(0,0,0,0.7)' }}>
          Local Map: Hex [{hex.q}, {hex.r}]
        </div>
      </div>
    </div>
  );
}
