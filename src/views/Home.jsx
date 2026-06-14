import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');

  return (
    <div className="home-container">
      <div className="bg-glow"></div>
      <div className="home-content">
        <h1>D&D Ethereal Hexcrawl</h1>
        <p>A premium map exploration tool for modern campaigns.</p>
        
        <div className="home-cards">
          <div className="home-card">
            <h3>Dungeon Master</h3>
            <p>Host a campaign, build the map, and reveal regions to your players.</p>
            <button className="primary-btn" onClick={() => navigate('/dm')} style={{ marginTop: 'auto' }}>
              <span>Start as DM</span>
              <div className="btn-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </button>
          </div>
          
          <div className="home-card">
            <h3>Player</h3>
            <p>Join a campaign. Enter a room code for online play, or leave blank if you are playing on this exact same computer (Dual Monitors).</p>
            <input 
              type="text" 
              placeholder="Room Code (Required for online)" 
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              className="room-input"
            />
            <button className="primary-btn" onClick={() => navigate(`/player${roomCode ? `?room=${roomCode}` : ''}`)}>
              <span>Join as Player</span>
              <div className="btn-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
