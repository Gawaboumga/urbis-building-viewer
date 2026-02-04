import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getBuildingSolid } from '../services/api';
import BuildingViewerComponent from '../components/BuildingViewerComponent';

const BuildingPage: React.FC = () => {
  const { buildingSolidId } = useParams();
  const [buildingSolid, setBuildingSolid] = useState<any>(null);

  useEffect(() => {
    if (buildingSolidId) {
      getBuildingSolid(Number(buildingSolidId), {
        computeArea: true
      }).then(setBuildingSolid);
    }
  }, [buildingSolidId]);

  return (
    <div className="container-fluid full-height">
      <div className="info-banner p-3 border-bottom">
        <h4>Building Information</h4>
        <p>Select a face on the building to see surface.</p>
      </div>
      <div className="main-section d-flex flex-row full-height">
        <div
          id="building_viewer"
          className="building-3d flex-fill p-3 border-end"
          style={{ minWidth: '400px', minHeight: '500px' }}
        >
          {buildingSolid && <BuildingViewerComponent buildingSolid={buildingSolid} />}
        </div>

        <div id="faces" className="faces-section p-3" style={{ minWidth: '250px' }}>
          <h5>List of faces</h5>
          <ul id="faceList" className="list-group" />
        </div>
      </div>
      <div className="info-banner p-3 border-bottom">
        <h4>You can rotate with left click, move with right click and zoom with mouse wheel</h4>
      </div>
    </div>
  );
};

export default BuildingPage;