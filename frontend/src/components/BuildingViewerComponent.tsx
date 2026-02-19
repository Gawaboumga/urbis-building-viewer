
import React, { useEffect, useRef } from 'react';
import { BuildingViewer } from './BuildingViewer';

interface BuildingViewerProps {
  buildingSolid: any;
}

const BuildingViewerComponent: React.FC<BuildingViewerProps> = ({ buildingSolid }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BuildingViewer | null>(null);

  useEffect(() => {
    if (!viewerRef.current && containerRef.current && buildingSolid) {
      viewerRef.current = new BuildingViewer(containerRef.current, buildingSolid);
    }
    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps → run once

  useEffect(() => {
    if (viewerRef.current && buildingSolid) {
      //viewerRef.current.updateBuilding(buildingSolid);
    } else if (!viewerRef.current && containerRef.current && buildingSolid) {
      viewerRef.current = new BuildingViewer(containerRef.current, buildingSolid);
    }
  }, [buildingSolid]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '500px', border: '1px solid #ccc' }}
    />
  );
};

export default BuildingViewerComponent;
