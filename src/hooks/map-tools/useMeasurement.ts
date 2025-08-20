
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

interface UseMeasurementProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
}

const measureStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
  stroke: new Stroke({ color: '#ffcc33', width: 2 }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#ffcc33' }),
  }),
});

export const useMeasurement = ({ mapRef, isMapReady }: UseMeasurementProps) => {
  const [activeMeasureTool, setActiveMeasureTool] = useState<'LineString' | 'Polygon' | null>(null);
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

    // Remove existing tooltip if it exists
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


  const stopMeasureTool = useCallback(() => {
    if (drawInteractionRef.current && mapRef.current) {
      mapRef.current.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }
    setActiveMeasureTool(null);
    currentDrawingFeatureRef.current = null;
  }, [mapRef]);
  
  const clearMeasurements = useCallback(() => {
    stopMeasureTool();
    if (measureSourceRef.current) {
        measureSourceRef.current.clear();
    }
    if (mapRef.current) {
        Object.values(tooltipsRef.current).forEach(overlay => mapRef.current!.removeOverlay(overlay));
    }
    tooltipsRef.current = {};
  }, [stopMeasureTool, mapRef]);

  const toggleMeasureTool = useCallback((toolType: 'LineString' | 'Polygon') => {
    if (!mapRef.current) return;

    if (activeMeasureTool === toolType) {
      stopMeasureTool();
      return;
    }

    stopMeasureTool();
    
    const newDrawInteraction = new Draw({
        source: measureSourceRef.current!,
        type: toolType,
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
        // The tooltip is already placed, just finalize
    });

    mapRef.current.addInteraction(newDrawInteraction);
    drawInteractionRef.current = newDrawInteraction;
    setActiveMeasureTool(toolType);
  }, [mapRef, activeMeasureTool, stopMeasureTool]);
  
  // Initialize layer and source
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

  // Cleanup effect
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
    activeMeasureTool,
    toggleMeasureTool,
    clearMeasurements,
  };
};

// Add this CSS to your globals.css to style the tooltips
/*
.ol-tooltip {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  color: white;
  padding: 4px 8px;
  opacity: 0.7;
  white-space: nowrap;
  font-size: 12px;
  cursor: default;
  user-select: none;
}
.ol-tooltip-measure {
  opacity: 1;
  font-weight: bold;
}
.ol-tooltip-static {
  background-color: #ffcc33;
  color: black;
  border: 1px solid white;
}
.ol-tooltip-measure:before,
.ol-tooltip-static:before {
  border-top: 6px solid rgba(0, 0, 0, 0.5);
  border-right: 6px solid transparent;
  border-left: 6px solid transparent;
  content: "";
  position: absolute;
  bottom: -6px;
  margin-left: -7px;
  left: 50%;
}
.ol-tooltip-static:before {
  border-top-color: #ffcc33;
}
*/
