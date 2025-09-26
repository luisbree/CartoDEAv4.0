
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import type Feature from 'ol/Feature';
import { Geometry, LineString, Point, Polygon } from 'ol/geom';
import { useToast } from "@/hooks/use-toast";
import { findSentinel2Footprints } from '@/services/sentinel';
import { findLandsatFootprints } from '@/services/landsat';
import type { MapLayer, VectorMapLayer, PlainFeatureData, LabelOptions, StyleOptions, GraduatedSymbology, CategorizedSymbology } from '@/lib/types';
import { nanoid } from 'nanoid';
import { Style, Stroke, Fill, Circle as CircleStyle, Text as TextStyle } from 'ol/style';
import type { StyleLike } from 'ol/style/Style';
import { transformExtent } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { download as downloadShp } from 'shpjs';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';
import type { GeeValueQueryInput } from '@/ai/flows/gee-types';


interface UseLayerManagerProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  onShowTableRequest: (plainData: PlainFeatureData[], layerName: string, layerId: string) => void;
  updateGeoServerDiscoveredLayerState: (layerName: string, added: boolean, type: 'wms' | 'wfs') => void;
  clearSelectionAfterExtraction: () => void;
  updateInspectedFeatureData: (featureId: string, key: string, value: any) => void;
}

const LAYER_START_Z_INDEX = 10;
const GEE_LAYER_Z_INDEX = 5; // Lower z-index for GEE layers

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


// A completely transparent style for the invisible WFS layer
const transparentStyle = new Style({
  fill: new Fill({ color: 'rgba(255,255,255,0)' }),
  stroke: new Stroke({ color: 'rgba(255,255,255,0)', width: 0 }),
});


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
    return baseStyleOrFn || transparentStyle;
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
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const { toast } = useToast();
  const [isFindingSentinelFootprints, setIsFindingSentinelFootprints] = useState(false);
  const [isFindingLandsatFootprints, setIsFindingLandsatFootprints] = useState(false);
  const [isDrawingSourceEmptyOrNotPolygon, setIsDrawingSourceEmptyOrNotPolygon] = useState(true);
  const [isWfsLoading, setIsWfsLoading] = useState(false);

  useEffect(() => {
    // This effect ensures z-ordering is correct whenever the layers array changes.
    // UI has top layer at index 0. Map has top layer at highest z-index.
    const operationalLayers = layers.filter(l => l.type !== 'gee');
    const layer_count = operationalLayers.length;
    
    layers.forEach((layer) => {
      if (layer.type === 'gee') {
        layer.olLayer.setZIndex(GEE_LAYER_Z_INDEX);
      } else {
        // Find its index among non-GEE layers to determine z-index
        const operationalIndex = operationalLayers.findIndex(opLayer => opLayer.id === layer.id);
        if (operationalIndex !== -1) {
            layer.olLayer.setZIndex(LAYER_START_Z_INDEX + (layer_count - 1 - operationalIndex));
        }
      }
    });
  }, [layers]);

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

  }, [mapRef]);

  const handleAddHybridLayer = useCallback(async (layerName: string, layerTitle: string, serverUrl: string, bbox?: [number, number, number, number], styleName?: string) => {
      if (!isMapReady || !mapRef.current) return;
      
      const map = mapRef.current;
      
      try {
          const cleanedServerUrl = serverUrl.replace(/\/wms\/?$/, '').replace(/\/wfs\/?$/, '');

          // 1. Add WMS layer for visualization
          const wmsParams: { [key: string]: any } = {
            'LAYERS': layerName,
            'TILED': true
          };

          if (styleName) {
            wmsParams['STYLES'] = styleName;
          }

          const wmsSource = new TileWMS({
              url: `${cleanedServerUrl}/wms`,
              params: wmsParams,
              serverType: 'geoserver',
              transition: 0,
              crossOrigin: 'anonymous',
          });

          const wmsLayerId = `wms-visual-${layerName}-${nanoid()}`;
          const wmsLayer = new TileLayer({
              source: wmsSource,
              properties: { id: wmsLayerId, name: `${layerTitle} (Visual)`, type: 'wms', gsLayerName: layerName, isVisualOnly: true, bbox: bbox },
              visible: true, // Make sure it's visible by default
          });
          map.addLayer(wmsLayer);

          // 2. Setup WFS VectorSource with BBOX loading strategy
          const vectorSource = new VectorSource({
              format: new GeoJSON(),
              strategy: bboxStrategy,
              loader: function (extent, resolution, projection) {
                  setIsWfsLoading(true);
                  const proj = projection.getCode();
                  
                  // Logic to handle potential version conflicts
                  const attemptLoad = (version: string, srsParam: string) => {
                    const wfsUrl = `${cleanedServerUrl}/wfs?service=WFS&version=${version}&request=GetFeature&typename=${layerName}&outputFormat=application/json&${srsParam}=${proj}&bbox=${extent.join(',')},${proj}`;
                    const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(wfsUrl)}&cacheBust=${Date.now()}`;
                    
                    return fetch(proxyUrl).then(response => {
                        if (!response.ok) {
                            return response.text().then(text => { throw { status: response.status, text: text, isXml: response.headers.get('content-type')?.includes('xml') }; });
                        }
                        return response.json();
                    });
                  };

                  attemptLoad('1.1.0', 'srsName')
                    .then(data => {
                        const features = vectorSource.getFormat()!.readFeatures(data);
                        features.forEach(f => { if (!f.getId()) { f.setId(nanoid()); } });
                        vectorSource.addFeatures(features);
                        setIsWfsLoading(false);
                    })
                    .catch(error => {
                        // If the first attempt failed with an XML error, it's likely a version issue. Retry with 1.0.0.
                        if (error.isXml) {
                            console.warn(`WFS 1.1.0 failed for ${layerName}, retrying with 1.0.0.`);
                            toast({ description: `Reintentando carga para ${layerTitle} con protocolo anterior...` });
                            attemptLoad('1.0.0', 'SRSNAME')
                              .then(data => {
                                const features = vectorSource.getFormat()!.readFeatures(data);
                                features.forEach(f => { if (!f.getId()) { f.setId(nanoid()); } });
                                vectorSource.addFeatures(features);
                              })
                              .catch(finalError => {
                                console.error(`Error al cargar entidades WFS para ${layerName} (reintento fallido):`, finalError);
                                toast({ description: `No se pudieron cargar las entidades para ${layerTitle}.`, variant: "destructive" });
                                vectorSource.removeLoadedExtent(extent);
                              })
                              .finally(() => setIsWfsLoading(false));
                        } else {
                            console.error(`Error al cargar entidades WFS para ${layerName}:`, error);
                            toast({ description: `No se pudieron cargar las entidades para ${layerTitle}.`, variant: "destructive" });
                            vectorSource.removeLoadedExtent(extent);
                            setIsWfsLoading(false);
                        }
                    });
              }
          });

          // 3. Create the invisible VectorLayer for interaction
          const wfsLayerId = `wfs-data-${layerName}-${nanoid()}`;
          const vectorLayer = new VectorLayer({
              source: vectorSource,
              style: transparentStyle, // Make it invisible
              properties: {
                  id: wfsLayerId,
                  name: layerTitle || layerName,
                  type: 'wfs',
                  gsLayerName: layerName,
                  isDeas: serverUrl.includes('minfra.gba.gob.ar'),
                  bbox: bbox,
                  linkedWmsLayerId: wmsLayerId
              }
          });
          
          addLayer({
              id: wfsLayerId,
              name: layerTitle,
              olLayer: vectorLayer,
              visible: true,
              opacity: 1,
              type: 'wfs',
              isDeas: serverUrl.includes('minfra.gba.gob.ar'),
          });
          
          updateGeoServerDiscoveredLayerState(layerName, true, 'wfs');
          updateGeoServerDiscoveredLayerState(layerName, true, 'wms');
          setTimeout(() => toast({ description: `Capa "${layerTitle}" añadida.` }), 0);

      } catch (error: any) {
          console.error("Error adding hybrid WMS/WFS layer:", error);
          setTimeout(() => toast({ description: `Error al añadir capa: ${error.message}`, variant: 'destructive' }), 0);
          setIsWfsLoading(false);
      }
  }, [isMapReady, mapRef, addLayer, updateGeoServerDiscoveredLayerState, toast]);


  const addGeeLayerToMap = useCallback((tileUrl: string, layerName: string, geeParams: Omit<GeeValueQueryInput, 'lon' | 'lat'>) => {
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
        geeParams: geeParams, // Store the params for querying later
      }
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

  const removeLayers = useCallback((layerIds: string[]) => {
    setLayers(prevLayers => {
        if (!mapRef.current || layerIds.length === 0) return prevLayers;

        const layersToRemove = prevLayers.filter(l => layerIds.includes(l.id));
        if (layersToRemove.length === 0) return prevLayers;
    
        layersToRemove.forEach(layer => {
          mapRef.current!.removeLayer(layer.olLayer);
          
          const linkedWmsId = layer.olLayer.get('linkedWmsLayerId');
          if (linkedWmsId) {
            const wmsLayer = mapRef.current?.getLayers().getArray().find(l => l.get('id') === linkedWmsId);
            if (wmsLayer) {
              mapRef.current?.removeLayer(wmsLayer);
            }
          }
    
          const gsLayerName = layer.olLayer.get('gsLayerName');
          if (gsLayerName) {
            updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wfs');
            updateGeoServerDiscoveredLayerState(gsLayerName, false, 'wms');
          }
        });
    
        if (layersToRemove.length === 1) {
          setTimeout(() => toast({ description: `Capa "${layersToRemove[0].name}" eliminada.` }), 0);
        } else {
          setTimeout(() => toast({ description: `${layersToRemove.length} capa(s) eliminada(s).` }), 0);
        }
        
        return prevLayers.filter(l => !layerIds.includes(l.id));
    });
  }, [mapRef, toast, updateGeoServerDiscoveredLayerState]);

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
  }, [toast]);
  
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => {
        if (l.id === layerId) {
            const newVisibility = !l.visible;
            const linkedWmsId = l.olLayer.get('linkedWmsLayerId');
            if (linkedWmsId && mapRef.current) {
              const wmsLayer = mapRef.current.getLayers().getArray().find(mapLyr => mapLyr.get('id') === linkedWmsId);
              if (wmsLayer) {
                wmsLayer.setVisible(newVisibility);
              }
            } else {
              l.olLayer.setVisible(newVisibility);
            }
            return { ...l, visible: newVisibility };
        }
        return l;
    }));
  }, [mapRef]);

  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const linkedWmsId = l.olLayer.get('linkedWmsLayerId');
        if (linkedWmsId && mapRef.current) {
          const wmsLayer = mapRef.current.getLayers().getArray().find(mapLyr => mapLyr.get('id') === linkedWmsId);
          if (wmsLayer) {
            wmsLayer.setOpacity(opacity);
          }
        } else {
          l.olLayer.setOpacity(opacity);
        }
        return { ...l, opacity };
      }
      return l;
    }));
  }, [mapRef]);

  const changeLayerStyle = useCallback((layerId: string, styleOptions: StyleOptions) => {
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer) return;

    // Hide linked WMS to show custom style
    const linkedWmsId = layer.olLayer.get('linkedWmsLayerId');
    if (linkedWmsId && mapRef.current) {
        const wmsLayer = mapRef.current.getLayers().getArray().find(l => l.get('id') === linkedWmsId);
        if (wmsLayer) {
            wmsLayer.setVisible(false);
            setTimeout(() => toast({ description: `Se ocultó la capa WMS para mostrar el nuevo estilo.` }), 0);
        }
    }

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

  }, [layers, toast, mapRef]);

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

    // Hide linked WMS to show custom style
    const linkedWmsId = layer.olLayer.get('linkedWmsLayerId');
    if (linkedWmsId && mapRef.current) {
        const wmsLayer = mapRef.current.getLayers().getArray().find(l => l.get('id') === linkedWmsId);
        if (wmsLayer) {
            wmsLayer.setVisible(false);
            setTimeout(() => toast({ description: `Se ocultó la capa WMS para mostrar el nuevo estilo.` }), 0);
        }
    }

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
  }, [layers, toast, mapRef]);
  
  const applyCategorizedSymbology = useCallback((layerId: string, symbology: CategorizedSymbology) => {
      const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
      if (!layer) return;
  
      const linkedWmsId = layer.olLayer.get('linkedWmsLayerId');
      if (linkedWmsId && mapRef.current) {
          const wmsLayer = mapRef.current.getLayers().getArray().find(l => l.get('id') === linkedWmsId);
          if (wmsLayer) {
              wmsLayer.setVisible(false);
              setTimeout(() => toast({ description: `Se ocultó la capa WMS para mostrar el nuevo estilo.` }), 0);
          }
      }
  
      const olLayer = layer.olLayer;
      const labelOptions = olLayer.get('labelOptions');
      olLayer.set('categorizedSymbology', symbology);
      olLayer.set('graduatedSymbology', undefined); // Clear other complex symbology
  
      const finalStyle = createStyleFunction(null, labelOptions, undefined, symbology);
      olLayer.setStyle(finalStyle);
      olLayer.set('originalStyle', olLayer.getStyle());
  
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, categorizedSymbology: symbology, graduatedSymbology: undefined } : l));
      setTimeout(() => toast({ description: `Simbología por categorías aplicada a "${layer.name}".` }), 0);
  }, [layers, toast, mapRef]);

  const zoomToLayerExtent = useCallback((layerId: string) => {
    if (!mapRef.current) return;
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    let extent: number[] | undefined;

    if (layer.olLayer instanceof VectorLayer) {
        const source = layer.olLayer.getSource();
        if (source && source.getFeatures().length > 0) {
            extent = source.getExtent();
        } else {
            setTimeout(() => toast({ description: "La capa no tiene entidades para hacer zoom." }), 0);
            return;
        }
    } else {
        const bbox4326 = layer.olLayer.get('bbox');
        if (bbox4326) {
            try {
                extent = transformExtent(bbox4326, 'EPSG:4326', 'EPSG:3857');
            } catch (e) { console.error(e); }
        }
    }

    if (extent && extent.every(isFinite) && extent[2] > extent[0] && extent[3] > extent[1]) {
         mapRef.current.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 1000,
            maxZoom: 16,
        });
    } else {
        setTimeout(() => toast({ description: "No se puede determinar una extensión válida para esta capa." }), 0);
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
  }, [toast]);
  
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
  }, [drawingSourceRef, mapRef, toast]);
  
  const handleExtractBySelection = useCallback((selectedFeaturesForExtraction: Feature<Geometry>[], onSuccess?: () => void) => {
    setLayers(prevLayers => {
        if (selectedFeaturesForExtraction.length === 0) {
            setTimeout(() => toast({ description: "No hay entidades seleccionadas para extraer." }), 0);
            return prevLayers;
        }
    
        const clonedFeatures = selectedFeaturesForExtraction.map(f => {
            const clone = f.clone();
            clone.setStyle(undefined); // Crucial: Remove the highlight style from the clone
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
  }, [mapRef, toast, clearSelectionAfterExtraction]);
  
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
      let textData: string;
      let mimeType: string;
      let extension: string;

      const writeOptions = {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
          decimals: 7,
      };

      if (format === 'geojson' || format === 'kml') {
          if (format === 'geojson') {
              textData = new GeoJSON().writeFeatures(features, writeOptions);
              mimeType = 'application/geo+json';
              extension = 'geojson';
          } else { // kml
              textData = new KML({ extractStyles: true, showPointNames: true }).writeFeatures(features, writeOptions);
              mimeType = 'application/vnd.google-earth.kml+xml';
              extension = 'kml';
          }

          const blob = new Blob([textData], { type: mimeType });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${layerName}.${extension}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);

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
          downloadShp(geojson, options);
      } else {
        return;
      }
      
      setTimeout(() => toast({ description: `Capa "${layer.name}" exportada como ${format.toUpperCase()}.` }), 0);
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      setTimeout(() => toast({ description: `Error al exportar la capa como ${format.toUpperCase()}.`, variant: "destructive" }), 0);
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
  }, [mapRef, toast]);

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
  }, [mapRef, toast]);

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


  return {
    layers,
    addLayer,
    addGeeLayerToMap,
    handleAddHybridLayer,
    removeLayer,
    removeLayers,
    reorderLayers,
    toggleLayerVisibility,
    setLayerOpacity,
    changeLayerStyle,
    changeLayerLabels,
    applyGraduatedSymbology,
    applyCategorizedSymbology,
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
  };
};
