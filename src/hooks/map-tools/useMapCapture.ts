
"use client";

import { useState, useCallback } from 'react';
import type { Map } from 'ol';
import { useToast } from "@/hooks/use-toast";


interface UseMapCaptureProps {
  mapRef: React.RefObject<Map | null>;
  activeBaseLayerId: string;
}

export const useMapCapture = ({ mapRef }: UseMapCaptureProps) => {
  const { toast } = useToast();
  const [isCapturing, setIsCapturing] = useState(false);

  const captureMapAsDataUrl = useCallback(async (): Promise<string | null> => {
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
                  
                  const canvases = map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer');
                  Array.from(canvases).forEach(canvas => {
                      if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
                          const opacity = parseFloat(canvas.style.opacity) || 1.0;
                          const filter = (canvas.style as any).filter || 'none';
                          mapContext.globalAlpha = opacity;
                          mapContext.filter = filter;
                          mapContext.drawImage(canvas, 0, 0, canvas.width, canvas.height);
                      }
                  });
  
                  const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.95);
                  resolve(dataUrl);
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
    captureMapAsDataUrl,
    isCapturing,
  };
};
