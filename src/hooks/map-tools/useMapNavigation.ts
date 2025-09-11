
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import DragBox from 'ol/interaction/DragBox';
import type { MapActionToolId } from '@/lib/types';
import type { Extent } from 'ol/extent';

interface UseMapNavigationProps {
  mapRef: React.RefObject<Map | null>;
  mapElementRef: React.RefObject<HTMLDivElement | null>;
  isMapReady: boolean;
  activeTool: MapActionToolId | null;
  setActiveTool: (toolId: MapActionToolId | null) => void;
}

const MAX_HISTORY_LENGTH = 20;

export const useMapNavigation = ({
  mapRef,
  mapElementRef,
  isMapReady,
  activeTool,
  setActiveTool,
}: UseMapNavigationProps) => {
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  const viewHistoryRef = useRef<Extent[]>([]);
  const isNavigatingHistoryRef = useRef(false);
  const [canGoToPrevious, setCanGoToPrevious] = useState(false);

  // Stop any active navigation tool
  const stopTool = useCallback(() => {
    if (dragBoxInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(dragBoxInteractionRef.current);
      dragBoxInteractionRef.current = null;
    }
  }, [mapRef]);

  // Toggle zoom to area tool
  const toggleZoomToArea = useCallback(() => {
    setActiveTool(activeTool === 'zoomToArea' ? null : 'zoomToArea');
  }, [activeTool, setActiveTool]);
  
  // Go to the previous extent in history
  const goToPreviousExtent = useCallback(() => {
    if (viewHistoryRef.current.length < 2) return; // Need at least current and previous

    isNavigatingHistoryRef.current = true;
    viewHistoryRef.current.pop(); // Remove current view
    const previousExtent = viewHistoryRef.current[viewHistoryRef.current.length - 1];
    
    mapRef.current?.getView().fit(previousExtent, {
      duration: 500,
      callback: () => {
        isNavigatingHistoryRef.current = false;
        setCanGoToPrevious(viewHistoryRef.current.length > 1);
      }
    });

  }, [mapRef]);


  // Effect to manage the DragBox interaction for "Zoom to Area"
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    
    stopTool(); // Clear previous interaction

    if (activeTool === 'zoomToArea') {
      const dragBox = new DragBox({});
      dragBoxInteractionRef.current = dragBox;
      mapRef.current.addInteraction(dragBox);

      dragBox.on('boxend', () => {
        const extent = dragBox.getGeometry().getExtent();
        mapRef.current?.getView().fit(extent, { duration: 500 });
        setActiveTool(null); // Deactivate tool after use
      });
    }

    // Manage cursor style
    if (mapElementRef.current) {
        mapElementRef.current.style.cursor = activeTool === 'zoomToArea' ? 'crosshair' : 'default';
    }

    return () => {
      stopTool();
      if (mapElementRef.current) {
        mapElementRef.current.style.cursor = 'default';
      }
    };
  }, [activeTool, isMapReady, mapRef, mapElementRef, stopTool, setActiveTool]);


  // Effect to manage the view history
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;

    const view = mapRef.current.getView();
    
    const listener = view.on('moveend', () => {
        if (isNavigatingHistoryRef.current) {
            return;
        }
        const newExtent = view.calculateExtent(mapRef.current!.getSize());
        viewHistoryRef.current.push(newExtent);
        
        // Keep history at a reasonable size
        if (viewHistoryRef.current.length > MAX_HISTORY_LENGTH) {
            viewHistoryRef.current.shift();
        }
        
        setCanGoToPrevious(viewHistoryRef.current.length > 1);
    });

    // Add initial extent
    const initialExtent = view.calculateExtent(mapRef.current.getSize()!);
    viewHistoryRef.current.push(initialExtent);

    return () => {
        view.un('moveend', listener.key);
    };
  }, [isMapReady, mapRef]);
  
  
  return {
    activeTool,
    toggleZoomToArea,
    goToPreviousExtent,
    canGoToPrevious,
  };
};
