import { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { BuildingViewer } from './BuildingViewer';
import type { GeometryExportFormat } from './BuildingViewer';


interface BuildingViewerProps {
  buildingSolids?: any[];     // preferred
  buildingSolid?: any;        // legacy single-solid prop
}

export interface BuildingViewerHandle {
  clearSelectedFaces: () => void;
  downloadAllGeometries: (format: GeometryExportFormat) => void;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

const BuildingViewerComponent = forwardRef<BuildingViewerHandle, BuildingViewerProps>(
  ({ buildingSolids, buildingSolid }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<BuildingViewer | null>(null);

    // Normalize to an array
    const solids = useMemo(() => {
      return buildingSolids?.length ? buildingSolids : asArray(buildingSolid);
    }, [buildingSolids, buildingSolid]);

    useImperativeHandle(ref, () => ({
      clearSelectedFaces: () => {
        viewerRef.current?.clearSelectedFaces();
      },
      downloadAllGeometries: (format) => {
        viewerRef.current?.downloadAllGeometries(format);
      }
    }));

    useEffect(() => {
      viewerRef.current?.destroy();
      viewerRef.current = null;

      if (containerRef.current && solids.length > 0) {
        viewerRef.current = new BuildingViewer(containerRef.current, solids);
      }

      return () => {
        viewerRef.current?.destroy();
        viewerRef.current = null;
      };
    }, [solids]);

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '500px', border: '1px solid #ccc' }}
      />
    );
  }
);

export default BuildingViewerComponent;