'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, ListTree, Eye, EyeOff, ArrowLeft, CloudOff } from 'lucide-react';
import { getMapState } from '@/services/sharing-service';
import type { MapState, MapLayer as AppMapLayer, RemoteSerializableLayer } from '@/lib/types';
import MapView from '@/components/map-view';
import { useOpenLayersMap } from '@/hooks/map-core/useOpenLayersMap';
import { useLayerManager } from '@/hooks/layer-manager/useLayerManager';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { transform } from 'ol/proj';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type { Map } from 'ol';

interface SharedMapClientProps {
    mapId?: string;
    mapState?: MapState | null;
}

const SharedMapClient: React.FC<SharedMapClientProps> = ({ mapId, mapState: initialMapState }) => {
    const { mapRef, setMapInstanceAndElement, isMapReady, drawingSourceRef } = useOpenLayersMap();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [isLoading, setIsLoading] = useState(!initialMapState);
    const [error, setError] = useState<string | null>(null);
    const [displayLayers, setDisplayLayers] = useState<Partial<AppMapLayer>[]>([]);
    
    const { handleAddHybridLayer, addGeeLayerToMap } = useLayerManager({
        mapRef,
        isMapReady,
        drawingSourceRef,
        onShowTableRequest: () => {},
        updateGeoServerDiscoveredLayerState: () => {},
        clearSelectionAfterExtraction: () => {},
        updateInspectedFeatureData: () => {},
    });

    useEffect(() => {
        let isMounted = true;

        const loadMap = async () => {
            if (!isMapReady || !mapRef.current) return;
            
            let finalMapState: MapState | null = initialMapState || null;
            
            if (!finalMapState && mapId && firestore) {
                console.log("Fetching map state from DB for mapId:", mapId);
                try {
                    const stateFromDb = await getMapState(firestore, mapId);
                    if (isMounted) {
                        if (stateFromDb) {
                            finalMapState = stateFromDb;
                        } else {
                            setError('No se pudo encontrar el estado del mapa para este ID.');
                            setIsLoading(false);
                            return;
                        }
                    }
                } catch (err) {
                    if (isMounted) {
                        console.error(err);
                        setError('Ocurrió un error al cargar el mapa compartido.');
                        setIsLoading(false);
                        return;
                    }
                }
            }

            if (!finalMapState) {
                if (isMounted) setIsLoading(false);
                return;
            }

            console.log("Applying map state:", finalMapState);
            const map = mapRef.current;
            const view = map.getView();
            try {
                const center3857 = transform(finalMapState.view.center, 'EPSG:4326', 'EPSG:3857');
                view.setCenter(center3857);
                view.setZoom(finalMapState.view.zoom);
            } catch (viewError) {
                console.error("Error setting map view:", viewError);
            }

            const loadedLayers: Partial<AppMapLayer>[] = [];
            for (const layerState of finalMapState.layers) {
                if (!isMounted) return;

                try {
                    if (layerState.type === 'local') {
                        loadedLayers.push({ id: nanoid(), name: layerState.name, type: 'local-placeholder', visible: false, olLayer: new VectorLayer({ source: new VectorSource() }) });
                        continue;
                    }
                    
                    const remoteLayer = layerState as RemoteSerializableLayer;
                    let newLayer: AppMapLayer | null = null;
                    if ((remoteLayer.type === 'wms' || remoteLayer.type === 'wfs') && remoteLayer.url && remoteLayer.layerName) {
                        newLayer = await handleAddHybridLayer(remoteLayer.layerName, remoteLayer.name, remoteLayer.url, undefined, remoteLayer.styleName || undefined);
                    } else if (remoteLayer.type === 'gee' && remoteLayer.geeParams?.tileUrl) {
                        newLayer = addGeeLayerToMap(remoteLayer.geeParams.tileUrl, remoteLayer.name, remoteLayer.geeParams);
                    }
                    
                    if (newLayer) {
                        newLayer.olLayer.setVisible(remoteLayer.visible);
                        newLayer.olLayer.setOpacity(remoteLayer.opacity);
                        const visualLayer = newLayer.olLayer.get('visualLayer');
                        if (visualLayer) {
                            visualLayer.setVisible(remoteLayer.visible && (remoteLayer.wmsStyleEnabled ?? true));
                            visualLayer.setOpacity(remoteLayer.opacity);
                        }
                        loadedLayers.push({ ...newLayer, visible: remoteLayer.visible, opacity: remoteLayer.opacity, wmsStyleEnabled: remoteLayer.wmsStyleEnabled });
                    }
                } catch (layerError) {
                    console.error(`Failed to load layer "${layerState.name}":`, layerError);
                }
            }

            if (isMounted) {
                setDisplayLayers(loadedLayers.reverse());
                setIsLoading(false);
                console.log("Finished loading all layers. Total:", loadedLayers.length);
            }
        };

        if(isMapReady && (mapId || initialMapState)) {
           loadMap();
        } else if (!mapId && !initialMapState) {
            setIsLoading(false);
            setError("No se proporcionó un ID de mapa o un estado de mapa inicial.");
        }


        return () => {
            isMounted = false;
        };
    }, [isMapReady, mapId, firestore, initialMapState, mapRef, handleAddHybridLayer, addGeeLayerToMap]);


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

    // Render logic
    if (isLoading) {
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
                     <Button asChild variant="link" className="mt-4">
                        <Link href="/">Volver al Editor Principal</Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen bg-gray-800">
            <MapView
                setMapInstanceAndElement={setMapInstanceAndElement}
                activeBaseLayerId={initialMapState?.baseLayerId || 'osm-standard'}
                baseLayerSettings={{ opacity: 1, brightness: 100, contrast: 100 }}
            />
             <div className="absolute top-4 right-4 z-10">
                <Button asChild variant="secondary" className="shadow-lg">
                    <Link href="/">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver al Editor Principal
                    </Link>
                </Button>
            </div>
            <div className="absolute top-4 left-4 z-10 bg-gray-800/80 backdrop-blur-sm text-white rounded-lg shadow-lg max-w-sm w-full border border-gray-700">
                <div className="flex items-center p-3 border-b border-gray-700">
                    <ListTree className="h-5 w-5 mr-3 text-primary" />
                    <h2 className="text-base font-semibold">Capas Compartidas</h2>
                </div>
                <div className="p-2 max-h-[70vh] overflow-y-auto">
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
                                        className={`flex-1 text-xs font-medium truncate ${layer.type === 'local-placeholder' ? 'text-gray-500 italic' : (layer.visible ? "text-white" : "text-gray-400")}`}
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
                </div>
            </div>
        </div>
    );
};

export default SharedMapClient;
