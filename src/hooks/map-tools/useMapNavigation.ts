
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

const MAX_HISTORY_LENGTH = 20;

export const useMapNavigation = ({
  mapRef,
  mapElementRef,
  isMapReady,
  activeTool,
  setActiveTool,
}: UseMapNavigationProps) => {
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  const [viewHistory, setViewHistory] = useState<Extent[]>([]);
  const isNavigatingHistoryRef = useRef(false);

  const stopTool = useCallback(() => {
    if (dragBoxInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(dragBoxInteractionRef.current);
      dragBoxInteractionRef.current = null;
    }
  }, [mapRef]);

  const toggleZoomToArea = useCallback(() => {
    setActiveTool(activeTool === 'zoomToArea' ? null : 'zoomToArea');
  }, [activeTool, setActiveTool]);

  const goToPreviousExtent = useCallback(() => {
    if (viewHistory.length < 2) return;

    isNavigatingHistoryRef.current = true;
    
    const newHistory = [...viewHistory];
    newHistory.pop();
    const previousExtent = newHistory[newHistory.length - 1];

    if (mapRef.current && previousExtent) {
        mapRef.current.getView().fit(previousExtent, {
          duration: 500,
          callback: () => {
            setTimeout(() => {
              isNavigatingHistoryRef.current = false;
            }, 100); 
          }
        });
        setViewHistory(newHistory);
    } else {
       isNavigatingHistoryRef.current = false;
    }
  }, [mapRef, viewHistory]);

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
        setActiveTool(null);
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
  }, [activeTool, isMapReady, mapRef, mapElementRef, stopTool, setActiveTool]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const view = map.getView();
    let moveEndKey: EventsKey | undefined;
    let historyTimeout: NodeJS.Timeout | undefined;

    const handleMoveEnd = () => {
      if (isNavigatingHistoryRef.current) return;
      
      const newExtent = view.calculateExtent(map.getSize());

      setViewHistory(prevHistory => {
        const lastExtent = prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;
        if (lastExtent && lastExtent.every((val, i) => Math.abs(val - newExtent[i]) < 1)) {
          return prevHistory;
        }

        const updatedHistory = [...prevHistory, newExtent];
        if (updatedHistory.length > MAX_HISTORY_LENGTH) {
          return updatedHistory.slice(updatedHistory.length - MAX_HISTORY_LENGTH);
        }
        return updatedHistory;
      });
    };

    const debouncedListener = () => {
        clearTimeout(historyTimeout);
        historyTimeout = setTimeout(handleMoveEnd, 250);
    };

    // Use 'rendercomplete' for the very first extent capture.
    const renderCompleteKey = map.once('rendercomplete', () => {
      const initialSize = map.getSize();
      if (initialSize) {
        setViewHistory([view.calculateExtent(initialSize)]);
      }
      // After the first render, start listening for movement.
      moveEndKey = view.on('moveend', debouncedListener);
    });

    return () => {
      clearTimeout(historyTimeout);
      if (renderCompleteKey) unByKey(renderCompleteKey);
      if (moveEndKey) unByKey(moveEndKey);
    };
  }, [isMapReady, mapRef]);

  return {
    activeTool,
    toggleZoomToArea,
    goToPreviousExtent,
    canGoToPrevious: viewHistory.length > 1,
    viewHistory,
  };
};
