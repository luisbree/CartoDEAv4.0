
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import DragBox from 'ol/interaction/DragBox';
import type { MapActionToolId } from '@/lib/types';
import type { Extent } from 'ol/extent';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';

interface UseMapNavigationProps {
  mapRef: React.RefObject<Map | null>;
  mapElementRef: React.RefObject<HTMLDivElement | null>;
  isMapReady: boolean;
  activeTool: MapActionToolId | null;
  setActiveTool: (toolId: MapActionToolId | null) => void;
}

export const useMapNavigation = ({
  mapRef,
  mapElementRef,
  isMapReady,
  activeTool,
  setActiveTool,
}: UseMapNavigationProps) => {
  const dragBoxInteractionRef = useRef<DragBox | null>(null);

  const stopTool = useCallback(() => {
    if (dragBoxInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(dragBoxInteractionRef.current);
      dragBoxInteractionRef.current = null;
    }
  }, [mapRef]);

  const toggleZoomToArea = useCallback(() => {
    setActiveTool(activeTool === 'zoomToArea' ? null : 'zoomToArea');
  }, [activeTool, setActiveTool]);

  
  // Effect to manage the "Zoom to Area" tool
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    
    stopTool(); 

    if (activeTool === 'zoomToArea') {
      const dragBox = new DragBox({});
      dragBoxInteractionRef.current = dragBox;
      mapRef.current.addInteraction(dragBox);

      dragBox.on('boxend', () => {
        const extent = dragBox.getGeometry().getExtent();
        mapRef.current?.getView().fit(extent, { duration: 500 });
        // Correctly toggle the tool off so the lastActiveToolRef is updated
        toggleZoomToArea();
      });
    }

    if (mapElementRef.current) {
        mapElementRef.current.style.cursor = activeTool === 'zoomToArea' ? 'crosshair' : 'default';
    }

    return () => {
      stopTool();
      if (mapElementRef.current) {
        mapElementRef.current.style.cursor = 'default';
      }
    };
  }, [activeTool, isMapReady, mapRef, mapElementRef, stopTool, toggleZoomToArea]);


  return {
    activeTool,
    toggleZoomToArea,
  };
};
