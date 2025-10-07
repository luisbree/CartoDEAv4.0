"use client";

import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import GeoJSON from 'ol/format/GeoJSON';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import type { MapState } from '@/lib/types';
import { BASE_LAYER_DEFINITIONS } from '../map-view';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

interface SharedMapClientProps {
  mapState: MapState;
}

// Simple state for managing layer properties in the UI
interface UILayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

const SharedMapClient: React.FC<SharedMapClientProps> = ({ mapState }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const layerRefs = useRef<Record<string, TileLayer<any> | VectorLayer<any>>>({});
  const [uiLayers, setUiLayers] = useState<UILayerState[]>([]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return; // Initialize map only once
    }

    const baseLayerDef = BASE_LAYER_DEFINITIONS.find(def => def.id === mapState.baseLayerId) || BASE_LAYER_DEFINITIONS[1];
    const baseLayer = baseLayerDef.createLayer ? baseLayerDef.createLayer() : null;
    const initialLayersForMap = baseLayer ? [baseLayer] : [];
    
    const initialUiLayers: UILayerState[] = [];
    if (baseLayer) {
        const baseLayerId = `base-${baseLayerDef.id}`;
        layerRefs.current[baseLayerId] = baseLayer;
        initialUiLayers.push({
            id: baseLayerId,
            name: baseLayerDef.name,
            visible: true,
            opacity: 1,
        });
    }

    mapState.layers.forEach((layerData, index) => {
        const layerId = `layer-${index}`;
        let olLayer: TileLayer<any> | VectorLayer<any> | null = null;

        if (layerData.type === 'wms' && layerData.url && layerData.layerName) {
            olLayer = new TileLayer({
                source: new TileWMS({
                    url: `${layerData.url}/wms`,
                    params: {
                        'LAYERS': layerData.layerName, 'TILED': true, 'STYLES': layerData.styleName || '', 'VERSION': '1.1.1', 'TRANSPARENT': true,
                    },
                    serverType: 'geoserver',
                }),
                opacity: layerData.opacity,
                visible: layerData.visible,
            });
        } else if (layerData.type === 'wfs' && layerData.url && layerData.layerName) {
            olLayer = new VectorLayer({
                source: new VectorSource({
                    format: new GeoJSON(),
                    url: (extent) => `/api/geoserver-proxy?url=${encodeURIComponent(`${layerData.url}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${layerData.layerName}&outputFormat=application/json&srsname=EPSG:3857&bbox=${extent.join(',')},EPSG:3857`)}`,
                    strategy: bboxStrategy,
                }),
                style: new Style({
                    stroke: new Stroke({ color: '#3399CC', width: 2 }),
                    fill: new Fill({ color: 'rgba(0, 153, 204, 0.2)' }),
                    image: new CircleStyle({
                        radius: 5,
                        fill: new Fill({ color: 'rgba(0, 153, 204, 0.2)' }),
                        stroke: new Stroke({ color: '#3399CC', width: 1.5 })
                    })
                }),
                opacity: layerData.opacity,
                visible: layerData.visible,
            });
        } else if (layerData.type === 'gee' && layerData.geeParams?.tileUrl) {
             olLayer = new TileLayer({
                source: new XYZ({ url: layerData.geeParams.tileUrl, crossOrigin: 'anonymous' }),
                opacity: layerData.opacity,
                visible: layerData.visible,
            });
        }

        if (olLayer) {
            initialLayersForMap.push(olLayer);
            layerRefs.current[layerId] = olLayer;
            initialUiLayers.push({
                id: layerId,
                name: layerData.name,
                visible: layerData.visible,
                opacity: layerData.opacity,
            });
        }
    });

    const map = new Map({
        target: mapElementRef.current,
        layers: initialLayersForMap,
        view: new View({
            center: fromLonLat(mapState.view.center),
            zoom: mapState.view.zoom,
            projection: 'EPSG:3857',
        }),
        controls: defaultControls({ attributionOptions: { collapsible: false } }),
    });

    mapRef.current = map;
    setUiLayers(initialUiLayers);

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }
    };
  }, [mapState]);

  const handleVisibilityChange = (layerId: string, isVisible: boolean) => {
    const olLayer = layerRefs.current[layerId];
    if (olLayer) {
      olLayer.setVisible(isVisible);
      setUiLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: isVisible } : l));
    }
  };

  const handleOpacityChange = (layerId: string, opacity: number) => {
    const olLayer = layerRefs.current[layerId];
    if (olLayer) {
      olLayer.setOpacity(opacity);
      setUiLayers(prev => prev.map(l => l.id === layerId ? { ...l, opacity } : l));
    }
  };

  return (
    <div className="relative w-full h-full">
        <div ref={mapElementRef} className="w-full h-full" />
        <div className="absolute top-16 left-2 z-10 bg-gray-800/80 backdrop-blur-sm text-white p-3 rounded-lg shadow-lg w-64 max-h-[calc(100%-8rem)] flex flex-col">
            <h3 className="text-sm font-semibold mb-2 border-b border-gray-600 pb-2">Capas</h3>
            <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                <div className="space-y-3">
                {uiLayers.map(layer => (
                    <div key={layer.id} className="text-xs">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id={`vis-${layer.id}`}
                                checked={layer.visible}
                                onCheckedChange={(checked) => handleVisibilityChange(layer.id, !!checked)}
                                className="border-gray-400 data-[state=checked]:bg-primary"
                            />
                            <Label htmlFor={`vis-${layer.id}`} className="flex-1 truncate" title={layer.name}>
                                {layer.name}
                            </Label>
                        </div>
                        <div className="mt-1.5 pl-1">
                            <Slider
                                value={[layer.opacity * 100]}
                                onValueChange={(value) => handleOpacityChange(layer.id, value[0] / 100)}
                                className="w-full h-2"
                            />
                        </div>
                    </div>
                ))}
                </div>
            </div>
        </div>
    </div>
  );
};

export default SharedMapClient;
