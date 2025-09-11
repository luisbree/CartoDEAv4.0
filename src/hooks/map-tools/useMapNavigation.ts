
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

    // The current view is the last item, so we pop it to get to the previous one
    const newHistory = [...viewHistory];
    newHistory.pop(); 
    const previousExtent = newHistory[newHistory.length - 1];

    if (mapRef.current && previousExtent) {
        mapRef.current.getView().fit(previousExtent, {
          duration: 500,
          callback: () => {
            // Delay resetting the flag slightly to prevent the moveend event from re-adding the extent we just navigated to
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

  
  // Effect to manage the view history for the back button
  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;
    const view = map.getView();
    
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
    
    // Use 'rendercomplete' for the very first extent capture, which is more reliable.
    const renderCompleteKey = map.once('rendercomplete', () => {
        const initialSize = map.getSize();
        if (initialSize) {
           setViewHistory([view.calculateExtent(initialSize)]);
        }
    });

    const moveEndKey = view.on('moveend', handleMoveEnd);

    return () => {
        unByKey(renderCompleteKey);
        unByKey(moveEndKey);
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
