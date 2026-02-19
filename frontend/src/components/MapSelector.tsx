
import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBuildingSolidsByDistance } from '../services/api';
import type { Address, BuildingSolidType } from '../types';

const LEAFLET_SRID = 4326;

const DEFAULT_CENTER: L.LatLngTuple = [50.846754, 4.352415];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 17;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Progressive search radii (meters or unit expected by the API)
const SEARCH_RADII = [10, 20, 30, 40, 50, 75, 100];

// Marker style
const FOUND_MARKER_STYLE: L.CircleMarkerOptions = {
  radius: 6,
  color: 'green',
  weight: 2,
  fillColor: '#2ecc71',
  fillOpacity: 0.8,
};

// Temporary search indicator style
const SEARCH_INDICATOR_STYLE: L.CircleOptions = {
  radius: 10,
  color: '#1e90ff',
  weight: 2,
  fillOpacity: 0,
};

interface Props {
  selectedAddresses?: Address[];
}


const MapSelector: React.FC<Props> = ({ selectedAddresses = [] }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const searchIndicatorRef = useRef<L.Circle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- Helpers -----------------------------------------------------------

  const clearMarkers = useCallback(() => {
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();
    }
  }, []);

  const setSearchIndicator = useCallback((latlng: L.LatLngExpression | null) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous indicator
    if (searchIndicatorRef.current) {
      searchIndicatorRef.current.removeFrom(map);
      searchIndicatorRef.current = null;
    }

    // Add new indicator
    if (latlng) {
      searchIndicatorRef.current = L.circle(latlng, SEARCH_INDICATOR_STYLE).addTo(map);
    }
  }, []);

  const cancelOngoingRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const progressiveFetch = useCallback(
    async (lng: number, lat: number): Promise<BuildingSolidType | null> => {
      cancelOngoingRequest();
      const controller = new AbortController();
      abortRef.current = controller;

      // Try distances progressively until features are found
      for (const distance of SEARCH_RADII) {
        try {
          const data = await getBuildingSolidsByDistance(
            lng,
            lat,
            distance,
            LEAFLET_SRID,
            LEAFLET_SRID
          );

          // Safeguard shape
          const isFeatureCollection =
            data && typeof data === 'object' && data.type === 'FeatureCollection' && Array.isArray(data.features);

          if (isFeatureCollection && data.features.length > 0) {
            return data as BuildingSolidType;
          }
        } catch (err: unknown) {
          // If aborted, break silently; else continue/notify
          if (controller.signal.aborted) {
            return null;
          }
          // Network/API error; continue trying next radius (or you can break)
          // console.error('Fetch error for distance', distance, err);
        }
      }
      return null;
    },
    [cancelOngoingRequest]
  );

  const renderFeatures = useCallback((data: BuildingSolidType) => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    clearMarkers();

    data.features.forEach((feature) => {
      const { coordinates } = feature.geometry;
      const [x, y] = coordinates; // lon, lat
      const buildingSolidId = feature.properties['building_solid_id'];

      const latLng = new L.LatLng(y, x);

      const marker = L.circleMarker(latLng, FOUND_MARKER_STYLE).bindPopup(
        `<a href=/building/${buildingSolidId} target="_blank">Building Solid: ${buildingSolidId}</a>`
      );

      marker.addTo(layer);
    });
  }, [clearMarkers]);

  // ---- Effects -----------------------------------------------------------

  useEffect(() => {
    const map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    // Base layer
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Dedicated layer group for markers
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Right-click handler
    const onContextMenu = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      // UI: show search indicator at clicked point
      setSearchIndicator(e.latlng);

      // Cancel previous request and clear markers
      cancelOngoingRequest();
      clearMarkers();

      const results = await progressiveFetch(lng, lat);

      // Remove search indicator
      setSearchIndicator(null);

      if (!results) {
        // Optional: toast/snackbar or popup
        L.popup()
          .setLatLng(e.latlng)
          .setContent(
            `<div style="font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
               No building solids found in the searched radii (${SEARCH_RADII.join(' → ')}).
             </div>`
          )
          .openOn(map);
        return;
      }

      renderFeatures(results);
    };

    map.on('contextmenu', onContextMenu);

    // Cleanup on unmount
    return () => {
      map.off('contextmenu', onContextMenu);
      cancelOngoingRequest();

      if (markersLayerRef.current) {
        markersLayerRef.current.remove();
        markersLayerRef.current = null;
      }
      if (searchIndicatorRef.current) {
        searchIndicatorRef.current.remove();
        searchIndicatorRef.current = null;
      }

      map.remove();
      mapRef.current = null;
    };
  }, [cancelOngoingRequest, clearMarkers, progressiveFetch, renderFeatures, setSearchIndicator]);


useEffect(() => {
  const map = mapRef.current;
  if (!map || !selectedAddresses || selectedAddresses.length === 0) return;

  // Keep only addresses with a valid GeoJSON Point geometry
  const pointAddrs = selectedAddresses.filter((addr) => addr.l72);
  if (pointAddrs.length === 0) return;

  // Focus map: fit bounds if multiple, flyTo if single
  const latLngs = pointAddrs.map((addr) => {
    const [lng, lat] = (addr.l72).coordinates;
    return L.latLng(lat, lng);
  });

  if (latLngs.length > 1) {
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [24, 24] });
  } else {
    map.flyTo(latLngs[0], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
  }

  // Cancel any ongoing request and clear previous markers
  cancelOngoingRequest();
  clearMarkers();

  // Fetch progressively for each selected point and merge results
  (async () => {
    const merged: BuildingSolidType = {
      type: 'FeatureCollection',
      features: [],
    } as BuildingSolidType;

    for (const addr of pointAddrs) {
      const [lng, lat] = addr.l72.coordinates;

      // Show a temporary indicator
      setSearchIndicator({lat, lng});

      const res = await progressiveFetch(lng, lat);

      // Remove indicator for this point
      setSearchIndicator(null);

      if (res && Array.isArray(res.features) && res.features.length > 0) {
        merged.features.push(...res.features);
      } else {
        // Optional: show a popup at that address point
        L.popup()
          .setLatLng([lat, lng])
          .setContent(
            `<div style="font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
               No building solids found in the searched radii (${SEARCH_RADII.join(' → ')}).
             </div>`
          )
          .openOn(map);
      }
    }

    // Render all found features together (one clear + draw)
    if (merged.features.length > 0) {
      renderFeatures(merged);
    }
  })();
}, [selectedAddresses, cancelOngoingRequest, clearMarkers, progressiveFetch, renderFeatures, setSearchIndicator]);


  return <div id="map" style={{ height: '600px' }} />;
};

export default MapSelector;
