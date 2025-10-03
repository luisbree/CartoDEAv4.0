
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ListTree, Eye, EyeOff } from 'lucide-react';
import { getMapState } from '@/services/sharing-service';
import type { MapState, MapLayer } from '@/lib/types';
import MapView, { BASE_LAYER_DEFINITIONS } from '@/components/map-view';
import { useOpenLayersMap } from '@/hooks/map-core/useOpenLayersMap';
import { useLayerManager } from '@/hooks/layer-manager/useLayerManager';
import { useToast } from '@/hooks/use-toast';
import { transform } from 'ol/proj';

interface SharedMapClientProps {
    mapId: string;
}

const SharedMapClient: React.FC<SharedMapClientProps> = ({ mapId }) => {
    const { mapRef, setMapInstanceAndElement, isMapReady, drawingSourceRef } = useOpenLayersMap();
    const { toast } = useToast();
    const [mapState, setMapState] = useState<MapState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // We need a simplified layer manager for the shared view
    const [layers, setLayers] = useState<MapLayer[]>([]);
    const { addLayer, addGeeLayerToMap, handleAddHybridLayer } = useLayerManager({
        mapRef,
        isMapReady,
        drawingSourceRef,
        onShowTableRequest: () => {}, // No-op for shared view
        updateGeoServerDiscoveredLayerState: () => {}, // No-op
        clearSelectionAfterExtraction: () => {}, // No-op
        updateInspectedFeatureData: () => {}, // No-op
    });
    const layerManagerRef = useRef({ addLayer, addGeeLayerToMap, handleAddHybridLayer });
    layerManagerRef.current = { addLayer, addGeeLayerToMap, handleAddHybridLayer };

    useEffect(() => {
        const fetchAndSetState = async () => {
            try {
                const state = await getMapState(mapId);
                if (state) {
                    setMapState(state);
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
        fetchAndSetState();
    }, [mapId]);

    useEffect(() => {
        if (isMapReady && mapState && mapRef.current) {
            const map = mapRef.current;
            const view = map.getView();

            // Set the view
            const center3857 = transform(mapState.view.center, 'EPSG:4326', 'EPSG:3857');
            view.setCenter(center3857);
            view.setZoom(mapState.view.zoom);

            // Set base layer (logic is in MapView component)

            // Load overlay layers
            mapState.layers.forEach(layerState => {
                if (layerState.type === 'wms' || layerState.type === 'wfs') {
                    if (layerState.url && layerState.layerName) {
                        layerManagerRef.current.handleAddHybridLayer(layerState.layerName, layerState.name, layerState.url, undefined, layerState.styleName);
                    }
                } else if (layerState.type === 'gee' && layerState.geeParams) {
                    // This part is tricky as it requires re-running the GEE flow.
                    // For now, we are just noting it. A full implementation would re-call GEE.
                    console.warn("La carga de capas GEE en mapas compartidos no está completamente implementada.");
                }
            });
            
            // This is a workaround to give layers time to be added.
            // A more robust solution would use events.
            setTimeout(() => {
                 setLayers(prev => {
                    const currentLayers = map.getLayers().getArray()
                        .map(olLayer => {
                            const layerId = olLayer.get('id');
                            return prev.find(l => l.id === layerId);
                        })
                        .filter((l): l is MapLayer => !!l);
                    
                    // Apply visibility and opacity from saved state
                    return currentLayers.map(l => {
                        const savedState = mapState.layers.find(sl => sl.name === l.name); // Match by name as ID is new
                        if (savedState) {
                           l.olLayer.setVisible(savedState.visible);
                           l.olLayer.setOpacity(savedState.opacity);
                           return {...l, visible: savedState.visible, opacity: savedState.opacity };
                        }
                        return l;
                    });
                });
            }, 2000);

        }
    }, [isMapReady, mapState, mapRef]);
    
     const handleToggleVisibility = (layerId: string) => {
        setLayers(prev => prev.map(l => {
            if (l.id === layerId) {
                const newVisibility = !l.visible;
                l.olLayer.setVisible(newVisibility);
                const visualLayer = l.olLayer.get('visualLayer');
                if (visualLayer) {
                   visualLayer.setVisible(newVisibility && (l.wmsStyleEnabled ?? false));
                }
                return { ...l, visible: newVisibility };
            }
            return l;
        }));
    };

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
                </div>
            </div>
        );
    }
    
    if (!mapState) {
        return null;
    }

    return (
        <div className="relative h-screen w-screen bg-gray-800">
            <MapView
                setMapInstanceAndElement={setMapInstanceAndElement}
                activeBaseLayerId={mapState.baseLayerId}
                baseLayerSettings={{ opacity: 1, brightness: 100, contrast: 100 }}
            />
            {/* Simplified Legend Panel */}
            <div className="absolute top-4 left-4 z-10 bg-gray-800/80 backdrop-blur-sm text-white rounded-lg shadow-lg max-w-sm w-full border border-gray-700">
                <div className="flex items-center p-3 border-b border-gray-700">
                    <ListTree className="h-5 w-5 mr-3 text-primary" />
                    <h2 className="text-base font-semibold">Capas Compartidas</h2>
                </div>
                <div className="p-2 max-h-[70vh] overflow-y-auto">
                    {layers.length > 0 ? (
                        <ul className="space-y-1.5">
                            {layers.map(layer => (
                                <li key={layer.id} className="flex items-center px-1.5 py-1 rounded-md hover:bg-gray-700/50">
                                    <button
                                      onClick={() => handleToggleVisibility(layer.id)}
                                      className="h-6 w-6 text-white hover:bg-gray-600/80 p-0 mr-2 flex-shrink-0"
                                      title={layer.visible ? "Ocultar capa" : "Mostrar capa"}
                                    >
                                        {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                     <span
                                        className={`flex-1 text-xs font-medium truncate ${layer.visible ? "text-white" : "text-gray-400"}`}
                                        title={layer.name}
                                    >
                                        {layer.name}
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
