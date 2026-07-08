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

  const [isOpen, setIsOpen] = useState(false);
  const [selectedDice, setSelectedDice] = useState(null);
  const [customQty, setCustomQty] = useState(6);

  const handleRoll = (nQty, type) => {
    if (!diceBoxRef.current || isRolling) return;
    setIsRolling(true);
    setIsOpen(false);

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
        {isOpen && (
          <div className="dice-tool-popup">
            {!selectedDice ? (
              <div className="dice-tool-types">
                <button onClick={() => setSelectedDice('d4')}>D4</button>
                <button onClick={() => setSelectedDice('d6')}>D6</button>
                <button onClick={() => setSelectedDice('d8')}>D8</button>
                <button onClick={() => setSelectedDice('d10')}>D10</button>
                <button onClick={() => setSelectedDice('d12')}>D12</button>
                <button onClick={() => setSelectedDice('d20')}>D20</button>
                <button onClick={() => setSelectedDice('d100')} style={{ gridColumn: 'span 3' }}>D100</button>
              </div>
            ) : (
              <div className="dice-tool-qty">
                <div className="qty-header">
                  <button onClick={() => setSelectedDice(null)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <span>Rolling {selectedDice.toUpperCase()}</span>
                </div>
                <div className="qty-options">
                  <div className="qty-row">
                    {[1, 2, 3].map(n => <button key={n} onClick={() => handleRoll(n, selectedDice)}>{n}</button>)}
                  </div>
                  <div className="qty-row">
                    {[4, 5].map(n => <button key={n} onClick={() => handleRoll(n, selectedDice)}>{n}</button>)}
                  </div>
                  <div className="qty-custom">
                    <input 
                      type="number" min="6" max="100" 
                      value={customQty} 
                      onChange={e => setCustomQty(Number(e.target.value))}
                      onKeyDown={e => { if(e.key === 'Enter') handleRoll(customQty, selectedDice) }}
                    />
                    <button onClick={() => handleRoll(customQty, selectedDice)}>Roll</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <button className="dice-tool-btn" onClick={() => setIsOpen(!isOpen)} title="Roll Dice">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            <polygon points="12 22 12 14.5"/>
            <polygon points="22 8.5 12 14.5 2 8.5"/>
            <polygon points="12 2 12 14.5"/>
          </svg>
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
