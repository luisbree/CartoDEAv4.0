
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Map, Feature } from 'ol';
import type { Coordinate } from 'ol/coordinate';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import type VectorSource from 'ol/source/Vector';
import View from 'ol/View';
import OSM from 'ol/source/OSM';

interface MapLayers {
  userLayer: VectorLayer<VectorSource>;
  poiLayer: VectorLayer<VectorSource>;
}

interface MapContextType {
  map: Map | null;
  setMap: (map: Map | null) => void;
  layers: MapLayers | null;
  setLayers: (layers: MapLayers) => void;
  setBaseLayer: (layerName: 'osm' | 'satellite') => void;
  addUserFeatures: (features: Feature[]) => void;
  clearUserFeatures: () => void;
  addPoiFeatures: (features: Feature[]) => void;
  clearPoiFeatures: () => void;
  downloadMapImage: () => void;
  centerOnFeature: (coordinate: Coordinate, zoom?: number) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider = ({ children }: { children: ReactNode }) => {
  const [map, setMap] = useState<Map | null>(null);
  const [layers, setLayers] = useState<MapLayers | null>(null);

  const setBaseLayer = useCallback(
    (layerName: 'osm' | 'satellite') => {
      if (!map) return;
      map
        .getLayers()
        .getArray()
        .filter(layer => layer.get('name') === 'osm' || layer.get('name') === 'satellite')
        .forEach(layer => map.removeLayer(layer));

      let baseLayer;
      if (layerName === 'satellite') {
        baseLayer = new TileLayer({
          source: new XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maxZoom: 19,
          }),
        });
        baseLayer.set('name', 'satellite');
      } else {
        // Default to OSM
        baseLayer = new TileLayer({
            source: new OSM(),
        });
        baseLayer.set('name', 'osm');
      }
      map.getLayers().insertAt(0, baseLayer);
    },
    [map]
  );

  const addUserFeatures = useCallback((features: Feature[]) => {
      if (!map || !layers?.userLayer) return;
      const userSource = layers.userLayer.getSource();
      if (!userSource) return;
      userSource.addFeatures(features);
      
      const extent = userSource.getExtent();
      if (extent && extent.every(isFinite)) {
        map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });
      }
    }, [map, layers]);

  const clearUserFeatures = useCallback(() => {
    layers?.userLayer.getSource()?.clear();
  }, [layers]);

  const addPoiFeatures = useCallback((features: Feature[]) => {
      if (!map || !layers?.poiLayer) return;
      const poiSource = layers.poiLayer.getSource();
      poiSource?.addFeatures(features);
    }, [map, layers]);

  const clearPoiFeatures = useCallback(() => {
    layers?.poiLayer.getSource()?.clear();
  }, [layers]);

  const downloadMapImage = useCallback(() => {
    if (!map) return;
    map.once('rendercomplete', () => {
      const mapCanvas = document.createElement('canvas');
      const size = map.getSize();
      if (size) {
        mapCanvas.width = size[0];
        mapCanvas.height = size[1];
        const mapContext = mapCanvas.getContext('2d');
        Array.from(map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer')).forEach(canvas => {
            if (mapContext && (canvas instanceof HTMLCanvasElement)) {
                mapContext.drawImage(canvas, 0, 0);
            }
        });
        const link = document.createElement('a');
        link.href = mapCanvas.toDataURL('image/png');
        link.download = 'map.png';
        link.click();
      }
    });
    map.renderSync();
  }, [map]);

  const centerOnFeature = useCallback(
    (coordinate: Coordinate, zoom: number = 15) => {
      if (!map) return;
      map.getView().animate({
        center: coordinate,
        zoom: zoom,
        duration: 1000,
      });
    },
    [map]
  );

  const contextValue: MapContextType = {
    map,
    setMap,
    layers,
    setLayers,
    setBaseLayer,
    addUserFeatures,
    clearUserFeatures,
    addPoiFeatures,
    clearPoiFeatures,
    downloadMapImage,
    centerOnFeature,
  };

  return (
    <MapContext.Provider value={contextValue}>
      {children}
    </MapContext.Provider>
  );
};

export const useMap = () => {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMap must be used within a MapProvider');
  }
  return context;
};
