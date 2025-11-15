

'use client';

import React, { useState, useMemo } from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower, Satellite, Loader2, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import type { MapLayer, LayerGroup, VectorMapLayer } from '@/lib/types';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { getGoesLayers, getGoesStormCores } from '@/ai/flows/gee-flow';
import { nanoid } from 'nanoid';
import XYZ from 'ol/source/XYZ';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Separator } from '../ui/separator';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import type { Map } from 'ol';
import { transformExtent } from 'ol/proj';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCenter } from 'ol/extent';
import { Point } from 'ol/geom';
import type Feature from 'ol/Feature';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { centroid } from '@turf/turf';
import type { Feature as TurfFeature, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry } from 'geojson';


interface ClimaPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddLayer: (layer: MapLayer | LayerGroup, bringToTop?: boolean) => void;
  style?: React.CSSProperties;
  mapRef: React.RefObject<Map | null>;
  allLayers: (MapLayer | LayerGroup)[];
}

const centroidStyle = new Style({
    image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: 'rgba(255, 69, 0, 0.8)' }), // Bright red-orange fill
        stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
    }),
});

const ClimaPanel: React.FC<ClimaPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onAddLayer,
  style,
  mapRef,
  allLayers,
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [tempThreshold, setTempThreshold] = useState(-60);
    const [numberOfImages, setNumberOfImages] = useState(1);
    const [selectedGoesLayerId, setSelectedGoesLayerId] = useState<string>('');
    const { toast } = useToast();

    const goesLayers = useMemo(() => {
        return allLayers
            .flatMap(item => ('layers' in item ? item.layers : [item]))
            .filter(layer => 
                layer.type === 'gee' && 
                layer.geeParams?.bandCombination === 'GOES_CLOUDTOP'
            ) as MapLayer[];
    }, [allLayers]);


    const handleAddGoesLayers = async () => {
        setIsLoading(true);
        toast({ description: `Buscando las últimas ${numberOfImages} imágenes de GOES-19...` });

        try {
            const results = await getGoesLayers({ numberOfImages });
            
            if (results && results.length > 0) {
                 if (results.length === 1) {
                    const result = results[0];
                    const layerId = `goes-c13-layer-${nanoid()}`;
                    let layerName = 'GOES-19 Topes Nubosos';
                    if (result.metadata?.timestamp) {
                        const imageDate = new Date(result.metadata.timestamp);
                        layerName = `GOES (${format(imageDate, "dd/MM HH:mm", { locale: es })})`;
                    }

                    const geeParams = {
                        bandCombination: 'GOES_CLOUDTOP',
                        metadata: result.metadata,
                        imageId: result.metadata?.imageId,
                    };

                    const goesLayer = new TileLayer({
                        source: new XYZ({ url: result.tileUrl, crossOrigin: 'anonymous' }),
                        properties: { 
                            id: layerId, 
                            name: layerName, 
                            type: 'gee', 
                            geeParams: geeParams
                        },
                        opacity: 0.6,
                    });
                    
                    const mapLayerToAdd: MapLayer = { 
                        id: layerId, 
                        name: layerName, 
                        olLayer: goesLayer, 
                        visible: true, 
                        opacity: 0.6, 
                        type: 'gee',
                        geeParams: geeParams 
                    };

                    onAddLayer(mapLayerToAdd, true);

                } else {
                    const groupName = `Secuencia GOES-19 (${results.length} imágenes)`;
                    const groupId = `goes-group-${nanoid()}`;
                    
                    const mapLayers: MapLayer[] = results.map((result, index) => {
                        const layerId = `goes-c13-layer-${nanoid()}`;
                        let layerName = `GOES #${index + 1}`;
                        if (result.metadata?.timestamp) {
                            const imageDate = new Date(result.metadata.timestamp);
                            layerName = `GOES (${format(imageDate, "dd/MM HH:mm", { locale: es })})`;
                        }
                        const isVisible = index === results.length - 1;
                        
                        const geeParams = {
                            bandCombination: 'GOES_CLOUDTOP',
                            metadata: result.metadata,
                            imageId: result.metadata?.imageId,
                        };

                        const goesLayer = new TileLayer({
                            source: new XYZ({ url: result.tileUrl, crossOrigin: 'anonymous' }),
                            visible: isVisible,
                            opacity: 0.6,
                            properties: { 
                                id: layerId, 
                                name: layerName, 
                                type: 'gee', 
                                geeParams: geeParams
                            },
                        });
                        
                        return { 
                            id: layerId, 
                            name: layerName, 
                            olLayer: goesLayer, 
                            visible: isVisible, 
                            opacity: 0.6, 
                            type: 'gee', 
                            groupId: groupId,
                            geeParams: geeParams
                        };
                    });

                    const layerGroup: LayerGroup = {
                        id: groupId,
                        name: groupName,
                        layers: mapLayers,
                        isExpanded: true,
                        displayMode: 'single',
                        isPlaying: true,
                        playSpeed: 1000,
                    };
                    
                    onAddLayer(layerGroup, true);
                }
                
                toast({ description: `Se añadieron ${results.length} capas de GOES.` });
            } else {
                 throw new Error("No se recibieron capas válidas del servidor de GEE.");
            }

        } catch (error: any) {
            console.error("Error adding GOES layers:", error);
            toast({
                title: "Error al obtener capas GOES",
                description: error.message || "No se pudieron añadir las capas de GOES.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };
    
const handleDetectStormCores = async () => {
    if (!mapRef.current) {
        toast({ description: "El mapa no está listo.", variant: "destructive" });
        return;
    }
    if (!selectedGoesLayerId) {
        toast({ description: "Por favor, seleccione una capa GOES para analizar.", variant: "destructive" });
        return;
    }

    const selectedLayer = goesLayers.find(l => l.id === selectedGoesLayerId);
    const imageId = selectedLayer?.geeParams?.imageId;
    const layerGeeParams = selectedLayer?.geeParams; // Capture full GEE params including metadata

    if (!imageId || !layerGeeParams) {
        toast({ description: "La capa GOES seleccionada no tiene un ID de imagen o metadatos válidos.", variant: "destructive" });
        return;
    }

    setIsDetecting(true);
    toast({ description: `Detectando núcleos de tormenta (T < ${tempThreshold}°C)...` });

    try {
        const view = mapRef.current.getView();
        const extent = view.calculateExtent(mapRef.current.getSize()!);
        const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');
        const aoi = { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] };

        // 1. Get the download URL for the storm core polygons from GEE
        const geeResult = await getGoesStormCores({
            imageId,
            temperatureThreshold: tempThreshold,
            aoi,
        });

        if (!geeResult || !geeResult.downloadUrl) {
            throw new Error("GEE no devolvió una URL de descarga para los núcleos de tormenta.");
        }

        // 2. Fetch the GeoJSON data from the URL
        const response = await fetch(geeResult.downloadUrl);
        if (!response.ok) {
            throw new Error(`Error al descargar los datos GeoJSON de los núcleos: ${response.statusText}`);
        }
        const polygonsGeoJSON = await response.json() as TurfFeatureCollection<TurfGeometry>;

        if (!polygonsGeoJSON.features || polygonsGeoJSON.features.length === 0) {
            toast({ description: "La detección no produjo ningún polígono de núcleo de tormenta." });
            setIsDetecting(false);
            return;
        }

        // 3. Calculate centroids using Turf.js
        const centroidsGeoJSON: TurfFeatureCollection<TurfGeometry> = {
            type: 'FeatureCollection',
            features: polygonsGeoJSON.features.map(polyFeature => {
                const center = centroid(polyFeature);
                center.properties = polyFeature.properties; // Copy properties
                return center;
            })
        };

        const olFormat = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });

        // 4. Create Polygon Layer
        const polygonFeatures = olFormat.readFeatures(polygonsGeoJSON);
        polygonFeatures.forEach(f => f.setId(nanoid())); // Ensure unique IDs
        const polygonSource = new VectorSource({ features: polygonFeatures });
        const polygonLayerId = `storm-cores-${nanoid()}`;
        const polygonLayerName = `Núcleos (${tempThreshold}°C) de ${selectedLayer.name}`;
        const polygonOlLayer = new VectorLayer({
            source: polygonSource,
            properties: { id: polygonLayerId, name: polygonLayerName, type: 'analysis' },
            opacity: 0.7
        });
        onAddLayer({
            id: polygonLayerId, name: polygonLayerName, olLayer: polygonOlLayer, visible: true, opacity: 0.7, type: 'analysis'
        }, true);

        // 5. Create Centroid Layer and attach GEE params
        const centroidFeatures = olFormat.readFeatures(centroidsGeoJSON);
        centroidFeatures.forEach(f => f.setId(nanoid()));
        const centroidSource = new VectorSource({ features: centroidFeatures });
        const centroidLayerId = `centroids-cores-${nanoid()}`;
        const centroidLayerName = `Centroides de ${polygonLayerName}`;
        const centroidOlLayer = new VectorLayer({
            source: centroidSource,
            properties: {
                id: centroidLayerId,
                name: centroidLayerName,
                type: 'analysis',
                // Attach the original GEE metadata here
                geeParams: layerGeeParams,
            },
            style: centroidStyle,
        });
        onAddLayer({
            id: centroidLayerId,
            name: centroidLayerName,
            olLayer: centroidOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
            // Also add geeParams to the MapLayer object for easy access
            geeParams: layerGeeParams,
        }, true);


        toast({ description: "Se añadieron los núcleos de tormenta y sus centroides." });

    } catch (error: any) {
        console.error("Error detecting storm cores:", error);
        toast({
            title: "Error en Detección",
            description: error.message || "No se pudieron detectar los núcleos de tormenta.",
            variant: "destructive",
        });
    } finally {
        setIsDetecting(false);
    }
};


  return (
    <DraggablePanel
      title="Clima y Satélite"
      icon={CloudRain}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 380, height: "auto" }}
    >
      <div className="p-3 space-y-4">
        <div className="space-y-3">
            <h3 className="text-sm font-semibold">Satélite GOES-19 (Topes Nubosos)</h3>
             <div className="space-y-2">
                <Label htmlFor="num-images" className="text-xs">Número de imágenes a cargar: <span className="font-bold">{numberOfImages}</span></Label>
                <Slider
                    id="num-images"
                    min={1}
                    max={12}
                    step={1}
                    value={[numberOfImages]}
                    onValueChange={(value) => setNumberOfImages(value[0])}
                    disabled={isLoading}
                />
            </div>
            <p className="text-xs text-gray-400">
                Visualiza la temperatura de los topes nubosos. Cargar más de una imagen las agrupará para reproducir la secuencia.
            </p>
            <Button className="w-full" onClick={handleAddGoesLayers} disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Satellite className="mr-2 h-4 w-4" />
                )}
                Añadir / Actualizar Capa(s) GOES
            </Button>
        </div>

        <Separator className="bg-white/15" />

        <div className="space-y-3">
            <h3 className="text-sm font-semibold">Detección de Núcleos de Tormenta</h3>
             <div className="space-y-2">
                <Label htmlFor="goes-layer-select" className="text-xs">Capa GOES a Analizar</Label>
                <Select value={selectedGoesLayerId} onValueChange={setSelectedGoesLayerId}>
                  <SelectTrigger id="goes-layer-select" className="h-8 text-xs bg-black/20 w-full" disabled={goesLayers.length === 0}>
                    <SelectValue placeholder="Seleccionar capa GOES..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {goesLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="temp-threshold" className="text-xs">Umbral de Temperatura: <span className="font-bold">{tempThreshold}°C</span></Label>
                <Slider
                    id="temp-threshold"
                    min={-120}
                    max={0}
                    step={1}
                    value={[tempThreshold]}
                    onValueChange={(value) => setTempThreshold(value[0])}
                    disabled={isDetecting}
                />
            </div>
            <p className="text-xs text-gray-400">
                Vectoriza las áreas de la imagen GOES seleccionada que estén por debajo del umbral de temperatura.
            </p>
            <Button className="w-full" onClick={handleDetectStormCores} disabled={isDetecting || isLoading || !selectedGoesLayerId}>
                {isDetecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Zap className="mr-2 h-4 w-4" />
                )}
                Detectar Núcleos de Tormenta
            </Button>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
