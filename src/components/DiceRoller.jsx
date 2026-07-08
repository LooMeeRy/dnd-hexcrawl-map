import React, { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';

export default function DiceRoller({ playerColor, playerName, onRollBroadcast, incomingRoll }) {
  const containerRef = useRef(null);
  const diceBoxRef = useRef(null);
  
  const [qty, setQty] = useState(1);
  const [diceType, setDiceType] = useState('d20');
  const [isRolling, setIsRolling] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  // Create a unique ID for the container so we can pass a CSS selector to DiceBox
  const containerId = useRef(`dice-box-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

  // Initialize DiceBox
  useEffect(() => {
    if (!containerRef.current) return;
    
    const box = new DiceBox(`#${containerId.current}`, {
      assetPath: '/assets/dice-box/', // must match the public folder path
      theme: 'default',
      themeColor: playerColor || '#ff5555',
      scale: 12,
      spinForce: 10,
      throwForce: 12,
      startingHeight: 14,
      restitution: 0.7,
      gravity: 3,
      mass: 2,
      friction: 0.8,
    });

    box.init().then(() => {
      diceBoxRef.current = box;
    }).catch(e => console.error("DiceBox init error:", e));

    return () => {
      // Cleanup if necessary. DiceBox doesn't have a strict destroy method in older versions,
      // but we can clear the canvas if needed.
    };
  }, []); // Init once

  // Update theme color when it changes
  useEffect(() => {
    if (diceBoxRef.current && playerColor) {
      diceBoxRef.current.updateConfig({ themeColor: playerColor });
    }
  }, [playerColor]);

  const localRollContext = useRef(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    if (!diceBoxRef.current) return;
    diceBoxRef.current.onRollComplete = (results) => {
      setIsRolling(false);
      
      // Auto clear dice after 7 seconds
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        if (diceBoxRef.current) diceBoxRef.current.clear();
      }, 7000);

      let rollGroup = null;
      if (Array.isArray(results) && results.length > 0) {
        rollGroup = results[0];
      } else if (results && results.value) {
        rollGroup = results;
      }

      if (rollGroup && rollGroup.rolls) {
        const individualRolls = rollGroup.rolls.map(r => r.value);
        const total = rollGroup.value;

        if (localRollContext.current) {
          const ctx = localRollContext.current;
          localRollContext.current = null;
          
          addToast(`You rolled ${ctx.notation}: [${individualRolls.join(', ')}] = ${total}`, ctx.color);

          if (onRollBroadcast) {
            onRollBroadcast({
              type: 'dice_roll',
              player: playerName || 'Unknown',
              color: ctx.color,
              notation: ctx.notation,
              results: individualRolls,
              total
            });
          }
        } else if (incomingRoll) {
          addToast(`${incomingRoll.player} rolled ${incomingRoll.notation}: [${incomingRoll.results.join(', ')}] = ${incomingRoll.total}`, incomingRoll.color);
        }
      }
    };
  }, [incomingRoll, onRollBroadcast, playerName]);

  // Handle incoming networked rolls
  useEffect(() => {
    if (incomingRoll && diceBoxRef.current) {
      const notation = incomingRoll.notation;
      localRollContext.current = null; // ensure it's marked as networked
      diceBoxRef.current.roll(notation, { themeColor: incomingRoll.color });
    }
  }, [incomingRoll]);

  const addToast = (message, color) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, color }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  const getDiceIcon = (type) => {
    switch (type) {
      case 'd4': return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 3 22 21 2 21 12 3"/></svg>;
      case 'd6': return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
      case 'd8': return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 22 12 12 22 2 12 12 2"/><line x1="2" y1="12" x2="22" y2="12"/></svg>;
      case 'd10': return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 20 10 12 22 4 10 12 2"/><line x1="12" y1="2" x2="12" y2="22"/></svg>;
      case 'd12': return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 20 8 17 20 7 20 4 8 12 2"/><line x1="12" y1="2" x2="12" y2="10"/><polygon points="12 10 18 13 15 19 9 19 6 13 12 10"/></svg>;
      case 'd20': return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><polygon points="12 22 12 14.5"/><polygon points="22 8.5 12 14.5 2 8.5"/><polygon points="12 2 12 14.5"/></svg>;
      case 'd100': return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><text x="12" y="16.5" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="bold">%</text></svg>;
      default: return null;
    }
  };

  const handleRoll = (nQty, type) => {
    if (!diceBoxRef.current || isRolling) return;
    setIsRolling(true);
    setIsOpen(false);
    setSelectedDice(null);

    const notation = `${nQty}${type}`;
    localRollContext.current = { notation, color: playerColor || '#ff5555' };
    diceBoxRef.current.roll(notation, { themeColor: playerColor || '#ff5555' }).catch(e => {
        console.error("Roll error", e);
        setIsRolling(false);
    });
  };

  return (
    <>
      {/* 3D Dice Canvas Container */}
      <div 
        id={containerId.current}
        ref={containerRef} 
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 900 // above map, below UI
        }}
      />

      {/* Pop-up Dice Tool */}
      <div className="dice-tool-container" style={{ '--btn-color': playerColor || '#ff5555' }}>
        
        {/* Stack of Dice Buttons (Vertical) */}
        {isOpen && (
          <div className="dice-stack open">
            {diceTypes.map((type, index) => (
              <div 
                key={type} 
                className="dice-stack-item"
                style={{ animationDelay: `${(diceTypes.length - 1 - index) * 0.03}s` }}
              >
                <button 
                  className={`dice-type-btn ${selectedDice === type ? 'active' : ''}`}
                  onClick={() => setSelectedDice(selectedDice === type ? null : type)}
                  title={`Roll ${type.toUpperCase()}`}
                >
                  {getDiceIcon(type)}
                </button>
                
                {/* Quantity Pop-out (Horizontal to the right) */}
                {selectedDice === type && (
                  <div className="dice-qty-bar">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} className="qty-btn" onClick={() => handleRoll(n, type)}>{n}</button>
                    ))}
                    <input 
                      type="number" min="6" max="100" 
                      value={customQty} 
                      onChange={e => setCustomQty(Number(e.target.value))}
                      onKeyDown={e => { if(e.key === 'Enter') handleRoll(customQty, type) }}
                      className="qty-custom-input"
                    />
                    <button className="qty-roll-btn" onClick={() => handleRoll(customQty, type)}>Roll</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Main D20 Icon Button */}
        <button 
          className="dice-main-btn" 
          onClick={() => {
             setIsOpen(!isOpen);
             if (isOpen) setSelectedDice(null);
          }} 
          title="Dice Menu"
        >
          {getDiceIcon('d20')}
        </button>
      </div>

      {/* Toast Notifications */}
      <div className="dice-toast-container">
        {toasts.map(t => (
          <div key={t.id} className="dice-toast" style={{ borderLeft: `4px solid ${t.color}` }}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
