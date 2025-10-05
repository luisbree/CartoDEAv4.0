"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ListTree, Eye, EyeOff, CloudOff, ChevronDown } from 'lucide-react';
import { getMapState } from '@/services/sharing-service';
import type { MapState, MapLayer as AppMapLayer, RemoteSerializableLayer } from '@/lib/types';
import MapView from '@/components/map-view';
import { useOpenLayersMap } from '@/hooks/map-core/useOpenLayersMap';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { transform } from 'ol/proj';
import { nanoid } from 'nanoid';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import type { Map } from 'ol';
import { Style } from 'ol/style';
import GeoJSON from 'ol/format/GeoJSON';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from '@/lib/utils';

interface SharedMapClientProps {
    mapId?: string;
    mapState?: MapState | null;
}

const SharedMapClient: React.FC<SharedMapClientProps> = ({ mapId, mapState: initialMapState }) => {
    const { mapRef, setMapInstanceAndElement, isMapReady } = useOpenLayersMap();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [mapState, setMapState] = useState<MapState | null>(initialMapState || null);
    const [isLoading, setIsLoading] = useState(!initialMapState);
    const [error, setError] = useState<string | null>(null);
    const [displayLayers, setDisplayLayers] = useState<Partial<AppMapLayer>[]>([]);
    
    useEffect(() => {
        if (initialMapState || !mapId || !firestore) {
            if (!mapId && !initialMapState) {
                setError("No se proporcionó un ID de mapa.");
                setIsLoading(false);
            }
            return;
        }

        const fetchMapState = async () => {
            setIsLoading(true);
            setError(null);
            console.log("Fetching map state from DB for mapId:", mapId);
            try {
                const stateFromDb = await getMapState(firestore, mapId);
                if (stateFromDb) {
                    setMapState(stateFromDb);
                } else {
                    setError('No se pudo encontrar el estado del mapa para este ID.');
                }
            } catch (err) {
                console.error(err);
                setError('Ocurrió un error al cargar el mapa compartido.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchMapState();
    }, [mapId, firestore, initialMapState]);
    
     useEffect(() => {
        if (!isMapReady || !mapState) return;

        const loadMap = async () => {
            const map = mapRef.current;
            if (!map) return;

            console.log("Applying map state to map...");

            // 1. Set View
            try {
                const view = map.getView();
                const center3857 = transform(mapState.view.center, 'EPSG:4326', 'EPSG:3857');
                view.setCenter(center3857);
                view.setZoom(mapState.view.zoom);
            } catch (viewError) {
                console.error("Error setting map view:", viewError);
            }

            // 2. Load Layers
            const loadedLayers: Partial<AppMapLayer>[] = [];

            for (const layerState of mapState.layers) {
                try {
                    let newLayer: AppMapLayer | null = null;
                    if (layerState.type === 'wfs' && layerState.url && layerState.layerName) {
                        const wfsId = `wfs-layer-${layerState.layerName}-${nanoid()}`;
                        const wmsId = `wms-layer-${layerState.layerName}-${nanoid()}`;
                        
                        const wfsSource = new VectorSource({
                            format: new GeoJSON(),
                            url: (extent) => {
                                const url = `${layerState.url}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${layerState.layerName}&outputFormat=application/json&srsname=EPSG:3857&bbox=${extent.join(',')},EPSG:3857`;
                                return `/api/geoserver-proxy?url=${encodeURIComponent(url)}`;
                            },
                            strategy: bboxStrategy,
                        });

                        const wfsLayer = new VectorLayer({
                            source: wfsSource,
                            style: new Style(), // Initially invisible
                            properties: { id: wfsId, name: layerState.name, gsLayerName: layerState.layerName, serverUrl: layerState.url, styleName: layerState.styleName },
                        });
                        
                        const wmsParams: Record<string, any> = { 'LAYERS': layerState.layerName, 'TILED': true, 'VERSION': '1.1.1' };
                        if (layerState.styleName) wmsParams['STYLES'] = layerState.styleName;
                        
                        const wmsSource = new TileWMS({
                            url: `${layerState.url}/wms`,
                            params: wmsParams,
                            serverType: 'geoserver',
                            transition: 0,
                            crossOrigin: 'anonymous',
                        });

                        const wmsLayer = new TileLayer({
                            source: wmsSource,
                            properties: { id: wmsId, isVisualPartner: true },
                        });

                        wfsLayer.set('visualLayer', wmsLayer);
                        map.addLayer(wmsLayer);
                        
                        newLayer = {
                            id: wfsId,
                            name: layerState.name,
                            olLayer: wfsLayer,
                            visible: true,
                            opacity: 1,
                            type: 'wfs',
                            wmsStyleEnabled: true
                        };
                    } else if (layerState.type === 'gee' && layerState.geeParams?.tileUrl) {
                        const geeSource = new XYZ({ url: layerState.geeParams.tileUrl, crossOrigin: 'anonymous' });
                        const layerId = `gee-${nanoid()}`;
                        const geeLayer = new TileLayer({ source: geeSource, properties: { id: layerId, name: layerState.name } });
                        newLayer = { id: layerId, name: layerState.name, olLayer: geeLayer, visible: true, opacity: 1, type: 'gee' };
                    } else if (layerState.type === 'local') {
                        loadedLayers.push({ id: nanoid(), name: layerState.name, type: 'local-placeholder', visible: false });
                    }

                    if (newLayer) {
                        newLayer.olLayer.setOpacity(layerState.opacity);
                        newLayer.olLayer.setVisible(layerState.visible);
                        newLayer.olLayer.setZIndex(10 + loadedLayers.length); // Ensure it's above base layers
                        const visualLayer = newLayer.olLayer.get('visualLayer');
                        if (visualLayer) {
                            visualLayer.setOpacity(layerState.opacity);
                            visualLayer.setVisible(layerState.visible && layerState.wmsStyleEnabled);
                            visualLayer.setZIndex(5);
                        }
                        map.addLayer(newLayer.olLayer);
                        loadedLayers.push(newLayer);
                    }
                } catch (layerError) {
                    console.error(`Failed to load layer "${layerState.name}":`, layerError);
                }
            }

            // 3. Update UI
            setDisplayLayers(loadedLayers.reverse());
            setIsLoading(false); // Stop loading indicator only after everything is done
            console.log("Finished applying map state.");
        };

        loadMap();

    }, [isMapReady, mapState, mapRef, toast]);
    
    const handleToggleVisibility = useCallback((layerId: string) => {
        setDisplayLayers(prev => prev.map(l => {
            if (l.id === layerId && l.type !== 'local-placeholder' && l.olLayer) {
                const newVisibility = !l.visible;
                l.olLayer.setVisible(newVisibility);
                const visualLayer = l.olLayer.get('visualLayer');
                if (visualLayer) {
                    visualLayer.setVisible(newVisibility && (l.wmsStyleEnabled ?? true));
                }
                return { ...l, visible: newVisibility };
            }
            return l;
        }));
    }, []);

    if (isLoading && !mapState) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-800 text-white">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-lg">Cargando mapa compartido...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                    <h1 className="text-2xl font-bold text-gray-800">Error</h1>
                    <p className="mt-2 text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen bg-gray-800">
            <MapView
                setMapInstanceAndElement={setMapInstanceAndElement}
                activeBaseLayerId={mapState?.baseLayerId || 'osm-standard'}
                baseLayerSettings={{ opacity: 1, brightness: 100, contrast: 100 }}
            />
            <div className="absolute top-4 left-4 z-10 bg-gray-800/80 backdrop-blur-sm text-white rounded-lg shadow-lg max-w-sm w-full border border-gray-700">
                <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
                    <AccordionItem value="item-1" className="border-none">
                        <AccordionTrigger className="p-3 hover:no-underline">
                            <div className="flex items-center">
                                <ListTree className="h-5 w-5 mr-3 text-primary" />
                                <h2 className="text-base font-semibold">Capas Compartidas</h2>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-2 pt-0 max-h-[70vh] overflow-y-auto">
                            {displayLayers.length > 0 ? (
                                <ul className="space-y-1">
                                    {displayLayers.map(layer => (
                                        <li key={layer.id} className="flex items-center px-1.5 py-1.5 rounded-md hover:bg-gray-700/50">
                                            {layer.type === 'local-placeholder' ? (
                                                <div className="h-6 w-6 mr-2 flex-shrink-0 flex items-center justify-center text-gray-500" title="Capa local no disponible">
                                                    <CloudOff className="h-4 w-4" />
                                                </div>
                                            ) : (
                                                <button
                                                  onClick={() => handleToggleVisibility(layer.id!)}
                                                  className="h-6 w-6 text-white hover:bg-gray-600/80 p-0 mr-2 flex-shrink-0"
                                                  title={layer.visible ? "Ocultar capa" : "Mostrar capa"}
                                                >
                                                    {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                </button>
                                            )}
                                             <span
                                                className={cn("flex-1 text-xs font-medium truncate", layer.type === 'local-placeholder' ? 'text-gray-500 italic' : (layer.visible ? "text-white" : "text-gray-400"))}
                                                title={layer.name}
                                            >
                                                {layer.name} {layer.type === 'local-placeholder' && "(local)"}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                 <p className="text-xs text-center text-gray-400 py-3">No hay capas en este mapa.</p>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    );
};

export default SharedMapClient;
