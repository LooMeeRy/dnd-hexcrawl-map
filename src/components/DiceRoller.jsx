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
      scale: 6,
      spinForce: 6,
      throwForce: 6,
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

  // Handle incoming networked rolls
  useEffect(() => {
    if (incomingRoll && diceBoxRef.current) {
      // Try to roll the dice on screen so they see it
      // Even if we can't force the result visually on all clients perfectly, 
      // they will see the dice fall and then the toast will pop up with the true result.
      
      const notation = incomingRoll.notation; 
      
      // We pass the roller's color to the options parameter to override our own config!
      diceBoxRef.current.roll(notation, { themeColor: incomingRoll.color })
        .then(() => {
           addToast(`${incomingRoll.player} rolled ${notation}: [${incomingRoll.results.join(', ')}] = ${incomingRoll.total}`, incomingRoll.color);
        });
    }
  }, [incomingRoll]);

  const addToast = (message, color) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, color }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const handleRoll = () => {
    if (!diceBoxRef.current || isRolling) return;
    setIsRolling(true);
    
    const notation = `${qty}${diceType}`;
    
    diceBoxRef.current.roll(notation, { themeColor: playerColor || '#ff5555' })
      .then(results => {
        setIsRolling(false);
        // results is an array of Roll Result Array Objects
        // Example: [{ qty: 2, sides: 20, value: 34, rolls: [...] }]
        if (results && results.length > 0) {
           const rollGroup = results[0];
           const individualRolls = rollGroup.rolls.map(r => r.value);
           const total = rollGroup.value;
           
           // Notify locally
           addToast(`You rolled ${notation}: [${individualRolls.join(', ')}] = ${total}`, playerColor);
           
           // Broadcast to others
           if (onRollBroadcast) {
             onRollBroadcast({
               type: 'dice_roll',
               player: playerName || 'Unknown',
               color: playerColor || '#ff5555',
               notation,
               results: individualRolls,
               total
             });
           }
        }
      })
      .catch(e => {
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

      {/* Dice UI Panel (Left side) */}
      <div className="dice-ui-panel">
        <h4>Roll Dice</h4>
        <div className="dice-controls">
          <input 
            type="number" 
            min="1" max="20" 
            value={qty} 
            onChange={(e) => setQty(Number(e.target.value))}
            className="dice-qty-input"
          />
          <select 
            value={diceType} 
            onChange={(e) => setDiceType(e.target.value)}
            className="dice-type-select"
          >
            <option value="d4">D4</option>
            <option value="d6">D6</option>
            <option value="d8">D8</option>
            <option value="d10">D10</option>
            <option value="d12">D12</option>
            <option value="d20">D20</option>
            <option value="d100">D100</option>
          </select>
        </div>
        <button 
          className="dice-roll-btn" 
          onClick={handleRoll} 
          disabled={isRolling}
          style={{ '--btn-color': playerColor || '#ff5555' }}
        >
          {isRolling ? 'Rolling...' : 'ROLL'}
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
