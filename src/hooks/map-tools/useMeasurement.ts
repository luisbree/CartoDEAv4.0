
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { getArea, getLength } from 'ol/sphere';
import Overlay from 'ol/Overlay';
import type { LineString, Polygon } from 'ol/geom';
import type Feature from 'ol/Feature';
import type { MeasureToolId } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface UseMeasurementProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  activeTool: MeasureToolId | null;
  setActiveTool: (toolId: MeasureToolId | null) => void;
}

const measureStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
  stroke: new Stroke({ color: '#ffcc33', width: 2 }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#ffcc33' }),
  }),
});

export const useMeasurement = ({ mapRef, isMapReady, activeTool, setActiveTool }: UseMeasurementProps) => {
  const { toast } = useToast();
  const measureSourceRef = useRef<VectorSource | null>(null);
  const measureLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const tooltipsRef = useRef<Record<string, Overlay>>({});
  const currentDrawingFeatureRef = useRef<Feature | null>(null);

  const formatLength = (line: LineString) => {
    const length = getLength(line, { projection: 'EPSG:3857' });
    if (length > 1000) {
      return `${(length / 1000).toFixed(2)} km`;
    }
    return `${length.toFixed(2)} m`;
  };

  const formatArea = (polygon: Polygon) => {
    const area = getArea(polygon, { projection: 'EPSG:3857' });
    if (area > 1000000) {
      return `${(area / 1000000).toFixed(2)} km²`;
    }
    return `${area.toFixed(2)} m²`;
  };
  
  const addTooltip = (feature: Feature, text: string) => {
    const featureId = feature.get('measure_id');
    if (!featureId || !mapRef.current) return;

    if (tooltipsRef.current[featureId]) {
      mapRef.current.removeOverlay(tooltipsRef.current[featureId]);
      delete tooltipsRef.current[featureId];
    }
    
    const tooltipElement = document.createElement('div');
    tooltipElement.className = 'ol-tooltip ol-tooltip-measure';
    tooltipElement.innerHTML = text;
    
    const tooltip = new Overlay({
      element: tooltipElement,
      offset: [0, -15],
      positioning: 'bottom-center',
    });

    const geometry = feature.getGeometry();
    if (geometry) {
        let position;
        if (geometry.getType() === 'Polygon') {
            position = (geometry as Polygon).getInteriorPoint().getCoordinates();
        } else if (geometry.getType() === 'LineString') {
            position = (geometry as LineString).getLastCoordinate();
        }
        tooltip.setPosition(position);
    }
    
    tooltipsRef.current[featureId] = tooltip;
    mapRef.current.addOverlay(tooltip);
};

  const stopTool = useCallback(() => {
    if (drawInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }
    currentDrawingFeatureRef.current = null;
  }, [mapRef]);
  
  const clearMeasurements = useCallback(() => {
    setActiveTool(null);
    if (measureSourceRef.current) {
        measureSourceRef.current.clear();
    }
    if (mapRef.current) {
        Object.values(tooltipsRef.current).forEach(overlay => mapRef.current!.removeOverlay(overlay));
    }
    tooltipsRef.current = {};
  }, [setActiveTool, mapRef]);

  const toggleTool = useCallback((toolId: MeasureToolId) => {
    setActiveTool(toolId);
  }, [setActiveTool]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    
    stopTool();

    if (activeTool) {
        const newDrawInteraction = new Draw({
            source: measureSourceRef.current!,
            type: activeTool,
            style: measureStyle,
        });
        
        newDrawInteraction.on('drawstart', (evt) => {
            currentDrawingFeatureRef.current = evt.feature;
            const featureId = `measure_${Date.now()}`;
            evt.feature.set('measure_id', featureId);

            evt.feature.getGeometry()?.on('change', (e) => {
                const geom = e.target;
                let output = '';
                if (geom.getType() === 'LineString') {
                    output = formatLength(geom as LineString);
                } else if (geom.getType() === 'Polygon') {
                    output = formatArea(geom as Polygon);
                }
                addTooltip(evt.feature, output);
            });
        });

        newDrawInteraction.on('drawend', () => {
            currentDrawingFeatureRef.current = null;
        });

        mapRef.current.addInteraction(newDrawInteraction);
        drawInteractionRef.current = newDrawInteraction;
        toast({description: `Herramienta de medición de ${activeTool === 'LineString' ? 'distancia' : 'área'} activada.`});
    }

    return () => {
      stopTool();
    }
  }, [activeTool, isMapReady, mapRef, stopTool, toast]);
  
  useEffect(() => {
    if (isMapReady && mapRef.current && !measureLayerRef.current) {
      measureSourceRef.current = new VectorSource();
      measureLayerRef.current = new VectorLayer({
        source: measureSourceRef.current,
        style: measureStyle,
        properties: { id: 'measurement-layer', name: 'Mediciones' },
      });
      mapRef.current.addLayer(measureLayerRef.current);
    }
  }, [isMapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = measureLayerRef.current;
    return () => {
      if (drawInteractionRef.current && map) {
        map.removeInteraction(drawInteractionRef.current);
      }
      if (layer && map) {
        map.removeLayer(layer);
      }
       if (map) {
        Object.values(tooltipsRef.current).forEach(overlay => map.removeOverlay(overlay));
      }
    };
  }, [mapRef]);

  return {
    activeTool,
    toggleTool,
    clearMeasurements,
  };
};
