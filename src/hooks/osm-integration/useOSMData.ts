
"use client";

import { useState, useCallback } from 'react';
import type { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { useToast } from "@/hooks/use-toast";
import type { MapLayer, OSMCategoryConfig } from '@/lib/types';
import { nanoid } from 'nanoid';
import { transformExtent, type Extent } from 'ol/proj';
import { get as getProjection } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import shp from 'shpjs';
import JSZip from 'jszip';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import osmtogeojson from 'osmtogeojson';


interface UseOSMDataProps {
  mapRef: React.RefObject<Map | null>;
  drawingSourceRef: React.RefObject<VectorSource>;
  addLayer: (layer: MapLayer) => void;
  osmCategoryConfigs: Omit<OSMCategoryConfig, 'matcher'>[];
}

export const useOSMData = ({ mapRef, drawingSourceRef, addLayer, osmCategoryConfigs }: UseOSMDataProps) => {
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
    
    const executeQuery = async (queryFragment: string): Promise<Feature<Geometry>[]> => {
        const overpassQuery = `
          [out:json][timeout:60];
          (${queryFragment});
          out geom;
        `;
        
        try {
            const response = await fetch(`https://overpass-api.de/api/interpreter`, {
                method: 'POST',
                body: `data=${encodeURIComponent(overpassQuery)}`,
            });
            if (!response.ok) {
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

  const fetchOSMForCurrentView = useCallback(async (categoryIds: string[]) => {
    // This function logic can be simplified or merged with fetchOSMData if the primary
    // trigger is always a drawn polygon. For now, we'll leave it as a distinct path.
    // If you need this functionality, the implementation would be similar to fetchOSMData
    // but using the map's current view extent instead of a drawn polygon.
    toast({ description: "Funcionalidad no implementada en este momento." });
  }, [toast]);


  const handleDownloadOSMLayers = useCallback(async (format: 'geojson' | 'kml' | 'shp') => {
      const osmLayers = mapRef.current?.getLayers().getArray()
        .filter(l => l.get('type') === 'osm') as VectorLayer<any>[] | undefined;
      
      if (!osmLayers || osmLayers.length === 0) {
          toast({ description: "No hay capas OSM para descargar." });
          return;
      }
      setIsDownloading(true);
      try {
          const allFeatures = osmLayers.flatMap(l => l.getSource()?.getFeatures() ?? []);
          if (allFeatures.length === 0) {
              toast({ description: "No hay entidades en las capas OSM para descargar." });
              return;
          }

          const geojsonFormat = new GeoJSON({
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326'
          });

          if (format === 'shp') {
              const zip = new JSZip();
              const geoJson = JSON.parse(geojsonFormat.writeFeatures(allFeatures));
              const shpBuffer = await shp.write(geoJson.features, 'GEOMETRY', {});
              zip.file(`osm_layers.zip`, shpBuffer);
              const content = await zip.generateAsync({ type: "blob" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(content);
              link.download = "osm_layers_shp.zip";
              link.click();
              URL.revokeObjectURL(link.href);
              link.remove();
          } else { 
              let textData: string;
              let fileExtension = format;
              let mimeType = 'text/plain';

              if (format === 'geojson') {
                  textData = geojsonFormat.writeFeatures(allFeatures);
                  mimeType = 'application/geo+json';
              } else { // kml
                  const kmlFormat = new KML({ extractStyles: true });
                  textData = kmlFormat.writeFeatures(allFeatures);
                  mimeType = 'application/vnd.google-earth.kml+xml';
              }
              
              const blob = new Blob([textData], { type: mimeType });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `osm_layers.${fileExtension}`;
              link.click();
              URL.revokeObjectURL(link.href);
              link.remove();
          }
          toast({ description: `Capas OSM descargadas como ${format.toUpperCase()}.` });
      } catch (error: any) {
          console.error("Error downloading OSM layers:", error);
          toast({ description: `Error al descargar: ${error.message}` });
      } finally {
          setIsDownloading(false);
      }
  }, [mapRef, toast]);


  return {
    isFetchingOSM,
    selectedOSMCategoryIds,
    setSelectedOSMCategoryIds,
    fetchOSMData,
    fetchOSMForCurrentView,
    isDownloading,
    handleDownloadOSMLayers: handleDownloadOSMLayers,
  };
};
