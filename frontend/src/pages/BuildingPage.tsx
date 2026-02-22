import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { getBuildingSolid } from '../services/api';
import BuildingViewerComponent, { type BuildingViewerHandle } from '../components/BuildingViewerComponent';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

function parseIdsParam(param?: string): number[] {
  if (!param) return [];

  // Accept comma-separated: "12,15,18"
  // Also tolerate accidental spaces: "12, 15, 18"
  return param
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(n => Number(n))
    .filter(n => Number.isFinite(n) && n > 0);
}

const BuildingPage: React.FC = () => {
  // NEW: buildingSolidIds instead of buildingSolidId
  const { buildingSolidIds } = useParams();

  // Parse once per param change
  const ids = useMemo(() => parseIdsParam(buildingSolidIds), [buildingSolidIds]);

  // Store multiple solids
  const [buildingSolids, setBuildingSolids] = useState<any[] | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Ref to call imperative methods on the viewer
  const viewerHandleRef = useRef<BuildingViewerHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);

      if (ids.length === 0) {
        setBuildingSolids(null);
        setStatus('idle');
        return;
      }

      setStatus('loading');

      try {
        // Fetch all solids in parallel
        const results = await Promise.all(
          ids.map(id => getBuildingSolid(id, { computeArea: true }))
        );

        if (cancelled) return;

        // If your API might return null/undefined for missing ids, filter them:
        const valid = results.filter(Boolean);

        setBuildingSolids(valid);
        setStatus('loaded');
      } catch (e: any) {
        if (cancelled) return;
        setStatus('error');
        setError(e?.message ?? 'Failed to load building solids');
        setBuildingSolids(null);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [ids]);

  const handleClearSelectedFaces = () => {
    viewerHandleRef.current?.clearSelectedFaces();
  };

  const hasSolids = !!buildingSolids && buildingSolids.length > 0;

  return (
    <div className="container-fluid full-height">
      <div className="info-banner p-3 border-bottom">
        <h4>Building Information</h4>
        <p>
          Select a face on the building to see the surface.
          {ids.length > 1 && (
            <span style={{ marginLeft: 8, opacity: 0.8 }}>
              (Loaded {ids.length} solids)
            </span>
          )}
        </p>
      </div>

      <div className="main-section d-flex flex-row full-height">
        <div
          id="building_viewer"
          className="building-3d flex-fill p-3 border-end"
          style={{ minWidth: '400px', minHeight: '500px' }}
        >
          {status === 'loading' && (
            <div style={{ padding: 12 }}>Loading building solid(s)...</div>
          )}

          {status === 'error' && (
            <div style={{ padding: 12, color: 'crimson' }}>
              Error: {error}
            </div>
          )}

          {hasSolids && (
            <BuildingViewerComponent
              ref={viewerHandleRef}
              // NEW PROP: buildingSolids (array)
              buildingSolids={buildingSolids}
            />
          )}

          {status !== 'loading' && !hasSolids && ids.length > 0 && (
            <div style={{ padding: 12 }}>
              No solids found for ids: {ids.join(', ')}
            </div>
          )}

          {ids.length === 0 && (
            <div style={{ padding: 12, opacity: 0.7 }}>
              No building id(s) provided.
            </div>
          )}
        </div>

        <div id="faces" className="faces-section p-3" style={{ minWidth: '250px' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="m-0">List of faces</h5>
          </div>

          <ul id="faceList" className="list-group" />

          <h5 style={{ marginTop: 16 }}>
            Clear everything{' '}
            <span
              onClick={hasSolids ? handleClearSelectedFaces : undefined}
              title="Clear selected faces"
              style={{
                cursor: hasSolids ? 'pointer' : 'not-allowed',
                opacity: hasSolids ? 1 : 0.4,
                fontSize: '1rem',
                userSelect: 'none'
              }}
            >
              ❌
            </span>
          </h5>
        </div>
      </div>

      <div className="info-banner p-3 border-bottom">
        <h4>You can rotate with left click, move with right click and zoom with mouse wheel</h4>
        <h4>if you SHIFT + left click, you can draw a custom area or get distance between points</h4>
      </div>
    </div>
  );
};

export default BuildingPage;
