
'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Map, View } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';

// Default style for drawn features
const defaultDrawingStyle = new Style({
  fill: new Fill({
    color: 'rgba(255, 255, 255, 0.2)',
  }),
  stroke: new Stroke({
    color: '#ffcc33',
    width: 2,
  }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({
      color: '#ffcc33',
    }),
  }),
});

interface UseOpenLayersMapOptions {
  initialCenter?: number[]; // [lon, lat]
  initialZoom?: number;
}

export const useOpenLayersMap = (options: UseOpenLayersMapOptions = {}) => {
  const mapRef = useRef<Map | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const drawingSourceRef = useRef<VectorSource>(new VectorSource());
  const drawingLayerRef = useRef<VectorLayer<VectorSource>>(
    new VectorLayer({
      source: drawingSourceRef.current,
      style: defaultDrawingStyle,
      properties: {
        id: 'drawing-layer',
        name: 'Dibujos del Usuario',
        isDrawingLayer: true, // Custom property to identify this layer
      }
    })
  );

  const setMapInstanceAndElement = useCallback((mapInstance: Map, mapDivElement: HTMLDivElement) => {
    if (mapInstance && mapDivElement && !mapRef.current) {
      mapRef.current = mapInstance;
      mapElementRef.current = mapDivElement;
      
      // The drawing layer is always added, regardless of mode.
      mapInstance.addLayer(drawingLayerRef.current);
      
      setIsMapReady(true);
    }
  }, []);

  // Effect to initialize the map view
  useEffect(() => {
    if (mapElementRef.current && !mapRef.current) {
      const center = options.initialCenter 
        ? fromLonLat(options.initialCenter, 'EPSG:3857') 
        : fromLonLat([-60.0, -36.5], 'EPSG:3857');
      
      const zoom = options.initialZoom ?? 7;

      const map = new Map({
        target: mapElementRef.current,
        layers: [], // Layers will be added by the MapView component
        view: new View({
          center: center,
          zoom: zoom,
          projection: 'EPSG:3857',
          constrainResolution: true,
        }),
        controls: defaultControls({
          attributionOptions: { collapsible: false },
          zoom: true,
          rotate: false,
        }),
      });
      
      // Call the callback to set the instance refs
      setMapInstanceAndElement(map, mapElementRef.current);
    }
  }, [options.initialCenter, options.initialZoom, setMapInstanceAndElement]);


  return {
    mapRef,
    mapElementRef,
    drawingSourceRef,
    drawingLayerRef,
    setMapInstanceAndElement,
    isMapReady,
  };
};
