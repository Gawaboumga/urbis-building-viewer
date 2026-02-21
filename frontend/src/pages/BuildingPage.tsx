import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { getBuildingSolid } from '../services/api';
import BuildingViewerComponent, { type BuildingViewerHandle } from '../components/BuildingViewerComponent';

const BuildingPage: React.FC = () => {
  const { buildingSolidId } = useParams();
  const [buildingSolid, setBuildingSolid] = useState<any>(null);

  // Ref to call imperative methods on the viewer
  const viewerHandleRef = useRef<BuildingViewerHandle | null>(null);

  useEffect(() => {
    if (buildingSolidId) {
      getBuildingSolid(Number(buildingSolidId), { computeArea: true }).then(setBuildingSolid);
    }
  }, [buildingSolidId]);

  const handleClearSelectedFaces = () => {
    viewerHandleRef.current?.clearSelectedFaces();
  };

  return (
    <div className="container-fluid full-height">
      <div className="info-banner p-3 border-bottom">
        <h4>Building Information</h4>
        <p>Select a face on the building to see the surface.</p>
      </div>

      <div className="main-section d-flex flex-row full-height">
        <div
          id="building_viewer"
          className="building-3d flex-fill p-3 border-end"
          style={{ minWidth: '400px', minHeight: '500px' }}
        >
          {buildingSolid && (
            <BuildingViewerComponent
              ref={viewerHandleRef}
              buildingSolid={buildingSolid}
            />
          )}
        </div>

        <div id="faces" className="faces-section p-3" style={{ minWidth: '250px' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="m-0">List of faces</h5>
          </div>

          <ul id="faceList" className="list-group" />

            <h5>Clear everything
              <span
                onClick={buildingSolid ? handleClearSelectedFaces : undefined}
                title="Clear selected faces"
                style={{
                  cursor: buildingSolid ? "pointer" : "not-allowed",
                  opacity: buildingSolid ? 1 : 0.4,
                  fontSize: "1rem",
                  userSelect: "none"
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
