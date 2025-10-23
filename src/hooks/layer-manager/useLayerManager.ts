

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
import type { MapLayer, VectorMapLayer, PlainFeatureData, LabelOptions, StyleOptions, GraduatedSymbology, CategorizedSymbology, GeoTiffStyle } from '@/lib/types';
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


interface UseLayerManagerProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  onShowTableRequest: (plainData: PlainFeatureData[], layerName: string, layerId: string) => void;
  updateGeoServerDiscoveredLayerState: (layerName: string, added: boolean, type: 'wms' | 'wfs') => void;
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
  const [layers, setLayersInternal] = useState<MapLayer[]>([]);
  const { toast } = useToast();
  const [isFindingSentinelFootprints, setIsFindingSentinelFootprints] = useState(false);
  const [isFindingLandsatFootprints, setIsFindingLandsatFootprints] = useState(false);
  const [isDrawingSourceEmptyOrNotPolygon, setIsDrawingSourceEmptyOrNotPolygon] = useState(true);
  const [isWfsLoading, setIsWfsLoading] = useState(false);
  const [lastRemovedLayers, setLastRemovedLayers] = useState<MapLayer[]>([]);

  const setLayers = useCallback((updater: React.SetStateAction<MapLayer[]>) => {
      setLayersInternal(prevLayers => {
          const newLayers = typeof updater === 'function' ? updater(prevLayers) : updater;
  
          // --- Start of zIndex logic ---
          // All layers that are not WMS are "operational" and their zIndex is determined by their order in the list.
          const operationalLayers = newLayers.filter(l => l.type !== 'wms');
          const layer_count = operationalLayers.length;
  
          newLayers.forEach(layer => {
              const zIndex = layer.olLayer.getZIndex();
              let newZIndex = zIndex;
  
              if (layer.type === 'wms') {
                  newZIndex = WMS_LAYER_Z_INDEX;
              } else {
                  const operationalIndex = operationalLayers.findIndex(opLayer => opLayer.id === layer.id);
                  if (operationalIndex !== -1) {
                      newZIndex = LAYER_START_Z_INDEX + (layer_count - 1 - operationalIndex);
                  }
              }
  
              if (zIndex !== newZIndex) {
                  layer.olLayer.setZIndex(newZIndex);
              }
          });
          // --- End of zIndex logic ---
  
          return newLayers;
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

  const addGeeLayerToMap = useCallback((tileUrl: string, layerName: string, geeParams: Omit<GeeValueQueryInput, 'aoi' | 'zoom'>) => {
    if (!mapRef.current) return;

    const layerId = `gee-${nanoid()}`;
    
    const geeSource = new XYZ({
      url: tileUrl,
      crossOrigin: 'anonymous',
    });

    const geeLayer = new TileLayer({
      source: geeSource,
      properties: {
        id: layerId,
        name: layerName,
        type: 'gee',
        geeParams: { ...geeParams, tileUrl }, // Store the tileUrl in geeParams for sharing
      },
    });

    addLayer({
      id: layerId,
      name: layerName,
      olLayer: geeLayer,
      visible: true,
      opacity: 1,
      type: 'gee'
    });
    
    setTimeout(() => toast({ description: `Capa de Google Earth Engine "${layerName}" añadida.` }), 0);

  }, [mapRef, addLayer, toast]);
  
  const addSmnRadarLayer = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const radarLayerId = 'smn-radar-layer';
    const existingLayer = layers.find(l => l.id === radarLayerId) as MapLayer | undefined;

    if (existingLayer) {
        const source = existingLayer.olLayer.getSource() as TileWMS;
        const params = source.getParams();
        params['TIME'] = Date.now(); // Cache-busting parameter
        source.updateParams(params);
        toast({ description: 'Capa de radar del SMN actualizada.' });
    } else {
        const radarSource = new TileWMS({
            url: 'https://geoservicios.smn.gob.ar/geoserver/wms',
            params: {
                'LAYERS': 'capa:mosaicovisor',
                'TILED': true,
                'VERSION': '1.1.1',
                'TRANSPARENT': true,
            },
            serverType: 'geoserver',
            crossOrigin: 'anonymous',
        });

        const radarLayer = new TileLayer({
            source: radarSource,
            properties: { id: radarLayerId, name: 'Radar SMN (Mosaico)', type: 'wms' },
            zIndex: WMS_LAYER_Z_INDEX + 1, // Ensure it's on top of other WMS
            opacity: 0.7,
        });

        const newMapLayer: MapLayer = {
            id: radarLayerId,
            name: 'Radar SMN (Mosaico)',
            olLayer: radarLayer,
            visible: true,
            opacity: 0.7,
            type: 'wms',
        };

        addLayer(newMapLayer, true);
        toast({ description: 'Capa de radar del SMN añadida.' });
    }
  }, [mapRef, layers, addLayer, toast]);


  const undoRemove = useCallback(() => {
      if (!mapRef.current || lastRemovedLayers.length === 0) return;
      const map = mapRef.current;
      const layersToRestore = lastRemovedLayers;

      layersToRestore.forEach(layer => {
          map.addLayer(layer.olLayer);
          const visualLayer = layer.olLayer.get('visualLayer');
          if (visualLayer) {
              map.addLayer(visualLayer);
          }
      });
      
      setLayers(prev => [...layersToRestore, ...prev]);
      setLastRemovedLayers([]); // Clear the undo buffer

      toast({ description: `${layersToRestore.length} capa(s) restaurada(s).` });
  }, [mapRef, lastRemovedLayers, toast, setLayers]);


  const removeLayers = useCallback((layerIds: string[]) => {
    let removedLayers: MapLayer[] = [];
    setLayers(prevLayers => {
        if (!mapRef.current || layerIds.length === 0) return prevLayers;
        const map = mapRef.current;

        const layersToRemove = prevLayers.filter(l => layerIds.includes(l.id));
        if (layersToRemove.length === 0) return prevLayers;
        
        removedLayers = layersToRemove;
    
        layersToRemove.forEach(layer => {
            map.removeLayer(layer.olLayer);
            
            const visualLayer = layer.olLayer.get('visualLayer');
            if (visualLayer) {
                map.removeLayer(visualLayer);
            }
            
            const gsLayerName = layer.olLayer.get('gsLayerName');
            if (gsLayerName) {
                if (layer.type === 'wms' || layer.type === 'wfs') {
                    updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wms');
                    updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wfs');
                }
            }
        });
        
        return prevLayers.filter(l => !layerIds.includes(l.id));
    });
    
    setTimeout(() => {
        if (removedLayers.length > 0) {
            setLastRemovedLayers(removedLayers);
            const description = removedLayers.length === 1
                ? `Capa "${removedLayers[0].name}" eliminada.`
                : `${removedLayers.length} capa(s) eliminada(s).`;
            
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
                toast({ description: `${layersToMove.length} capa(s) reordenada(s).` });
            }, 0);
        }

        return remainingLayers;
    });
  }, [toast, setLayers]);
  
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => {
        if (l.id === layerId) {
            const newVisibility = !l.visible;
            l.olLayer.setVisible(newVisibility);
            // Also toggle the visual partner layer if it exists
            const visualLayer = l.olLayer.get('visualLayer');
            if (visualLayer) {
                visualLayer.setVisible(newVisibility && (l.wmsStyleEnabled ?? true));
            }
            return { ...l, visible: newVisibility };
        }
        return l;
    }));
  }, [setLayers]);

  const toggleWmsStyle = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => {
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
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
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

    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, graduatedSymbology: undefined, categorizedSymbology: undefined } : l));
    setTimeout(() => toast({ description: `Estilo de la capa "${layer.name}" actualizado.` }), 0);

  }, [layers, toast, setLayers]);

  const changeLayerLabels = useCallback((layerId: string, labelOptions: LabelOptions) => {
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
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
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer) return;

    const olLayer = layer.olLayer;
    const labelOptions = olLayer.get('labelOptions');
    olLayer.set('graduatedSymbology', symbology);
    olLayer.set('categorizedSymbology', undefined); // Clear other complex symbology

    // Create and apply the new style function that combines symbology and labels
    const finalStyle = createStyleFunction(null, labelOptions, symbology, undefined);
    olLayer.setStyle(finalStyle);
    olLayer.set('originalStyle', olLayer.getStyle()); // Store the new function as the base

    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, graduatedSymbology: symbology, categorizedSymbology: undefined } : l));
    setTimeout(() => toast({ description: `Simbología graduada aplicada a "${layer.name}".` }), 0);
  }, [layers, toast, setLayers]);
  
  const applyCategorizedSymbology = useCallback((layerId: string, symbology: CategorizedSymbology) => {
      const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
      if (!layer) return;
  
      const olLayer = layer.olLayer;
      const labelOptions = olLayer.get('labelOptions');
      olLayer.set('categorizedSymbology', symbology);
      olLayer.set('graduatedSymbology', undefined); // Clear other complex symbology
  
      const finalStyle = createStyleFunction(null, labelOptions, undefined, symbology);
      olLayer.setStyle(finalStyle);
      olLayer.set('originalStyle', olLayer.getStyle());
  
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, categorizedSymbology: symbology, graduatedSymbology: undefined } : l));
      setTimeout(() => toast({ description: `Simbología por categorías aplicada a "${layer.name}".` }), 0);
  }, [layers, toast, setLayers]);

  const applyGeoTiffStyle = useCallback((layerId: string, style: GeoTiffStyle) => {
    const layer = layers.find(l => l.id === layerId);
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

    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, geoTiffStyle: style } : l));
    toast({ description: `Estilo aplicado a la capa "${layer.name}".` });
  }, [layers, toast, setLayers]);

  const zoomToLayerExtent = useCallback((layerId: string) => {
    if (!mapRef.current) return;
    const layer = layers.find(l => l.id === layerId);
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
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.olLayer instanceof VectorLayer) {
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
    } else {
        setTimeout(() => toast({ description: "Solo se puede mostrar la tabla de atributos para capas vectoriales." }), 0);
    }
  }, [layers, onShowTableRequest, toast]);

  const renameLayer = useCallback((layerId: string, newName: string) => {
    setLayers(prev =>
      prev.map(l => {
        if (l.id === layerId) {
          return { ...l, name: newName };
        }
        return l;
      })
    );
    setTimeout(() => {
      toast({ description: `Capa renombrada a "${newName}"` });
    }, 0);
  }, [toast, setLayers]);
  
  const handleExtractByPolygon = useCallback((layerIdToExtract: string, onSuccess?: () => void) => {
    setLayers(prevLayers => {
        const targetLayer = prevLayers.find(l => l.id === layerIdToExtract) as VectorMapLayer | undefined;
        const drawingFeatures = drawingSourceRef.current?.getFeatures() ?? [];
        const polygonFeature = drawingFeatures.find(f => f.getGeometry()?.getType() === 'Polygon');
    
        if (!targetLayer || !polygonFeature) {
            setTimeout(() => toast({ description: "Se requiere una capa vectorial y un polígono dibujado." }), 0);
            return prevLayers;
        }
        const polygonGeometry = polygonFeature.getGeometry();
        if (!polygonGeometry) return prevLayers;
    
        const targetSource = targetLayer.olLayer.getSource();
        if (!targetSource) return prevLayers;
    
        const intersectingFeatures = targetSource.getFeatures().filter(feature => {
            const featureGeometry = feature.getGeometry();
            return featureGeometry && polygonGeometry.intersectsExtent(featureGeometry.getExtent());
        });
    
        if (intersectingFeatures.length === 0) {
            setTimeout(() => toast({ description: "No se encontraron entidades dentro del polígono." }), 0);
            return prevLayers;
        }
        
        const newSourceName = `Extracción de ${targetLayer.name}`;
        const newSource = new VectorSource({ features: intersectingFeatures.map(f => f.clone()) });
        const newLayerId = `extract-${targetLayer.id}-${nanoid()}`;
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: {
                id: newLayerId,
                name: newSourceName,
                type: 'vector'
            },
            style: targetLayer.olLayer.getStyle()
        });
        
        const newMapLayer: MapLayer = {
            id: newLayerId,
            name: newSourceName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'vector'
        };

        mapRef.current?.addLayer(newOlLayer);
        setTimeout(() => toast({ description: `${intersectingFeatures.length} entidades extraídas a una nueva capa.` }), 0);
        onSuccess?.();
        
        return [newMapLayer, ...prevLayers];
    });
  }, [drawingSourceRef, mapRef, toast, setLayers]);
  
  const handleExtractBySelection = useCallback((selectedFeaturesForExtraction: Feature<Geometry>[], onSuccess?: () => void) => {
    setLayers(prevLayers => {
        if (selectedFeaturesForExtraction.length === 0) {
            setTimeout(() => toast({ description: "No hay entidades seleccionadas para extraer." }), 0);
            return prevLayers;
        }
    
        const clonedFeatures = selectedFeaturesForExtraction.map(f => {
            const clone = f.clone();
            clone.setStyle(undefined); // Crucial: Remove the highlight style from the clone
            // Ensure the clone gets the ID
            if (f.getId()) {
                clone.setId(f.getId());
            }
            return clone;
        });
        
        let style;
        let originalLayerName = 'Selección';
        const firstFeature = selectedFeaturesForExtraction[0];
    
        if (firstFeature) {
          for (const layer of prevLayers) {
            if (layer.olLayer instanceof VectorLayer) {
              const source = layer.olLayer.getSource();
              // Use getFeatureById for robustness, as hasFeature might not work if the feature instance is different
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
            style: style // Apply the original layer's style, not the highlight style
        });
    
        const newMapLayer: MapLayer = {
            id: newLayerId,
            name: newSourceName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'vector'
        };
    
        mapRef.current?.addLayer(newOlLayer);
        setTimeout(() => toast({ description: `${clonedFeatures.length} entidades extraídas a la capa "${newSourceName}".` }), 0);
        
        clearSelectionAfterExtraction();
        onSuccess?.();
        
        return [newMapLayer, ...prevLayers];
    });
  }, [mapRef, toast, clearSelectionAfterExtraction, setLayers]);
  
  const handleExportLayer = useCallback(async (layerId: string, format: 'geojson' | 'kml' | 'shp') => {
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
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

        setLayers(prevLayers => {
            const existingLayer = prevLayers.find(l => l.id === 'sentinel-footprints') as VectorMapLayer | undefined;
            if (existingLayer) {
                existingLayer.olLayer.getSource()?.clear();
                existingLayer.olLayer.getSource()?.addFeatures(features);
                setTimeout(() => toast({ description: `Capa de Sentinel-2 actualizada con ${features.length} footprints.` }), 0);
                return [...prevLayers]; // Return a new array to trigger re-render
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
                
                const newMapLayer = {
                    id: 'sentinel-footprints',
                    name: 'Footprints Sentinel-2',
                    olLayer: sentinelLayer,
                    visible: true,
                    opacity: 1,
                    type: 'sentinel'
                };
                mapRef.current?.addLayer(sentinelLayer);
                setTimeout(() => toast({ description: `${features.length} footprints de Sentinel-2 añadidos al mapa.` }), 0);
                return [newMapLayer, ...prevLayers];
            }
        });
    } catch (error: any) {
        console.error("Error finding Sentinel-2 footprints:", error);
        setTimeout(() => toast({ description: `Error al buscar escenas: ${error.message}` }), 0);
    } finally {
        setIsFindingSentinelFootprints(false);
    }
  }, [mapRef, toast, setLayers]);

  const clearSentinel2FootprintsLayer = useCallback(() => {
    const sentinelLayer = layers.find(l => l.id === 'sentinel-footprints');
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

        setLayers(prevLayers => {
            const existingLayer = prevLayers.find(l => l.id === 'landsat-footprints') as VectorMapLayer | undefined;
            if (existingLayer) {
                existingLayer.olLayer.getSource()?.clear();
                existingLayer.olLayer.getSource()?.addFeatures(features);
                setTimeout(() => toast({ description: `Capa de Landsat actualizada con ${features.length} footprints.` }), 0);
                return [...prevLayers];
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
    
                const newMapLayer = {
                    id: 'landsat-footprints',
                    name: 'Footprints Landsat',
                    olLayer: landsatLayer,
                    visible: true,
                    opacity: 1,
                    type: 'landsat'
                };
                mapRef.current?.addLayer(landsatLayer);
                setTimeout(() => toast({ description: `${features.length} footprints de Landsat añadidos al mapa.` }), 0);
                return [newMapLayer, ...prevLayers];
            }
        });
    } catch (error: any) {
        console.error("Error finding Landsat footprints:", error);
        setTimeout(() => toast({ description: `Error al buscar escenas de Landsat: ${error.message}` }), 0);
    } finally {
        setIsFindingLandsatFootprints(false);
    }
  }, [mapRef, toast, setLayers]);

  const clearLandsatFootprintsLayer = useCallback(() => {
    const landsatLayer = layers.find(l => l.id === 'landsat-footprints');
    if (landsatLayer) {
        removeLayer(landsatLayer.id);
    } else {
        setTimeout(() => toast({ description: "No hay capa de footprints de Landsat para limpiar." }), 0);
    }
  }, [layers, removeLayer, toast]);
  
  const updateFeatureAttribute = useCallback((featureId: string, key: string, value: any) => {
      const layer = layers.find(l => 
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
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
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
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    const layer = layers.find(l => l.id === layerId);
    if (!layer || !(layer.olLayer instanceof TileLayer)) {
      toast({ description: 'La capa seleccionada no es una capa WMS válida.', variant: "destructive" });
      return;
    }

    const source = layer.olLayer.getSource();
    if (!(source instanceof TileWMS)) {
        toast({ description: 'La fuente de la capa no es TileWMS.', variant: "destructive" });
        return;
    }

    const size = map.getSize();
    if (!size || size[0] === 0 || size[1] === 0) {
      toast({ description: 'El tamaño del mapa es inválido para la exportación.', variant: 'destructive' });
      return;
    }
    const [width, height] = size;

    const view = map.getView();
    const extent = view.calculateExtent(size);
    const projection = view.getProjection();
    const srs = projection.getCode();
    
    const params = source.getParams();
    const wmsUrl = source.getUrls()?.[0];

    if (!wmsUrl) {
      toast({ description: 'No se pudo obtener la URL del servicio WMS.', variant: 'destructive' });
      return;
    }

    const getMapParams = {
        SERVICE: 'WMS',
        VERSION: '1.3.0',
        REQUEST: 'GetMap',
        FORMAT: 'image/geotiff',
        TRANSPARENT: 'true',
        LAYERS: params.LAYERS,
        STYLES: params.STYLES || '',
        CRS: srs,
        BBOX: extent.join(','),
        WIDTH: width,
        HEIGHT: height,
    };
    
    const url = new URL(wmsUrl);
    Object.entries(getMapParams).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(url.toString())}`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`El servidor WMS respondió con estado: ${response.status}`);
        }
        
        const blob = await response.blob();
        if (blob.type !== 'image/tiff') {
            throw new Error('El servidor no devolvió un GeoTIFF válido.');
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${layer.name.replace(/ /g, '_')}.tif`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        toast({ description: `Descargando GeoTIFF para "${layer.name}".` });

    } catch (error: any) {
        console.error("Error exporting WMS as GeoTIFF:", error);
        toast({ title: 'Error de Exportación', description: error.message, variant: 'destructive' });
    }
  }, [layers, mapRef, toast]);


  return {
    layers,
    addLayer,
    addGeeLayerToMap,
    addSmnRadarLayer,
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
    handleExtractBySelection: (features: Feature<Geometry>[]) => handleExtractBySelection(features),
    handleExportLayer,
    findSentinel2FootprintsInCurrentView,
    isFindingSentinelFootprints,
    clearSentinel2FootprintsLayer,
    findLandsatFootprintsInCurrentView,
    isFindingLandsatFootprints,
    clearLandsatFootprintsLayer,
    isWfsLoading,
    updateFeatureAttribute,
    addFieldToLayer,
    handleExportWmsAsGeotiff,
  };
};


    

    








