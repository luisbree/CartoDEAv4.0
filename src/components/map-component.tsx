
'use client';

import { useMap } from '@/hooks/use-map';
import 'ol/ol.css';
import { Map as OlMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import React, { useEffect, useRef } from 'react';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';

export function MapComponent() {
  const mapRef = useRef<HTMLDivElement>(null);
  const { setMap, setLayers } = useMap();

  useEffect(() => {
    if (!mapRef.current) return;

    const osmLayer = new TileLayer({
      source: new OSM(),
    });
    osmLayer.set('name', 'osm');

    const userLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({
          color: '#388E3C', // Forest Green
          width: 3,
        }),
        fill: new Fill({
          color: 'rgba(56, 142, 60, 0.3)',
        }),
        image: new Circle({
          radius: 7,
          fill: new Fill({
            color: '#388E3C',
          }),
          stroke: new Stroke({
            color: '#fff',
            width: 2,
          }),
        }),
      }),
    });
    userLayer.set('name', 'user-layer');

    const poiLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({
            color: '#F57C00', // Soft Orange
          }),
          stroke: new Stroke({
            color: '#fff',
            width: 2,
          }),
        }),
      }),
    });
    poiLayer.set('name', 'poi-layer');

    const mapInstance = new OlMap({
      target: mapRef.current,
      layers: [osmLayer, userLayer, poiLayer],
      view: new View({
        center: [0, 0],
        zoom: 2,
        enableRotation: false,
      }),
      controls: [],
    });

    setMap(mapInstance);
    setLayers({
      userLayer,
      poiLayer,
    });

    return () => {
      mapInstance.setTarget(undefined);
      setMap(null);
    };
  }, [setMap, setLayers]);

  return <div ref={mapRef} className="w-full h-full bg-background" />;
}
