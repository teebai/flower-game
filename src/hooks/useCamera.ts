// ============================================================
// FLOWER GAME — CAMERA & ZOOM CONTAINER
// Manages viewport transform for pan/zoom + grass sync.
// ============================================================

import { useRef, useCallback, useState, useEffect } from 'react';

interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

interface UseCameraProps {
  /** Container ref for measuring bounds */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Garden bounding boxes for auto-fit */
  gardenRects: Array<{ x: number; y: number; width: number; height: number }>;
  /** Padding around gardens in px */
  padding?: number;
  /** Timeout before auto-home (ms) */
  homeTimeout?: number;
}

export function useCamera({
  containerRef,
  gardenRects,
  padding = 60,
  homeTimeout = 3000,
}: UseCameraProps) {
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [isManual, setIsManual] = useState(false);
  const homeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Calculate zoom to fit all gardens */
  const fitToGardens = useCallback(() => {
    const container = containerRef.current;
    if (!container || gardenRects.length === 0) return;

    const vw = container.clientWidth;
    const vh = container.clientHeight;

    // Find bounding box of all gardens
    const minX = Math.min(...gardenRects.map(r => r.x)) - padding;
    const maxX = Math.max(...gardenRects.map(r => r.x + r.width)) + padding;
    const minY = Math.min(...gardenRects.map(r => r.y)) - padding;
    const maxY = Math.max(...gardenRects.map(r => r.y + r.height)) + padding;

    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const scaleX = vw / contentW;
    const scaleY = vh / contentH;
    const zoom = Math.min(scaleX, scaleY, 1.5); // max 1.5x zoom

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setCamera({
      x: vw / 2 - centerX * zoom,
      y: vh / 2 - centerY * zoom,
      zoom,
    });
  }, [containerRef, gardenRects, padding]);

  /** Pan by delta */
  const pan = useCallback((dx: number, dy: number) => {
    setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setIsManual(true);

    // Reset home timer
    if (homeTimerRef.current) clearTimeout(homeTimerRef.current);
    homeTimerRef.current = setTimeout(() => {
      setIsManual(false);
      fitToGardens();
    }, homeTimeout);
  }, [fitToGardens, homeTimeout]);

  /** Zoom at a point */
  const zoomAt = useCallback((pointX: number, pointY: number, delta: number) => {
    setCamera(prev => {
      const newZoom = Math.max(0.5, Math.min(2.5, prev.zoom + delta));
      const zoomRatio = newZoom / prev.zoom;
      return {
        zoom: newZoom,
        x: pointX - (pointX - prev.x) * zoomRatio,
        y: pointY - (pointY - prev.y) * zoomRatio,
      };
    });
    setIsManual(true);
  }, []);

  /** Reset to home view */
  const goHome = useCallback(() => {
    setIsManual(false);
    fitToGardens();
  }, [fitToGardens]);

  // Auto-fit on mount and when gardens change
  useEffect(() => {
    if (!isManual) fitToGardens();
  }, [gardenRects, isManual, fitToGardens]);

  return {
    camera,
    pan,
    zoomAt,
    goHome,
    isManual,
  };
}
