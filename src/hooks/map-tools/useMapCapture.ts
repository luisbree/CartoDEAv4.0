
"use client";

import { useState, useCallback } from 'react';
import type { Map } from 'ol';
import { useToast } from "@/hooks/use-toast";
import { transformExtent, get as getProjection } from 'ol/proj';
import type { Extent } from 'ol/extent';
import { getPointResolution } from 'ol/proj';

interface UseMapCaptureProps {
  mapRef: React.RefObject<Map | null>;
  activeBaseLayerId: string; // Keep this for potential future use, even if unused now
}

export interface MapCaptureData {
  image: string;
  extent: Extent;
  scale: {
    barWidth: number;
    text: string;
  }
}

// Function to get scale info
const getScaleInfo = (map: Map): { barWidth: number; text: string } => {
    const view = map.getView();
    const projection = view.getProjection();
    const resolution = view.getResolution();
    const center = view.getCenter();

    if (!resolution || !center) return { barWidth: 100, text: 'N/A' };
    
    const pointResolution = getPointResolution(projection, resolution, center, 'm');
    const inchesPerMetre = 1 / 0.0254;
    const dpi = 96;
    const inchsPerMeters = 39.37;
    const scale = resolution * getProjection('EPSG:4326')!.getMetersPerUnit()! * inchsPerMeters * dpi;


    // Simplified scale text logic
    const nominalMapWidth = resolution * map.getSize()![0];
    const scaleBarDistance = Math.pow(10, Math.floor(Math.log10(nominalMapWidth / 4)));
    const scaleBarWidth = scaleBarDistance / resolution;
    
    let text = `${scaleBarDistance.toFixed(0)} m`;
    if (scaleBarDistance >= 1000) {
      text = `${(scaleBarDistance / 1000).toFixed(0)} km`;
    }

    return { barWidth: scaleBarWidth, text };
};


export const useMapCapture = ({ mapRef }: UseMapCaptureProps) => {
  const { toast } = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  const captureMapDataUrl = useCallback(async (): Promise<MapCaptureData | null> => {
      if (!mapRef.current) {
          toast({ description: 'El mapa no está listo para ser capturado.' });
          return null;
      }
  
      setIsCapturing(true);
      toast({ description: `Refrescando el mapa para la impresión...` });
  
      const map = mapRef.current;
  
      return new Promise((resolve) => {
          map.once('rendercomplete', () => {
              try {
                  const mapCanvas = document.createElement('canvas');
                  const size = map.getSize();
                  if (!size) {
                      throw new Error("Map size is not available.");
                  }
                  mapCanvas.width = size[0];
                  mapCanvas.height = size[1];
                  const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });
                  if (!mapContext) {
                      throw new Error("Could not get canvas context.");
                  }
                  
                  // Iterate over all canvases in the map viewport and draw them onto our combined canvas
                  const canvases = map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer');
                  Array.from(canvases).forEach(canvas => {
                      if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
                          const opacity = parseFloat(canvas.style.opacity) || 1.0;
                          mapContext.globalAlpha = opacity;
                          mapContext.drawImage(canvas, 0, 0);
                      }
                  });
  
                  const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.95);
                  
                  // Get extent and scale info
                  const view = map.getView();
                  const extent3857 = view.calculateExtent(size);
                  const extent4326 = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
                  const scale = getScaleInfo(map);

                  resolve({
                      image: dataUrl,
                      extent: extent4326,
                      scale: scale,
                  });
              } catch (error) {
                  console.error('Error capturing map:', error);
                  toast({ description: `Error al capturar el mapa: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
                  resolve(null);
              } finally {
                  setIsCapturing(false);
              }
          });
          map.renderSync();
      });
  }, [mapRef, toast]);
  
  return {
    captureMapDataUrl,
    isCapturing,
  };
};
