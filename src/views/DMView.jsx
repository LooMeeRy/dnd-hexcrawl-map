import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DMView() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState(() => {
    const saved = localStorage.getItem('dnd-campaigns');
    return saved ? JSON.parse(saved) : [];
  });
  const [newCampaignName, setNewCampaignName] = useState('');
  
  useEffect(() => {
    localStorage.setItem('dnd-campaigns', JSON.stringify(campaigns));
  }, [campaigns]);

  const createCampaign = () => {
    if (!newCampaignName.trim()) return;
    const newCamp = {
      id: Math.random().toString(36).substring(2, 9),
      name: newCampaignName.trim(),
      createdAt: Date.now()
    };
    setCampaigns(prev => [...prev, newCamp]);
    setNewCampaignName('');
  };

  const deleteCampaign = (id) => {
    if(confirm("Are you sure you want to delete this campaign? All map data will be lost forever.")) {
      setCampaigns(prev => prev.filter(c => c.id !== id));
      localStorage.removeItem(`dnd-map-${id}`);
    }
  };

  return (
    <div className="home-container">
      <div className="bg-glow"></div>
      <div className="home-content" style={{ textAlign: 'left', maxWidth: '600px', width: '100%' }}>
        <h1 style={{ textAlign: 'center' }}>Campaign Manager</h1>
        <p style={{ textAlign: 'center' }}>Select an existing campaign or create a new one.</p>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', alignItems: 'center', justifyContent: 'center' }}>
          <input 
            type="text" 
            placeholder="New Campaign Name (e.g. Curse of Strahd)" 
            value={newCampaignName}
            onChange={e => setNewCampaignName(e.target.value)}
            className="room-input"
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button className="primary-btn" onClick={createCampaign} style={{ whiteSpace: 'nowrap', margin: 0, height: '100%' }}>
            Create
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: '32px' }}>No campaigns found. Create one above!</div>
          ) : campaigns.map(c => (
            <div key={c.id} className="home-card" style={{ flexDirection: 'row', alignItems: 'center', padding: '20px' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{c.name}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Created: {new Date(c.createdAt).toLocaleDateString()}</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button style={{ padding: '10px 16px', borderRadius: '12px', border: 'none', background: 'white', color: '#121212', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => navigate(`/dm/map/${c.id}`)}>Open</button>
                <button style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(255,85,85,0.3)', background: 'transparent', color: '#ff5555', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => deleteCampaign(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <button className="ghost-btn" onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}
