"use client";

import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, transformExtent } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import GeoJSON from 'ol/format/GeoJSON';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import type { MapState } from '@/lib/types';
import { BASE_LAYER_DEFINITIONS } from '../map-view';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';

interface SharedMapClientProps {
  mapState: MapState;
}

const SharedMapClient: React.FC<SharedMapClientProps> = ({ mapState }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return; // Initialize map only once
    }

    // 1. Create Base Layer
    const baseLayerDef = BASE_LAYER_DEFINITIONS.find(def => def.id === mapState.baseLayerId) || BASE_LAYER_DEFINITIONS[1];
    const baseLayer = baseLayerDef.createLayer ? baseLayerDef.createLayer() : null;
    if (baseLayer) {
        baseLayer.setVisible(true);
    }
    
    // Create an array for all layers, starting with the base layer if it exists
    const initialLayers = baseLayer ? [baseLayer] : [];

    // 2. Create Operational Layers from mapState
    mapState.layers.forEach(layerData => {
        if (layerData.type === 'wms' && layerData.url && layerData.layerName) {
            const olLayer = new TileLayer({
                source: new TileWMS({
                    url: `${layerData.url}/wms`,
                    params: {
                        'LAYERS': layerData.layerName,
                        'TILED': true,
                        'STYLES': layerData.styleName || '',
                        'VERSION': '1.1.1',
                        'TRANSPARENT': true,
                    },
                    serverType: 'geoserver',
                }),
                opacity: layerData.opacity,
                visible: layerData.visible,
            });
            initialLayers.push(olLayer);
        } else if (layerData.type === 'wfs' && layerData.url && layerData.layerName) {
            const wfsSource = new VectorSource({
                format: new GeoJSON(),
                url: (extent) => {
                    const wfsUrl = `${layerData.url}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${layerData.layerName}&outputFormat=application/json&srsname=EPSG:3857&bbox=${extent.join(',')},EPSG:3857`;
                    // Note: This proxy is necessary if the GeoServer doesn't have CORS enabled.
                    return `/api/geoserver-proxy?url=${encodeURIComponent(wfsUrl)}`;
                },
                strategy: bboxStrategy,
            });

            const olLayer = new VectorLayer({
                source: wfsSource,
                opacity: layerData.opacity,
                visible: layerData.visible,
                style: new Style({ // A simple default style for WFS layers in the viewer
                    stroke: new Stroke({ color: '#3399CC', width: 2 }),
                    fill: new Fill({ color: 'rgba(0, 153, 204, 0.2)' }),
                     image: new CircleStyle({
                        radius: 5,
                        fill: new Fill({ color: 'rgba(0, 153, 204, 0.2)' }),
                        stroke: new Stroke({ color: '#3399CC', width: 1.5 })
                    })
                })
            });
            initialLayers.push(olLayer);
        } else if (layerData.type === 'gee' && layerData.geeParams?.tileUrl) {
             const geeLayer = new TileLayer({
                source: new XYZ({
                    url: layerData.geeParams.tileUrl,
                    crossOrigin: 'anonymous',
                }),
                opacity: layerData.opacity,
                visible: layerData.visible,
            });
            initialLayers.push(geeLayer);
        }
    });

    // 3. Create the Map and View
    const map = new Map({
        target: mapElementRef.current,
        layers: initialLayers,
        view: new View({
            center: fromLonLat(mapState.view.center),
            zoom: mapState.view.zoom,
            projection: 'EPSG:3857',
        }),
        controls: defaultControls({ attributionOptions: { collapsible: false } }),
    });

    mapRef.current = map;

    return () => {
      // Cleanup on component unmount
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }
    };
  }, [mapState]); // Rerun effect if mapState changes (shouldn't happen on this page)

  return <div ref={mapElementRef} className="w-full h-full" />;
};

export default SharedMapClient;
