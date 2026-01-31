import type { FeatureCollection, MultiPoint, Point } from 'geojson';


export interface Address {
  id: number;
  address_id: number;
  street_name_french: string;
  municipality_id: number;
  parent_id: number | null;
  cadastral_parcel_id: number | null;
  building_id: number | null;
  carto_angle: number;
  postal_code: number;
  police_number: string;
  box_number: string | null;
  stat_nis_code: string;
  l72: Point;
  geometry: MultiPoint;
}

export interface AddressGroup {
  buildingId: number | null;
  streetNameFrench: string;
  policeNumber: string;
  boxNumbers: string;
  addressIds: number[];
}

export interface AddressResponse {
  addresses: {
    addressId: number;
    buildingId: number;
    l72: {
      coordinates: [number, number];
    };
  }[];
}

interface BuildingProps {
  building_solid_id?: number;
  [key: string]: unknown;
}

export type BuildingSolidType = FeatureCollection<Point, BuildingProps>;
