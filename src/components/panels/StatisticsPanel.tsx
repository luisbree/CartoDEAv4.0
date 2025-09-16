
"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChartHorizontal, Sigma, Maximize, Layers, Scissors, Square } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type Feature from 'ol/Feature';
import type { Geometry, Polygon as OlPolygon } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import * as turf from '@turf/turf';
import bboxClip from '@turf/bbox-clip';
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
  selectedFeatures,
  drawingSource,
  onAddLayer,
  style,
  mapRef,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
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

  const stopDrawing = useCallback(() => {
      if (drawInteractionRef.current && mapRef.current) {
          mapRef.current.removeInteraction(drawInteractionRef.current);
          drawInteractionRef.current = null;
          setIsDrawingRectangle(false);
      }
  }, [mapRef]);

  // Cleanup effect for removing the analysis layer and interaction when the panel is closed or component unmounts
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
    }
  }, [layer, numericFields]);


  const handleToggleDrawRectangle = useCallback(() => {
      if (!mapRef.current) return;
      if (isDrawingRectangle) {
          stopDrawing();
          return;
      }
      
      setIsDrawingRectangle(true);
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
          
          toast({ description: `Área de análisis definida.` });
          stopDrawing();
      });
  }, [mapRef, isDrawingRectangle, stopDrawing, toast]);


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
        toast({ description: "Seleccione una capa y dibuje un polígono de análisis.", variant: "destructive" });
        return;
    }
    
    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource || analysisSource.getFeatures().length === 0) {
        toast({ description: "La capa de análisis no tiene entidades.", variant: "destructive" });
        return;
    }

    const geojsonFormat = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const drawingFeatureGeoJSON = geojsonFormat.writeFeatureObject(analysisFeatureRef.current);
    const clipBbox = turf.bbox(drawingFeatureGeoJSON);
    const intersectionResults: any[] = [];

    analysisSource.getFeatures().forEach(feature => {
        const featureGeoJSONObject = geojsonFormat.writeFeatureObject(feature);
        try {
            const clipped = bboxClip(featureGeoJSONObject, clipBbox);
            if (clipped && clipped.geometry && clipped.geometry.coordinates.length > 0) {
                // Restore original properties to the clipped geometry
                const clippedFeatureWithProps = turf.feature(clipped.geometry, feature.getProperties());
                intersectionResults.push(clippedFeatureWithProps);
            }
        } catch (error) {
            console.warn(`Error de Turf.js al recortar la entidad ${feature.getId()}:`, error);
        }
    });

    if (intersectionResults.length > 0) {
        const features = new GeoJSON({ featureProjection: 'EPSG:3857' }).readFeatures({
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
            style: layer.olLayer.getStyle(), // Inherit style from parent
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
        toast({ description: "Seleccione capa, campo y dibuje un área de análisis.", variant: "destructive" });
        return;
    }

    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource) return;

    const geojsonFormat = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const drawingFeatureTurf = turf.feature((geojsonFormat.writeFeature(analysisFeatureRef.current) as any).geometry);
    
    let totalWeightedSum = 0;
    let totalIntersectionArea = 0;

    console.log(`--- Iniciando Cálculo Ponderado para el campo "${selectedField}" ---`);

    analysisSource.getFeatures().forEach(feature => {
        const featureValue = feature.get(selectedField);
        if (typeof featureValue !== 'number' || !isFinite(featureValue)) {
            return;
        }
        
        const analysisFeatureTurf = turf.feature((geojsonFormat.writeFeature(feature) as any).geometry, feature.getProperties());
        if (!analysisFeatureTurf.geometry) return;

        try {
            const clippedFeature = turf.clip(analysisFeatureTurf, drawingFeatureTurf);
            
            if (clippedFeature) {
                const intersectionArea = turf.area(clippedFeature);
                console.log(`Entidad ID ${feature.getId()}: Intersección encontrada. Área de intersección: ${intersectionArea.toFixed(2)} m²`);

                if (intersectionArea > 0) {
                    const weightedValue = featureValue * intersectionArea;
                    totalWeightedSum += weightedValue;
                    totalIntersectionArea += intersectionArea;
                    console.log(`   - Valor del campo: ${featureValue}`);
                    console.log(`   - Valor ponderado (valor * área): ${weightedValue.toFixed(2)}`);
                }
            }
        } catch (error) {
            console.warn(`Error en la operación de clip de Turf.js para la entidad ${feature.getId()}:`, error);
        }
    });

    const weightedAverage = totalIntersectionArea > 0 ? totalWeightedSum / totalIntersectionArea : 0;

    console.log(`--- Cálculo Finalizado ---`);
    console.log(`Suma Ponderada Total: ${totalWeightedSum.toFixed(2)}`);
    console.log(`Área Total de Intersección: ${totalIntersectionArea.toFixed(2)} m²`);
    console.log(`Promedio Ponderado Final: ${weightedAverage.toFixed(4)}`);

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
                <Button 
                    onClick={handleExtractByDrawing} 
                    disabled={!analysisFeatureRef.current || !layer}
                    className="h-8 text-xs border-white/30 bg-black/20"
                    variant="outline"
                    title={!analysisFeatureRef.current ? "Dibuje un rectángulo de análisis primero" : "Extraer entidades de la capa por el área dibujada"}
                >
                    <Scissors className="mr-2 h-4 w-4" />
                    Extraer por Dibujo
                </Button>
            </div>
             <Button 
                onClick={handleCalculate} 
                disabled={!selectedField} 
                className="w-full h-8 text-xs border-white/30 bg-black/20"
                variant="secondary"
            >
                <Sigma className="mr-2 h-4 w-4" />
                Calcular Estadísticas Básicas
            </Button>
             <Button 
                onClick={handleCalculateWeightedSum} 
                disabled={!selectedField || !analysisFeatureRef.current} 
                className="w-full h-8 text-xs border-white/30 bg-black/20"
                variant="secondary"
                title={!analysisFeatureRef.current ? "Dibuje un polígono en el mapa primero" : ""}
            >
                <Maximize className="mr-2 h-4 w-4" />
                Calcular Promedio Ponderado
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
                                    <TableCell className="text-xs text-primary-foreground p-1.5 font-semibold">Promedio Ponderado (por área)</TableCell>
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
