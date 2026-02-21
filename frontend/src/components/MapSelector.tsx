import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { getBuildingSolidsByDistance, getBuildingSolidsByBbox } from '../services/api';
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

// Selection rectangle style (SHIFT + drag)
const SELECTION_RECT_STYLE: L.PathOptions = {
  color: '#ff7800',
  weight: 2,
  dashArray: '6 4',
  fillColor: '#ffb347',
  fillOpacity: 0.15,
};

interface Props {
  selectedAddresses?: Address[];
}

const MapSelector: React.FC<Props> = ({ selectedAddresses = [] }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const searchIndicatorRef = useRef<L.Circle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // SHIFT + drag selection state
  const selectionRectRef = useRef<L.Rectangle | null>(null);
  const selectionStartRef = useRef<L.LatLng | null>(null);
  const selectingRef = useRef(false);

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
            LEAFLET_SRID,
            controller.signal
          );

          // Safeguard shape
          const isFeatureCollection =
            data &&
            typeof data === 'object' &&
            (data as any).type === 'FeatureCollection' &&
            Array.isArray((data as any).features);

          if (isFeatureCollection && (data as any).features.length > 0) {
            return data as BuildingSolidType;
          }
        } catch (err: unknown) {
          if (controller.signal.aborted) return null;
          // Otherwise continue to next radius
        }
      }
      return null;
    },
    [cancelOngoingRequest]
  );

  // Fetch everything within a rectangle bbox (west,south,east,north)
  const fetchByBbox = useCallback(
    async (bounds: L.LatLngBounds): Promise<BuildingSolidType | null> => {
      cancelOngoingRequest();
      const controller = new AbortController();
      abortRef.current = controller;

      const sw = bounds.getSouthWest(); // lat/lng
      const ne = bounds.getNorthEast(); // lat/lng

      const west = sw.lng;
      const south = sw.lat;
      const east = ne.lng;
      const north = ne.lat;

      try {
        const data = await getBuildingSolidsByBbox(
          west,
          south,
          east,
          north,
          LEAFLET_SRID,
          LEAFLET_SRID,
          controller.signal
        );

        const isFeatureCollection =
          data &&
          typeof data === 'object' &&
          (data as any).type === 'FeatureCollection' &&
          Array.isArray((data as any).features);

        if (isFeatureCollection) return data as BuildingSolidType;
        return null;
      } catch (err: unknown) {
        if (controller.signal.aborted) return null;
        return null;
      }
    },
    [cancelOngoingRequest]
  );

  const renderFeatures = useCallback(
    (data: BuildingSolidType) => {
      const layer = markersLayerRef.current;
      if (!layer) return;

      clearMarkers();

      data.features.forEach((feature) => {
        const { coordinates } = feature.geometry as any;
        const [x, y] = coordinates; // lon, lat
        const buildingSolidId = (feature.properties as any)['building_solid_id'];

        const latLng = new L.LatLng(y, x);

        const marker = L.circleMarker(latLng, FOUND_MARKER_STYLE).bindPopup(
          `<a href=/building/${buildingSolidId} target="_blank" rel="noreferrer">Building Solid: ${buildingSolidId}</a>`
        );

        // Attach id for potential later use
        (marker as any).__buildingSolidId = buildingSolidId;

        marker.addTo(layer);
      });
    },
    [clearMarkers]
  );

  const clearSelectionRectangle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectionRectRef.current) {
      selectionRectRef.current.removeFrom(map);
      selectionRectRef.current = null;
    }
    selectionStartRef.current = null;
    selectingRef.current = false;

    // Ensure dragging is re-enabled if selection ends unexpectedly
    if (!map.dragging.enabled()) {
      map.dragging.enable();
    }
  }, []);

  // ---- Effects -----------------------------------------------------------

  useEffect(() => {
    // Disable built-in Leaflet boxZoom (shift+drag zoom) so we can use shift+drag selection
    const map = L.map('map', { boxZoom: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    // Base layer
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    // Dedicated layer group for markers
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Right-click handler (existing behavior)
    const onContextMenu = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      setSearchIndicator(e.latlng);

      cancelOngoingRequest();
      clearMarkers();

      const results = await progressiveFetch(lng, lat);

      setSearchIndicator(null);

      if (!results) {
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

    // SHIFT + left drag selection handlers
    const onMouseDown = (e: L.LeafletMouseEvent) => {
      const oe = e.originalEvent as MouseEvent | undefined;
      if (!oe) return;

      // Start selection only with SHIFT + left button
      if (!oe.shiftKey || oe.button !== 0) return;

      selectingRef.current = true;
      selectionStartRef.current = e.latlng;

      // Disable map dragging while selecting
      map.dragging.disable();

      const initialBounds = L.latLngBounds(e.latlng, e.latlng);
      selectionRectRef.current = L.rectangle(initialBounds, SELECTION_RECT_STYLE).addTo(map);

      oe.preventDefault();
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!selectingRef.current || !selectionStartRef.current || !selectionRectRef.current) return;

      const bounds = L.latLngBounds(selectionStartRef.current, e.latlng);
      selectionRectRef.current.setBounds(bounds);
    };

    const finishSelection = async (endLatLng?: L.LatLng) => {
      if (!selectingRef.current || !selectionStartRef.current) return;

      // Re-enable map dragging
      if (!map.dragging.enabled()) map.dragging.enable();

      const end = endLatLng ?? selectionStartRef.current;
      const bounds = L.latLngBounds(selectionStartRef.current, end);

      // Optional: ignore very small drags
      const pixelSize = map.latLngToContainerPoint(bounds.getNorthEast()).distanceTo(
        map.latLngToContainerPoint(bounds.getSouthWest())
      );
      if (pixelSize < 6) {
        clearSelectionRectangle();
        return;
      }

      // UI indicator at center of rectangle
      setSearchIndicator(bounds.getCenter());

      // Clear current markers and fetch all features inside bbox
      clearMarkers();
      const results = await fetchByBbox(bounds);

      setSearchIndicator(null);

      if (!results || !Array.isArray(results.features) || results.features.length === 0) {
        L.popup()
          .setLatLng(bounds.getCenter())
          .setContent(
            `<div style="font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
              No building solids found in this rectangle.
            </div>`
          )
          .openOn(map);
        clearSelectionRectangle();
        return;
      }

      renderFeatures(results);
      clearSelectionRectangle();
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!selectingRef.current) return;
      finishSelection(e.latlng);
    };

    // If mouseup happens outside the map container
    const onDocMouseUp = () => {
      if (!selectingRef.current) return;
      finishSelection();
    };

    map.on('contextmenu', onContextMenu);

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    document.addEventListener('mouseup', onDocMouseUp);

    // Cleanup on unmount
    return () => {
      map.off('contextmenu', onContextMenu);

      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      document.removeEventListener('mouseup', onDocMouseUp);

      clearSelectionRectangle();
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
  }, [
    cancelOngoingRequest,
    clearMarkers,
    clearSelectionRectangle,
    fetchByBbox,
    progressiveFetch,
    renderFeatures,
    setSearchIndicator,
  ]);

  // Focus and fetch progressively for selected addresses (existing behavior)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAddresses || selectedAddresses.length === 0) return;

    // Keep only addresses with a valid GeoJSON Point geometry
    const pointAddrs = selectedAddresses.filter((addr) => addr.l72);
    if (pointAddrs.length === 0) return;

    // Focus map: fit bounds if multiple, flyTo if single
    const latLngs = pointAddrs.map((addr) => {
      const [lng, lat] = addr.l72.coordinates;
      return L.latLng(lat, lng);
    });

    if (latLngs.length > 1) {
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [24, 24] });
    } else {
      map.flyTo(latLngs[0], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
    }

    cancelOngoingRequest();
    clearMarkers();

    (async () => {
      const merged: BuildingSolidType = {
        type: 'FeatureCollection',
        features: [],
      } as BuildingSolidType;

      for (const addr of pointAddrs) {
        const [lng, lat] = addr.l72.coordinates;

        setSearchIndicator({ lat, lng });

        const res = await progressiveFetch(lng, lat);

        setSearchIndicator(null);

        if (res && Array.isArray(res.features) && res.features.length > 0) {
          merged.features.push(...res.features);
        } else {
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

      if (merged.features.length > 0) {
        renderFeatures(merged);
      }
    })();
  }, [
    selectedAddresses,
    cancelOngoingRequest,
    clearMarkers,
    progressiveFetch,
    renderFeatures,
    setSearchIndicator,
  ]);

  return <div id="map" style={{ height: '600px' }} />;
};

export default MapSelector;
