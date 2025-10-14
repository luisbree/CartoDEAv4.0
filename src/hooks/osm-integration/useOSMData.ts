
"use client";

import { useState, useCallback } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { useToast } from "@/hooks/use-toast";
import type { MapLayer, OSMCategoryConfig } from '@/lib/types';
import { nanoid } from 'nanoid';
import { transformExtent } from 'ol/proj';
import { get as getProjection } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import osmtogeojson from 'osmtogeojson';

// Use an alternative, often less busy, Overpass API endpoint.
const OVERPASS_API_URL = 'https://overpass.kumi.systems/api/interpreter';

interface UseOSMDataProps {
  mapRef: React.RefObject<Map | null>;
  drawingSourceRef: React.RefObject<VectorSource>;
  addLayer: (layer: MapLayer) => void;
  osmCategoryConfigs: Omit<OSMCategoryConfig, 'matcher'>[];
  onExportLayers: (layers: VectorLayer<any>[], layerName: string, format: 'geojson' | 'kml' | 'shp') => Promise<void>;
}

export const useOSMData = ({ mapRef, drawingSourceRef, addLayer, osmCategoryConfigs, onExportLayers }: UseOSMDataProps) => {
  const { toast } = useToast();
  const [isFetchingOSM, setIsFetchingOSM] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedOSMCategoryIds, setSelectedOSMCategoryIds] = useState<string[]>(['watercourses', 'water_bodies']);

  const executeQuery = useCallback(async (queryFragment: string, retries = 1): Promise<Feature<Geometry>[]> => {
    const overpassQuery = `
      [out:json][timeout:60];
      (${queryFragment});
      out geom;
    `;
    
    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
        });

        // Handle non-OK responses first
        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 504 && retries > 0) {
                console.warn(`Overpass API timeout/overload, retrying... (${retries} retries left)`);
                toast({ description: `El servidor de OSM está ocupado, reintentando...` });
                await new Promise(res => setTimeout(res, 3000));
                return executeQuery(queryFragment, retries - 1);
            }
            throw new Error(`Error de la API de Overpass: ${response.status}. ${errorText}`);
        }

        // Check content type before parsing
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const errorText = await response.text();
            // Try to find a meaningful message in the HTML/XML error response
            const remarkMatch = errorText.match(/<p><strong>remark:<\/strong>(.*?)<\/p>/);
            const detailedMessage = remarkMatch ? remarkMatch[1].trim() : "La respuesta no fue un JSON válido.";
            throw new Error(`Error del servidor de Overpass: ${detailedMessage}`);
        }
        
        const osmData = await response.json();
        const geojsonData = osmtogeojson(osmData);
        
        const geojsonFormat = new GeoJSON({
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
        });

        const features = geojsonFormat.readFeatures(geojsonData);
        features.forEach(f => f.setId(nanoid()));
        return features;
    } catch (error) {
        console.error("Overpass query failed:", error);
        throw error;
    }
  }, [toast]);

  const getBbox = useCallback(() => {
    const drawingSource = drawingSourceRef.current;
    const map = mapRef.current;
    if (!map) {
      toast({ description: 'El mapa no está disponible.', variant: 'destructive' });
      return null;
    }

    const mapProjection = map.getView().getProjection();
    const dataProjection = getProjection('EPSG:4326');
    let extent;

    // Prioritize drawn polygon
    const polygonFeature = drawingSource?.getFeatures().find(f => f.getGeometry()?.getType() === 'Polygon');
    
    if (polygonFeature) {
        extent = polygonFeature.getGeometry()!.getExtent();
        toast({ description: 'Buscando OSM en el área dibujada.' });
    } else {
        // Fallback to map view
        extent = map.getView().calculateExtent(map.getSize()!);
        toast({ description: 'Buscando OSM en la vista actual del mapa.' });
    }

    const transformedExtent = transformExtent(extent, mapProjection, dataProjection!);
    return `${transformedExtent[1]},${transformedExtent[0]},${transformedExtent[3]},${transformedExtent[2]}`;
  }, [drawingSourceRef, mapRef, toast]);


  const fetchOSMData = useCallback(async () => {
    if (selectedOSMCategoryIds.length === 0) {
        toast({ description: 'Por favor, seleccione al menos una categoría de OSM.' });
        return;
    }
    
    setIsFetchingOSM(true);
    
    const bboxStr = getBbox();
    if (!bboxStr) {
      setIsFetchingOSM(false);
      return;
    }
    
    try {
      for (const categoryId of selectedOSMCategoryIds) {
        const config = osmCategoryConfigs.find(c => c.id === categoryId);
        if (config) {
          const queryFragment = config.overpassQueryFragment(bboxStr);
          const features = await executeQuery(queryFragment);
          
          if (features.length > 0) {
            const layerName = `${config.name} (${features.length})`;
            const vectorSource = new VectorSource({ features });
            const newLayer = new VectorLayer({
              source: vectorSource,
              style: config.style,
              properties: { id: `osm-${config.id}-${nanoid()}`, name: layerName, type: 'osm' }
            });
            addLayer({ id: newLayer.get('id'), name: layerName, olLayer: newLayer, visible: true, opacity: 1, type: 'osm' });
          } else {
            toast({ description: `No se encontraron entidades para "${config.name}".` });
          }
        }
      }
    } catch (error: any) {
      console.error("Error fetching OSM data:", error);
      toast({ description: `Error al obtener datos de OSM: ${error.message}`, variant: "destructive" });
    } finally {
      setIsFetchingOSM(false);
    }
  }, [selectedOSMCategoryIds, getBbox, osmCategoryConfigs, executeQuery, addLayer, toast]);
  
  const fetchCustomOSMData = useCallback(async (key: string, value: string) => {
    setIsFetchingOSM(true); // Reuse the same loading state
    const queryDescription = value ? `${key}="${value}"` : key;
    
    const bboxStr = getBbox();
    if (!bboxStr) {
        setIsFetchingOSM(false);
        return;
    }

    try {
        const queryFragment = value
            ? `nwr["${key}"="${value}"](${bboxStr});`
            : `nwr["${key}"](${bboxStr});`;

        const features = await executeQuery(queryFragment);
        
        if (features.length > 0) {
            const layerName = `OSM: ${queryDescription} (${features.length})`;
            const vectorSource = new VectorSource({ features });
            const newLayer = new VectorLayer({
                source: vectorSource,
                // Using a default style for custom queries, can be enhanced later
                properties: { id: `osm-custom-${nanoid()}`, name: layerName, type: 'osm' }
            });
            addLayer({ id: newLayer.get('id'), name: layerName, olLayer: newLayer, visible: true, opacity: 1, type: 'osm' });
        } else {
            toast({ description: `No se encontraron entidades para "${queryDescription}".` });
        }
    } catch (error: any) {
        console.error("Error fetching custom OSM data:", error);
        toast({ description: `Error al obtener datos de OSM: ${error.message}`, variant: "destructive" });
    } finally {
        setIsFetchingOSM(false);
    }
  }, [getBbox, executeQuery, addLayer, toast]);


 const handleDownloadOSMLayers = useCallback(async (format: 'geojson' | 'kml' | 'shp') => {
      setIsDownloading(true);
      try {
          const osmLayers = mapRef.current?.getLayers().getArray()
            .filter(l => l.get('type') === 'osm') as VectorLayer<any>[] | undefined;
          
          if (!osmLayers || osmLayers.length === 0) {
              toast({ description: "No hay capas OSM cargadas para descargar." });
              return;
          }
          await onExportLayers(osmLayers, 'Capas_OSM_Fusionadas', format);
      
      } catch (error: any) {
          console.error("Error during OSM layer download process:", error);
          toast({ description: `Error al preparar la descarga: ${error.message}`, variant: 'destructive' });
      } finally {
          setIsDownloading(false);
      }
  }, [mapRef, toast, onExportLayers]);


  return {
    isFetchingOSM,
    selectedOSMCategoryIds,
    setSelectedOSMCategoryIds,
    fetchOSMData,
    fetchCustomOSMData, // Export the new function
    isDownloading,
    handleDownloadOSMLayers,
  };
};


    