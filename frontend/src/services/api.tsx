import type { Address, AddressGroup, BuildingSolidType } from "../types";


const BASE_URL = import.meta.env.VITE_API_BASE;

export async function searchAddressesByBuilding(query: string, topK: number) {
  const res = await fetch(`${BASE_URL}/addresses/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ free_text: query, top_k: topK }),
  });

  if (!res.ok) throw new Error('Failed to fetch suggestions');
  const data = await res.json();

  const allValues: AddressGroup[] = [];

  const toSearch = data.building != null && data.building.length > 0 ? data.building : data.similar;

  const groupedByBuilding = toSearch.reduce((acc: Record<number, Address[]>, item: Address) => {
    const building_id = item.building_id ?? 0;
    if (!acc[building_id]) {
      acc[building_id] = [];
    }
    acc[building_id].push(item);
    return acc;
  }, {});

  for (const addresses of Object.values(groupedByBuilding)) {
    const grouped = (addresses as Address[]).reduce((acc, address) => {
      const key = `${address.street_name_french}_${address.police_number}_${address.postal_code}`;
      acc[key] = acc[key] || [];
      acc[key].push(address);
      return acc;
    }, {} as Record<string, Address[]>);

    for (const group of Object.values(grouped)) {
      const first = group[0];
      const boxNumbers = group.map(a => a.box_number).filter(Boolean).join(', ');
      allValues.push({
        buildingId: first.building_id,
        streetNameFrench: first.street_name_french,
        policeNumber: first.police_number,
        boxNumbers,
        addressIds: group.map(a => a.address_id),
      });
    }
  }

  return allValues;
}

export async function getAddressesById(addressIds: number[], destinationSRID: number) {
  const res = await fetch(`${BASE_URL}/addresses/by_address_id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address_ids: addressIds,
      destination_srid: destinationSRID
    }),
  });

  if (!res.ok) throw new Error('Failed to fetch addresses');
  return res.json();
}

export async function getBuildingSolidsByDistance(
  lng: number,
  lat: number,
  distance: number,
  sourceSRID: number,
  destinationSRID: number
): Promise<BuildingSolidType> {
  const res = await fetch(`${BASE_URL}/urbis_3d/nearby`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x72: lng, y72: lat, distance, source_srid: sourceSRID, destination_srid: destinationSRID }),
  });

  if (!res.ok) throw new Error('Failed to fetch building solids');
  return res.json();
}

export async function getBuildingSolidsByBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  sourceSRID: number,
  destinationSRID: number,
): Promise<BuildingSolidType> {
  const res = await fetch(`${BASE_URL}/urbis_3d/bbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ west: west, south: south, east: east, north: north,
      source_srid: sourceSRID, destination_srid: destinationSRID,
      predicate: 'within'
    }),
  });

  if (!res.ok) throw new Error('Failed to fetch building solids');
  return res.json();
}

export async function getBuildingSolid(
  buildingSolidId: number,
  options: {
    computeArea?: boolean;
    destinationSRID?: number | null;
  } = {}
) {
  const res = await fetch(`${BASE_URL}/urbis_3d/building_solid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      building_solid_id: buildingSolidId,
      destination_srid: options.destinationSRID,
      compute_area: options.computeArea
    }),
  });

  if (!res.ok) throw new Error('Failed to fetch building solid');
  return res.json();
}