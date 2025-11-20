

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
import DragBox, { type DragBoxEvent } from 'ol/interaction/DragBox';
import { singleClick, never, altKeyOnly, primaryAction, shiftKeyOnly, platformModifierKeyOnly } from 'ol/events/condition';
import type { PlainFeatureData, InteractionToolId, VectorMapLayer } from '@/lib/types';
import { getGeeValueAtPoint } from '@/ai/flows/gee-flow';
import { transform, transformExtent } from 'ol/proj';
import type { GeeValueQueryInput } from '@/ai/flows/gee-types';
import Overlay from 'ol/Overlay';
import { nanoid } from 'nanoid';
import VectorSource from 'ol/source/Vector';
import MultiPoint from 'ol/geom/MultiPoint';
import { intersects } from 'ol/extent';
import GeoJSON from 'ol/format/GeoJSON';
import * as turf from '@turf/turf';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import type Layer from 'ol/layer/Layer';


interface UseFeatureInspectionProps {
  mapRef: React.RefObject<Map | null>;
  mapElementRef: React.RefObject<HTMLDivElement | null>;
  isMapReady: boolean;
  activeTool: InteractionToolId | null;
  setActiveTool: (toolId: InteractionToolId | null) => void;
  onNewSelection: (plainData: PlainFeatureData[], layerName: string, layerId: string | null) => void;
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
    geometry: (feature) => {
      const geom = feature.getGeometry();
      if (!geom) return undefined;

      const type = geom.getType();
      let coordinates;

      if (type === 'Polygon') {
          coordinates = (geom as Polygon).getCoordinates()[0]; // Outer ring
      } else if (type === 'LineString') {
          coordinates = (geom as LineString).getCoordinates();
      } else if (type === 'MultiPolygon') {
          coordinates = (geom as MultiPolygon).getPolygons().flatMap(p => p.getCoordinates()[0]);
      } else if (type === 'MultiLineString') {
          coordinates = (geom as MultiLineString).getLineStrings().flatMap(l => l.getCoordinates());
      } else {
          return undefined;
      }
      return new MultiPoint(coordinates);
    },
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
  const [currentInspectedLayerId, setCurrentInspectedLayerId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  
  const rasterQueryOverlaysRef = useRef<Overlay[]>([]);
  const rasterQueryMarkersLayerRef = useRef<VectorLayer<VectorSource<Feature<Point>>> | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  const deleteVertexBoxRef = useRef<DragBox | null>(null);
  const allFeaturesRef = useRef<PlainFeatureData[]>([]);
  
  const onNewSelectionRef = useRef(onNewSelection);
  useEffect(() => {
    onNewSelectionRef.current = onNewSelection;
  }, [onNewSelection]);

  const processAndDisplayFeatures = useCallback((plainData: PlainFeatureData[], layerName: string, layerId: string | null = null) => {
    allFeaturesRef.current = plainData;
    setInspectedFeatureData(plainData); // Set the raw, unsorted data
    setCurrentInspectedLayerName(layerName);
    setCurrentInspectedLayerId(layerId);
    setSortConfig(null); // Reset sort config on new data

    if (plainData && plainData.length > 0) {
        setTimeout(() => toast({ description: `${plainData.length} entidad(es) de "${layerName}" cargada(s) en la tabla.` }), 0);
    }
  }, [toast]);
  
  const updateInspectedFeatureData = useCallback((featureId: string, key: string, value: any) => {
    // Update the full dataset
    const newAllFeatures = allFeaturesRef.current.map(feature => {
        if (feature.id === featureId) {
            return { ...feature, attributes: { ...feature.attributes, [key]: value } };
        }
        return feature;
    });
    allFeaturesRef.current = newAllFeatures;

    // Update the visible data
    setInspectedFeatureData(prevData => {
        if (!prevData) return null;
        return prevData.map(feature => {
            if (feature.id === featureId) {
                return { ...feature, attributes: { ...feature.attributes, [key]: value } };
            }
            return feature;
        });
    });
  }, []);

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
    allFeaturesRef.current = [];
    setCurrentInspectedLayerName(null);
    setCurrentInspectedLayerId(null);
    clearRasterQueryVisuals();
  }, [clearRasterQueryVisuals]);

  const selectFeaturesById = useCallback((featureIds: string[], ctrlOrMeta: boolean, shift: boolean) => {
    if (!selectInteractionRef.current || !mapRef.current) return;

    const featuresToSelect: Feature<Geometry>[] = [];
    let layerToSearch: VectorMapLayer | undefined;

    // Find the layer containing the first feature to optimize search.
    // This assumes all featureIds in the list belong to the same layer.
    if (currentInspectedLayerId) {
      const foundLayer = mapRef.current.getAllLayers().find(l => l.get('id') === currentInspectedLayerId);
      if (foundLayer instanceof VectorLayer) {
        layerToSearch = foundLayer as VectorMapLayer;
      }
    }

    const searchInLayer = (layer: VectorLayer<any>) => {
      const source = layer.getSource();
      if (source) {
        featureIds.forEach(id => {
            const feature = source.getFeatureById(id);
            if (feature && !featuresToSelect.includes(feature as Feature<Geometry>)) {
                featuresToSelect.push(feature as Feature<Geometry>);
            }
        });
      }
    };
    
    if (layerToSearch) {
        searchInLayer(layerToSearch.olLayer);
    } else {
        mapRef.current.getLayers().forEach(layer => {
            if (layer instanceof VectorLayer) {
                searchInLayer(layer);
            }
        });
    }

    if (ctrlOrMeta) { // Add to current selection
        selectInteractionRef.current.getFeatures().extend(featuresToSelect);
    } else if (shift) { // For now, treat shift like a normal click, can be extended
        selectInteractionRef.current.getFeatures().clear();
        selectInteractionRef.current.getFeatures().extend(featuresToSelect);
    }
    else { // Replace selection
        selectInteractionRef.current.getFeatures().clear();
        selectInteractionRef.current.getFeatures().extend(featuresToSelect);
    }
    
    setSelectedFeatures([...selectInteractionRef.current.getFeatures().getArray()]);
  }, [mapRef, currentInspectedLayerId]);
  
  const selectByLayer = useCallback((targetLayerId: string, selectorLayerId: string) => {
      if (!mapRef.current || !selectInteractionRef.current) return;
      const map = mapRef.current;
      
      const targetLayer = map.getAllLayers().find(l => l.get('id') === targetLayerId) as VectorLayer<any> | undefined;
      const selectorLayer = map.getAllLayers().find(l => l.get('id') === selectorLayerId) as VectorLayer<any> | undefined;

      if (!targetLayer || !selectorLayer) {
        toast({ description: "No se pudieron encontrar las capas de análisis.", variant: "destructive" });
        return;
      }
      
      const targetSource = targetLayer.getSource();
      const selectorSource = selectorLayer.getSource();
      if (!targetSource || !selectorSource) return;

      const relevantSelectedFeatures = selectedFeatures.filter(sf => selectorSource.hasFeature(sf));
      const selectorFeatures = (relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : selectorSource.getFeatures());
      
      if (selectorFeatures.length === 0) {
          toast({ description: "La capa selectora no tiene entidades válidas.", variant: "destructive" });
          return;
      }

      toast({ description: `Seleccionando entidades de "${targetLayer.get('name')}"...` });
      
      const geojsonFormat = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      const selectorTurfFeatures = selectorFeatures.map(f => geojsonFormat.writeFeatureObject(f)) as turf.Feature<turf.Polygon | turf.MultiPolygon>[];
      
      const featuresToSelect: Feature<Geometry>[] = [];
      const targetFeatures = targetSource.getFeatures();

      targetFeatures.forEach(targetFeature => {
          const targetGeom = targetFeature.getGeometry();
          if (!targetGeom) return;

          try {
            const targetTurfFeature = geojsonFormat.writeFeatureObject(targetFeature);
            
            // Check if the target feature intersects with ANY of the selector features
            for (const selectorFeature of selectorTurfFeatures) {
                // Use a combination of intersects and within to cover all cases
                const intersects = turf.booleanIntersects(selectorFeature, targetTurfFeature);
                const isWithin = turf.booleanWithin(targetTurfFeature, selectorFeature);

                if (intersects || isWithin) {
                    featuresToSelect.push(targetFeature);
                    return; // Move to the next target feature once a match is found
                }
            }
          } catch(e) {
            console.warn("Error processing a feature during spatial selection:", e);
          }
      });

      selectInteractionRef.current.getFeatures().clear();
      selectInteractionRef.current.getFeatures().extend(featuresToSelect);
      setSelectedFeatures(featuresToSelect);

      toast({ description: `${featuresToSelect.length} entidades seleccionadas.` });

  }, [mapRef, toast, selectedFeatures]);
  
  // --- This is the main effect that manages all interactions ---
  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
        return;
    }

    const map = mapRef.current;
    
    // Store listeners to be able to remove them correctly
    let clickListener: EventsKey | undefined;
    let boxEndListenerKey: EventsKey | undefined;
    let selectListener: EventsKey | undefined;
    let modifyEndListener: EventsKey | undefined;

    // --- Shared cleanup function ---
    const cleanup = () => {
        if (selectInteractionRef.current) {
            if (selectListener) {
                unByKey(selectListener);
                selectListener = undefined;
            }
        }
        if (dragBoxInteractionRef.current) {
            if (boxEndListenerKey) {
                unByKey(boxEndListenerKey);
                boxEndListenerKey = undefined;
            }
            map.removeInteraction(dragBoxInteractionRef.current);
            dragBoxInteractionRef.current = null;
        }
        if (modifyInteractionRef.current) {
            if (modifyEndListener) {
                unByKey(modifyEndListener);
                modifyEndListener = undefined;
            }
            map.removeInteraction(modifyInteractionRef.current);
            modifyInteractionRef.current = null;
        }
        if (mapElementRef.current) {
            mapElementRef.current.style.cursor = 'default';
        }
        if (clickListener) {
            unByKey(clickListener);
            clickListener = undefined;
        }
    };
    
    cleanup(); // Clean up previous tool's effects before setting up the new one

    // --- Initialize shared interactions if they don't exist ---
    if (!rasterQueryMarkersLayerRef.current) {
        const markerSource = new VectorSource();
        rasterQueryMarkersLayerRef.current = new VectorLayer({ source: markerSource, style: crossStyle, properties: { id: 'raster-query-markers' } });
        map.addLayer(rasterQueryMarkersLayerRef.current);
    }
    if (!selectInteractionRef.current) {
        selectInteractionRef.current = new Select({ style: highlightStyle, multi: true });
        map.addInteraction(selectInteractionRef.current);
    }
    selectInteractionRef.current.setActive(false); // Ensure it's off by default

    // --- Tool-specific setup ---
    if (mapElementRef.current) {
        mapElementRef.current.style.cursor = activeTool ? 'crosshair' : 'default';
    }

    if (activeTool === 'inspect') {
        const handleInspectClick = (e: MapBrowserEvent<any>) => {
            const featuresAtPixel: Feature<Geometry>[] = [];
            let layerOfFirstFeature: Layer | undefined;

            map.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
                if (layer instanceof VectorLayer && layer.get('isDrawingLayer') !== true && layer.get('id') !== 'raster-query-markers' && layer.get('isVisualPartner') !== true) {
                    featuresAtPixel.push(feature as Feature<Geometry>);
                    if (!layerOfFirstFeature) {
                        layerOfFirstFeature = layer;
                    }
                }
            });
            
            if (featuresAtPixel.length > 0) {
                const feature = featuresAtPixel[0];
                onNewSelectionRef.current(
                    [{ id: feature.getId() as string, attributes: feature.getProperties() }],
                    layerOfFirstFeature?.get('name') || 'Inspección',
                    layerOfFirstFeature?.get('id') || null
                );
            }
        };

        const inspectDragBox = new DragBox({});
        map.addInteraction(inspectDragBox);
        dragBoxInteractionRef.current = inspectDragBox;

        const boxEndListener = (event: DragBoxEvent) => {
            const extent = inspectDragBox.getGeometry().getExtent();
            const featuresInBox: Feature<Geometry>[] = [];
            let firstLayer: VectorMapLayer | undefined;

            map.getLayers().forEach(layer => {
              if (layer instanceof VectorLayer && layer.getVisible() && layer.get('isDrawingLayer') !== true && layer.get('id') !== 'raster-query-markers' && layer.get('isVisualPartner') !== true) {
                  const source = layer.getSource();
                  if (source) {
                      source.forEachFeatureIntersectingExtent(extent, (feature) => {
                          featuresInBox.push(feature as Feature<Geometry>);
                          if (!firstLayer) {
                              firstLayer = layer as VectorMapLayer;
                          }
                      });
                  }
              }
            });

            if (featuresInBox.length > 0) {
                const plainData = featuresInBox.map(f => ({ id: f.getId() as string, attributes: f.getProperties() }));
                onNewSelectionRef.current(plainData, firstLayer?.get('name') || 'Inspección por Área', firstLayer?.get('id') || null);
            }
        };
        
        clickListener = map.on('singleclick', handleInspectClick);
        boxEndListenerKey = inspectDragBox.on('boxend', boxEndListener);

    } else if (activeTool === 'selectBox') {
        const selectInteraction = selectInteractionRef.current!;
        selectInteraction.setActive(true);

        selectListener = selectInteraction.on('select', (e: SelectEvent) => {
            setSelectedFeatures([...e.target.getFeatures().getArray()]);
        });
        
        const selectDragBox = new DragBox({});
        map.addInteraction(selectDragBox);
        dragBoxInteractionRef.current = selectDragBox;

        const boxEndListener = (event: DragBoxEvent) => {
            const extent = selectDragBox.getGeometry().getExtent();
            const featuresInBox: Feature<Geometry>[] = [];

             map.getLayers().forEach(layer => {
                if (layer instanceof VectorLayer && layer.getVisible() && layer.get('isDrawingLayer') !== true && layer.get('id') !== 'raster-query-markers' && layer.get('isVisualPartner') !== true) {
                    const source = layer.getSource();
                    if (source) {
                        source.forEachFeatureIntersectingExtent(extent, (feature) => {
                            featuresInBox.push(feature as Feature<Geometry>);
                        });
                    }
                }
            });

            if (!platformModifierKeyOnly(event.mapBrowserEvent)) {
                selectInteraction.getFeatures().clear();
            }
            selectInteraction.getFeatures().extend(featuresInBox);
            setSelectedFeatures([...selectInteraction.getFeatures().getArray()]);
        };
        boxEndListenerKey = selectDragBox.on('boxend', boxEndListener);

    } else if (activeTool === 'queryRaster') {
        const handleRasterQuery = async (e: MapBrowserEvent<any>) => {
            let resultsFound = false;
            toast({ description: "Consultando capas raster..." });
            
            const createAndAddVisuals = (content: string) => {
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

                if (rasterQueryMarkersLayerRef.current) {
                    const markerFeature = new Feature({ geometry: new Point(e.coordinate) });
                    rasterQueryMarkersLayerRef.current.getSource()?.addFeature(markerFeature);
                }
                resultsFound = true;
            };

            for (const layer of map.getAllLayers()) {
                if (!layer.getVisible() || !(layer instanceof TileLayer)) continue;
                const source = layer.getSource();
                
                if (source instanceof TileWMS) {
                    const view = map.getView();
                    const viewResolution = view.getResolution();
                    if (!viewResolution) continue;

                    const url = source.getFeatureInfoUrl(
                        e.coordinate, viewResolution, view.getProjection(),
                        {'INFO_FORMAT': 'application/json', 'FEATURE_COUNT': '1'}
                    );
                    if (url) {
                        const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(url)}&cacheBust=${Date.now()}`;
                        try {
                            const response = await fetch(proxyUrl);
                            if (response.ok) {
                                const data = await response.json();
                                if (data.features && data.features.length > 0) {
                                    const properties = data.features[0].properties;
                                    const valueKeys = ['GRAY_INDEX', 'PALETTE_INDEX', 'RED', 'GREEN', 'BLUE'];
                                    const foundKey = valueKeys.find(key => key in properties);
                                    let resultText = '';
                                    if (foundKey) resultText = `${parseFloat(properties[foundKey]).toFixed(2)}`;
                                    if (resultText) createAndAddVisuals(resultText);
                                }
                            }
                        } catch (error) { console.error("Error en GetFeatureInfo:", error); }
                    }
                }
                
                const geeParams = layer.get('geeParams') as Omit<GeeValueQueryInput, 'aoi' | 'zoom' | 'lon' | 'lat'> | undefined;
                if (layer.get('type') === 'gee' && geeParams) {
                    try {
                        const [lon, lat] = transform(e.coordinate, map.getView().getProjection(), 'EPSG:4326');
                        const result = await getGeeValueAtPoint({ ...geeParams, lon, lat });
                        if (result.value !== null && result.value !== undefined) {
                            let valueStr = typeof result.value === 'number' ? result.value.toFixed(4) : String(result.value);
                            createAndAddVisuals(valueStr);
                        }
                    } catch (error: any) { console.error("Error querying GEE value:", error); }
                }
            }
            if (!resultsFound) toast({ description: "No se encontraron valores en las capas raster en este punto." });
        };
        clickListener = map.on('singleclick', handleRasterQuery);

    } else if (activeTool === 'modify') {
        const selectInteraction = selectInteractionRef.current!;
        selectInteraction.setActive(true);
        selectInteraction.style_ = (feature) => [modifyVertexStyle, highlightStyle];

        const selectedFeaturesCollection = selectInteraction.getFeatures();
        
        const modify = new Modify({ features: selectedFeaturesCollection, style: undefined });
        modifyInteractionRef.current = modify;
        map.addInteraction(modify);

        modifyEndListener = modify.on('modifyend', () => toast({ description: "Geometría modificada." }));
    }
    
    return cleanup;
  }, [activeTool, isMapReady, mapRef, mapElementRef, toast, onNewSelectionRef]);


  return {
    activeTool,
    setActiveTool,
    selectedFeatures,
    inspectedFeatureData,
    currentInspectedLayerName,
    currentInspectedLayerId,
    sortConfig,
    setSortConfig,
    clearSelection,
    processAndDisplayFeatures,
    selectFeaturesById,
    updateInspectedFeatureData,
    selectByLayer,
  };
};


    
