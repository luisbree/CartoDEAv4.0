
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map, MapBrowserEvent } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import type Feature from 'ol/Feature';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useToast } from "@/hooks/use-toast";
import type { Geometry } from 'ol/geom';
import Select, { type SelectEvent } from 'ol/interaction/Select';
import DragBox from 'ol/interaction/DragBox';
import { singleClick, never } from 'ol/events/condition';
import type { PlainFeatureData, InteractionToolId } from '@/lib/types';
import { getGeeValueAtPoint } from '@/ai/flows/gee-flow';
import { transform } from 'ol/proj';
import type { GeeValueQueryInput } from '@/ai/flows/gee-types';
import Overlay from 'ol/Overlay';
import { nanoid } from 'nanoid';


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
  const [rasterQueryOverlays, setRasterQueryOverlays] = useState<Overlay[]>([]);

  const selectInteractionRef = useRef<Select | null>(null);
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  
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
  
  const clearRasterQueryOverlays = useCallback(() => {
    if (mapRef.current) {
        rasterQueryOverlays.forEach(overlay => mapRef.current!.removeOverlay(overlay));
    }
    setRasterQueryOverlays([]);
  }, [rasterQueryOverlays, mapRef]);

  const clearSelection = useCallback(() => {
    if (selectInteractionRef.current) {
      selectInteractionRef.current.getFeatures().clear();
    }
    setSelectedFeatures([]);
    setInspectedFeatureData(null);
    setCurrentInspectedLayerName(null);
    clearRasterQueryOverlays();
  }, [clearRasterQueryOverlays]);

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

    // --- Cleanup previous interactions ---
    if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
    if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
    selectInteractionRef.current = null;
    dragBoxInteractionRef.current = null;
    if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';

    // --- Handle tool deactivation ---
    if (!activeTool) {
      clearSelection();
      return;
    }

    // --- Set cursor style ---
    if (mapElementRef.current) {
        mapElementRef.current.style.cursor = 'crosshair';
    }
    
    // --- Raster Query Logic ---
    if (activeTool === 'queryRaster') {
        const handleRasterQuery = async (e: MapBrowserEvent<any>) => {
            let resultsFound = false;
            toast({ description: "Consultando capas raster..." });
            
            const createAndAddOverlay = (content: string) => {
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
                setRasterQueryOverlays(prev => [...prev, overlay]);
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
                                      createAndAddOverlay(resultText);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error("Error en GetFeatureInfo:", error);
                        }
                    }
                }
                
                // Handle GEE layers
                const geeParams = layer.get('geeParams') as GeeValueQueryInput | undefined;
                if (layer.get('type') === 'gee' && geeParams) {
                    try {
                        const [lon, lat] = transform(e.coordinate, map.getView().getProjection(), 'EPSG:4326');
                        const result = await getGeeValueAtPoint({ ...geeParams, lon, lat });

                        if (result.value !== null && result.value !== undefined) {
                             let valueStr = result.value;
                             if (typeof valueStr === 'number') {
                                valueStr = valueStr.toFixed(4);
                             }
                            createAndAddOverlay(String(valueStr));
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
    const select = new Select({
        style: highlightStyle,
        multi: true,
        condition: singleClick,
        filter: (feature, layer) => layer && !layer.get('isBaseLayer') && !layer.get('isDrawingLayer'),
        useInteractingStyle: false,
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
        } else if (activeTool === 'selectBox' && (e.selected.length > 0 || e.deselected.length > 0)) {
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


    return () => {
        if (map) {
            if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
            if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
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
