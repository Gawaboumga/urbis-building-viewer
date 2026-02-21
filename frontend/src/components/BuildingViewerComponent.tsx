import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { BuildingViewer } from './BuildingViewer';

interface BuildingViewerProps {
  buildingSolid: any;
}

export interface BuildingViewerHandle {
  clearSelectedFaces: () => void;
}

const BuildingViewerComponent = forwardRef<BuildingViewerHandle, BuildingViewerProps>(
  ({ buildingSolid }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<BuildingViewer | null>(null);

    useImperativeHandle(ref, () => ({
      clearSelectedFaces: () => {
        viewerRef.current?.clearSelectedFaces();
      },
    }));

    useEffect(() => {
      if (!viewerRef.current && containerRef.current && buildingSolid) {
        viewerRef.current = new BuildingViewer(containerRef.current, buildingSolid);
      }
      return () => {
        viewerRef.current?.destroy();
        viewerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (!viewerRef.current && containerRef.current && buildingSolid) {
        viewerRef.current = new BuildingViewer(containerRef.current, buildingSolid);
      }
      // if you later re-enable updateBuilding, you can call it here
    }, [buildingSolid]);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '500px', border: '1px solid #ccc' }}
      />
    );
  }
);

export default BuildingViewerComponent;
