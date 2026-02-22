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

// Marker style (default)
const FOUND_MARKER_STYLE: L.CircleMarkerOptions = {
  radius: 6,
  color: 'green',
  weight: 2,
  fillColor: '#2ecc71',
  fillOpacity: 0.8,
};

// Marker style (selected)
const SELECTED_MARKER_STYLE: L.CircleMarkerOptions = {
  radius: 7,
  color: '#ff2d55',
  weight: 3,
  fillColor: '#ff2d55',
  fillOpacity: 0.9,
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

// ---------- Helpers (type-safe feature extraction) -------------------------

type MaybeFeature = BuildingSolidType['features'][number];

function isLonLatTuple(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

function getFeatureLonLat(feature: MaybeFeature): [number, number] | null {
  const geom = (feature as any)?.geometry;
  const coords = geom?.coordinates;
  if (!isLonLatTuple(coords)) return null;
  return [coords[0], coords[1]];
}

function getBuildingSolidId(feature: MaybeFeature): string | number | null {
  const props = (feature as any)?.properties;
  const id = props?.building_solid_id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  return null;
}

function isFeatureCollection(data: unknown): data is BuildingSolidType {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as any).type === 'FeatureCollection' &&
    Array.isArray((data as any).features)
  );
}

function dedupeFeaturesById(features: MaybeFeature[]): MaybeFeature[] {
  const seen = new Set<string | number>();
  const out: MaybeFeature[] = [];
  for (const f of features) {
    const id = getBuildingSolidId(f);
    if (id == null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f);
  }
  return out;
}

// ---------- Component ------------------------------------------------------

const MapSelector: React.FC<Props> = ({ selectedAddresses = [] }) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const searchIndicatorRef = useRef<L.Circle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // SHIFT + drag selection state
  const selectionRectRef = useRef<L.Rectangle | null>(null);
  const selectionStartRef = useRef<L.LatLng | null>(null);
  const selectingRef = useRef(false);

  // Multi-selection state
  const selectedIdsRef = useRef<Set<string | number>>(new Set());
  const selectedMarkersRef = useRef<Map<string | number, L.CircleMarker>>(new Map());

  // Controls
  const openControlRef = useRef<L.Control | null>(null);
  const clearControlRef = useRef<L.Control | null>(null);
  const openControlAnchorRef = useRef<HTMLAnchorElement | null>(null);

  // ---------- Basic helpers ----------------------------

  const cancelOngoingRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const clearMarkers = useCallback(() => {
    markersLayerRef.current?.clearLayers();
  }, []);

  const setSearchIndicator = useCallback((latlng: L.LatLngExpression | null) => {
    const map = mapRef.current;
    if (!map) return;

    if (searchIndicatorRef.current) {
      searchIndicatorRef.current.removeFrom(map);
      searchIndicatorRef.current = null;
    }

    if (latlng) {
      searchIndicatorRef.current = L.circle(latlng, SEARCH_INDICATOR_STYLE).addTo(map);
    }
  }, []);

  // ---------- Selection helpers ------------------------

  const updateOpenControlLabel = useCallback(() => {
    const a = openControlAnchorRef.current;
    if (!a) return;
    const count = selectedIdsRef.current.size;
    a.innerHTML = `Open (${count})`;
    a.style.opacity = count > 0 ? '1' : '0.5';
    a.style.pointerEvents = count > 0 ? 'auto' : 'none';
  }, []);

  const setMarkerSelectedStyle = useCallback((marker: L.CircleMarker, selected: boolean) => {
    marker.setStyle(selected ? SELECTED_MARKER_STYLE : FOUND_MARKER_STYLE);
    if (selected && (marker as any).bringToFront) (marker as any).bringToFront();
  }, []);

  const clearSelection = useCallback(() => {
    for (const marker of selectedMarkersRef.current.values()) {
      setMarkerSelectedStyle(marker, false);
    }
    selectedMarkersRef.current.clear();
    selectedIdsRef.current.clear();
    updateOpenControlLabel();
  }, [setMarkerSelectedStyle, updateOpenControlLabel]);

  const selectOnly = useCallback(
    (id: string | number, marker: L.CircleMarker) => {
      // Replace selection
      clearSelection();
      selectedIdsRef.current.add(id);
      selectedMarkersRef.current.set(id, marker);
      setMarkerSelectedStyle(marker, true);
      updateOpenControlLabel();
    },
    [clearSelection, setMarkerSelectedStyle, updateOpenControlLabel]
  );

  const toggleAdditive = useCallback(
    (id: string | number, marker: L.CircleMarker) => {
      if (selectedIdsRef.current.has(id)) {
        selectedIdsRef.current.delete(id);
        selectedMarkersRef.current.delete(id);
        setMarkerSelectedStyle(marker, false);
      } else {
        selectedIdsRef.current.add(id);
        selectedMarkersRef.current.set(id, marker);
        setMarkerSelectedStyle(marker, true);
      }
      updateOpenControlLabel();
    },
    [setMarkerSelectedStyle, updateOpenControlLabel]
  );

  const openSelectedBuildings = useCallback(() => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    window.open(`/building/${ids.join(',')}`, '_blank', 'noreferrer');
  }, []);

  // ---------- Data fetching ----------------------------

  const progressiveFetch = useCallback(
    async (lng: number, lat: number): Promise<BuildingSolidType | null> => {
      cancelOngoingRequest();
      const controller = new AbortController();
      abortRef.current = controller;

      for (const distance of SEARCH_RADII) {
        try {
          const data = await getBuildingSolidsByDistance(
            lng,
            lat,
            distance,
            LEAFLET_SRID,
            LEAFLET_SRID
          );

          if (controller.signal.aborted) return null;

          if (isFeatureCollection(data) && data.features.length > 0) {
            // Dedupe (cheap safety)
            return {
              ...data,
              features: dedupeFeaturesById(data.features as any),
            } as BuildingSolidType;
          }
        } catch {
          if (controller.signal.aborted) return null;
        }
      }
      return null;
    },
    [cancelOngoingRequest]
  );

  const fetchByBbox = useCallback(
    async (bounds: L.LatLngBounds): Promise<BuildingSolidType | null> => {
      cancelOngoingRequest();
      const controller = new AbortController();
      abortRef.current = controller;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      try {
        const data = await getBuildingSolidsByBbox(
          sw.lng,
          sw.lat,
          ne.lng,
          ne.lat,
          LEAFLET_SRID,
          LEAFLET_SRID
        );

        if (controller.signal.aborted) return null;

        if (!isFeatureCollection(data)) return null;

        return {
          ...data,
          features: dedupeFeaturesById(data.features as any),
        } as BuildingSolidType;
      } catch {
        if (controller.signal.aborted) return null;
        return null;
      }
    },
    [cancelOngoingRequest]
  );

  // ---------- Rendering markers ------------------------

  const buildPopupHtml = useCallback((buildingId: string | number) => {
    const selected = Array.from(selectedIdsRef.current);
    const csv = selected.join(',');
    return `
      <div style="font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
        <div><strong>Building:</strong> ${buildingId}</div>
        <div style="margin-top: 6px;"><strong>Selected:</strong> ${selected.length}</div>

        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
          ${
            selected.length > 0
              ? `<a href="/building/${csv}" target="_blank" rel="noreferrer">Open selected</a>`
              : ''
          }
          <a href="/building/${buildingId}" target="_blank" rel="noreferrer">Open only this</a>
        </div>

        <div style="margin-top: 8px; color: #666; font-size: 12px;">
          Tip: Click replaces selection • Ctrl/Cmd+Click multi-select
        </div>
      </div>
    `;
  }, []);

  const renderFeatures = useCallback(
    (data: BuildingSolidType) => {
      const layer = markersLayerRef.current;
      if (!layer) return;

      clearMarkers();
      clearSelection();

      const safeFeatures = dedupeFeaturesById(data.features as any);

      for (const feature of safeFeatures) {
        const id = getBuildingSolidId(feature as any);
        const lonLat = getFeatureLonLat(feature as any);
        if (id == null || lonLat == null) continue;

        const [lng, lat] = lonLat;
        const marker = L.circleMarker([lat, lng], FOUND_MARKER_STYLE);

        // Bind popup once
        marker.bindPopup('');

        marker.on('click', (e: L.LeafletMouseEvent) => {
          const oe = e.originalEvent as MouseEvent | undefined;
          const additive = !!oe && (oe.ctrlKey || oe.metaKey);

          // Requested behavior: without Ctrl/Cmd => replace selection
          if (additive) {
            toggleAdditive(id, marker);
          } else {
            selectOnly(id, marker);
          }

          marker.setPopupContent(buildPopupHtml(id));
          marker.openPopup();
        });

        marker.addTo(layer);
      }
    },
    [buildPopupHtml, clearMarkers, clearSelection, selectOnly, toggleAdditive]
  );

  // ---------- Rectangle selection ----------------------

  const clearSelectionRectangle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    selectionRectRef.current?.removeFrom(map);
    selectionRectRef.current = null;
    selectionStartRef.current = null;
    selectingRef.current = false;

    if (!map.dragging.enabled()) map.dragging.enable();
  }, []);

  // ---------- Effects: map initialization ---------------

  useEffect(() => {
    const map = L.map('map', { boxZoom: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // --- Open control
    const OpenSelectedControl = (L.Control as any).extend({
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const a = L.DomUtil.create('a', '', container) as HTMLAnchorElement;

        a.href = '#';
        a.title = 'Open selected buildings';
        a.innerHTML = 'Open (0)';
        a.style.opacity = '0.5';
        a.style.pointerEvents = 'none';

        openControlAnchorRef.current = a;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(a, 'click', (ev: Event) => {
          L.DomEvent.preventDefault(ev);
          openSelectedBuildings();
        });

        return container;
      },
    });

    openControlRef.current = new OpenSelectedControl({ position: 'topright' });
    openControlRef.current?.addTo(map);

    // --- Clear control
    const ClearControl = (L.Control as any).extend({
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const a = L.DomUtil.create('a', '', container) as HTMLAnchorElement;

        a.href = '#';
        a.title = 'Clear selection';
        a.innerHTML = 'Clear';

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(a, 'click', (ev: Event) => {
          L.DomEvent.preventDefault(ev);
          clearSelection();
        });

        return container;
      },
    });

    clearControlRef.current = new ClearControl({ position: 'topright' });
    clearControlRef.current?.addTo(map);

    // Right-click fetch
    const onContextMenu = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      setSearchIndicator(e.latlng);
      cancelOngoingRequest();
      clearMarkers();
      clearSelection();

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

    // SHIFT + drag bbox selection
    const onMouseDown = (e: L.LeafletMouseEvent) => {
      const oe = e.originalEvent as MouseEvent | undefined;
      if (!oe || !oe.shiftKey || oe.button !== 0) return;

      selectingRef.current = true;
      selectionStartRef.current = e.latlng;

      map.dragging.disable();

      const initialBounds = L.latLngBounds(e.latlng, e.latlng);
      selectionRectRef.current = L.rectangle(initialBounds, SELECTION_RECT_STYLE).addTo(map);

      oe.preventDefault();
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!selectingRef.current || !selectionStartRef.current || !selectionRectRef.current) return;
      selectionRectRef.current.setBounds(L.latLngBounds(selectionStartRef.current, e.latlng));
    };

    const finishSelection = async (endLatLng?: L.LatLng) => {
      if (!selectingRef.current || !selectionStartRef.current) return;

      if (!map.dragging.enabled()) map.dragging.enable();

      const end = endLatLng ?? selectionStartRef.current;
      const bounds = L.latLngBounds(selectionStartRef.current, end);

      const pixelSize = map
        .latLngToContainerPoint(bounds.getNorthEast())
        .distanceTo(map.latLngToContainerPoint(bounds.getSouthWest()));

      if (pixelSize < 6) {
        clearSelectionRectangle();
        return;
      }

      setSearchIndicator(bounds.getCenter());

      cancelOngoingRequest();
      clearMarkers();
      clearSelection();

      const results = await fetchByBbox(bounds);

      setSearchIndicator(null);

      if (!results || !results.features?.length) {
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

    const onDocMouseUp = () => {
      if (!selectingRef.current) return;
      finishSelection();
    };

    map.on('contextmenu', onContextMenu);
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    document.addEventListener('mouseup', onDocMouseUp);

    return () => {
      map.off('contextmenu', onContextMenu);
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      document.removeEventListener('mouseup', onDocMouseUp);

      clearSelectionRectangle();
      cancelOngoingRequest();

      openControlRef.current?.remove();
      openControlRef.current = null;
      clearControlRef.current?.remove();
      clearControlRef.current = null;

      openControlAnchorRef.current = null;

      markersLayerRef.current?.remove();
      markersLayerRef.current = null;

      searchIndicatorRef.current?.remove();
      searchIndicatorRef.current = null;

      selectedMarkersRef.current.clear();
      selectedIdsRef.current.clear();

      map.remove();
      mapRef.current = null;
    };
  }, [
    cancelOngoingRequest,
    clearMarkers,
    clearSelection,
    clearSelectionRectangle,
    fetchByBbox,
    progressiveFetch,
    renderFeatures,
    setSearchIndicator,
    openSelectedBuildings,
  ]);

  // ---------- Effect: focus and fetch for selected addresses ---------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAddresses?.length) return;

    const pointAddrs = selectedAddresses.filter((addr) => addr.l72);
    if (pointAddrs.length === 0) return;

    const latLngs = pointAddrs.map((addr) => {
      const [lng, lat] = addr.l72.coordinates;
      return L.latLng(lat, lng);
    });

    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
    } else {
      map.flyTo(latLngs[0], Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
    }

    cancelOngoingRequest();
    clearMarkers();
    clearSelection();

    (async () => {
      const all: MaybeFeature[] = [];

      for (const addr of pointAddrs) {
        const [lng, lat] = addr.l72.coordinates;

        setSearchIndicator({ lat, lng });
        const res = await progressiveFetch(lng, lat);
        setSearchIndicator(null);

        if (res?.features?.length) {
          all.push(...(res.features as any));
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

      const merged: BuildingSolidType = {
        type: 'FeatureCollection',
        features: dedupeFeaturesById(all) as any,
      } as BuildingSolidType;

      if (merged.features.length > 0) {
        renderFeatures(merged);
      }
    })();
  }, [
    selectedAddresses,
    cancelOngoingRequest,
    clearMarkers,
    clearSelection,
    progressiveFetch,
    renderFeatures,
    setSearchIndicator,
  ]);

  return <div id="map" style={{ height: '600px' }} />;
};

export default MapSelector;
