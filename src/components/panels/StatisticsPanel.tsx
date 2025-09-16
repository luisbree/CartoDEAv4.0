"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChartHorizontal, Sigma, Maximize, Layers, Scissors } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type Feature from 'ol/Feature';
import type { Geometry, Polygon as OlPolygon, MultiPolygon as OlMultiPolygon } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import * as turf from '@turf/turf';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, Position, Feature as GeoJSONFeature, Geometry as GeoJSONGeometry } from 'geojson';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import { Style, Fill, Stroke } from 'ol/style';

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
}

interface StatResults {
  sum: number;
  mean: number;
  median: number;
  count: number;
  min: number;
  max: number;
  weightedSum?: number;
}

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
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [results, setResults] = useState<StatResults | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDrawingPolygonAvailable, setIsDrawingPolygonAvailable] = useState(false);
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

  // Reset state when layer changes
  useEffect(() => {
    if (layer) {
      setSelectedField(numericFields[0] || '');
      setResults(null);
      setIsSelectionMode(false);
    }
  }, [layer, numericFields]);

  // Effect to check for an available drawing polygon
  useEffect(() => {
    const source = drawingSource;
    if (!source) {
      setIsDrawingPolygonAvailable(false);
      return;
    }

    const checkPolygon = () => {
      const hasPolygon = source.getFeatures().some(f => f.getGeometry()?.getType() === 'Polygon');
      setIsDrawingPolygonAvailable(hasPolygon);
    };

    source.on(['addfeature', 'removefeature', 'clear'], checkPolygon);
    checkPolygon(); // Initial check

    return () => {
      source.un(['addfeature', 'removefeature', 'clear'], checkPolygon);
    };
  }, [drawingSource]);


  const handleCalculate = useCallback(() => {
    if (!layer || !selectedField) {
      setResults(null);
      return;
    }
    const source = layer.olLayer.getSource();
    if (!source) return;

    // Determine if we should use the selection
    const relevantSelectedFeatures = selectedFeatures.filter(feature => {
        // A feature from the selection is relevant if it exists in the current layer's source.
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

  const handleCreateLayerFromDrawing = useCallback(() => {
    if (!drawingSource) {
        toast({ description: "No hay fuente de dibujo disponible.", variant: "destructive"});
        return;
    }
    const drawingPolygonFeature = drawingSource.getFeatures().find(f => f.getGeometry()?.getType() === 'Polygon');
    if (!drawingPolygonFeature) {
        toast({ description: "No se encontró un polígono dibujado para crear la capa.", variant: "destructive"});
        return;
    }

    const clonedFeature = drawingPolygonFeature.clone();
    clonedFeature.setId(nanoid()); // Give it a new ID

    const layerName = `Polígono de Análisis`;
    const source = new VectorSource({ features: [clonedFeature] });
    const layerId = `analysis-poly-${nanoid()}`;
    const olLayer = new VectorLayer({
        source,
        properties: { id: layerId, name: layerName, type: 'vector' },
        style: new Style({
            stroke: new Stroke({ color: 'rgba(0, 255, 255, 1)', width: 2.5 }),
            fill: new Fill({ color: 'rgba(0, 255, 255, 0.3)' }),
        }),
    });
    onAddLayer({
        id: layerId,
        name: layerName,
        olLayer,
        visible: true,
        opacity: 1,
        type: 'vector',
    }, true);
    toast({ description: `Se creó la capa "${layerName}".` });
  }, [drawingSource, onAddLayer, toast]);
  
  const handleExtractByDrawing = useCallback(() => {
    if (!layer || !drawingSource) {
        toast({ description: "Seleccione una capa y dibuje un polígono.", variant: "destructive" });
        return;
    }
    const drawingPolygonFeature = drawingSource.getFeatures().find(f => f.getGeometry()?.getType() === 'Polygon');
    if (!drawingPolygonFeature) {
        toast({ description: "No se encontró un polígono dibujado para la extracción.", variant: "destructive" });
        return;
    }
    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource || analysisSource.getFeatures().length === 0) {
        toast({ description: "La capa de análisis no tiene entidades.", variant: "destructive" });
        return;
    }

    // This formatter will read map geometries (EPSG:3857) and write them as standard GeoJSON (EPSG:4326)
    const geojsonFormat = new GeoJSON({
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326'
    });

    const drawingGeom = drawingPolygonFeature.getGeometry() as OlPolygon;
    const drawingPolygonGeoJSON = geojsonFormat.writeGeometryObject(drawingGeom) as TurfPolygon;

    const intersectionResults: GeoJSONFeature[] = [];

    for (const feature of analysisSource.getFeatures()) {
        const featureGeom = feature.getGeometry();
        if (!featureGeom) continue;

        const featureGeoJSONObject = geojsonFormat.writeFeatureObject(feature);
        if (!featureGeoJSONObject || !featureGeoJSONObject.geometry) {
            continue;
        }

        const analysisGeometries: TurfPolygon[] = [];
        if (featureGeoJSONObject.geometry.type === 'Polygon') {
            analysisGeometries.push(featureGeoJSONObject.geometry as TurfPolygon);
        } else if (featureGeoJSONObject.geometry.type === 'MultiPolygon') {
            (featureGeoJSONObject.geometry as TurfMultiPolygon).coordinates.forEach(polyCoords => {
                analysisGeometries.push(turf.polygon(polyCoords).geometry);
            });
        }
        
        for (const analysisPolygon of analysisGeometries) {
             try {
                // Pass the geometry objects directly to turf.intersect
                const intersection = turf.intersect(drawingPolygonGeoJSON, analysisPolygon);
                
                if (intersection) {
                    const intersectionWithProps = turf.feature(intersection.geometry, feature.getProperties());
                    intersectionResults.push(intersectionWithProps);
                }
            } catch (error) {
                console.warn(`Error de Turf.js en la intersección para la entidad ${feature.getId()}:`, error);
            }
        }
    }

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
            style: new Style({
                stroke: new Stroke({ color: 'rgba(255, 0, 0, 1)', width: 2 }),
                fill: new Fill({ color: 'rgba(255, 0, 0, 0.5)' }),
            }),
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
}, [layer, drawingSource, toast, onAddLayer]);


  const handleCalculateWeightedSum = useCallback(async () => {
    // This function can be implemented later once the extraction is confirmed to work.
    toast({ description: "Función de suma ponderada aún no implementada en este panel."});
  }, [toast]);


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
                    onClick={handleCreateLayerFromDrawing} 
                    disabled={!isDrawingPolygonAvailable} 
                    className="h-8 text-xs"
                    variant="outline"
                    title={!isDrawingPolygonAvailable ? "Dibuje un polígono en el mapa primero" : "Crear una capa a partir del polígono dibujado"}
                >
                    <Layers className="mr-2 h-4 w-4" />
                    Crear Capa desde Dibujo
                </Button>
                <Button 
                    onClick={handleExtractByDrawing} 
                    disabled={!isDrawingPolygonAvailable || !layer}
                    className="h-8 text-xs"
                    variant="outline"
                    title={!isDrawingPolygonAvailable ? "Dibuje un polígono en el mapa primero" : "Extraer entidades de la capa por el área dibujada"}
                >
                    <Scissors className="mr-2 h-4 w-4" />
                    Extraer por Dibujo
                </Button>
            </div>
             <Button 
                onClick={handleCalculate} 
                disabled={!selectedField} 
                className="w-full h-8 text-xs"
                variant="secondary"
            >
                <Sigma className="mr-2 h-4 w-4" />
                Calcular Estadísticas Básicas
            </Button>
             <Button 
                onClick={handleCalculateWeightedSum} 
                disabled={!selectedField || !isDrawingPolygonAvailable} 
                className="w-full h-8 text-xs"
                variant="secondary"
                title={!isDrawingPolygonAvailable ? "Dibuje un polígono en el mapa primero" : ""}
            >
                <Maximize className="mr-2 h-4 w-4" />
                Suma Ponderada (WIP)
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
                             {results.weightedSum !== undefined && (
                                <TableRow className="bg-primary/20">
                                    <TableCell className="text-xs text-primary-foreground p-1.5 font-semibold">Suma Ponderada (por área dibujada)</TableCell>
                                    <TableCell className="text-xs text-primary-foreground p-1.5 text-right font-mono font-semibold">{results.weightedSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
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
