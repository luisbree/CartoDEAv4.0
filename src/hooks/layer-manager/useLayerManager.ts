
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import XYZ from 'ol/source/XYZ';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { useToast } from "@/hooks/use-toast";
import { findSentinel2Footprints } from '@/services/sentinel';
import { findLandsatFootprints } from '@/services/landsat';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { nanoid } from 'nanoid';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { transformExtent } from 'ol/proj';
import { asArray as asOlColorArray } from 'ol/color';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import shp from 'shpjs';
import JSZip from 'jszip';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';


interface UseLayerManagerProps {
  mapRef: React.RefObject<Map | null>;
  isMapReady: boolean;
  drawingSourceRef: React.RefObject<VectorSource>;
  onShowTableRequest: (features: Feature[], layerName: string) => void;
  updateGeoServerDiscoveredLayerState: (layerName: string, added: boolean, type: 'wms' | 'wfs') => void;
  clearSelectionAfterExtraction: () => void;
  setIsWfsLoading: (isLoading: boolean) => void;
}

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
};

// A completely transparent style for the invisible WFS layer
const transparentStyle = new Style({
  fill: new Fill({ color: 'rgba(255,255,255,0)' }),
  stroke: new Stroke({ color: 'rgba(255,255,255,0)', width: 0 }),
});

export const useLayerManager = ({
  mapRef,
  isMapReady,
  drawingSourceRef,
  onShowTableRequest,
  updateGeoServerDiscoveredLayerState,
  clearSelectionAfterExtraction,
  setIsWfsLoading,
}: UseLayerManagerProps) => {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const { toast } = useToast();
  const [isFindingSentinelFootprints, setIsFindingSentinelFootprints] = useState(false);
  const [isFindingLandsatFootprints, setIsFindingLandsatFootprints] = useState(false);
  const [isDrawingSourceEmptyOrNotPolygon, setIsDrawingSourceEmptyOrNotPolygon] = useState(true);

  useEffect(() => {
    // This effect ensures z-ordering is correct whenever the layers array changes.
    // UI has top layer at index 0. Map has top layer at highest z-index.
    const layerCount = layers.length;
    layers.forEach((layer, index) => {
      layer.olLayer.setZIndex(LAYER_START_Z_INDEX + (layerCount - 1 - index));
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

  const handleAddHybridLayer = useCallback(async (layerName: string, layerTitle: string, serverUrl: string, bbox?: [number, number, number, number]) => {
      if (!isMapReady || !mapRef.current) return;
      
      const map = mapRef.current;
      
      try {
          // 1. Add WMS layer for visualization (this is always fast)
          const wmsSource = new TileWMS({
              url: `${serverUrl}/wms`,
              params: { 'LAYERS': layerName, 'TILED': true },
              serverType: 'geoserver',
              transition: 0,
              crossOrigin: 'anonymous',
          });

          const wmsLayerId = `wms-visual-${layerName}-${nanoid()}`;
          const wmsLayer = new TileLayer({
              source: wmsSource,
              properties: { id: wmsLayerId, name: `${layerTitle} (Visual)`, type: 'wms', gsLayerName: layerName, isVisualOnly: true, bbox: bbox },
          });
          map.addLayer(wmsLayer);

          // 2. Setup WFS VectorSource with BBOX loading strategy
          const vectorSource = new VectorSource({
              format: new GeoJSON(),
              strategy: bboxStrategy,
              loader: function (extent, resolution, projection) {
                  setIsWfsLoading(true);
                  const proj = projection.getCode();
                  const wfsUrl = `${serverUrl}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${layerName}&outputFormat=application/json&srsname=${proj}&bbox=${extent.join(',')},${proj}`;
                  const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(wfsUrl)}&cacheBust=${Date.now()}`;
                  
                  fetch(proxyUrl)
                    .then(response => {
                      if (!response.ok) {
                        throw new Error(`Fallo en la solicitud WFS para ${layerName}`);
                      }
                      return response.json();
                    })
                    .then(data => {
                      const features = vectorSource.getFormat()!.readFeatures(data);
                      // Ensure all features get a unique ID for selection to work
                      features.forEach(f => {
                        if (!f.getId()) {
                          f.setId(nanoid());
                        }
                      });
                      vectorSource.addFeatures(features);
                    })
                    .catch(error => {
                      console.error(`Error al cargar entidades WFS para ${layerName}:`, error);
                      toast({ description: `No se pudieron cargar las entidades para ${layerTitle}.`, variant: "destructive" });
                      vectorSource.removeLoadedExtent(extent); // Important: tell the source the load failed
                    })
                    .finally(() => {
                      setIsWfsLoading(false);
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
                  isDeas: serverUrl.includes('minfra.gba.gob.ar'), // Simple check for now
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
          }, false);
          
          updateGeoServerDiscoveredLayerState(layerName, true, 'wfs');
          updateGeoServerDiscoveredLayerState(layerName, true, 'wms');
          toast({ description: `Capa "${layerTitle}" añadida.` });

      } catch (error: any) {
          console.error("Error adding hybrid WMS/WFS layer:", error);
          toast({ description: `Error al añadir capa: ${error.message}`, variant: 'destructive' });
          setIsWfsLoading(false); // Ensure loading is stopped on initial setup error
      }
  }, [isMapReady, mapRef, addLayer, updateGeoServerDiscoveredLayerState, toast, setIsWfsLoading]);

  const addGeeLayerToMap = useCallback((tileUrl: string, layerName: string) => {
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
    
    toast({ description: `Capa de Google Earth Engine "${layerName}" añadida.` });

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
          toast({ description: `Capa "${layersToRemove[0].name}" eliminada.` });
        } else {
          toast({ description: `${layersToRemove.length} capa(s) eliminada(s).` });
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

  const changeLayerStyle = useCallback((layerId: string, styleOptions: { strokeColor?: string; fillColor?: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; lineWidth?: number }) => {
    setLayers(prevLayers => {
        const layer = prevLayers.find(l => l.id === layerId);
        if (!layer || !(layer.olLayer instanceof VectorLayer)) {
            toast({ description: "Solo se puede cambiar el estilo de capas vectoriales." });
            return prevLayers;
        }
    
        const linkedWmsId = layer.olLayer.get('linkedWmsLayerId');
        if (linkedWmsId && mapRef.current) {
            const wmsLayer = mapRef.current.getLayers().getArray().find(l => l.get('id') === linkedWmsId);
            if (wmsLayer) {
                wmsLayer.setVisible(false);
                toast({ description: `Se ocultó la capa WMS para mostrar el nuevo estilo.` });
            }
        }
    
        const olLayer = layer.olLayer as VectorLayer<any>;
        const existingStyle = olLayer.getStyle();
        let baseStyle: Style;
    
        if (existingStyle instanceof Style) {
            baseStyle = existingStyle.clone();
        } else if (Array.isArray(existingStyle) && existingStyle.length > 0 && existingStyle[0] instanceof Style) {
            baseStyle = existingStyle[0].clone();
        } else {
            baseStyle = new Style({
                stroke: new Stroke({ color: '#3399CC', width: 2 }),
                fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
                image: new CircleStyle({
                    radius: 5,
                    fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
                    stroke: new Stroke({ color: '#3399CC', width: 1 })
                })
            });
        }
    
        const stroke = baseStyle.getStroke() ?? new Stroke();
        const fill = baseStyle.getFill() ?? new Fill();
        const image = baseStyle.getImage() instanceof CircleStyle ? baseStyle.getImage().clone() as CircleStyle : new CircleStyle({
            radius: 5,
            fill: new Fill({ color: 'rgba(51, 153, 204, 0.2)' }),
            stroke: new Stroke({ color: '#3399CC', width: 1.5 })
        });
        
        let styleChanged = false;
    
        if (styleOptions.strokeColor) {
            const colorHex = colorMap[styleOptions.strokeColor.toLowerCase()];
            if (colorHex) {
                styleChanged = true;
                stroke.setColor(colorHex);
                if (image.getStroke()) image.getStroke().setColor(colorHex);
            }
        }
    
        if (styleOptions.fillColor) {
            const colorHex = colorMap[styleOptions.fillColor.toLowerCase()];
            if (colorHex) {
                styleChanged = true;
                const olColor = asOlColorArray(colorHex);
                const fillColorRgba = [...olColor.slice(0, 3), 0.6] as [number, number, number, number];
                fill.setColor(fillColorRgba);
                if (image.getFill()) image.getFill().setColor(fillColorRgba);
            }
        }
    
        if (styleOptions.lineWidth) {
            styleChanged = true;
            stroke.setWidth(styleOptions.lineWidth);
            if (image.getStroke()) image.getStroke().setWidth(styleOptions.lineWidth > 3 ? styleOptions.lineWidth / 2 : 1.5);
        }
    
        if (styleOptions.lineStyle) {
            styleChanged = true;
            let lineDash: number[] | undefined;
            if (styleOptions.lineStyle === 'dashed') lineDash = [10, 10];
            else if (styleOptions.lineStyle === 'dotted') lineDash = [1, 5];
            stroke.setLineDash(lineDash);
        }
        
        if (styleChanged) {
            const newStyle = new Style({ stroke, fill, image });
            olLayer.setStyle(newStyle);
            toast({ description: `Estilo de la capa "${layer.name}" actualizado.` });
        }
        return prevLayers;
    });
  }, [toast, mapRef]);

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
            toast({ description: "La capa no tiene entidades para hacer zoom." });
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

    if (extent) {
         mapRef.current.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 1000,
            maxZoom: 16,
        });
    } else {
        toast({ description: "No se puede determinar la extensión de esta capa." });
    }
  }, [mapRef, layers, toast]);

  const handleShowLayerTable = useCallback((layerId: string) => {
    setLayers(prevLayers => {
        const layer = prevLayers.find(l => l.id === layerId);
        if (layer && layer.olLayer instanceof VectorLayer) {
            const source = layer.olLayer.getSource();
            if (source) {
                const features = source.getFeatures();
                if (features.length > 0) {
                    onShowTableRequest(features, layer.name);
                } else {
                    toast({ description: `La capa "${layer.name}" no tiene entidades para mostrar en la tabla.` });
                }
            }
        } else {
            toast({ description: "Solo se puede mostrar la tabla de atributos para capas vectoriales." });
        }
        return prevLayers;
    });
  }, [onShowTableRequest, toast]);

  const renameLayer = useCallback((layerId: string, newName: string) => {
    setLayers(prev =>
      prev.map(l => {
        if (l.id === layerId) {
          return { ...l, name: newName };
        }
        return l;
      })
    );
    // The toast needs to be called outside the immediate state update function
    // to avoid the React warning about updating a component from another's render.
    // A microtask (setTimeout) ensures this runs after the current render cycle.
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
            toast({ description: "Se requiere una capa vectorial y un polígono dibujado." });
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
            toast({ description: "No se encontraron entidades dentro del polígono." });
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
        toast({ description: `${intersectingFeatures.length} entidades extraídas a una nueva capa.` });
        onSuccess?.();
        
        return [newMapLayer, ...prevLayers];
    });
  }, [drawingSourceRef, mapRef, toast]);
  
  const handleExtractBySelection = useCallback((selectedFeaturesForExtraction: Feature<Geometry>[], onSuccess?: () => void) => {
    setLayers(prevLayers => {
        if (selectedFeaturesForExtraction.length === 0) {
            toast({ description: "No hay entidades seleccionadas para extraer." });
            return prevLayers;
        }
    
        const clonedFeatures = selectedFeaturesForExtraction.map(f => f.clone());
        
        let style;
        let originalLayerName = 'Selección';
        const firstFeature = selectedFeaturesForExtraction[0];
    
        if (firstFeature) {
          for (const layer of prevLayers) {
            if (layer.olLayer instanceof VectorLayer) {
              const source = layer.olLayer.getSource();
              if (source && source.hasFeature(firstFeature)) {
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
    
        const newMapLayer: MapLayer = {
            id: newLayerId,
            name: newSourceName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'vector'
        };
    
        mapRef.current?.addLayer(newOlLayer);
        toast({ description: `${clonedFeatures.length} entidades extraídas a la capa "${newSourceName}".` });
        
        clearSelectionAfterExtraction();
        onSuccess?.();
        
        return [newMapLayer, ...prevLayers];
    });
  }, [mapRef, toast, clearSelectionAfterExtraction]);
  
  const handleExportLayer = useCallback(async (layerId: string, format: 'geojson' | 'kml' | 'shp') => {
    const layer = layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
    if (!layer || !(layer.olLayer instanceof VectorLayer)) {
      toast({ description: "Solo se pueden exportar capas vectoriales." });
      return;
    }
    const source = layer.olLayer.getSource();
    if (!source || source.getFeatures().length === 0) {
      toast({ description: "La capa no tiene entidades para exportar." });
      return;
    }
    const features = source.getFeatures();
    const layerName = layer.name.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    try {
      if (format === 'shp') {
        const geojsonFormat = new GeoJSON({ featureProjection: 'EPSG:4326', dataProjection: 'EPSG:3857' });
        const geojson = geojsonFormat.writeFeaturesObject(features);
        const shpBuffer = await shp.write(geojson.features, 'GEOMETRY', {});
        const zip = new JSZip();
        zip.file(`${layerName}.zip`, shpBuffer);
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${layerName}_shp.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
      } else {
        let textData: string;
        let mimeType: string;
        let extension: string;

        if (format === 'geojson') {
          const geojsonFormat = new GeoJSON({ featureProjection: 'EPSG:4326', dataProjection: 'EPSG:3857' });
          textData = geojsonFormat.writeFeatures(features, {
            decimals: 7,
          });
          mimeType = 'application/geo+json';
          extension = 'geojson';
        } else { // kml
          const kmlFormat = new KML({ extractStyles: true, showPointNames: true });
          textData = kmlFormat.writeFeatures(features, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
            decimals: 7,
          });
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
      }
      toast({ description: `Capa "${layer.name}" exportada como ${format.toUpperCase()}.` });
    } catch (error) {
      console.error(`Error exporting as ${format}:`, error);
      toast({ description: `Error al exportar la capa como ${format.toUpperCase()}.`, variant: "destructive" });
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
            toast({ description: "No se encontraron escenas de Sentinel-2 en la vista actual para el rango de fechas especificado." });
            return;
        }

        setLayers(prevLayers => {
            const existingLayer = prevLayers.find(l => l.id === 'sentinel-footprints') as VectorMapLayer | undefined;
            if (existingLayer) {
                existingLayer.olLayer.getSource()?.clear();
                existingLayer.olLayer.getSource()?.addFeatures(features);
                toast({ description: `Capa de Sentinel-2 actualizada con ${features.length} footprints.` });
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
                toast({ description: `${features.length} footprints de Sentinel-2 añadidos al mapa.` });
                return [newMapLayer, ...prevLayers];
            }
        });
    } catch (error: any) {
        console.error("Error finding Sentinel-2 footprints:", error);
        toast({ description: `Error al buscar escenas: ${error.message}` });
    } finally {
        setIsFindingSentinelFootprints(false);
    }
  }, [mapRef, toast]);

  const clearSentinel2FootprintsLayer = useCallback(() => {
    const sentinelLayer = layers.find(l => l.id === 'sentinel-footprints');
    if (sentinelLayer) {
        removeLayer(sentinelLayer.id);
    } else {
        toast({ description: "No hay capa de footprints de Sentinel-2 para limpiar." });
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
            toast({ description: "No se encontraron escenas de Landsat en la vista actual para el rango de fechas especificado." });
            return;
        }

        setLayers(prevLayers => {
            const existingLayer = prevLayers.find(l => l.id === 'landsat-footprints') as VectorMapLayer | undefined;
            if (existingLayer) {
                existingLayer.olLayer.getSource()?.clear();
                existingLayer.olLayer.getSource()?.addFeatures(features);
                toast({ description: `Capa de Landsat actualizada con ${features.length} footprints.` });
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
                toast({ description: `${features.length} footprints de Landsat añadidos al mapa.` });
                return [newMapLayer, ...prevLayers];
            }
        });
    } catch (error: any) {
        console.error("Error finding Landsat footprints:", error);
        toast({ description: `Error al buscar escenas de Landsat: ${error.message}` });
    } finally {
        setIsFindingLandsatFootprints(false);
    }
  }, [mapRef, toast]);

  const clearLandsatFootprintsLayer = useCallback(() => {
    const landsatLayer = layers.find(l => l.id === 'landsat-footprints');
    if (landsatLayer) {
        removeLayer(landsatLayer.id);
    } else {
        toast({ description: "No hay capa de footprints de Landsat para limpiar." });
    }
  }, [layers, removeLayer, toast]);


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
    zoomToLayerExtent,
    handleShowLayerTable,
    renameLayer,
    isDrawingSourceEmptyOrNotPolygon,
    handleExtractByPolygon,
    handleExtractBySelection,
    handleExportLayer,
    findSentinel2FootprintsInCurrentView,
    isFindingSentinelFootprints,
    clearSentinel2FootprintsLayer,
    findLandsatFootprintsInCurrentView,
    isFindingLandsatFootprints,
    clearLandsatFootprintsLayer,
  };
};
