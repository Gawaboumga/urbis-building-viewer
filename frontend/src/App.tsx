import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import BuildingPage from './pages/BuildingPage';
import MapPage from './pages/MapPage';
import FooterLegal from './components/FooterLegal';

const App: React.FC = () => {
  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/building/:buildingSolidIds" element={<BuildingPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>

      <FooterLegal />
    </>
  );
};

export default App;
