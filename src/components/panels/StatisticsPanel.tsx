
"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartHorizontal, Sigma, Maximize, Layers, Scissors, Square } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type Feature from 'ol/Feature';
import type { Geometry, Polygon as OlPolygon } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import * as turf from '@turf/turf';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, Position, Feature as GeoJSONFeature, Geometry as GeoJSONGeometry } from 'geojson';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import { Style, Fill, Stroke } from 'ol/style';
import type { Map } from 'ol';
import Draw, { createBox } from 'ol/interaction/Draw';
import { cn } from '@/lib/utils';


interface StatisticsPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  layer: VectorMapLayer | null;
  allLayers: MapLayer[]; // All layers to populate the selector
  selectedFeatures: Feature<Geometry>[];
  drawingSource: VectorSource<Feature<Geometry>> | null;
  onAddLayer: (layer: MapLayer, bringToTop?: boolean) => void;
  style?: React.CSSProperties;
  mapRef: React.RefObject<Map | null>;
}

interface StatResults {
  sum: number;
  mean: number;
  median: number;
  count: number;
  min: number;
  max: number;
  weightedSum?: number;
  weightedAverage?: number;
}

const analysisLayerStyle = new Style({
    stroke: new Stroke({ color: 'rgba(0, 255, 255, 1)', width: 2.5, lineDash: [8, 8] }),
    fill: new Fill({ color: 'rgba(0, 255, 255, 0.2)' }),
});

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  layer,
  allLayers,
  selectedFeatures,
  drawingSource,
  onAddLayer,
  style,
  mapRef,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [selectedAnalysisLayerId, setSelectedAnalysisLayerId] = useState<string>('');
  const [results, setResults] = useState<StatResults | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDrawingRectangle, setIsDrawingRectangle] = useState(false);
  
  const analysisFeatureRef = useRef<Feature<OlPolygon> | null>(null);
  const analysisLayerRef = useRef<VectorLayer<VectorSource<Feature<OlPolygon>>> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const { toast } = useToast();

  const numericFields = useMemo(() => {
    if (!layer) return [];
    const source = layer.olLayer.getSource();
    if (!source) return [];
    const features = source.getFeatures();
    if (features.length === 0) return [];

    const keys = new Set<string>();
    const firstFeatureProps = features[0].getProperties();
    for (const key in firstFeatureProps) {
      if (typeof firstFeatureProps[key] === 'number') {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  }, [layer]);

  const polygonLayers = useMemo(() => {
    return allLayers.filter((l): l is VectorMapLayer => {
        if (l.type === 'vector' || l.type === 'wfs' || l.type === 'osm' || l.type === 'drawing' || l.type === 'analysis') {
            const source = (l as VectorMapLayer).olLayer.getSource();
            if (source && source.getFeatures().length > 0) {
                const geomType = source.getFeatures()[0].getGeometry()?.getType();
                return geomType === 'Polygon' || geomType === 'MultiPolygon';
            }
        }
        return false;
    });
  }, [allLayers]);

  const stopDrawing = useCallback(() => {
      if (drawInteractionRef.current && mapRef.current) {
          mapRef.current.removeInteraction(drawInteractionRef.current);
          drawInteractionRef.current = null;
          setIsDrawingRectangle(false);
      }
  }, [mapRef]);

  // Cleanup effect
  useEffect(() => {
    return () => {
        stopDrawing();
        if (analysisLayerRef.current && mapRef.current) {
            mapRef.current.removeLayer(analysisLayerRef.current);
            analysisLayerRef.current = null;
            analysisFeatureRef.current = null;
        }
    };
  }, [mapRef, stopDrawing]);


  // Reset state when layer changes
  useEffect(() => {
    if (layer) {
      setSelectedField(numericFields[0] || '');
      setResults(null);
      setIsSelectionMode(false);
      setSelectedAnalysisLayerId('');
      analysisFeatureRef.current = null;
      if (analysisLayerRef.current) {
        analysisLayerRef.current.getSource()?.clear();
      }
    }
  }, [layer, numericFields]);


  const handleToggleDrawRectangle = useCallback(() => {
      if (!mapRef.current) return;
      if (isDrawingRectangle) {
          stopDrawing();
          return;
      }
      
      setIsDrawingRectangle(true);
      setSelectedAnalysisLayerId(''); // Deselect layer if user starts drawing
      toast({ description: "Haz clic en dos esquinas opuestas en el mapa para dibujar un rectángulo." });
      
      const draw = new Draw({
          type: 'Circle',
          geometryFunction: createBox(),
      });

      drawInteractionRef.current = draw;
      mapRef.current.addInteraction(draw);
      
      draw.once('drawend', (event) => {
          const feature = event.feature as Feature<OlPolygon>;
          analysisFeatureRef.current = feature;
          
          if (!analysisLayerRef.current) {
            const source = new VectorSource();
            analysisLayerRef.current = new VectorLayer({
                source,
                style: analysisLayerStyle,
                properties: { id: `internal-analysis-layer-${nanoid()}`, name: 'Capa de Análisis Interna' },
            });
            mapRef.current?.addLayer(analysisLayerRef.current);
          }
          analysisLayerRef.current.getSource()?.clear();
          analysisLayerRef.current.getSource()?.addFeature(feature);
          
          toast({ description: `Área de análisis definida por dibujo.` });
          stopDrawing();
      });
  }, [mapRef, isDrawingRectangle, stopDrawing, toast]);

  const handleAnalysisLayerSelect = (layerId: string) => {
    setSelectedAnalysisLayerId(layerId);
    stopDrawing(); // Stop drawing if a layer is selected
    const selectedLayer = polygonLayers.find(l => l.id === layerId);
    if (selectedLayer) {
        const source = selectedLayer.olLayer.getSource();
        const features = source?.getFeatures();
        if (features && features.length > 0) {
            // Using the first feature for now. Could be expanded to merge all features.
            analysisFeatureRef.current = features[0] as Feature<OlPolygon>;

            if (!analysisLayerRef.current && mapRef.current) {
              const source = new VectorSource();
              analysisLayerRef.current = new VectorLayer({ source, style: analysisLayerStyle });
              mapRef.current.addLayer(analysisLayerRef.current);
            }

            analysisLayerRef.current?.getSource()?.clear();
            analysisLayerRef.current?.getSource()?.addFeature(features[0].clone()); // Show a clone on the map
            
            toast({ description: `Área de análisis definida por la capa "${selectedLayer.name}".` });
        } else {
            analysisFeatureRef.current = null;
            analysisLayerRef.current?.getSource()?.clear();
        }
    }
  };


  const handleCalculate = useCallback(() => {
    if (!layer || !selectedField) {
      setResults(null);
      return;
    }
    const source = layer.olLayer.getSource();
    if (!source) return;

    const relevantSelectedFeatures = selectedFeatures.filter(feature => {
        return source.getFeatureById(feature.getId() as string | number) !== null;
    });

    const featuresToAnalyze = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : source.getFeatures();
    setIsSelectionMode(relevantSelectedFeatures.length > 0);

    const values = featuresToAnalyze
      .map(f => f.get(selectedField))
      .filter(v => typeof v === 'number' && isFinite(v)) as number[];

    if (values.length === 0) {
      setResults(null);
      return;
    }

    values.sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    const count = values.length;
    const min = values[0];
    const max = values[values.length - 1];

    setResults({ sum, mean, median, count, min, max });
  }, [layer, selectedField, selectedFeatures]);

  
 const handleExtractByDrawing = useCallback(() => {
    if (!layer || !analysisFeatureRef.current) {
        toast({ description: "Seleccione una capa y defina un área de análisis.", variant: "destructive" });
        return;
    }
    
    const inputSource = layer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
        toast({ description: "La capa de análisis no tiene entidades.", variant: "destructive" });
        return;
    }

    const format4326 = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const format3857 = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    
    const maskFeature4326 = format4326.writeFeatureObject(analysisFeatureRef.current);

    const intersectionResults: any[] = [];

    inputSource.getFeatures().forEach(feature => {
        const feature4326 = format4326.writeFeatureObject(feature);
        try {
            const intersection = turf.intersect(feature4326 as any, maskFeature4326 as any);
            if (intersection) {
                const intersectionFeatureWithProps = turf.feature(intersection.geometry, feature.getProperties());
                intersectionResults.push(intersectionFeatureWithProps);
            }
        } catch (error) {
            console.warn(`Error de Turf.js al intersectar la entidad ${feature.getId()}:`, error);
        }
    });

    if (intersectionResults.length > 0) {
        const features = format3857.readFeatures({
            type: 'FeatureCollection',
            features: intersectionResults,
        });
        features.forEach(f => f.setId(nanoid()));
        
        const layerName = `Recorte de ${layer.name}`;
        const source = new VectorSource({ features });
        const layerId = `intersection-${nanoid()}`;
        const olLayer = new VectorLayer({
            source,
            properties: { id: layerId, name: layerName, type: 'vector' },
            style: layer.olLayer.getStyle(),
        });
        onAddLayer({
            id: layerId,
            name: layerName,
            olLayer,
            visible: true,
            opacity: 1,
            type: 'vector',
        }, true);
        toast({ description: `Se creó la capa de recorte "${layerName}" con ${features.length} entidades.` });
    } else {
        toast({ description: "No se encontraron intersecciones para crear una capa de recorte." });
    }
}, [layer, toast, onAddLayer]);


  const handleCalculateWeightedSum = useCallback(async () => {
    if (!layer || !selectedField || !analysisFeatureRef.current) {
        toast({ description: "Seleccione capa, campo y defina un área de análisis.", variant: "destructive" });
        return;
    }

    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource) return;
    
    const format4326 = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    
    const maskFeature4326 = format4326.writeFeatureObject(analysisFeatureRef.current);

    let totalWeightedSum = 0;
    let totalIntersectionArea = 0;
    
    analysisSource.getFeatures().forEach(feature => {
        const featureValue = feature.get(selectedField);
        if (typeof featureValue !== 'number' || !isFinite(featureValue)) {
            return;
        }
        
        const analysisFeature4326 = format4326.writeFeatureObject(feature) as TurfFeature<TurfPolygon | TurfMultiPolygon>;
        if (!analysisFeature4326.geometry) return;

        try {
            const intersection = turf.intersect(analysisFeature4326, maskFeature4326 as any);
            
            if (intersection) {
                const intersectionArea = turf.area(intersection);
                if (intersectionArea > 0) {
                    const weightedValue = featureValue * intersectionArea;
                    totalWeightedSum += weightedValue;
                    totalIntersectionArea += intersectionArea;
                }
            }
        } catch (error) {
            console.warn(`Error en la operación de intersección de Turf.js para la entidad ${feature.getId()}:`, error);
        }
    });

    const weightedAverage = totalIntersectionArea > 0 ? totalWeightedSum / totalIntersectionArea : 0;

    setResults(prev => ({
        ...(prev || { sum: 0, mean: 0, median: 0, count: 0, min: 0, max: 0 }),
        weightedSum: totalWeightedSum,
        weightedAverage: weightedAverage,
    }));
    toast({ description: "Cálculo de promedio ponderado completado." });
  }, [layer, selectedField, toast]);


  const panelTitle = `Estadísticas: ${layer?.name || ''}${isSelectionMode ? ' (Selección)' : ''}`;

  return (
    <DraggablePanel
      title={panelTitle}
      icon={BarChartHorizontal}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: "auto" }}
    >
        <div className="space-y-3">
            <div className="space-y-1">
                <Label htmlFor="stats-field-select" className="text-xs">
                    Campo a analizar
                </Label>
                <Select value={selectedField} onValueChange={setSelectedField} disabled={numericFields.length === 0}>
                    <SelectTrigger id="stats-field-select" className="h-8 text-xs bg-black/20">
                        <SelectValue placeholder="Seleccionar campo numérico..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                        {numericFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            
            <div className="space-y-2">
                <Label className="text-xs">Área de Análisis</Label>
                <div className="flex items-center gap-2">
                    <Button 
                        onClick={handleToggleDrawRectangle}
                        size="icon"
                        className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", isDrawingRectangle && "bg-primary hover:bg-primary/90")}
                        variant="outline"
                        title={isDrawingRectangle ? "Cancelar dibujo" : "Dibujar un rectángulo en el mapa para usar como área de análisis"}
                    >
                        <Square className="h-4 w-4" />
                    </Button>
                    <Select value={selectedAnalysisLayerId} onValueChange={handleAnalysisLayerSelect} disabled={polygonLayers.length === 0}>
                        <SelectTrigger className="h-8 text-xs bg-black/20 flex-grow" title="Usar una capa de polígonos existente como área de análisis">
                            <SelectValue placeholder="O usar capa como área..." />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                            {polygonLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex items-center gap-2">
                 <Button 
                    onClick={handleCalculate} 
                    disabled={!selectedField} 
                    className="h-8 text-xs border-white/30 bg-black/20 flex-grow"
                    variant="secondary"
                >
                    <Sigma className="mr-2 h-4 w-4" />
                    Calcular Estadísticas
                </Button>
                 <Button 
                    onClick={handleExtractByDrawing} 
                    disabled={!analysisFeatureRef.current || !layer}
                    className="h-8 text-xs border-white/30 bg-black/20"
                    variant="outline"
                    title={!analysisFeatureRef.current ? "Defina un área de análisis primero" : "Extraer entidades de la capa por el área de análisis"}
                >
                    <Scissors className="mr-2 h-4 w-4" />
                    Extraer
                </Button>
            </div>
             <Button 
                onClick={handleCalculateWeightedSum} 
                disabled={!selectedField || !analysisFeatureRef.current} 
                className="w-full h-8 text-xs border-white/30 bg-black/20"
                variant="secondary"
                title={!analysisFeatureRef.current ? "Defina un área de análisis primero" : ""}
            >
                <Maximize className="mr-2 h-4 w-4" />
                Calcular Promedio Ponderado por Área
            </Button>

            {results && (
                <div className="pt-2 border-t border-white/10">
                    <Table>
                        <TableBody>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Suma</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Promedio</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Mediana</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.median.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Mínimo</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Máximo</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>
                            <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Cantidad</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.count.toLocaleString()}</TableCell></TableRow>
                             {results.weightedAverage !== undefined && (
                                <TableRow className="bg-primary/20">
                                    <TableCell className="text-xs text-primary-foreground p-1.5 font-semibold">Promedio Ponderado</TableCell>
                                    <TableCell className="text-xs text-primary-foreground p-1.5 text-right font-mono font-semibold">{results.weightedAverage.toLocaleString(undefined, { maximumFractionDigits: 4 })}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    </DraggablePanel>
  );
};

export default StatisticsPanel;

    