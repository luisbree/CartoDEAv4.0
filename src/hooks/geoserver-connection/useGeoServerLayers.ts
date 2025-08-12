
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { Map } from 'ol';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { useToast } from "@/hooks/use-toast";
import type { MapLayer, GeoServerDiscoveredLayer } from '@/lib/types';
import { nanoid } from 'nanoid';
import { Style, Fill, Stroke } from 'ol/style';
import { bbox as bboxStrategy } from 'ol/loadingstrategy';


interface UseGeoServerLayersProps {
  onLayerStateUpdate: (layerName: string, added: boolean, type: 'wms' | 'wfs') => void;
}

export const useGeoServerLayers = ({
  onLayerStateUpdate,
}: UseGeoServerLayersProps) => {
  const { toast } = useToast();
  
  const handleFetchGeoServerLayers = useCallback(async (urlOverride: string): Promise<GeoServerDiscoveredLayer[]> => {
    const urlToUse = urlOverride;
    if (!urlToUse.trim()) {
      toast({ description: 'Por favor, ingrese una URL de GeoServer válida.' });
      return [];
    }
    
    const getCapabilitiesUrl = `${urlToUse.trim()}/wms?service=WMS&version=1.3.0&request=GetCapabilities`;
    const proxyUrl = `/api/geoserver-proxy?url=${encodeURIComponent(getCapabilitiesUrl)}&cacheBust=${Date.now()}`;

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Error al obtener capas de GeoServer: ${response.statusText}. Detalles: ${errorData}`);
      }

      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "application/xml");
      console.log(xml)
      const errorNode = xml.querySelector('ServiceException, ServiceExceptionReport');
      if (errorNode) {
          throw new Error(`Error en la respuesta de GeoServer: ${errorNode.textContent || 'Error desconocido'}`);
      }
      const layerNodes = Array.from(xml.querySelectorAll('Layer[queryable="1"]'));

      const discoveredLayers: GeoServerDiscoveredLayer[] = layerNodes.map(node => {
          const name = node.querySelector('Name')?.textContent ?? '';
          const title = node.querySelector('Title')?.textContent ?? name;
          
          let bboxNode = node.querySelector('BoundingBox[CRS="CRS:84"]');
          let bbox: [number, number, number, number] | undefined = undefined;

          if (bboxNode) {
              const minx = parseFloat(bboxNode.getAttribute('minx') || '0');
              const miny = parseFloat(bboxNode.getAttribute('miny') || '0');
              const maxx = parseFloat(bboxNode.getAttribute('maxx') || '0');
              const maxy = parseFloat(bboxNode.getAttribute('maxy') || '0');
              if (!isNaN(minx) && !isNaN(miny) && !isNaN(maxx) && !isNaN(maxy)) {
                bbox = [minx, miny, maxx, maxy]; 
              }
          } else {
              bboxNode = node.querySelector('BoundingBox[CRS="EPSG:4326"]');
              if (bboxNode) {
                  const minx_lat = parseFloat(bboxNode.getAttribute('minx') || '0');
                  const miny_lon = parseFloat(bboxNode.getAttribute('miny') || '0');
                  const maxx_lat = parseFloat(bboxNode.getAttribute('maxx') || '0');
                  const maxy_lon = parseFloat(bboxNode.getAttribute('maxy') || '0');
                  if (!isNaN(minx_lat) && !isNaN(miny_lon) && !isNaN(maxx_lat) && !isNaN(maxy_lon)) {
                    bbox = [miny_lon, minx_lat, maxy_lon, maxx_lat]; 
                  }
              }
          }
          
          // Get default style name
          const styleName = node.querySelector('Style > Name')?.textContent ?? undefined;

          return { name, title, bbox, wmsAddedToMap: false, wfsAddedToMap: false, styleName };
      }).filter(l => l.name);

      return discoveredLayers;

    } catch (error: any) {
      console.error("Error fetching GeoServer layers:", error);
      toast({ description: `Error al conectar con GeoServer: ${error.message}` });
      return [];
    }
  }, [toast]);

  return {
    handleFetchGeoServerLayers,
  };
};
