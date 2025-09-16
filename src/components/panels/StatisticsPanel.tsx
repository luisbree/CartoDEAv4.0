
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
import type { Geometry, Polygon as OlPolygon, MultiPolygon as OlMultiPolygon } from 'ol/geom';
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
import { get as getProjection, transform } from 'ol/proj';


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
  mapRef,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [results, setResults] = useState<StatResults | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDrawingRectangle, setIsDrawingRectangle] = useState(false);
  const drawInteractionRef = useRef<Draw | null>(null);
  const analysisPolygonRef = useRef<Feature<OlPolygon> | null>(null);

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

  const stopDrawing = useCallback(() => {
      if (drawInteractionRef.current && mapRef.current) {
          mapRef.current.removeInteraction(drawInteractionRef.current);
          drawInteractionRef.current = null;
          setIsDrawingRectangle(false);
          toast({ description: "Herramienta de dibujo desactivada." });
      }
  }, [mapRef, toast]);


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
          // Set properties on the feature so it has attributes
          feature.setProperties({
              name: 'Área de Análisis',
              created_at: new Date().toISOString(),
          });
          feature.setId(`analysis-poly-feature-${nanoid()}`);
          analysisPolygonRef.current = feature;
          
          const layerName = `Área de Análisis`;
          const source = new VectorSource({ features: [feature] });
          const layerId = `analysis-poly-${nanoid()}`;
          const olLayer = new VectorLayer({
              source,
              properties: { id: layerId, name: layerName, type: 'analysis' },
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
              type: 'analysis',
          }, true);
          toast({ description: `Se creó la capa "${layerName}".` });
          stopDrawing();
      });
  }, [mapRef, isDrawingRectangle, stopDrawing, onAddLayer, toast]);


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
    if (!layer || !analysisPolygonRef.current) {
        toast({ description: "Seleccione una capa y dibuje un polígono de análisis.", variant: "destructive" });
        return;
    }
    const drawingPolygonFeature = analysisPolygonRef.current;
    
    const analysisSource = layer.olLayer.getSource();
    if (!analysisSource || analysisSource.getFeatures().length === 0) {
        toast({ description: "La capa de análisis no tiene entidades.", variant: "destructive" });
        return;
    }

    const geojsonFormat = new GeoJSON();
    const mapProjection = getProjection('EPSG:3857');
    const dataProjection = getProjection('EPSG:4326');
    
    // 1. Convert drawing polygon to a valid Turf-ready GeoJSON feature
    const drawingGeom = drawingPolygonFeature.getGeometry()?.clone().transform(mapProjection!, dataProjection!);
    if (!drawingGeom) {
        toast({ description: "La geometría del dibujo es inválida.", variant: "destructive" });
        return;
    }
    const drawingPolygonGeoJSON = geojsonFormat.writeGeometryObject(drawingGeom) as TurfPolygon | TurfMultiPolygon;
    
    const intersectionResults: GeoJSONFeature[] = [];

    analysisSource.getFeatures().forEach(feature => {
        const featureGeom = feature.getGeometry()?.clone().transform(mapProjection!, dataProjection!);
        if (!featureGeom) return;

        const analysisPolygon = geojsonFormat.writeGeometryObject(featureGeom) as TurfPolygon | TurfMultiPolygon;
        
        console.log("POLYGON 1 (Dibujo):", drawingPolygonGeoJSON);
        console.log("POLYGON 2 (Análisis):", analysisPolygon);

        try {
          // 1. CALCULAR LA INTERSECCIÓN
          //    Esta es la función principal de la librería Turf.js.
          //    Toma dos geometrías (el polígono dibujado y el polígono de la capa de análisis)
          //    y devuelve una nueva geometría que representa SOLO la parte donde se superponen.
          //    Si no se superponen en absoluto, devuelve `null`.
          const intersection = turf.intersect(drawingPolygonGeoJSON, analysisPolygon);
          console.log('Resultado de la intersección:', intersection);
        
          // 2. VERIFICAR SI HUBO UNA INTERSECCIÓN
          //    Este `if` comprueba si la variable `intersection` no es `null`.
          //    Si es `null` (no hubo superposición), el código dentro del `if` no se ejecuta.
          if (intersection) {
        
            // 3. CREAR UNA NUEVA ENTIDAD (FEATURE)
            //    Si hubo una intersección, creamos una nueva entidad geográfica.
            //    - Geometría: Usamos la nueva geometría de la intersección que acabamos de calcular.
            //    - Propiedades: Copiamos todos los atributos (como nombre, área, etc.) de la entidad original de la capa de análisis.
            const intersectedFeature = turf.feature(intersection.geometry, feature.getProperties());
        
            // 4. GUARDAR EL RESULTADO
            //    Añadimos esta nueva entidad (que es el "recorte") a nuestro array de resultados.
            intersectionResults.push(intersectedFeature);
          }
        } catch (error) {
          // 5. MANEJO DE ERRORES
          //    A veces, las geometrías pueden tener errores internos (micro-bucles, etc.).
          //    Si `turf.intersect` falla, este bloque `catch` se activa.
          //    Imprime un aviso en la consola del navegador con el ID de la entidad que causó el problema,
          //    pero permite que el programa continúe con la siguiente entidad sin detenerse.
          console.warn(`Error de Turf.js en la intersección para la entidad ${feature.getId()}:`, error);
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
}, [layer, toast, onAddLayer]);


  const handleCalculateWeightedSum = useCallback(async () => {
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
                    onClick={handleToggleDrawRectangle}
                    className={cn("h-8 text-xs", isDrawingRectangle && "bg-primary hover:bg-primary/90")}
                    variant="outline"
                    title={isDrawingRectangle ? "Cancelar dibujo" : "Dibujar un rectángulo en el mapa para usar como área de análisis"}
                >
                    <Square className="mr-2 h-4 w-4" />
                    {isDrawingRectangle ? "Dibujando..." : "Dibujar Rectángulo de Análisis"}
                </Button>
                <Button 
                    onClick={handleExtractByDrawing} 
                    disabled={!analysisPolygonRef.current || !layer}
                    className="h-8 text-xs"
                    variant="outline"
                    title={!analysisPolygonRef.current ? "Dibuje un rectángulo de análisis primero" : "Extraer entidades de la capa por el área dibujada"}
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
                disabled={!selectedField || !analysisPolygonRef.current} 
                className="w-full h-8 text-xs"
                variant="secondary"
                title={!analysisPolygonRef.current ? "Dibuje un polígono en el mapa primero" : ""}
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
