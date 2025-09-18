
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Draw, { createBox } from 'ol/interaction/Draw';
import KML from 'ol/format/KML';
import { useToast } from "@/hooks/use-toast";
import type { DrawToolId, MapLayer } from '@/lib/types';
import { nanoid } from 'nanoid';

interface UseDrawingInteractionsProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  activeTool: DrawToolId | null;
  setActiveTool: (toolId: DrawToolId | null) => void;
  addLayer: (layer: MapLayer) => void;
}

export const useDrawingInteractions = ({
  mapRef,
  isMapReady,
  drawingSourceRef,
  activeTool,
  setActiveTool,
  addLayer,
}: UseDrawingInteractionsProps) => {
  const { toast } = useToast();
  const drawInteractionRef = useRef<Draw | null>(null);

  const stopTool = useCallback(() => {
    if (drawInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }
  }, [mapRef]);
  
  const toggleTool = useCallback((toolId: DrawToolId) => {
    setActiveTool(toolId);
  }, [setActiveTool]);


  useEffect(() => {
    // This effect manages the OpenLayers interaction based on the activeTool state
    if (!isMapReady || !mapRef.current || !drawingSourceRef.current) {
        return;
    }
    
    stopTool(); // Stop any existing draw interaction first

    if (activeTool) {
        const drawOptions: any = {
          source: drawingSourceRef.current,
          type: activeTool,
        };
        
        let toastMessage = `Herramienta de dibujo de ${activeTool} activada.`;
    
        if (activeTool === 'Rectangle') {
          drawOptions.type = 'Circle';
          drawOptions.geometryFunction = createBox();
          toastMessage = `Herramienta de dibujo de Rectángulo activada.`;
        }
    
        if (activeTool === 'FreehandPolygon') {
            drawOptions.type = 'Polygon';
            drawOptions.freehand = true;
            toastMessage = `Herramienta de dibujo a Mano Alzada activada.`;
        }
    
        const newDrawInteraction = new Draw(drawOptions);
        mapRef.current.addInteraction(newDrawInteraction);
        drawInteractionRef.current = newDrawInteraction;
        
        toast({ description: toastMessage });
    }
    
    // Cleanup function to remove the interaction when the component unmounts or the tool changes
    return () => {
        stopTool();
    };

  }, [activeTool, isMapReady, mapRef, drawingSourceRef, stopTool, toast]);


  const clearDrawnFeatures = useCallback(() => {
    setActiveTool(null);
    if (drawingSourceRef.current) {
      drawingSourceRef.current.clear();
      toast({ description: 'Dibujos borrados del mapa.' });
    }
  }, [drawingSourceRef, toast, setActiveTool]);
  
  const convertDrawingsToLayer = useCallback(() => {
    if (!drawingSourceRef.current || drawingSourceRef.current.getFeatures().length === 0) {
      toast({ description: 'No hay nada para convertir a capa.' });
      return;
    }

    try {
      const features = drawingSourceRef.current.getFeatures();
      const clonedFeatures = features.map((f, index) => {
        const clone = f.clone();
        // Assign a unique OL ID for internal management
        clone.setId(nanoid());
        // Set user-visible attributes for the attribute table and exports
        clone.setProperties({
          'id': index + 1,
          'etiqueta': `Dibujo ${index + 1}`
        });
        return clone;
      });
      
      const layerName = "Capa Dibujada";
      const source = new VectorSource({ features: clonedFeatures });
      const layerId = `${layerName.replace(/ /g, '_')}-${nanoid()}`;
      const olLayer = new VectorLayer({
          source,
          properties: { id: layerId, name: layerName, type: 'drawing' },
      });
      
      addLayer({
          id: layerId,
          name: layerName,
          olLayer,
          visible: true,
          opacity: 1,
          type: 'drawing',
      });

      // Clear the original drawing source after converting
      clearDrawnFeatures();

      toast({ description: 'Dibujos convertidos a una nueva capa.' });

    } catch (error) {
      console.error("Error converting drawings to layer:", error);
      toast({ description: 'Error al convertir los dibujos a capa.' });
    }
  }, [drawingSourceRef, addLayer, clearDrawnFeatures, toast]);

  return {
    activeTool,
    toggleTool,
    clearDrawnFeatures,
    convertDrawingsToLayer,
  };
};
