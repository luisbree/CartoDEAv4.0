
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map, MapBrowserEvent } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import Feature from 'ol/Feature';
import { Circle as CircleStyle, Fill, Stroke, Style, RegularShape } from 'ol/style';
import { useToast } from "@/hooks/use-toast";
import { Geometry, Point, LineString, Polygon, MultiPolygon, MultiLineString } from 'ol/geom';
import Select, { type SelectEvent } from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import DragBox from 'ol/interaction/DragBox';
import { singleClick, never, altKeyOnly, primaryAction, shiftKeyOnly, platformModifierKeyOnly } from 'ol/events/condition';
import type { PlainFeatureData, InteractionToolId } from '@/lib/types';
import { getGeeValueAtPoint } from '@/ai/flows/gee-flow';
import { transform } from 'ol/proj';
import type { GeeValueQueryInput } from '@/ai/flows/gee-types';
import Overlay from 'ol/Overlay';
import { nanoid } from 'nanoid';
import VectorSource from 'ol/source/Vector';


interface UseFeatureInspectionProps {
  mapRef: React.RefObject<Map | null>;
  mapElementRef: React.RefObject<HTMLDivElement | null>;
  isMapReady: boolean;
  activeTool: InteractionToolId | null;
  setActiveTool: (toolId: InteractionToolId | null) => void;
  onNewSelection: () => void;
}

const highlightStyle = new Style({
  stroke: new Stroke({
    color: '#00FFFF', // Cyan
    width: 4,
  }),
  fill: new Fill({
    color: 'rgba(0, 255, 255, 0.2)',
  }),
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: 'rgba(0, 255, 255, 0.4)' }),
    stroke: new Stroke({ color: '#00FFFF', width: 2 }),
  }),
  zIndex: Infinity,
});

// New style for modification vertices (red cross)
const modifyVertexStyle = new Style({
    image: new RegularShape({
        fill: new Fill({ color: 'rgba(255, 0, 0, 0.7)' }),
        stroke: new Stroke({ color: 'rgba(255, 0, 0, 0.7)', width: 1.5 }),
        points: 4,
        radius: 6,
        radius2: 0,
        angle: Math.PI / 4,
    }),
});

const crossStyle = new Style({
    image: new RegularShape({
        fill: new Fill({ color: 'rgba(255, 0, 0, 0.7)' }),
        stroke: new Stroke({ color: 'rgba(255, 0, 0, 0.7)', width: 1.5 }),
        points: 4,
        radius: 6,
        radius2: 0,
        angle: Math.PI / 4,
    }),
});

export const useFeatureInspection = ({
  mapRef,
  mapElementRef,
  isMapReady,
  activeTool,
  setActiveTool,
  onNewSelection,
}: UseFeatureInspectionProps) => {
  const { toast } = useToast();
  const [selectedFeatures, setSelectedFeatures] = useState<Feature<Geometry>[]>([]);
  const [inspectedFeatureData, setInspectedFeatureData] = useState<PlainFeatureData[] | null>([]);
  const [currentInspectedLayerName, setCurrentInspectedLayerName] = useState<string | null>(null);
  
  const rasterQueryOverlaysRef = useRef<Overlay[]>([]);
  const rasterQueryMarkersLayerRef = useRef<VectorLayer<VectorSource<Feature<Point>>> | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  const deleteVertexBoxRef = useRef<DragBox | null>(null);
  
  const onNewSelectionRef = useRef(onNewSelection);
  useEffect(() => {
    onNewSelectionRef.current = onNewSelection;
  }, [onNewSelection]);

  const processAndDisplayFeatures = useCallback((plainData: PlainFeatureData[], layerName: string) => {
    setInspectedFeatureData(plainData);
    setCurrentInspectedLayerName(layerName);
    
    if (plainData && plainData.length > 0) {
       setTimeout(() => toast({ description: `${plainData.length} entidad(es) de "${layerName}" cargada(s) en la tabla.` }), 0);
       onNewSelectionRef.current();
    }
    
  }, [toast]);
  
  const clearRasterQueryVisuals = useCallback(() => {
    if (mapRef.current) {
        rasterQueryOverlaysRef.current.forEach(overlay => mapRef.current!.removeOverlay(overlay));
        rasterQueryOverlaysRef.current = [];
        
        if (rasterQueryMarkersLayerRef.current) {
            rasterQueryMarkersLayerRef.current.getSource()?.clear();
        }
    }
  }, [mapRef]);

  const clearSelection = useCallback(() => {
    if (selectInteractionRef.current) {
      selectInteractionRef.current.getFeatures().clear();
    }
    setSelectedFeatures([]);
    setInspectedFeatureData(null);
    setCurrentInspectedLayerName(null);
    clearRasterQueryVisuals();
  }, [clearRasterQueryVisuals]);

  const selectFeaturesById = useCallback((featureIds: string[]) => {
    if (!selectInteractionRef.current || !mapRef.current) return;

    const featuresToSelect: Feature<Geometry>[] = [];
    mapRef.current.getLayers().forEach(layer => {
        if (layer instanceof VectorLayer) {
            const source = layer.getSource();
            if (source) {
                featureIds.forEach(id => {
                    const feature = source.getFeatureById(id);
                    if (feature) {
                        featuresToSelect.push(feature as Feature<Geometry>);
                    }
                });
            }
        }
    });
    
    selectInteractionRef.current.getFeatures().clear();
    selectInteractionRef.current.getFeatures().extend(featuresToSelect);
    setSelectedFeatures(featuresToSelect);
  }, [mapRef]);
  
  

  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const map = mapRef.current;

    // --- Initialize the query markers layer if it doesn't exist ---
    if (!rasterQueryMarkersLayerRef.current) {
        const markerSource = new VectorSource();
        const markerLayer = new VectorLayer({
            source: markerSource,
            style: crossStyle,
            properties: { id: 'raster-query-markers' }
        });
        rasterQueryMarkersLayerRef.current = markerLayer;
        map.addLayer(markerLayer);
    }

    // --- Cleanup previous interactions ---
    if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
    if (modifyInteractionRef.current) map.removeInteraction(modifyInteractionRef.current);
    if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
    if (deleteVertexBoxRef.current) map.removeInteraction(deleteVertexBoxRef.current);
    selectInteractionRef.current = null;
    modifyInteractionRef.current = null;
    dragBoxInteractionRef.current = null;
    deleteVertexBoxRef.current = null;
    if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';

    // --- Handle tool deactivation ---
    if (!activeTool) {
      clearSelection();
      return;
    }

    // --- Set cursor style based on active tool ---
    if (mapElementRef.current) {
        if (activeTool === 'queryRaster') mapElementRef.current.style.cursor = 'help';
        else if (activeTool === 'modify') mapElementRef.current.style.cursor = 'default';
        else mapElementRef.current.style.cursor = 'crosshair';
    }
    
    // --- Raster Query Logic ---
    if (activeTool === 'queryRaster') {
        const handleRasterQuery = async (e: MapBrowserEvent<any>) => {
            let resultsFound = false;
            toast({ description: "Consultando capas raster..." });
            
            const createAndAddVisuals = (content: string) => {
                // Create text overlay
                const tooltipElement = document.createElement('div');
                tooltipElement.className = 'ol-tooltip ol-tooltip-query';
                tooltipElement.innerHTML = content;
                
                const overlay = new Overlay({
                    element: tooltipElement,
                    offset: [10, -10],
                    positioning: 'bottom-left',
                    position: e.coordinate,
                });

                map.addOverlay(overlay);
                rasterQueryOverlaysRef.current.push(overlay);

                // Create cross marker feature
                if (rasterQueryMarkersLayerRef.current) {
                    const markerFeature = new Feature({
                        geometry: new Point(e.coordinate),
                    });
                    rasterQueryMarkersLayerRef.current.getSource()?.addFeature(markerFeature);
                }
                
                resultsFound = true;
            };

            for (const layer of map.getAllLayers()) {
                if (!layer.getVisible() || !(layer instanceof TileLayer)) continue;
                
                const source = layer.getSource();
                
                // Handle WMS layers
                if (source instanceof TileWMS) {
                    const view = map.getView();
                    const viewResolution = view.getResolution();
                    if (!viewResolution) continue;

                    const url = source.getFeatureInfoUrl(
                        e.coordinate,
                        viewResolution,
                        view.getProjection(),
                        {'INFO_FORMAT': 'application/json', 'FEATURE_COUNT': '1'}
                    );
                    if (url) {
                        const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(url)}`;
                        try {
                            const response = await fetch(proxyUrl);
                            if (response.ok) {
                                const data = await response.json();
                                if (data.features && data.features.length > 0) {
                                    const properties = data.features[0].properties;
                                    let resultText = '';
                                    for (const key in properties) {
                                        // Simple heuristic to find a value-like property
                                        if (typeof properties[key] === 'number' || (typeof properties[key] === 'string' && !isNaN(parseFloat(properties[key])))) {
                                            resultText = `${parseFloat(properties[key]).toFixed(2)}`;
                                            break;
                                        }
                                    }
                                    if (resultText) {
                                      createAndAddVisuals(resultText);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error("Error en GetFeatureInfo:", error);
                        }
                    }
                }
                
                // Handle GEE layers
                const geeParams = layer.get('geeParams') as Omit<GeeValueQueryInput, 'lon' | 'lat'> | undefined;
                if (layer.get('type') === 'gee' && geeParams) {
                    try {
                        const [lon, lat] = transform(e.coordinate, map.getView().getProjection(), 'EPSG:4326');
                        const result = await getGeeValueAtPoint({ ...geeParams, lon, lat });

                        if (result.value !== null && result.value !== undefined) {
                             let valueStr = result.value;
                             if (typeof valueStr === 'number') {
                                valueStr = valueStr.toFixed(4);
                             }
                            createAndAddVisuals(String(valueStr));
                        }
                    } catch (error: any) {
                        console.error("Error querying GEE value:", error);
                    }
                }
            }

            if (!resultsFound) {
                toast({ description: "No se encontraron valores en las capas raster en este punto." });
            }
        };

        map.on('singleclick', handleRasterQuery);
        return () => {
            map.un('singleclick', handleRasterQuery);
            if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';
        };
    }

    // --- Vector Inspection and Selection Logic ---
    if (activeTool === 'inspect' || activeTool === 'selectBox') {
        const select = new Select({
            style: highlightStyle,
            multi: true,
            condition: singleClick, // Selection happens on single click
        });
        selectInteractionRef.current = select;
        map.addInteraction(select);

        select.on('select', (e: SelectEvent) => {
            const currentSelectedFeatures = e.target.getFeatures().getArray();
            setSelectedFeatures(currentSelectedFeatures);

            if (activeTool === 'inspect') {
                const plainData: PlainFeatureData[] = currentSelectedFeatures.map(f => ({
                    id: f.getId() as string,
                    attributes: f.getProperties()
                }));
                processAndDisplayFeatures(plainData, 'Inspección');
            } else if (activeTool === 'selectBox') {
                toast({ description: `${currentSelectedFeatures.length} entidad(es) seleccionada(s).` });
            }
        });
        
        const dragBox = new DragBox({});
        dragBoxInteractionRef.current = dragBox;
        map.addInteraction(dragBox);
    
        dragBox.on('boxend', () => {
            const extent = dragBox.getGeometry().getExtent();
            const featuresInBox: Feature<Geometry>[] = [];
            
            map.getLayers().forEach(layer => {
              if (layer instanceof VectorLayer && layer.getVisible() && !layer.get('isBaseLayer') && !layer.get('isDrawingLayer')) {
                const source = layer.getSource();
                if (source) {
                  source.forEachFeatureIntersectingExtent(extent, (feature) => {
                    featuresInBox.push(feature as Feature<Geometry>);
                  });
                }
              }
            });
          
            const currentSelectedInSelect = select.getFeatures();
            currentSelectedInSelect.clear();
            currentSelectedInSelect.extend(featuresInBox);
          
            setSelectedFeatures(featuresInBox);
            
            if (activeTool === 'inspect') {
              const plainData: PlainFeatureData[] = featuresInBox.map(f => ({
                id: f.getId() as string,
                attributes: f.getProperties()
              }));
              processAndDisplayFeatures(plainData, 'Inspección por área');
            } else {
              toast({ description: `${featuresInBox.length} entidad(es) seleccionada(s).` });
            }
        });
    }

    // --- Vector Modification Logic ---
    if (activeTool === 'modify') {
        // Use an internal, invisible Select interaction to hold the feature being modified.
        const selectForModify = new Select({ style: new Style() });
        selectInteractionRef.current = selectForModify; // Store it for cleanup
        map.addInteraction(selectForModify);

        const selectedFeaturesCollection = selectForModify.getFeatures();

        const modify = new Modify({
            features: selectedFeaturesCollection, // Correctly initialize with a feature collection
            style: modifyVertexStyle,
            deleteCondition: altKeyOnly,
        });
        modifyInteractionRef.current = modify;
        map.addInteraction(modify);

        const deleteVertexBox = new DragBox({ condition: shiftKeyOnly });
        deleteVertexBoxRef.current = deleteVertexBox;
        map.addInteraction(deleteVertexBox);

        const selectAndModify = (e: MapBrowserEvent<any>) => {
            if (platformModifierKeyOnly(e)) { // Ctrl/Cmd click to delete feature
                map.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
                    if (layer instanceof VectorLayer) {
                        const source = layer.getSource();
                        if (source && feature) {
                            try {
                                source.removeFeature(feature);
                                toast({ description: `Entidad eliminada.` });
                                return true; // stop searching
                            } catch (error) {
                                // This can happen if the feature was already removed
                                console.warn("Feature already removed or could not be removed.");
                            }
                        }
                    }
                    return false;
                });
                return;
            }

            // Find feature to modify
             map.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
                if (layer instanceof VectorLayer && !layer.get('isDrawingLayer')) {
                    selectedFeaturesCollection.clear();
                    selectedFeaturesCollection.push(feature);
                    return true;
                }
                return false;
            });
        };

        deleteVertexBox.on('boxend', () => {
            const deleteExtent = deleteVertexBox.getGeometry().getExtent();
            // The Modify interaction source is now the feature collection of the Select interaction
            const featureToModify = selectedFeaturesCollection.getArray()[0];
            if (!featureToModify) return;

            const geometry = featureToModify.getGeometry();
            if (!geometry) return;
            
            let coordinatesChanged = false;

            const processCoordinates = (coords: any[]): any[] => {
                if (!Array.isArray(coords)) return [];
                
                // Check if it's a list of coordinates or a list of rings/paths
                if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                     // It's a single ring or path
                     const newCoords = coords.filter(coord =>
                        !(coord[0] >= deleteExtent[0] && coord[0] <= deleteExtent[2] &&
                          coord[1] >= deleteExtent[1] && coord[1] <= deleteExtent[3])
                    );
                    if (newCoords.length !== coords.length) coordinatesChanged = true;
                    return newCoords;
                } else if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                    // It's a list of rings (Polygon) or paths (MultiLineString)
                    const newRings = coords.map(ring => processCoordinates(ring));
                     // A Polygon ring needs at least 4 points (first=last), a LineString needs at least 2
                    if (geometry instanceof Polygon || geometry instanceof MultiPolygon) {
                        return newRings.filter(ring => ring.length >= 4);
                    } else {
                        return newRings.filter(ring => ring.length >= 2);
                    }
                }
                return coords;
            };

            const newGeometryCoords = processCoordinates(geometry.getCoordinates());
            geometry.setCoordinates(newGeometryCoords, (geometry as any).getLayout());
            
            if (coordinatesChanged) {
                toast({description: `Vértices eliminados.`});
            }
        });
        
        map.on('singleclick', selectAndModify);

        modify.on('modifystart', () => {
            if (mapElementRef.current) mapElementRef.current.style.cursor = 'grabbing';
        });
        modify.on('modifyend', () => {
            if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';
            toast({ description: "Geometría modificada." });
        });

        return () => { // Cleanup for modify tool
            map.un('singleclick', selectAndModify);
            if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
            if (modifyInteractionRef.current) map.removeInteraction(modifyInteractionRef.current);
            if (deleteVertexBoxRef.current) map.removeInteraction(deleteVertexBoxRef.current);
        };
    }

    return () => {
        if (map) {
            if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
            if (modifyInteractionRef.current) map.removeInteraction(modifyInteractionRef.current);
            if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
            if (deleteVertexBoxRef.current) map.removeInteraction(deleteVertexBoxRef.current);
            if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';
        }
    };
  }, [activeTool, isMapReady, mapRef, mapElementRef, processAndDisplayFeatures, toast, clearSelection]);


  return {
    activeTool,
    setActiveTool: (tool) => setActiveTool(tool),
    selectedFeatures,
    inspectedFeatureData,
    currentInspectedLayerName,
    clearSelection,
    processAndDisplayFeatures,
    selectFeaturesById,
  };
};
