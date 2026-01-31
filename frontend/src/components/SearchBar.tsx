import React, { useState } from 'react';
import { searchAddressesByBuilding, getAddressesById } from '../services/api';
import type { Address, AddressGroup } from '../types';

interface Props {
  onSelectAddresses: (addresses: Address[]) => void;
}

const SearchBar: React.FC<Props> = ({ onSelectAddresses }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressGroup[]>([]);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (value.length > 3) {
      try {
        const data = await searchAddressesByBuilding(value, 30);
        const sortedData = sortBuildings(data);
        setSuggestions(sortedData);
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  };

  const handleSelect = async (group: AddressGroup) => {
    const addresses = await getAddressesById(group.addressIds, 4326);
    onSelectAddresses(addresses);
    setSuggestions([]);
  };

  return (
    <div className="search-bar">
      <input
        id="searchAddress"
        type="text"
        className="form-control"
        placeholder="Search address..."
        value={query}
        onChange={handleSearch}
        autoComplete="off"
      />
      <ul id="suggestions" className="list-group">
        {suggestions.map((group, idx) => (
          <li
            key={idx}
            className="list-group-item"
            onClick={() => handleSelect(group)}
            style={{ cursor: 'pointer' }}
          >
            {group.streetNameFrench} {group.policeNumber}: {group.boxNumbers}
          </li>
        ))}
      </ul>
    </div>
  );

  function extractNumericPart(policeNumber: string): number {
    const match = policeNumber.match(/\d+/);
    return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
  }

  /**
   * Sorts buildings by:
   * 1. Length of numeric part (fewest digits first)
   * 2. Numeric value
   * 3. Optional trailing letter (alphabetical)
   */
  function sortBuildings(buildings: AddressGroup[]): AddressGroup[] {
    return buildings.sort((a, b) => {
      const numA = extractNumericPart(a.policeNumber);
      const numB = extractNumericPart(b.policeNumber);

      const lenA = numA.toString().length;
      const lenB = numB.toString().length;

      if (lenA !== lenB) {
        return lenA - lenB; // shorter digit length first
      }

      if (numA !== numB) {
        return numA - numB; // smaller numeric value first
      }

      // If numeric parts are equal, compare trailing letters
      const letterA = a.policeNumber.replace(/\d+/g, "") || "";
      const letterB = b.policeNumber.replace(/\d+/g, "") || "";
      return letterA.localeCompare(letterB);
    });
  }
};

export default SearchBar;