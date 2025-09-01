
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

  const fetchOSMData = useCallback(async () => {
    if (selectedOSMCategoryIds.length === 0) {
        toast({ description: 'Por favor, seleccione al menos una categoría de OSM.' });
        return;
    }
    
    setIsFetchingOSM(true);
    toast({ description: `Buscando ${selectedOSMCategoryIds.length} categoría(s) de OSM...` });

    const drawingSource = drawingSourceRef.current;
    const map = mapRef.current;
    if (!map || !drawingSource) return;
    
    const polygonFeature = drawingSource.getFeatures().find(f => f.getGeometry()?.getType() === 'Polygon');
    if (!polygonFeature) {
        toast({ description: 'Por favor, dibuje un polígono para definir el área de búsqueda.' });
        setIsFetchingOSM(false);
        return;
    }

    const mapProjection = getProjection('EPSG:3857');
    const dataProjection = getProjection('EPSG:4326');
    const extent = polygonFeature.getGeometry()!.getExtent();
    const transformedExtent = transformExtent(extent, mapProjection!, dataProjection!);
    const bboxStr = `${transformedExtent[1]},${transformedExtent[0]},${transformedExtent[3]},${transformedExtent[2]}`;
    
    const geojsonFormat = new GeoJSON({
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326'
    });
    
    const executeQuery = async (queryFragment: string, retries = 1): Promise<Feature<Geometry>[]> => {
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

            if (!response.ok) {
                // Retry logic for server overload errors (504 Gateway Timeout)
                if (response.status === 504 && retries > 0) {
                    console.warn(`Overpass API timeout/overload, retrying... (${retries} retries left)`);
                    toast({ description: `El servidor de OSM está ocupado, reintentando...` });
                    await new Promise(res => setTimeout(res, 3000)); // Wait 3 seconds before retrying
                    return executeQuery(queryFragment, retries - 1);
                }
                const errorText = await response.text();
                throw new Error(`Overpass API error: ${response.status} ${errorText}`);
            }

            const osmData = await response.json();
            const geojsonData = osmtogeojson(osmData);
            const features = geojsonFormat.readFeatures(geojsonData);
            features.forEach(f => f.setId(nanoid()));
            return features;
        } catch (error) {
            console.error("Overpass query failed:", error);
            throw error;
        }
    };
    
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
  }, [selectedOSMCategoryIds, drawingSourceRef, mapRef, addLayer, osmCategoryConfigs, toast]);

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
    isDownloading,
    handleDownloadOSMLayers,
  };
};
