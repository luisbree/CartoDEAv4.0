
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import type VectorSource from 'ol/source/Vector';
import Draw, { createBox } from 'ol/interaction/Draw';
import KML from 'ol/format/KML';
import { useToast } from "@/hooks/use-toast";
import type { DrawToolId } from '@/lib/types';

interface UseDrawingInteractionsProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  activeTool: DrawToolId | null;
  setActiveTool: (toolId: DrawToolId | null) => void;
}

export const useDrawingInteractions = ({
  mapRef,
  isMapReady,
  drawingSourceRef,
  activeTool,
  setActiveTool,
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

  const saveDrawnFeaturesAsKML = useCallback(() => {
    if (!drawingSourceRef.current || drawingSourceRef.current.getFeatures().length === 0) {
      toast({ description: 'No hay nada que guardar.' });
      return;
    }

    try {
      const kmlFormat = new KML({
        extractStyles: true,
        showPointNames: true,
      });
      const features = drawingSourceRef.current.getFeatures();
      const kmlString = kmlFormat.writeFeatures(features, {
        dataProjection: 'EPSG:4326',
        featureProjection: mapRef.current?.getView().getProjection() ?? 'EPSG:3857',
      });
      
      const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `dibujos_mapa_${new Date().toISOString().split('T')[0]}.kml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      toast({ description: 'Dibujos guardados como KML.' });
    } catch (error) {
      console.error("Error saving KML:", error);
      toast({ description: 'Error al guardar el archivo KML.' });
    }
  }, [drawingSourceRef, mapRef, toast]);

  return {
    activeTool,
    toggleTool,
    clearDrawnFeatures,
    saveDrawnFeaturesAsKML,
  };
};
