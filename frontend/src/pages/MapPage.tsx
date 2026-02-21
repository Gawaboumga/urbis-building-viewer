import React, { useState } from 'react';
import MapSelector from '../components/MapSelector';
import SearchBar from '../components/SearchBar';
import type { Address } from '../types';

const MapPage: React.FC = () => {
  const [selectedAddresses, setSelectedAddresses] = useState<Address[]>([]);

  return (
    <div className="container-fluid full-height">
      <div className="map-container">
        <SearchBar onSelectAddresses={setSelectedAddresses} />
        <MapSelector selectedAddresses={selectedAddresses} />
        <p className="map-hint">
          💡 Right-click anywhere on the map to display nearby buildings or select an area with shift + left click.
        </p>
      </div>
    </div>
  );
};

export default MapPage;
