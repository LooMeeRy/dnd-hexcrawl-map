import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './views/Home';
import DMView from './views/DMView';
import DMMapEditor from './views/DMMapEditor';
import PlayerView from './views/PlayerView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dm" element={<DMView />} />
        <Route path="/dm/map/:campaignId" element={<DMMapEditor />} />
        <Route path="/player" element={<PlayerView />} />
      </Routes>
    </BrowserRouter>
  );
}
