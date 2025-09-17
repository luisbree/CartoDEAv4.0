"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartHorizontal, Sigma, Square, Eraser, Brush, Target } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type Feature from 'ol/Feature';
import type { Geometry, Polygon as OlPolygon } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import { Style, Fill, Stroke } from 'ol/style';
import type { Map } from 'ol';
import Draw, { createBox } from 'ol/interaction/Draw';
import { cn } from '@/lib/utils';
import { calculateSpatialStats } from '@/services/spatial-analysis';
import { multiPolygon } from '@turf/helpers';
import type { Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon } from 'geojson';


interface StatisticsPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  layer: VectorMapLayer | null;
  allLayers: MapLayer[];
  selectedFeatures: Feature<Geometry>[];
  style?: React.CSSProperties;
  mapRef: React.RefObject<Map | null>;
}

interface StatResults {
  sum?: number;
  mean?: number;
  median?: number;
  count?: number;
  min?: number;
  max?: number;
  weightedAverage?: number;
  proportionalSum?: number;
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
  style,
  mapRef,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [maskLayerId, setMaskLayerId] = useState<string>('');
  const [results, setResults] = useState<StatResults | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<'Rectangle' | 'FreehandPolygon' | null>(null);
  
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

  const polygonLayersForMask = useMemo(() => {
    return allLayers.filter((l): l is VectorMapLayer => 
        l.id !== layer?.id && // Exclude the layer being analyzed
        (l.type === 'vector' || l.type === 'wfs' || l.type === 'osm' || l.type === 'drawing' || l.type === 'analysis')
    ).filter(l => {
      const source = l.olLayer.getSource();
      const features = source?.getFeatures();
      if (features && features.length > 0) {
        const geomType = features[0].getGeometry()?.getType();
        return geomType === 'Polygon' || geomType === 'MultiPolygon';
      }
      return false;
    });
  }, [allLayers, layer]);


  const stopDrawing = useCallback(() => {
      if (drawInteractionRef.current && mapRef.current) {
          mapRef.current.removeInteraction(drawInteractionRef.current);
          drawInteractionRef.current = null;
          setActiveDrawTool(null);
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
      setMaskLayerId('');
      analysisFeatureRef.current = null;
      if (analysisLayerRef.current) {
        analysisLayerRef.current.getSource()?.clear();
      }
    }
  }, [layer, numericFields]);
  
  const handleSelectMaskLayer = (layerId: string) => {
    setMaskLayerId(layerId);
    // Using a layer as a mask is mutually exclusive with drawing a mask
    handleClearAnalysisArea(false); // Don't show toast
    if (layerId) {
      toast({ description: `Se usará la capa seleccionada como área de análisis.` });
    }
  };

  const handleToggleDrawTool = useCallback((tool: 'Rectangle' | 'FreehandPolygon') => {
      if (!mapRef.current) return;
      
      setMaskLayerId(''); // Clear layer mask selection
      stopDrawing(); // Stop any current drawing first

      if (activeDrawTool === tool) { // If clicking the same tool, just deactivate it
          setActiveDrawTool(null);
          return;
      }
      
      setActiveDrawTool(tool);
      toast({ description: `Haz clic y arrastra en el mapa para dibujar un ${tool === 'Rectangle' ? 'rectángulo' : 'área a mano alzada'}.` });
      
      const draw = new Draw({
          type: tool === 'Rectangle' ? 'Circle' : 'Polygon',
          geometryFunction: tool === 'Rectangle' ? createBox() : undefined,
          freehand: tool === 'FreehandPolygon',
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
  }, [mapRef, activeDrawTool, stopDrawing, toast]);

  const handleClearAnalysisArea = useCallback((showToast = true) => {
    stopDrawing();
    setMaskLayerId('');
    if (analysisLayerRef.current) {
      analysisLayerRef.current.getSource()?.clear();
    }
    analysisFeatureRef.current = null;
    setResults(null);
    if (showToast) {
        toast({ description: "Área de análisis limpiada." });
    }
  }, [stopDrawing, toast]);


  const handleCalculateBasicStats = useCallback(() => {
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

  const performSpatialAnalysis = useCallback(async () => {
    if (!layer || !selectedField) {
      toast({ description: "Seleccione una capa y un campo para analizar.", variant: "destructive" });
      return;
    }

    let maskGeometry: TurfPolygon | TurfMultiPolygon | null = null;
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    
    if (maskLayerId) {
        const maskLayer = polygonLayersForMask.find(l => l.id === maskLayerId);
        const maskSource = maskLayer?.olLayer.getSource();
        if (maskSource && maskSource.getFeatures().length > 0) {
            const maskFeatures = maskSource.getFeatures();
            const maskGeoJSON = format.writeFeaturesObject(maskFeatures);
            const maskPolygons = maskGeoJSON.features.flatMap(f =>
                f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
            );
            if (maskPolygons.length > 0) {
                maskGeometry = multiPolygon(maskPolygons).geometry;
            }
        }
    } else if (analysisFeatureRef.current) {
        maskGeometry = format.writeFeatureObject(analysisFeatureRef.current).geometry as TurfPolygon;
    }

    if (!maskGeometry) {
      toast({ description: "Defina un área de análisis dibujando en el mapa o seleccionando una capa de polígonos.", variant: "destructive" });
      return;
    }

    toast({ description: "Realizando análisis espacial..." });

    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource || analysisSource.getFeatures().length === 0) return;
    
    const analysisFeaturesGeoJSON = format.writeFeaturesObject(analysisSource.getFeatures());
    
    try {
        const { weightedAverage, proportionalSum } = await calculateSpatialStats({
            analysisFeaturesGeoJSON,
            drawingPolygonGeoJSON: maskGeometry,
            field: selectedField
        });
        
        setResults({ weightedAverage, proportionalSum });
        
        toast({ description: "Análisis espacial completado." });
    } catch (error: any) {
        console.error(`Error during spatial analysis calculation:`, error);
        toast({ title: "Error de Cálculo", description: error.message, variant: "destructive" });
    }
  }, [layer, selectedField, toast, maskLayerId, polygonLayersForMask]);
  

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
              <Label className="text-xs">Definir Área de Análisis</Label>
              <div className="space-y-2 p-2 border border-white/10 rounded-md">
                <div className="flex items-center gap-2">
                     <Button 
                        onClick={() => handleToggleDrawTool('Rectangle')}
                        size="icon"
                        className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeDrawTool === 'Rectangle' && "bg-primary hover:bg-primary/90")}
                        variant="outline"
                        title={activeDrawTool === 'Rectangle' ? "Cancelar dibujo" : "Dibujar un rectángulo en el mapa"}
                    >
                        <Square className="h-4 w-4" />
                    </Button>
                     <Button 
                        onClick={() => handleToggleDrawTool('FreehandPolygon')}
                        size="icon"
                        className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeDrawTool === 'FreehandPolygon' && "bg-primary hover:bg-primary/90")}
                        variant="outline"
                        title={activeDrawTool === 'FreehandPolygon' ? "Cancelar dibujo" : "Dibujar un área a mano alzada"}
                    >
                        <Brush className="h-4 w-4" />
                    </Button>
                    <Button
                        onClick={() => handleClearAnalysisArea(true)}
                        size="icon"
                        className="h-8 w-8 text-xs border-white/30 bg-black/20 hover:bg-red-500/20 hover:text-red-300"
                        variant="outline"
                        title="Limpiar área de análisis"
                    >
                        <Eraser className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-grow border-t border-dashed border-gray-600"></div>
                  <span className="text-xs text-gray-400">o</span>
                  <div className="flex-grow border-t border-dashed border-gray-600"></div>
                </div>
                 <Select value={maskLayerId} onValueChange={handleSelectMaskLayer} disabled={polygonLayersForMask.length === 0}>
                    <SelectTrigger className="h-8 text-xs bg-black/20">
                        <SelectValue placeholder="Usar capa como área..." />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                        {polygonLayersForMask.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                    </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                 <Button 
                    onClick={handleCalculateBasicStats} 
                    disabled={!selectedField} 
                    className="h-8 text-xs border-white/30 bg-black/20 flex-grow text-white hover:bg-white/5"
                    variant="secondary"
                >
                    <Sigma className="mr-2 h-4 w-4" />
                    Estadísticas
                </Button>
                 <Button 
                    onClick={performSpatialAnalysis}
                    disabled={!selectedField || (!analysisFeatureRef.current && !maskLayerId)} 
                    className="h-8 text-xs border-white/30 bg-black/20 flex-grow text-white hover:bg-white/5"
                    variant="secondary"
                    title={!analysisFeatureRef.current && !maskLayerId ? "Defina un área de análisis primero" : ""}
                >
                    <Target className="mr-2 h-4 w-4" />
                    Análisis Espacial
                </Button>
            </div>

            {results && (
                <div className="pt-2 border-t border-white/10">
                    <Table>
                        <TableBody>
                            {results.sum !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Suma</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>}
                            {results.mean !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Promedio</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>}
                            {results.median !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Mediana</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.median.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>}
                            {results.min !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Mínimo</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.min.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>}
                            {results.max !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Máximo</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell></TableRow>}
                            {results.count !== undefined && <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Cantidad</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{results.count.toLocaleString()}</TableCell></TableRow>}
                            
                            {results.proportionalSum !== undefined && (
                                <TableRow className="bg-primary/20">
                                    <TableCell className="text-xs text-primary-foreground p-1.5 font-semibold">Suma Proporcional</TableCell>
                                    <TableCell className="text-xs text-primary-foreground p-1.5 text-right font-mono font-semibold">{results.proportionalSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            )}
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
