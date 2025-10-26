
"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import type Feature from 'ol/Feature';
import { Geometry, LineString, Point, Polygon } from 'ol/geom';
import { useToast } from "@/hooks/use-toast";
import { findSentinel2Footprints } from '@/services/sentinel';
import { findLandsatFootprints } from '@/services/landsat';
import type { MapLayer, VectorMapLayer, PlainFeatureData, LabelOptions, StyleOptions, GraduatedSymbology, CategorizedSymbology, GeoTiffStyle, LayerGroup } from '@/lib/types';
import { nanoid } from 'nanoid';
import { Style, Stroke, Fill, Circle as CircleStyle, Text as TextStyle } from 'ol/style';
import type { StyleLike } from 'ol/style/Style';
import { transformExtent } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { download as downloadShp } from 'shpjs';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import type { GeeValueQueryInput } from '@/ai/flows/gee-types';
import { ToastAction } from '@/components/ui/toast';
import { saveFileWithPicker } from '@/services/download-service';
import { writeArrayBuffer } from 'geotiff';
import { getGeeGeoTiffDownloadUrl } from '@/ai/flows/gee-flow';


interface UseLayerManagerProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  onShowTableRequest: (plainData: PlainFeatureData[], layerName: string, layerId: string) => void;
  updateGeoServerDiscoveredLayerState: (layerName: string, added: boolean, type: 'wfs' | 'wms') => void;
  clearSelectionAfterExtraction: () => void;
  updateInspectedFeatureData: (featureId: string, key: string, value: any) => void;
}

const WMS_LAYER_Z_INDEX = 5;
const LAYER_START_Z_INDEX = 10;

const colorMap: { [key: string]: string } = {
  rojo: '#e63946',
  verde: '#2a9d8f',
  azul: '#0077b6',
  amarillo: '#ffbe0b',
  naranja: '#f4a261',
  violeta: '#8338ec',
  negro: '#000000',
  blanco: '#ffffff',
  gris: '#adb5bd',
  cian: '#00ffff',
  magenta: '#ff00ff',
  transparent: 'rgba(0,0,0,0)',
};

const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

// --- Color Interpolation Helpers (for GeoTIFF) ---
function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [0, 0, 0];
}

function generateColorRamp(startHex: string, endHex: string): (string | number)[] {
    const startRgb = hexToRgb(startHex);
    const endRgb = hexToRgb(endHex);
    
    // Format for ol/style/expressions: ['interpolate', ['linear'], ['band', 1], min, [r,g,b], max, [r,g,b]]
    // We just need the color arrays
    return [
      ...startRgb, 1,
      ...endRgb, 1,
    ];
}

const COLOR_RAMP_DEFINITIONS: Record<Exclude<any, 'custom'>, { start: string, end: string }> = {
  reds: { start: '#fee5d9', end: '#a50f15' },
  blues: { start: '#eff3ff', end: '#08519c' },
  greens: { start: '#edf8e9', end: '#006d2c' },
  viridis: { start: '#440154', end: '#fde725' },
  pinks: { start: '#ffcce1', end: '#c70063'},
};


// Centralized function to create the final style for a layer
const createStyleFunction = (
  baseStyleOrFn: StyleLike | null | undefined,
  labelOptions: LabelOptions | undefined,
  graduatedSymbology: GraduatedSymbology | undefined,
  categorizedSymbology: CategorizedSymbology | undefined
): StyleLike => {
  const isLabelEnabled = labelOptions?.enabled && labelOptions.labelParts.length > 0;

  // Case 1: No complex styling, just return the simple base style
  if (!isLabelEnabled && !graduatedSymbology && !categorizedSymbology) {
    return baseStyleOrFn || new Style(); // Return a default empty style if null
  }

  // Case 2: We have labels or complex symbology, so we need a style function
  return (feature, resolution) => {
    let baseStyle: Style | Style[];

    // Determine the base style
    if (graduatedSymbology) {
        const value = feature.get(graduatedSymbology.field);
        let fillColor = 'rgba(128,128,128,0.5)'; // Default gray for invalid values
        if (typeof value === 'number') {
            fillColor = graduatedSymbology.colors[graduatedSymbology.colors.length - 1]; // Default to last color
            for (let i = 0; i < graduatedSymbology.breaks.length; i++) {
                if (value <= graduatedSymbology.breaks[i]) {
                    fillColor = graduatedSymbology.colors[i];
                    break;
                }
            }
        }
        
        const strokeColor = colorMap[graduatedSymbology.strokeColor] || (isValidHex(graduatedSymbology.strokeColor) ? graduatedSymbology.strokeColor : 'rgba(0,0,0,0.5)');
        const strokeWidth = graduatedSymbology.strokeWidth ?? 1;

        baseStyle = new Style({
            fill: new Fill({ color: fillColor }),
            stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: strokeColor, width: 1 }),
            }),
        });
    } else if (categorizedSymbology) {
        const value = feature.get(categorizedSymbology.field);
        const category = categorizedSymbology.categories.find(c => c.value === value);
        const fillColor = category ? category.color : 'rgba(128,128,128,0.5)'; // Default gray if value not in categories
        
        const strokeColor = colorMap[categorizedSymbology.strokeColor] || (isValidHex(categorizedSymbology.strokeColor) ? categorizedSymbology.strokeColor : 'rgba(0,0,0,0.5)');
        const strokeWidth = categorizedSymbology.strokeWidth ?? 1;

        baseStyle = new Style({
            fill: new Fill({ color: fillColor }),
            stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: strokeColor, width: 1 }),
            }),
        });
    } else {
        const style = typeof baseStyleOrFn === 'function' ? baseStyleOrFn(feature, resolution) : baseStyleOrFn;
        baseStyle = Array.isArray(style) ? style[0] : style || new Style();
    }
    
    // If labels are not enabled, just return the calculated base style
    if (!isLabelEnabled) {
      return baseStyle;
    }

    // Clone the base style(s) to add labels without modifying the original
    const styleToClone = Array.isArray(baseStyle) ? baseStyle[0] : baseStyle;
    if (!(styleToClone instanceof Style)) return baseStyle;
    const finalStyle = styleToClone.clone();

    // --- Label Logic ---
    const labelText = labelOptions.labelParts.map(part => {
        if (part.type === 'field') return feature.get(part.value) || '';
        if (part.type === 'newline') return '\n';
        return part.value;
    }).join('');

    if (!labelText) {
        return finalStyle;
    }
    
    const textColor = colorMap[labelOptions.textColor] || (isValidHex(labelOptions.textColor) ? labelOptions.textColor : '#000000');
    const outlineColor = colorMap[labelOptions.outlineColor] || (isValidHex(labelOptions.outlineColor) ? labelOptions.outlineColor : '#FFFFFF');
    const geometry = feature.getGeometry();
    const geometryType = geometry?.getType();

    const textStyle = new TextStyle({
        text: labelText,
        font: `${labelOptions.fontSize}px ${labelOptions.fontFamily}`,
        fill: new Fill({ color: textColor }),
        stroke: new Stroke({ color: outlineColor, width: 2.5 }),
        textAlign: geometryType === 'Point' ? 'left' : 'center',
        textBaseline: 'middle',
        offsetX: geometryType === 'Point' ? 10 : 0,
        offsetY: -labelOptions.offsetY,
        placement: labelOptions.placement === 'parallel' && (geometryType === 'LineString' || geometryType === 'MultiLineString') ? 'line' : 'point',
        overflow: labelOptions.overflow,
    });

    finalStyle.setText(textStyle);
    return finalStyle;
  };
};


export const useLayerManager = ({
  mapRef,
  isMapReady,
  drawingSourceRef,
  onShowTableRequest,
  updateGeoServerDiscoveredLayerState,
  clearSelectionAfterExtraction,
  updateInspectedFeatureData,
}: UseLayerManagerProps) => {
  const [layers, setLayersInternal] = useState<(MapLayer | LayerGroup)[]>([]);
  const { toast } = useToast();
  const [isFindingSentinelFootprints, setIsFindingSentinelFootprints] = useState(false);
  const [isFindingLandsatFootprints, setIsFindingLandsatFootprints] = useState(false);
  const [isDrawingSourceEmptyOrNotPolygon, setIsDrawingSourceEmptyOrNotPolygon] = useState(true);
  const [isWfsLoading, setIsWfsLoading] = useState(false);
  const [lastRemovedLayers, setLastRemovedLayers] = useState<(MapLayer | LayerGroup)[]>([]);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const setLayers = useCallback((updater: React.SetStateAction<(MapLayer | LayerGroup)[]>) => {
      setLayersInternal(prevItems => {
          const newItems = typeof updater === 'function' ? updater(prevItems) : updater;
  
          // Flatten the list to get all operational layers for z-index calculation
          const operationalLayers: MapLayer[] = [];
          newItems.forEach(item => {
              if ('layers' in item) { // It's a group
                  operationalLayers.push(...item.layers);
              } else { // It's a layer
                  operationalLayers.push(item);
              }
          });
  
          const layer_count = operationalLayers.filter(l => l.type !== 'wms').length;
  
          operationalLayers.forEach(layer => {
              const zIndex = layer.olLayer.getZIndex();
              let newZIndex = zIndex;
  
              if (layer.type === 'wms') {
                  newZIndex = WMS_LAYER_Z_INDEX;
              } else {
                  const operationalIndex = operationalLayers.filter(l => l.type !== 'wms').findIndex(opLayer => opLayer.id === layer.id);
                  if (operationalIndex !== -1) {
                      newZIndex = LAYER_START_Z_INDEX + (layer_count - 1 - operationalIndex);
                  }
              }
  
              if (zIndex !== newZIndex) {
                  layer.olLayer.setZIndex(newZIndex);
              }
          });
  
          return newItems;
      });
  }, []);

  // Effect to check the state of the drawing source
  useEffect(() => {
    const source = drawingSourceRef.current;
    if (!source) return;

    const checkDrawingSource = () => {
      const features = source.getFeatures();
      if (features.length === 0) {
        setIsDrawingSourceEmptyOrNotPolygon(true);
        return;
      }
      const hasPolygon = features.some(f => f.getGeometry()?.getType() === 'Polygon');
      setIsDrawingSourceEmptyOrNotPolygon(!hasPolygon);
    };

    source.on('addfeature', checkDrawingSource);
    source.on('removefeature', checkDrawingSource);
    source.on('clear', checkDrawingSource);

    // Initial check
    checkDrawingSource();

    return () => {
      source.un('addfeature', checkDrawingSource);
      source.un('removefeature', checkDrawingSource);
      source.on('clear', checkDrawingSource);
    };
  }, [drawingSourceRef]);
  
  // Cleanup playback interval on unmount
  useEffect(() => {
      return () => {
          if (playbackIntervalRef.current) {
              clearInterval(playbackIntervalRef.current);
          }
      };
  }, []);

  const addLayer = useCallback((newLayer: MapLayer, bringToTop: boolean = true) => {
    if (!mapRef.current) return;
    mapRef.current.addLayer(newLayer.olLayer);
    
    setLayers(prev => {
        if (bringToTop) {
            return [newLayer, ...prev];
        } else {
            return [...prev, newLayer];
        }
    });

  }, [mapRef, setLayers]);
  
  const addGeeLayerToMap = useCallback((tileUrl: string, layerName: string, geeParams: Omit<GeeValueQueryInput, 'aoi' | 'zoom' | 'lon' | 'lat'> & { metadata?: any }) => {
    if (!mapRef.current) return;

    const layerId = `gee-${nanoid()}`;
    
    const geeSource = new XYZ({
      url: tileUrl,
      crossOrigin: 'anonymous',
    });

    const fullGeeParams = { ...geeParams, tileUrl };

    const geeLayer = new TileLayer({
      source: geeSource,
      properties: {
        id: layerId,
        name: layerName,
        type: 'gee',
        geeParams: fullGeeParams,
      },
    });

    addLayer({
      id: layerId,
      name: layerName,
      olLayer: geeLayer,
      visible: true,
      opacity: 0.6,
      type: 'gee'
    }, true);
    
    setTimeout(() => toast({ description: `Capa de Google Earth Engine "${layerName}" añadida.` }), 0);

    // Show metadata in attributes panel if available
    if (geeParams.metadata) {
      // GEE metadata is already a plain object. We can create a fake PlainFeatureData.
      const plainData: PlainFeatureData[] = [{
        id: nanoid(), // Give it a unique ID for the table
        attributes: geeParams.metadata,
      }];
      onShowTableRequest(plainData, `${layerName} - Metadatos`, layerId);
    }
  }, [mapRef, addLayer, toast, onShowTableRequest]);
  

  const handleAddHybridLayer = useCallback(async (layerName: string, layerTitle: string, serverUrl: string, bbox?: [number, number, number, number], styleName?: string, isInitiallyVisible: boolean = true, initialOpacity: number = 0.7, useWmsStyle: boolean = true): Promise<MapLayer | null> => {
    if (!isMapReady || !mapRef.current) return null;
    const map = mapRef.current;

    try {
        const cleanedServerUrl = serverUrl.replace(/\/wms\/?$|\/wfs\/?$/i, '');
        const wfsId = `wfs-layer-${layerName}-${nanoid()}`;

        const wfsSource = new VectorSource({
            format: new GeoJSON(),
            url: (extent) => {
                const wfsUrl = `${cleanedServerUrl}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${layerName}&outputFormat=application/json&srsname=EPSG:3857&bbox=${extent.join(',')},EPSG:3857`;
                return `/api/geoserver-proxy?url=${encodeURIComponent(wfsUrl)}`;
            },
            strategy: bboxStrategy,
        });

        wfsSource.on('featuresloadstart', () => setIsWfsLoading(true));
        wfsSource.on('featuresloadend', (event) => {
            console.log(`DEBUG: WFS features loaded for ${layerName}:`, event.features?.length);
            setIsWfsLoading(false);
        });
        wfsSource.on('featuresloaderror', () => setIsWfsLoading(false));

        const wfsLayer = new VectorLayer({
            source: wfsSource,
            style: useWmsStyle ? new Style() : undefined,
            properties: { id: wfsId, name: layerTitle, type: 'wfs', gsLayerName: layerName, serverUrl: cleanedServerUrl, styleName },
            visible: isInitiallyVisible,
            zIndex: LAYER_START_Z_INDEX
        });
        
        if (bbox) {
            wfsLayer.set('bbox', bbox);
        }
        
        const wmsId = `wms-layer-${layerName}-${nanoid()}`;
        const wmsParams: Record<string, any> = { 
            'LAYERS': layerName, 
            'TILED': true, 
            'VERSION': '1.1.1', 
            'TRANSPARENT': true, 
        };
        if (styleName && styleName.trim() !== '') {
            wmsParams['STYLES'] = styleName;
        }

        console.log(`DEBUG: Creating WMS layer for ${layerName} with URL: ${cleanedServerUrl}/wms and params:`, wmsParams);

        const wmsSource = new TileWMS({
            url: `${cleanedServerUrl}/wms`,
            params: wmsParams,
            serverType: 'geoserver',
            transition: 0,
            crossOrigin: 'anonymous',
        });

        const wmsLayer = new TileLayer({
            source: wmsSource,
            properties: { id: wmsId, name: `${layerTitle} (Visual)`, isVisualPartner: true, partnerId: wfsId },
            zIndex: WMS_LAYER_Z_INDEX,
            opacity: initialOpacity,
            visible: isInitiallyVisible && useWmsStyle,
        });
        
        map.addLayer(wmsLayer);
        wfsLayer.set('visualLayer', wmsLayer);

        const newLayer: MapLayer = {
            id: wfsId,
            name: layerTitle,
            olLayer: wfsLayer,
            visible: isInitiallyVisible,
            opacity: initialOpacity,
            type: 'wfs',
            wmsStyleEnabled: useWmsStyle,
        };

        addLayer(newLayer, true);
        
        // Force initial data load for the current view
        wfsSource.loadFeatures(map.getView().calculateExtent());

        updateGeoServerDiscoveredLayerState(layerName, true, 'wfs');
        setTimeout(() => toast({ description: `Capa "${layerTitle}" añadida.` }), 0);

        return newLayer;

    } catch (error: any) {
        console.error("Error adding hybrid layer:", error);
        setTimeout(() => toast({ description: `Error al añadir capa: ${error.message}`, variant: 'destructive' }), 0);
        return null;
    }
  }, [isMapReady, mapRef, addLayer, updateGeoServerDiscoveredLayerState, toast]);

  const undoRemove = useCallback(() => {
      if (!mapRef.current || lastRemovedLayers.length === 0) return;
      const map = mapRef.current;
      const layersToRestore = lastRemovedLayers;

      layersToRestore.forEach(item => {
          if ('layers' in item) { // It's a group
              item.layers.forEach(layer => {
                  map.addLayer(layer.olLayer);
                  const visualLayer = layer.olLayer.get('visualLayer');
                  if (visualLayer) map.addLayer(visualLayer);
              });
          } else { // It's a single layer
              map.addLayer(item.olLayer);
              const visualLayer = item.olLayer.get('visualLayer');
              if (visualLayer) map.addLayer(visualLayer);
          }
      });
      
      setLayers(prev => [...layersToRestore, ...prev]);
      setLastRemovedLayers([]); // Clear the undo buffer

      toast({ description: `${layersToRestore.length} item(s) restaurado(s).` });
  }, [mapRef, lastRemovedLayers, toast, setLayers]);


  const removeLayers = useCallback((itemIds: string[]) => {
    let removedItems: (MapLayer | LayerGroup)[] = [];
    
    setLayers(prevItems => {
        if (!mapRef.current || itemIds.length === 0) return prevItems;
        const map = mapRef.current;

        const itemsToRemove = prevItems.filter(item => itemIds.includes(item.id));
        if (itemsToRemove.length === 0) return prevItems;
        
        removedItems = itemsToRemove;

        itemsToRemove.forEach(item => {
            if ('layers' in item) { // It's a group
                item.layers.forEach(layer => {
                    map.removeLayer(layer.olLayer);
                    const visualLayer = layer.olLayer.get('visualLayer');
                    if (visualLayer) map.removeLayer(visualLayer);
                });
            } else { // It's a single layer
                map.removeLayer(item.olLayer);
                const visualLayer = item.olLayer.get('visualLayer');
                if (visualLayer) map.removeLayer(visualLayer);
                
                const gsLayerName = item.olLayer.get('gsLayerName');
                if (gsLayerName && (item.type === 'wms' || item.type === 'wfs')) {
                    updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wms');
                    updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wfs');
                }
            }
        });
        
        return prevItems.filter(l => !itemIds.includes(l.id));
    });
    
    setTimeout(() => {
        if (removedItems.length > 0) {
            setLastRemovedLayers(removedItems);
            const description = removedItems.length === 1
                ? `Item "${removedItems[0].name}" eliminado.`
                : `${removedItems.length} item(s) eliminado(s).`;
            
            toast({ description });
        }
    }, 100);

  }, [mapRef, toast, updateGeoServerDiscoveredLayerState, setLayers]);

  const removeLayer = useCallback((layerId: string) => {
    removeLayers([layerId]);
  }, [removeLayers]);

  const reorderLayers = useCallback((draggedIds: string[], targetId: string | null) => {
    setLayers(prevLayers => {
        const layersToMove = prevLayers.filter(l => draggedIds.includes(l.id));
        const remainingLayers = prevLayers.filter(l => !draggedIds.includes(l.id));
        
        let targetIndex = remainingLayers.findIndex(l => l.id === targetId);
        if (targetId === null) {
            targetIndex = remainingLayers.length;
        }

        if (targetIndex === -1) {
            return prevLayers; // Should not happen if targetId is valid
        }
        
        remainingLayers.splice(targetIndex, 0, ...layersToMove);
        
        if (layersToMove.length > 0) {
            setTimeout(() => {
                toast({ description: `${layersToMove.length} item(s) reordenado(s).` });
            }, 0);
        }

        return remainingLayers;
    });
  }, [toast, setLayers]);
  
 const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(currentItems => {
        return currentItems.map(item => {
            // Case 1: The item is a group, and the target layer is inside it.
            if ('layers' in item && item.layers.some(l => l.id === layerId)) {
                const group = item;
                const newLayers = group.layers.map(layer => {
                    let newVisibility = layer.visible;
                    if (group.displayMode === 'single') {
                        // In single mode, turn on the clicked layer and turn off all others.
                        newVisibility = layer.id === layerId;
                    } else if (layer.id === layerId) {
                        // In multiple mode, just toggle the clicked layer.
                        newVisibility = !layer.visible;
                    }

                    // Apply visibility to the OpenLayers layer object.
                    layer.olLayer.setVisible(newVisibility);
                    const visualLayer = layer.olLayer.get('visualLayer');
                    if (visualLayer) {
                        visualLayer.setVisible(newVisibility && (layer.wmsStyleEnabled ?? true));
                    }
                    
                    return { ...layer, visible: newVisibility };
                });
                return { ...group, layers: newLayers };
            }
            // Case 2: The item is a standalone layer.
            else if (!('layers' in item) && item.id === layerId) {
                const layer = item;
                const newVisibility = !layer.visible;
                layer.olLayer.setVisible(newVisibility);
                const visualLayer = layer.olLayer.get('visualLayer');
                if (visualLayer) {
                    visualLayer.setVisible(newVisibility && (layer.wmsStyleEnabled ?? true));
                }
                return { ...layer, visible: newVisibility };
            }
            // Case 3: The item is not relevant, return it as is.
            return item;
        });
    });
}, [setLayers]);


  const toggleWmsStyle = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => {
        if ('layers' in l) return l; // Skip groups
        if (l.id === layerId && l.type === 'wfs') {
            const newWmsStyleEnabled = !(l.wmsStyleEnabled ?? true);
            const visualLayer = l.olLayer.get('visualLayer');
            const vectorLayer = l.olLayer as VectorLayer<any>;
            
            if (visualLayer) {
                visualLayer.setVisible(l.visible && newWmsStyleEnabled);
            }
            
            if (newWmsStyleEnabled) {
                // If WMS style is ON, hide the vector style
                vectorLayer.setStyle(new Style());
            } else {
                // If WMS style is OFF, restore the custom style
                const baseStyle = vectorLayer.get('originalStyle');
                const labelOptions = vectorLayer.get('labelOptions');
                const graduatedSymbology = l.graduatedSymbology;
                const categorizedSymbology = l.categorizedSymbology;
                const restoredStyle = createStyleFunction(baseStyle, labelOptions, graduatedSymbology, categorizedSymbology);
                vectorLayer.setStyle(restoredStyle);
            }

            return { ...l, wmsStyleEnabled: newWmsStyleEnabled };
        }
        return l;
    }));
  }, [setLayers]);

  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setLayers(prev => prev.map(l => {
      if ('layers' in l) return l;
      if (l.id === layerId) {
        l.olLayer.setOpacity(opacity);
         // Also set opacity for the visual partner layer if it exists
         const visualLayer = l.olLayer.get('visualLayer');
         if (visualLayer) {
             visualLayer.setOpacity(opacity);
         }
        return { ...l, opacity };
      }
      return l;
    }));
  }, [setLayers]);

  const changeLayerStyle = useCallback((layerId: string, styleOptions: StyleOptions) => {
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer) return;

    const olLayer = layer.olLayer;
    const existingStyle = (olLayer.get('originalStyle') || olLayer.getStyle()) as StyleLike | undefined;
    let baseStyle: Style;

    if (existingStyle instanceof Style) {
        baseStyle = existingStyle.clone();
    } else {
        baseStyle = new Style({
            stroke: new Stroke({ color: '#3399CC', width: 2 }),
            fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
                stroke: new Stroke({ color: '#3399CC', width: 1.5 })
            })
        });
    }

    const stroke = baseStyle.getStroke() ?? new Stroke();
    const fill = baseStyle.getFill() ?? new Fill();
    const image = baseStyle.getImage() instanceof CircleStyle ? (baseStyle.getImage() as CircleStyle).clone() : new CircleStyle({
        radius: 5,
        fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
        stroke: new Stroke({ color: '#3399CC', width: 1.5 })
    });
    
    // Apply new style options
    const strokeColorValue = colorMap[styleOptions.strokeColor.toLowerCase()] || (isValidHex(styleOptions.strokeColor) ? styleOptions.strokeColor : undefined);
    if (strokeColorValue) {
      stroke.setColor(strokeColorValue);
      image.getStroke()?.setColor(strokeColorValue);
    }

    const fillColorValue = colorMap[styleOptions.fillColor.toLowerCase()] || (isValidHex(styleOptions.fillColor) ? styleOptions.fillColor : undefined);
    if (fillColorValue) {
      fill.setColor(fillColorValue);
      image.getFill()?.setColor(fillColorValue);
    }
    
    stroke.setWidth(styleOptions.lineWidth);
    image.getStroke()?.setWidth(styleOptions.lineWidth);
    image.setRadius(styleOptions.pointSize);
    let lineDash: number[] | undefined;
    if (styleOptions.lineStyle === 'dashed') lineDash = [10, 10];
    else if (styleOptions.lineStyle === 'dotted') lineDash = [1, 5];
    stroke.setLineDash(lineDash);

    const newSimpleStyle = new Style({ stroke, fill, image });
    olLayer.set('originalStyle', newSimpleStyle);
    olLayer.set('graduatedSymbology', undefined); // Clear graduated symbology
    olLayer.set('categorizedSymbology', undefined); // Clear categorized symbology

    const finalStyle = createStyleFunction(newSimpleStyle, olLayer.get('labelOptions'), undefined, undefined);
    olLayer.setStyle(finalStyle);

    setLayers(prev => prev.map(l => {
      if ('layers' in l) return l; // It's a group, don't modify it directly
      return l.id === layerId ? { ...l, graduatedSymbology: undefined, categorizedSymbology: undefined } : l
    }));
    setTimeout(() => toast({ description: `Estilo de la capa "${layer.name}" actualizado.` }), 0);

  }, [layers, toast, setLayers]);

  const changeLayerLabels = useCallback((layerId: string, labelOptions: LabelOptions) => {
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer) return;

    const olLayer = layer.olLayer;
    olLayer.set('labelOptions', labelOptions); // Store options

    if (!olLayer.get('originalStyle')) {
      olLayer.set('originalStyle', olLayer.getStyle());
    }

    const baseStyle = olLayer.get('originalStyle');
    const graduatedSymbology = layer.graduatedSymbology;
    const categorizedSymbology = layer.categorizedSymbology;

    const finalStyle = createStyleFunction(baseStyle, labelOptions, graduatedSymbology, categorizedSymbology);
    olLayer.setStyle(finalStyle);
    
    olLayer.getSource()?.changed(); // Force redraw
    toast({ description: `Etiquetas ${labelOptions.enabled ? 'activadas' : 'desactivadas'} para "${layer.name}".` });
  }, [layers, toast]);

  const applyGraduatedSymbology = useCallback((layerId: string, symbology: GraduatedSymbology) => {
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer) return;

    const olLayer = layer.olLayer;
    const labelOptions = olLayer.get('labelOptions');
    olLayer.set('graduatedSymbology', symbology);
    olLayer.set('categorizedSymbology', undefined); // Clear other complex symbology

    // Create and apply the new style function that combines symbology and labels
    const finalStyle = createStyleFunction(null, labelOptions, symbology, undefined);
    olLayer.setStyle(finalStyle);
    olLayer.set('originalStyle', olLayer.getStyle()); // Store the new function as the base

    setLayers(prev => prev.map(l => {
      if ('layers' in l) return l;
      return l.id === layerId ? { ...l, graduatedSymbology: symbology, categorizedSymbology: undefined } : l;
    }));
    setTimeout(() => toast({ description: `Simbología graduada aplicada a "${layer.name}".` }), 0);
  }, [layers, toast, setLayers]);
  
  const applyCategorizedSymbology = useCallback((layerId: string, symbology: CategorizedSymbology) => {
      const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId) as VectorMapLayer | undefined;
      if (!layer) return;
  
      const olLayer = layer.olLayer;
      const labelOptions = olLayer.get('labelOptions');
      olLayer.set('categorizedSymbology', symbology);
      olLayer.set('graduatedSymbology', undefined); // Clear other complex symbology
  
      const finalStyle = createStyleFunction(null, labelOptions, undefined, symbology);
      olLayer.setStyle(finalStyle);
      olLayer.set('originalStyle', olLayer.getStyle());
  
      setLayers(prev => prev.map(l => {
        if ('layers' in l) return l;
        return l.id === layerId ? { ...l, categorizedSymbology: symbology, graduatedSymbology: undefined } : l;
      }));
      setTimeout(() => toast({ description: `Simbología por categorías aplicada a "${layer.name}".` }), 0);
  }, [layers, toast, setLayers]);

  const applyGeoTiffStyle = useCallback((layerId: string, style: GeoTiffStyle) => {
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId);
    if (!layer || !(layer.olLayer instanceof WebGLTileLayer)) return;
    
    const olLayer = layer.olLayer as WebGLTileLayer;
    
    let startColor = '#ffffff', endColor = '#000000';
    if (style.colorRamp === 'custom' && style.customColors) {
        startColor = style.customColors.start;
        endColor = style.customColors.end;
    } else if (style.colorRamp !== 'custom') {
        startColor = COLOR_RAMP_DEFINITIONS[style.colorRamp].start;
        endColor = COLOR_RAMP_DEFINITIONS[style.colorRamp].end;
    }
    
    const colorExpression = [
        'case',
        ['==', ['band', style.band], 0], // Check for nodata value (assuming it's 0)
        [0, 0, 0, 0], // Output transparent if nodata
        [   // Else, apply the color ramp
            'interpolate',
            ['linear'],
            ['band', style.band],
            style.min,
            hexToRgb(startColor),
            style.max,
            hexToRgb(endColor),
        ]
    ];

    olLayer.setStyle({
        color: colorExpression,
    });

    setLayers(prev => prev.map(l => {
      if ('layers' in l) return l;
      return l.id === layerId ? { ...l, geoTiffStyle: style } : l;
    }));
    toast({ description: `Estilo aplicado a la capa "${layer.name}".` });
  }, [layers, toast, setLayers]);

  const zoomToLayerExtent = useCallback((layerId: string) => {
    if (!mapRef.current) return;
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId);
    if (!layer) return;

    let extent: number[] | undefined;
    
    // PRIORITIZE the bbox from GetCapabilities if it exists (more reliable)
    const bbox4326 = layer.olLayer.get('bbox');
    if (bbox4326) {
        try {
            extent = transformExtent(bbox4326, 'EPSG:4326', 'EPSG:3857');
        } catch (e) {
            console.error("Error transforming authoritative BBOX:", e);
        }
    }

    // FALLBACK to calculating from loaded features if no bbox is available
    if (!extent && layer.olLayer instanceof VectorLayer) {
        const source = layer.olLayer.getSource();
        if (source && source.getFeatures().length > 0) {
            extent = source.getExtent();
        }
    }

    if (extent && extent.every(isFinite) && (extent[2] - extent[0] > 0.000001) && (extent[3] - extent[1] > 0.000001)) {
         mapRef.current.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 1000,
            maxZoom: 16,
        });
    } else {
        setTimeout(() => toast({ description: "La capa no tiene entidades cargadas en la vista actual para hacer zoom." }), 0);
    }
  }, [mapRef, layers, toast]);

  const handleShowLayerTable = useCallback((layerId: string) => {
    const layer = layers.flatMap(item => 'layers' in item ? item.layers : item).find(l => l.id === layerId);
    if (!layer) {
      setTimeout(() => toast({ description: "No se pudo encontrar la capa." }), 0);
      return;
    }

    if (layer.olLayer instanceof VectorLayer) {
        const source = layer.olLayer.getSource();
        if (source) {
            const features = source.getFeatures();
            if (features.length > 0) {
                const plainData: PlainFeatureData[] = features.map(feature => ({
                    id: feature.getId() as string,
                    attributes: feature.getProperties(),
                }));
                onShowTableRequest(plainData, layer.name, layer.id);
            } else {
                setTimeout(() => toast({ description: `La capa "${layer.name}" no tiene entidades para mostrar en la tabla.` }), 0);
            }
        }
    } else if (layer.type === 'gee' && layer.olLayer.get('geeParams')?.metadata) {
      // Handle metadata for GEE layers
      const metadata = layer.olLayer.get('geeParams').metadata;
      const plainData: PlainFeatureData[] = [{
        id: nanoid(), // Give it a unique ID for the table
        attributes: metadata,
      }];
      onShowTableRequest(plainData, `${layer.name} - Metadatos`, layer.id);
    } else {
        setTimeout(() => toast({ description: "Solo se puede mostrar la tabla de atributos para capas vectoriales o capas GEE con metadatos." }), 0);
    }
  }, [layers, onShowTableRequest, toast]);

  const renameLayer = useCallback((layerId: string, newName: string) => {
      setLayers(prev =>
          prev.map(item => {
              if (item.id === layerId && !('layers' in item)) {
                  item.olLayer.set('name', newName);
                  return { ...item, name: newName };
              } else if ('layers' in item) { // Check inside groups
                  return {
                      ...item,
                      layers: item.layers.map(layer => {
                          if (layer.id === layerId) {
                              layer.olLayer.set('name', newName);
                              return { ...layer, name: newName };
                          }
                          return layer;
                      })
                  };
              }
              return item;
          })
      );
      setTimeout(() => {
          toast({ description: `Capa renombrada a "${newName}"` });
      }, 0);
  }, [toast, setLayers]);
  
  const handleExtractByPolygon = useCallback((layerIdToExtract: string, onSuccess?: () => void) => {
    const targetLayer = layers.flatMap(i => 'layers' in i ? i.layers : i).find(l => l.id === layerIdToExtract) as VectorMapLayer | undefined;
    const drawingFeatures = drawingSourceRef.current?.getFeatures() ?? [];
    const polygonFeature = drawingFeatures.find(f => f.getGeometry()?.getType() === 'Polygon');

    if (!targetLayer || !polygonFeature) {
        setTimeout(() => toast({ description: "Se requiere una capa vectorial y un polígono dibujado." }), 0);
        return;
    }
    const polygonGeometry = polygonFeature.getGeometry();
    if (!polygonGeometry) return;

    const targetSource = targetLayer.olLayer.getSource();
    if (!targetSource) return;

    const intersectingFeatures = targetSource.getFeatures().filter(feature => {
        const featureGeometry = feature.getGeometry();
        return featureGeometry && polygonGeometry.intersectsExtent(featureGeometry.getExtent());
    });

    if (intersectingFeatures.length === 0) {
        setTimeout(() => toast({ description: "No se encontraron entidades dentro del polígono." }), 0);
        return;
    }
    
    const newSourceName = `Extracción de ${targetLayer.name}`;
    const newSource = new VectorSource({ features: intersectingFeatures.map(f => f.clone()) });
    const newLayerId = `extract-${targetLayer.id}-${nanoid()}`;
    const newOlLayer = new VectorLayer({
        source: newSource,
        properties: { id: newLayerId, name: newSourceName, type: 'vector' },
        style: targetLayer.olLayer.getStyle()
    });
    
    addLayer({
        id: newLayerId,
        name: newSourceName,
        olLayer: newOlLayer,
        visible: true,
        opacity: 1,
        type: 'vector'
    }, true);

    setTimeout(() => toast({ description: `${intersectingFeatures.length} entidades extraídas a una nueva capa.` }), 0);
    onSuccess?.();
        
  }, [drawingSourceRef, layers, addLayer, toast]);
  
  const handleExtractBySelection = useCallback((selectedFeaturesForExtraction: Feature<Geometry>[], onSuccess?: () => void) => {
    if (selectedFeaturesForExtraction.length === 0) {
        setTimeout(() => toast({ description: "No hay entidades seleccionadas para extraer." }), 0);
        return;
    }

    const clonedFeatures = selectedFeaturesForExtraction.map(f => {
        const clone = f.clone();
        clone.setStyle(undefined); // Crucial: Remove the highlight style from the clone
        if (f.getId()) clone.setId(f.getId());
        return clone;
    });
    
    let style;
    let originalLayerName = 'Selección';
    const firstFeature = selectedFeaturesForExtraction[0];

    if (firstFeature) {
      for (const item of layers) {
        if (!('layers' in item)) { // It's a MapLayer
          const layer = item as VectorMapLayer;
          const source = layer.olLayer.getSource();
          if (source && firstFeature.getId() && source.getFeatureById(firstFeature.getId())) {
            style = layer.olLayer.getStyle();
            originalLayerName = layer.name;
            break;
          }
        }
      }
    }

    const newSourceName = `Extraidas_${originalLayerName}`;
    const newLayerId = `extract-sel-${nanoid()}`;
    const newSource = new VectorSource({ features: clonedFeatures });
    const newOlLayer = new VectorLayer({
        source: newSource,
        properties: { id: newLayerId, name: newSourceName, type: 'vector' },
        style: style
    });

    addLayer({
        id: newLayerId,
        name: newSourceName,
        olLayer: newOlLayer,
        visible: true,
        opacity: 1,
        type: 'vector'
    }, true);

    setTimeout(() => toast({ description: `${clonedFeatures.length} entidades extraídas a la capa "${newSourceName}".` }), 0);
    
    clearSelectionAfterExtraction();
    onSuccess?.();
        
  }, [addLayer, layers, toast, clearSelectionAfterExtraction]);
  
  const handleExportLayer = useCallback(async (layerId: string, format: 'geojson' | 'kml' | 'shp') => {
    const layer = layers.flatMap(i => 'layers' in i ? i.layers : i).find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer || !(layer.olLayer instanceof VectorLayer)) {
      setTimeout(() => toast({ description: "Solo se pueden exportar capas vectoriales." }), 0);
      return;
    }
    const source = layer.olLayer.getSource();
    if (!source || source.getFeatures().length === 0) {
      setTimeout(() => toast({ description: "La capa no tiene entidades para exportar." }), 0);
      return;
    }
    const features = source.getFeatures();
    const layerName = layer.name.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    try {
        const writeOptions = {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
            decimals: 7,
        };

        if (format === 'geojson' || format === 'kml') {
            const textData = format === 'geojson'
                ? new GeoJSON().writeFeatures(features, writeOptions)
                : new KML({ extractStyles: true, showPointNames: true }).writeFeatures(features, writeOptions);
            
            await saveFileWithPicker({
                fileContent: textData,
                suggestedName: `${layerName}.${format}`,
                fileType: format,
            });

        } else if (format === 'shp') {
            const geojson = new GeoJSON().writeFeaturesObject(features, writeOptions);
            const options = {
                folder: layerName,
                types: {
                    point: layerName + '_puntos',
                    polygon: layerName + '_poligonos',
                    line: layerName + '_lineas',
                }
            };
            downloadShp(geojson, options); // shpjs handles its own download
        } else {
            return;
        }
      
      setTimeout(() => toast({ description: `Preparando descarga de "${layer.name}" como ${format.toUpperCase()}.` }), 0);
    } catch (error: any) {
      console.error(`Error exporting as ${format}:`, error);
      if (error.name !== 'AbortError') {
        setTimeout(() => toast({ description: `Error al exportar la capa como ${format.toUpperCase()}.`, variant: "destructive" }), 0);
      }
    }
  }, [layers, toast]);

  const findSentinel2FootprintsInCurrentView = useCallback(async (dateRange?: { startDate?: string; completionDate?: string }) => {
    if (!mapRef.current) return;
    setIsFindingSentinelFootprints(true);
    try {
        const view = mapRef.current.getView();
        const extent = view.calculateExtent(mapRef.current.getSize()!);
        const features = await findSentinel2Footprints(extent, view.getProjection(), dateRange?.startDate, dateRange?.completionDate);
        
        if (features.length === 0) {
            setTimeout(() => toast({ description: "No se encontraron escenas de Sentinel-2 en la vista actual para el rango de fechas especificado." }), 0);
            return;
        }
        
        let existingLayer = layers.find(l => 'olLayer' in l && l.id === 'sentinel-footprints') as VectorMapLayer | undefined;
        if (existingLayer) {
            existingLayer.olLayer.getSource()?.clear();
            existingLayer.olLayer.getSource()?.addFeatures(features);
            setTimeout(() => toast({ description: `Capa de Sentinel-2 actualizada con ${features.length} footprints.` }), 0);
        } else {
            const sentinelSource = new VectorSource({ features });
            const sentinelLayer = new VectorLayer({
                source: sentinelSource,
                style: new Style({
                    stroke: new Stroke({ color: 'rgba(255, 0, 255, 1.0)', width: 2 }),
                    fill: new Fill({ color: 'rgba(255, 0, 255, 0.1)' }),
                }),
                properties: { id: 'sentinel-footprints', name: 'Footprints Sentinel-2', type: 'sentinel' }
            });
            
            addLayer({
                id: 'sentinel-footprints',
                name: 'Footprints Sentinel-2',
                olLayer: sentinelLayer,
                visible: true,
                opacity: 1,
                type: 'sentinel'
            });
            setTimeout(() => toast({ description: `${features.length} footprints de Sentinel-2 añadidos al mapa.` }), 0);
        }
    } catch (error: any) {
        console.error("Error finding Sentinel-2 footprints:", error);
        setTimeout(() => toast({ description: `Error al buscar escenas: ${error.message}` }), 0);
    } finally {
        setIsFindingSentinelFootprints(false);
    }
  }, [mapRef, toast, addLayer, layers]);

  const clearSentinel2FootprintsLayer = useCallback(() => {
    const sentinelLayer = layers.find(l => 'olLayer' in l && l.id === 'sentinel-footprints');
    if (sentinelLayer) {
        removeLayer(sentinelLayer.id);
    } else {
        setTimeout(() => toast({ description: "No hay capa de footprints de Sentinel-2 para limpiar." }), 0);
    }
  }, [layers, removeLayer, toast]);

  const findLandsatFootprintsInCurrentView = useCallback(async (dateRange?: { startDate?: string; completionDate?: string }) => {
    if (!mapRef.current) return;
    setIsFindingLandsatFootprints(true);
    try {
        const view = mapRef.current.getView();
        const extent = view.calculateExtent(mapRef.current.getSize()!);
        const features = await findLandsatFootprints(extent, view.getProjection(), dateRange?.startDate, dateRange?.completionDate);
        
        if (features.length === 0) {
            setTimeout(() => toast({ description: "No se encontraron escenas de Landsat en la vista actual para el rango de fechas especificado." }), 0);
            return;
        }

        let existingLayer = layers.find(l => 'olLayer' in l && l.id === 'landsat-footprints') as VectorMapLayer | undefined;
        if (existingLayer) {
            existingLayer.olLayer.getSource()?.clear();
            existingLayer.olLayer.getSource()?.addFeatures(features);
            setTimeout(() => toast({ description: `Capa de Landsat actualizada con ${features.length} footprints.` }), 0);
        } else {
            const landsatSource = new VectorSource({ features });
            const landsatLayer = new VectorLayer({
                source: landsatSource,
                style: new Style({
                    stroke: new Stroke({ color: 'rgba(255, 255, 0, 1.0)', width: 2 }),
                    fill: new Fill({ color: 'rgba(255, 255, 0, 0.1)' }),
                }),
                properties: { id: 'landsat-footprints', name: 'Footprints Landsat', type: 'landsat' }
            });

            addLayer({
                id: 'landsat-footprints',
                name: 'Footprints Landsat',
                olLayer: landsatLayer,
                visible: true,
                opacity: 1,
                type: 'landsat'
            });
            setTimeout(() => toast({ description: `${features.length} footprints de Landsat añadidos al mapa.` }), 0);
        }
    } catch (error: any) {
        console.error("Error finding Landsat footprints:", error);
        setTimeout(() => toast({ description: `Error al buscar escenas de Landsat: ${error.message}` }), 0);
    } finally {
        setIsFindingLandsatFootprints(false);
    }
  }, [mapRef, toast, addLayer, layers]);

  const clearLandsatFootprintsLayer = useCallback(() => {
    const landsatLayer = layers.find(l => 'olLayer' in l && l.id === 'landsat-footprints');
    if (landsatLayer) {
        removeLayer(landsatLayer.id);
    } else {
        setTimeout(() => toast({ description: "No hay capa de footprints de Landsat para limpiar." }), 0);
    }
  }, [layers, removeLayer, toast]);
  
  const updateFeatureAttribute = useCallback((featureId: string, key: string, value: any) => {
      const layer = layers.flatMap(i => 'layers' in i ? i.layers : i).find(l => 
          l.olLayer instanceof VectorLayer && l.olLayer.getSource()?.getFeatureById(featureId)
      ) as VectorMapLayer | undefined;
  
      if (layer) {
          const feature = layer.olLayer.getSource()?.getFeatureById(featureId);
          if (feature) {
              feature.set(key, value);
              updateInspectedFeatureData(featureId, key, value);
              toast({ description: `Atributo "${key}" actualizado.` });
          }
      }
  }, [layers, toast, updateInspectedFeatureData]);
  
  const addFieldToLayer = useCallback((layerId: string, fieldName: string, defaultValue: any) => {
    const layer = layers.flatMap(i => 'layers' in i ? i.layers : i).find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (layer) {
        const source = layer.olLayer.getSource();
        source?.getFeatures().forEach(feature => {
            feature.set(fieldName, defaultValue);
        });
        // This forces the attributes panel to re-render with the new column by re-fetching the data
        handleShowLayerTable(layer.id);
        toast({ description: `Campo "${fieldName}" añadido a la capa "${layer.name}".` });
    } else {
        toast({ description: "No se pudo encontrar la capa activa para añadir el campo.", variant: 'destructive' });
    }
  }, [layers, toast, handleShowLayerTable]);
  
  const handleExportWmsAsGeotiff = useCallback(async (layerId: string) => {
    const layer = layers.flatMap(i => 'layers' in i ? i.layers : i).find(l => l.id === layerId);
    if (!layer || !mapRef.current) return;

    if (layer.type === 'gee') {
        const geeParams = layer.olLayer.get('geeParams');
        if (!geeParams || !geeParams.bandCombination) {
            toast({ description: "La capa GEE no tiene los parámetros necesarios para la exportación.", variant: "destructive" });
            return;
        }

        toast({ description: "Iniciando exportación de GeoTIFF desde GEE..." });

        const view = mapRef.current.getView();
        const extent = view.calculateExtent(mapRef.current.getSize()!);
        const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');
        
        try {
            const result = await getGeeGeoTiffDownloadUrl({
                aoi: { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] },
                bandCombination: geeParams.bandCombination,
                // Pass other relevant params from the original layer if they exist
                startDate: geeParams.startDate,
                endDate: geeParams.endDate,
                minElevation: geeParams.minElevation,
                maxElevation: geeParams.maxElevation,
            });
    
            if (result?.downloadUrl) {
                window.open(result.downloadUrl, '_blank');
                toast({ description: "Descarga de GeoTIFF iniciada." });
            } else {
                throw new Error("No se recibió una URL de descarga del servidor.");
            }
        } catch(error: any) {
            console.error("Error exporting GEE layer as GeoTIFF:", error);
            toast({ title: "Error de Exportación", description: error.message, variant: "destructive" });
        }

    } else {
        // Fallback for generic WMS or other types if needed in the future
        toast({ description: 'La exportación directa de esta capa a GeoTIFF no está implementada. Use las herramientas de GEE.', variant: 'default', duration: 5000 });
    }
}, [layers, mapRef, toast]);

const groupLayers = useCallback((layerIds: string[], groupName: string) => {
    setLayers(prevItems => {
        const layersToGroup: MapLayer[] = [];
        layerIds.forEach(id => {
            const item = prevItems.find(item => item.id === id && !('layers' in item));
            if (item) {
                layersToGroup.push(item as MapLayer);
            }
        });

        if (layersToGroup.length === 0) return prevItems;

        const remainingItems = prevItems.filter(item => !layerIds.includes(item.id));
        
        const groupId = `group-${nanoid()}`;
        const newGroup: LayerGroup = {
            id: groupId,
            name: groupName,
            layers: layersToGroup.map(l => {
                // Ensure layer visibility is true when moving into a multi-select group
                l.olLayer.setVisible(true);
                const visualLayer = l.olLayer.get('visualLayer');
                if (visualLayer) visualLayer.setVisible(true && (l.wmsStyleEnabled ?? true));
                return { ...l, groupId: groupId, visible: true };
            }),
            isExpanded: true,
            displayMode: 'multiple',
            isPlaying: false,
            playSpeed: 1000,
        };

        const firstLayerIndex = prevItems.findIndex(item => item.id === layersToGroup[0].id);
        
        remainingItems.splice(firstLayerIndex, 0, newGroup);
        
        return remainingItems;
    });
    toast({ description: `Grupo "${groupName}" creado con ${layerIds.length} capas.` });
}, [setLayers, toast]);


  const ungroupLayer = useCallback((groupId: string) => {
    setLayers(prevItems => {
        const newItems: (MapLayer | LayerGroup)[] = [];
        const groupToUngroup = prevItems.find(item => item.id === groupId) as LayerGroup | undefined;

        if (!groupToUngroup) return prevItems;

        prevItems.forEach(item => {
            if (item.id === groupId) {
                // When ungrouping, remove the groupId from the layers
                const ungroupedLayers = groupToUngroup.layers.map(l => ({ ...l, groupId: undefined }));
                newItems.push(...ungroupedLayers);
            } else {
                newItems.push(item);
            }
        });
        return newItems;
    });
    toast({ description: `Grupo "${(layers.find(l => l.id === groupId) as LayerGroup)?.name}" desagrupado.` });
  }, [layers, setLayers, toast]);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setLayers(prev => prev.map(item =>
        item.id === groupId && 'layers' in item
            ? { ...item, isExpanded: !item.isExpanded }
            : item
    ));
  }, [setLayers]);

  const setGroupDisplayMode = useCallback((groupId: string, mode: 'single' | 'multiple') => {
      setLayers(prev => prev.map(item => {
          if (item.id === groupId && 'layers' in item) {
              const updatedGroup = { ...item, displayMode: mode };
              // If switching to single mode, ensure only one layer is visible
              if (mode === 'single') {
                  let firstVisibleFound = false;
                  updatedGroup.layers = updatedGroup.layers.map(layer => {
                      const shouldBeVisible = !firstVisibleFound;
                      if (layer.visible && shouldBeVisible) {
                          firstVisibleFound = true;
                          return layer; // Keep it visible
                      } else {
                          // Turn off this layer
                          layer.olLayer.setVisible(false);
                          const visualLayer = layer.olLayer.get('visualLayer');
                          if (visualLayer) visualLayer.setVisible(false);
                          return { ...layer, visible: false };
                      }
                  });
                   // If no layer was visible to begin with, make the first one visible
                   if (!firstVisibleFound && updatedGroup.layers.length > 0) {
                       const firstLayer = updatedGroup.layers[0];
                       firstLayer.olLayer.setVisible(true);
                       const visualLayer = firstLayer.olLayer.get('visualLayer');
                       if (visualLayer) visualLayer.setVisible(true && (firstLayer.wmsStyleEnabled ?? true));
                       updatedGroup.layers[0] = { ...firstLayer, visible: true };
                   }
              }
              return updatedGroup;
          }
          return item;
      }));
  }, [setLayers]);

   const renameGroup = useCallback((groupId: string, newName: string) => {
        setLayers(prev => prev.map(item =>
            (item.id === groupId && 'layers' in item)
                ? { ...item, name: newName }
                : item
        ));
        toast({ description: `Grupo renombrado a "${newName}"` });
    }, [setLayers, toast]);
    
    const toggleGroupPlayback = useCallback((groupId: string) => {
        setLayers(prev => {
            return prev.map(item => {
                if (item.id === groupId && 'layers' in item) {
                    const group = item as LayerGroup;
                    const newIsPlaying = !group.isPlaying;
                    
                    if (newIsPlaying) {
                        const speed = group.playSpeed || 1000;
                        playbackIntervalRef.current = setInterval(() => {
                            setLayers(current => {
                                const currentGroup = current.find(i => i.id === groupId) as LayerGroup;
                                if (!currentGroup || currentGroup.layers.length === 0) {
                                    clearInterval(playbackIntervalRef.current!);
                                    return current;
                                }
                                const visibleIndex = currentGroup.layers.findIndex(l => l.visible);
                                const nextIndex = (visibleIndex + 1) % currentGroup.layers.length;
                                
                                const newGroupLayers = currentGroup.layers.map((layer, index) => {
                                    const isVisible = index === nextIndex;
                                    layer.olLayer.setVisible(isVisible);
                                    return {...layer, visible: isVisible};
                                });
                                return current.map(i => i.id === groupId ? {...currentGroup, layers: newGroupLayers} : i);
                            });
                        }, speed);
                    } else {
                        if (playbackIntervalRef.current) {
                            clearInterval(playbackIntervalRef.current);
                            playbackIntervalRef.current = null;
                        }
                    }
                    return { ...group, isPlaying: newIsPlaying };
                }
                return item;
            });
        });
    }, [setLayers]);
    
    const setGroupPlaySpeed = useCallback((groupId: string, speed: number) => {
        setLayers(prev => prev.map(item => {
            if (item.id === groupId && 'layers' in item) {
                const group = item as LayerGroup;
                // If it's already playing, restart the interval with the new speed
                if (group.isPlaying) {
                    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
                    
                    playbackIntervalRef.current = setInterval(() => {
                        setLayers(current => {
                            const currentGroup = current.find(i => i.id === groupId) as LayerGroup;
                            if (!currentGroup || currentGroup.layers.length === 0) {
                                clearInterval(playbackIntervalRef.current!);
                                return current;
                            }
                            const visibleIndex = currentGroup.layers.findIndex(l => l.visible);
                            const nextIndex = (visibleIndex + 1) % currentGroup.layers.length;
                             const newGroupLayers = currentGroup.layers.map((layer, index) => {
                                const isVisible = index === nextIndex;
                                layer.olLayer.setVisible(isVisible);
                                return {...layer, visible: isVisible};
                            });
                            return current.map(i => i.id === groupId ? {...currentGroup, layers: newGroupLayers} : i);
                        });
                    }, speed);
                }
                return { ...group, playSpeed: speed };
            }
            return item;
        }));
    }, [setLayers]);


  return {
    layers,
    addLayer,
    addGeeLayerToMap,
    handleAddHybridLayer,
    removeLayer,
    removeLayers,
    undoRemove,
    lastRemovedLayers,
    reorderLayers,
    toggleLayerVisibility,
    toggleWmsStyle,
    setLayerOpacity,
    changeLayerStyle,
    changeLayerLabels,
    applyGraduatedSymbology,
    applyCategorizedSymbology,
    applyGeoTiffStyle,
    zoomToLayerExtent,
    handleShowLayerTable,
    renameLayer,
    isDrawingSourceEmptyOrNotPolygon,
    handleExtractByPolygon,
    handleExtractBySelection,
    handleExportLayer,
    handleExportWmsAsGeotiff,
    findSentinel2FootprintsInCurrentView,
    isFindingSentinelFootprints,
    clearSentinel2FootprintsLayer,
    findLandsatFootprintsInCurrentView,
    isFindingLandsatFootprints,
    clearLandsatFootprintsLayer,
    isWfsLoading,
    updateFeatureAttribute,
    addFieldToLayer,
    groupLayers,
    ungroupLayer,
    toggleGroupExpanded,
    setGroupDisplayMode,
    renameGroup,
    toggleGroupPlayback,
    setGroupPlaySpeed,
  };
};

    

    