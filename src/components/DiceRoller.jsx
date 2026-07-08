import React, { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import { GiD4, GiDiceSixFacesSix, GiDiceEightFacesEight, GiD10, GiD12, GiDiceTwentyFacesTwenty } from 'react-icons/gi';
import { FaPercent, FaPalette } from 'react-icons/fa';

export default function DiceRoller({ playerColor, playerName, onRollBroadcast, incomingRoll, hideControls }) {
  const containerRef = useRef(null);
  const diceBoxRef = useRef(null);
  
  const [qty, setQty] = useState(1);
  const [diceType, setDiceType] = useState('d20');
  const [isRolling, setIsRolling] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  const [activeTheme, setActiveTheme] = useState('default');
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  
  // Create a unique ID for the container so we can pass a CSS selector to DiceBox
  const containerId = useRef(`dice-box-${Math.random().toString(36).substr(2, 9)}`);

  // Initialize DiceBox
  useEffect(() => {
    if (!containerRef.current) return;
    
    const box = new DiceBox(`#${containerId.current}`, {
      assetPath: '/assets/dice-box/', // must match the public folder path
      theme: activeTheme,
      themeColor: playerColor || '#ff5555',
      scale: 5,
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

  // Update theme config when it changes
  useEffect(() => {
    if (diceBoxRef.current) {
      const configObj = {};
      if (playerColor) configObj.themeColor = playerColor;
      if (activeTheme) configObj.theme = activeTheme;
      diceBoxRef.current.updateConfig(configObj);
    }
  }, [playerColor, activeTheme]);

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
          
          addToastData({
            player: playerName || 'You',
            type: ctx.type,
            notation: ctx.notation,
            results: individualRolls,
            total,
            color: ctx.color
          });

          if (onRollBroadcast) {
            onRollBroadcast({
              type: 'dice_roll',
              player: playerName || 'Unknown',
              color: ctx.color,
              notation: ctx.notation,
              diceType: ctx.type,
              results: individualRolls,
              total
            });
          }
        }
      }
    };
  }, [onRollBroadcast, playerName]);

  // Handle incoming networked rolls
  useEffect(() => {
    if (incomingRoll) {
      // Since syncing 3D physics across AmmoJS instances is non-deterministic 
      // without a server physics authority, we disable the visual 3D roll for remote players 
      // and directly show the accurate result toast instead.
      addToastData({
        player: incomingRoll.player,
        type: incomingRoll.diceType || incomingRoll.notation.replace(/\d+/, ''),
        notation: incomingRoll.notation,
        results: incomingRoll.results,
        total: incomingRoll.total,
        color: incomingRoll.color
      });
    }
  }, [incomingRoll]);

  const addToastData = (data) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, ...data }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const [isOpen, setIsOpen] = useState(false);
  const [selectedDice, setSelectedDice] = useState(null);
  const [customQty, setCustomQty] = useState(6);

  const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  const getDiceIcon = (type, size = 26) => {
    switch (type) {
      case 'd4': return <GiD4 size={size} />;
      case 'd6': return <GiDiceSixFacesSix size={size} />;
      case 'd8': return <GiDiceEightFacesEight size={size} />;
      case 'd10': return <GiD10 size={size} />;
      case 'd12': return <GiD12 size={size} />;
      case 'd20': return <GiDiceTwentyFacesTwenty size={size} />;
      case 'd100': return <FaPercent size={size - 4} />;
      default: return null;
    }
  };

  const handleRoll = (nQty, type) => {
    if (!diceBoxRef.current || isRolling) return;
    setIsRolling(true);
    setIsOpen(false);
    setSelectedDice(null);
    setIsThemeMenuOpen(false);

    const notation = `${nQty}${type}`;
    localRollContext.current = { notation, type, color: playerColor || '#ff5555' };
    diceBoxRef.current.roll(notation).catch(e => {
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
        className="dice-canvas-container"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: '50vw',
          height: '60vh',
          pointerEvents: 'none',
          zIndex: 900 // above map, below UI
        }}
      />

      {/* Pop-up Dice Tool */}
      {!hideControls && (
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
                  onClick={() => { setSelectedDice(selectedDice === type ? null : type); setIsThemeMenuOpen(false); }}
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

            {/* Theme Picker Button */}
            <div className="dice-stack-item">
              <button 
                className={`dice-type-btn ${isThemeMenuOpen ? 'active' : ''}`}
                onClick={() => { setIsThemeMenuOpen(!isThemeMenuOpen); setSelectedDice(null); }}
                title="Change Theme"
              >
                <FaPalette size={22} />
              </button>
              
              {/* Theme Pop-out (Horizontal to the right) */}
              {isThemeMenuOpen && (
                <div className="dice-qty-bar theme-picker-bar" style={{ gap: '6px' }}>
                  {['default', 'rust', 'wooden', 'rock', 'gemstone'].map(t => (
                    <button 
                      key={t} 
                      className={`qty-btn ${activeTheme === t ? 'active' : ''}`} 
                      onClick={() => { setActiveTheme(t); setIsThemeMenuOpen(false); }}
                      style={{ textTransform: 'capitalize', width: 'auto', padding: '0 12px', fontSize: '0.85rem' }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Main D20 Icon Button */}
        <button 
          className="dice-main-btn" 
          onClick={() => {
             setIsOpen(!isOpen);
             if (isOpen) {
               setSelectedDice(null);
               setIsThemeMenuOpen(false);
             }
          }} 
          title="Dice Menu"
        >
          {getDiceIcon('d20', 32)}
        </button>
      </div>
      )}

      {/* Toast Notifications */}
      <div className="dice-toast-container">
        {toasts.map(t => (
          <div key={t.id} className="dice-toast" style={{ '--toast-color': t.color }}>
            <div className="toast-icon">
              {getDiceIcon(t.type, 24)}
            </div>
            <div className="toast-content">
              <div className="toast-player">{t.player}</div>
              <div className="toast-result">
                <span className="toast-notation">{t.notation}</span>
                {t.results.length > 1 ? (
                  <>: <span className="toast-rolls">[{t.results.join(', ')}]</span> = <span className="toast-total">{t.total}</span></>
                ) : (
                  <>: <span className="toast-total">{t.total}</span></>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
