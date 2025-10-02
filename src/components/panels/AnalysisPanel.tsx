

"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftingCompass, Scissors, Layers, CircleDotDashed, MinusSquare, BoxSelect, Droplet, Sparkles, Loader2, Combine, Minus, Plus, TrendingUp, Waypoints as CrosshairIcon, Merge, LineChart } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { intersect, featureCollection, difference, cleanCoords } from '@turf/turf';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry, LineString as TurfLineString, Point as TurfPoint } from 'geojson';
import { multiPolygon } from '@turf/helpers';
import Feature from 'ol/Feature';
import { type Geometry, type LineString as OlLineString, Point } from 'ol/geom';
import { getLength as olGetLength } from 'ol/sphere';
import { performBufferAnalysis, performConvexHull, performConcaveHull, calculateOptimalConcavity, projectPopulationGeometric, generateCrossSections, dissolveFeatures } from '@/services/spatial-analysis';
import { getGeeProfile } from '@/ai/flows/gee-flow';
import type { GeeProfileOutput, ProfilePoint } from '@/ai/flows/gee-types';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid, Line, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Style, Text as TextStyle, Fill, Stroke } from 'ol/style';


interface AnalysisPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  allLayers: MapLayer[];
  selectedFeatures: Feature<Geometry>[];
  onAddLayer: (layer: MapLayer, bringToTop?: boolean) => void;
  style?: React.CSSProperties;
}

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; }> = ({ icon: Icon, title }) => (
    <div className="flex items-center w-full">
        <Icon className="h-4 w-4 mr-3 text-primary/90" />
        <span className="text-sm font-semibold">{title}</span>
    </div>
);


const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  allLayers,
  selectedFeatures,
  onAddLayer,
  style,
}) => {
  const [activeAccordionItem, setActiveAccordionItem] = useState<string | undefined>(undefined);
  
  // State for Clip tool
  const [clipInputLayerId, setClipInputLayerId] = useState<string>('');
  const [clipMaskLayerId, setClipMaskLayerId] = useState<string>('');
  const [clipOutputName, setClipOutputName] = useState('');

  // State for Difference (Erase) tool
  const [eraseInputLayerId, setEraseInputLayerId] = useState<string>('');
  const [eraseMaskLayerId, setEraseMaskLayerId] = useState<string>('');
  const [eraseOutputName, setEraseOutputName] = useState('');
  
  // State for Buffer tool
  const [bufferInputLayerId, setBufferInputLayerId] = useState<string>('');
  const [bufferDistance, setBufferDistance] = useState<number>(100);
  const [bufferUnits, setBufferUnits] = useState<'meters' | 'kilometers' | 'miles'>('meters');
  const [bufferOutputName, setBufferOutputName] = useState('');

  // State for Hull tools
  const [hullInputLayerId, setHullInputLayerId] = useState<string>('');
  const [hullOutputName, setHullOutputName] = useState('');
  const [concavity, setConcavity] = useState<number>(2);
  const [isCalculatingConcavity, setIsCalculatingConcavity] = useState(false);
  const [concavityStats, setConcavityStats] = useState<{ mean: number, stdDev: number } | null>(null);


  // State for Union tool
  const [unionLayerIds, setUnionLayerIds] = useState<string[]>([]);
  const [unionOutputName, setUnionOutputName] = useState('');

  // State for Dissolve tool
  const [dissolveInputLayerId, setDissolveInputLayerId] = useState<string>('');
  const [dissolveOutputName, setDissolveOutputName] = useState('');

  // State for Population Projection
  const [pop2001, setPop2001] = useState<string>('');
  const [pop2010, setPop2010] = useState<string>('');
  const [pop2022, setPop2022] = useState<string>('');
  const [projectionYear, setProjectionYear] = useState<string>(String(new Date().getFullYear()));
  const [projectionResult, setProjectionResult] = useState<{ projectedPopulation: number; averageAnnualRate: number } | null>(null);

  // State for Cross-sections tool
  const [crossSectionInputLayerId, setCrossSectionInputLayerId] = useState<string>('');
  const [crossSectionOutputName, setCrossSectionOutputName] = useState<string>('');
  const [crossSectionDistance, setCrossSectionDistance] = useState<number>(100);
  const [crossSectionLength, setCrossSectionLength] = useState<number>(50);
  const [crossSectionUnits, setCrossSectionUnits] = useState<'meters' | 'kilometers'>('meters');
  const [isGeneratingCrossSections, setIsGeneratingCrossSections] = useState(false);
  
  // State for Profile tool
  const [profileInputLayerId, setProfileInputLayerId] = useState<string>('');
  const [profileDemLayer, setProfileDemLayer] = useState<'NASADEM_ELEVATION' | 'ALOS_DSM'>('NASADEM_ELEVATION');
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);

  const { toast } = useToast();

  const vectorLayers = useMemo(() => {
    return allLayers.filter((l): l is VectorMapLayer => l.type !== 'wms' && l.type !== 'gee' && l.type !== 'geotiff');
  }, [allLayers]);
  
  const polygonLayers = useMemo(() => {
    return vectorLayers.filter(l => {
      const source = l.olLayer.getSource();
      const features = source?.getFeatures();
      if (features && features.length > 0) {
        const geomType = features[0].getGeometry()?.getType();
        return geomType === 'Polygon' || geomType === 'MultiPolygon';
      }
      return false;
    });
  }, [vectorLayers]);

  const lineLayers = useMemo(() => {
    return vectorLayers.filter(l => {
        const source = l.olLayer.getSource();
        if (!source) return false;
        const features = source.getFeatures();
        if (features.length === 0) return false;
        const geomType = features[0].getGeometry()?.getType();
        return geomType === 'LineString' || geomType === 'MultiLineString';
    });
  }, [vectorLayers]);
  
  const handleRunProfile = useCallback(async () => {
    if (!profileInputLayerId) {
      toast({ description: "Por favor, seleccione una capa de línea para generar el perfil.", variant: "destructive" });
      return;
    }
    const lineLayer = lineLayers.find(l => l.id === profileInputLayerId);
    if (!lineLayer) return;

    const source = lineLayer.olLayer.getSource();
    if (!source || source.getFeatures().length === 0) {
      toast({ description: "La capa de línea seleccionada no tiene entidades.", variant: "destructive" });
      return;
    }

    const safeSelectedFeatures = selectedFeatures || [];
    let featureToProfile = safeSelectedFeatures.find(f => source.getFeatureById(f.getId() as string | number));
    
    if (!featureToProfile) {
        const layerFeatures = source.getFeatures();
        if (layerFeatures.length > 1) {
            toast({ description: "Múltiples líneas en la capa. Por favor, seleccione una para generar el perfil.", variant: "default" });
            return;
        }
        featureToProfile = layerFeatures[0];
    }
    
    const geometry = featureToProfile.getGeometry() as OlLineString;
    const lineCoords = geometry.getCoordinates();
    if (lineCoords.length < 2) {
      toast({ description: "La línea seleccionada no tiene suficientes puntos.", variant: "destructive" });
      return;
    }

    const startPoint = lineCoords[0];
    const endPoint = lineCoords[lineCoords.length - 1];

    const coordinates = [startPoint, endPoint];
    const distances = [0, olGetLength(geometry, { projection: 'EPSG:3857' })];
    
    const pointsGeoJSON = {
        type: 'MultiPoint',
        coordinates: coordinates.map(coord => new GeoJSON().writeGeometryObject(new Point(coord), {featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326'}).coordinates),
    };

    setIsGeneratingProfile(true);
    toast({ description: "Generando perfil para puntos de inicio y fin..." });

    try {
      const result = await getGeeProfile({
        points: pointsGeoJSON as { type: 'MultiPoint'; coordinates: number[][]; },
        bandCombination: profileDemLayer,
        distances: distances,
      });

      if (result && result.profile.length > 0) {
          const pointFeatures = result.profile.map(pointData => {
              const olPoint = new GeoJSON().readFeature({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: pointData.location },
                  properties: { elevation: pointData.elevation }
              }, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
              
              olPoint.setStyle(new Style({
                text: new TextStyle({
                  text: `${Math.round(pointData.elevation)}m`,
                  font: '12px Calibri,sans-serif',
                  fill: new Fill({ color: '#000' }),
                  stroke: new Stroke({ color: '#fff', width: 3 }),
                  offsetY: -15,
                })
              }));
              
              return olPoint;
          });

          const newLayerId = `profile-points-${nanoid()}`;
          const newSource = new VectorSource({ features: pointFeatures });
          const newOlLayer = new VectorLayer({
              source: newSource,
              properties: { id: newLayerId, name: `Elevación Perfil ${lineLayer.name}`, type: 'analysis' },
          });

          onAddLayer({
              id: newLayerId,
              name: `Elevación Perfil ${lineLayer.name}`,
              olLayer: newOlLayer,
              visible: true,
              opacity: 1,
              type: 'analysis',
          }, true);
        
        toast({ description: "Valores de elevación de inicio y fin añadidos al mapa." });
      } else {
        throw new Error("No se recibieron datos de elevación del perfil.");
      }

    } catch (error: any) {
      console.error("Error generating GEE profile:", error);
      toast({ title: "Error de Perfil GEE", description: error.message, variant: "destructive" });
    } finally {
      setIsGeneratingProfile(false);
    }
  }, [profileInputLayerId, profileDemLayer, lineLayers, toast, selectedFeatures, onAddLayer]);

  const handleRunClip = () => {
    const inputLayer = vectorLayers.find(l => l.id === clipInputLayerId);
    const maskLayer = polygonLayers.find(l => l.id === clipMaskLayerId);

    if (!inputLayer || !maskLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada y una de recorte.", variant: "destructive" });
        return;
    }
    
    const inputSource = inputLayer.olLayer.getSource();
    const maskSource = maskLayer.olLayer.getSource();
    if (!inputSource || !maskSource || maskSource.getFeatures().length === 0) {
        toast({ description: "Una de las capas seleccionadas no tiene entidades.", variant: "destructive" });
        return;
    }

    const outputName = clipOutputName.trim() || `Recorte de ${inputLayer.name}`;
    
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    const maskFeatures = maskSource.getFeatures();
    const maskGeoJSON = format.writeFeaturesObject(maskFeatures) as TurfFeatureCollection<TurfPolygon | TurfMultiPolygon>;
    
    const maskPolygons = maskGeoJSON.features.flatMap(f => 
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    );
    if (maskPolygons.length === 0) {
        toast({ description: "La capa de máscara no contiene polígonos válidos.", variant: "destructive" });
        return;
    }
    const unifiedMask = multiPolygon(maskPolygons);

    const inputFeatures = inputSource.getFeatures();
    const inputGeoJSON = format.writeFeaturesObject(inputFeatures) as TurfFeatureCollection;

    const clippedFeaturesGeoJSON: TurfFeature<TurfGeometry>[] = [];

    for (const inputFeature of inputGeoJSON.features) {
        try {
            const intersectionResult = intersect(featureCollection([unifiedMask, inputFeature]));

            if (intersectionResult && intersectionResult.geometry && intersectionResult.geometry.coordinates.length > 0) {
                intersectionResult.properties = inputFeature.properties;
                clippedFeaturesGeoJSON.push(intersectionResult);
            }
        } catch (e) {
            console.warn("Error intersecting a feature, skipping it.", e);
        }
    }
    
    if (clippedFeaturesGeoJSON.length > 0) {
        const finalOLFeatures = formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: clippedFeaturesGeoJSON
        });

        finalOLFeatures.forEach(f => f.setId(nanoid()));

        const newLayerId = `clip-result-${nanoid()}`;
        const newSource = new VectorSource({ features: finalOLFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
            style: inputLayer.olLayer.getStyle(),
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);
        toast({ description: `Se creó la capa de recorte "${outputName}" con ${finalOLFeatures.length} entidades.` });
        
        setClipInputLayerId('');
        setClipMaskLayerId('');
        setClipOutputName('');

    } else {
        toast({ description: "No se encontraron entidades resultantes de la operación de recorte." });
    }
  };
  
 const handleRunErase = () => {
    const inputLayer = vectorLayers.find(l => l.id === eraseInputLayerId);
    const maskLayer = polygonLayers.find(l => l.id === eraseMaskLayerId);

    if (!inputLayer || !maskLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada y una de borrado.", variant: "destructive" });
        return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    const maskSource = maskLayer.olLayer.getSource();
    if (!inputSource || !maskSource || maskSource.getFeatures().length === 0) {
        toast({ description: "Una de las capas seleccionadas no tiene entidades.", variant: "destructive" });
        return;
    }

    const safeSelectedFeatures = selectedFeatures || [];
    const relevantSelectedFeatures = safeSelectedFeatures.filter(feature => 
        inputSource.getFeatureById(feature.getId() as string | number) !== null
    );
    const featuresToProcess = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : inputSource.getFeatures();
    
    if (featuresToProcess.length === 0) {
        toast({ description: "No hay entidades de entrada para procesar.", variant: "destructive" });
        return;
    }

    const outputName = eraseOutputName.trim() || `Diferencia de ${inputLayer.name}`;
    toast({ description: `Calculando diferencia para ${featuresToProcess.length} entidad(es)...` });
    
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    const maskFeatures = maskSource.getFeatures();
    const maskGeoJSON = format.writeFeaturesObject(maskFeatures) as TurfFeatureCollection<TurfPolygon | TurfMultiPolygon>;
    
    const maskPolygons = maskGeoJSON.features.flatMap(f => {
        const cleanedFeature = cleanCoords(f);
        return cleanedFeature.geometry.type === 'Polygon' 
            ? [cleanedFeature.geometry.coordinates] 
            : cleanedFeature.geometry.coordinates;
    });
    
    if (maskPolygons.length === 0) {
        toast({ description: "La capa de borrado no contiene polígonos válidos.", variant: "destructive" });
        return;
    }
    const eraseMask = multiPolygon(maskPolygons);

    const erasedFeaturesGeoJSON: TurfFeature<TurfGeometry>[] = [];

    for (const olFeature of featuresToProcess) {
        try {
            const inputFeatureGeoJSON = format.writeFeatureObject(olFeature) as TurfFeature;
            const cleanedInput = cleanCoords(inputFeatureGeoJSON);

            const differenceResult = difference(featureCollection([cleanedInput, eraseMask]));

            if (differenceResult) {
                differenceResult.properties = inputFeatureGeoJSON.properties;
                erasedFeaturesGeoJSON.push(differenceResult);
            }
        } catch (e) {
            console.warn("Error performing difference on a feature, skipping it.", e);
        }
    }

    if (erasedFeaturesGeoJSON.length > 0) {
        const finalOLFeatures = formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: erasedFeaturesGeoJSON
        });

        finalOLFeatures.forEach(f => f.setId(nanoid()));

        const newLayerId = `erase-result-${nanoid()}`;
        const newSource = new VectorSource({ features: finalOLFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
            style: inputLayer.olLayer.getStyle(),
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
        type: 'analysis',
        }, true);

        toast({ description: `Se creó la capa de diferencia "${outputName}" con ${finalOLFeatures.length} entidades.` });
        setEraseInputLayerId('');
        setEraseMaskLayerId('');
        setEraseOutputName('');
    } else {
        toast({ description: "La operación de diferencia no produjo entidades resultantes." });
    }
  };
  
 const handleRunBuffer = async () => {
    const inputLayer = vectorLayers.find(l => l.id === bufferInputLayerId);
    if (!inputLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada para el buffer.", variant: "destructive" });
        return;
    }

    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
        toast({ description: "La capa de entrada seleccionada no tiene entidades.", variant: "destructive" });
        return;
    }
    
    const safeSelectedFeatures = selectedFeatures || [];
    const relevantSelectedFeatures = safeSelectedFeatures.filter(feature => 
        inputSource.getFeatureById(feature.getId() as string | number) !== null
    );

    const featuresToBuffer = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : inputSource.getFeatures();
    const outputName = bufferOutputName.trim() || `Buffer de ${inputLayer.name}`;

    toast({ description: `Calculando buffer para ${featuresToBuffer.length} entidad(es)...` });

    try {
      const bufferedFeatures = await performBufferAnalysis({
        features: featuresToBuffer,
        distance: bufferDistance,
        units: bufferUnits,
      });

      bufferedFeatures.forEach(f => f.setId(nanoid()));

      const newLayerId = `buffer-result-${nanoid()}`;
      const newSource = new VectorSource({ features: bufferedFeatures });
      const newOlLayer = new VectorLayer({
          source: newSource,
          properties: { id: newLayerId, name: outputName, type: 'analysis' },
      });

      onAddLayer({
          id: newLayerId,
          name: outputName,
          olLayer: newOlLayer,
          visible: true,
          opacity: 1,
          type: 'analysis',
      }, true);

      toast({ description: `Se creó la capa de buffer "${outputName}".` });

      setBufferInputLayerId('');
      setBufferOutputName('');
      setBufferDistance(100);

    } catch (error: any) {
        console.error("Buffer analysis failed:", error);
        toast({ title: "Error de Buffer", description: error.message, variant: "destructive" });
    }
  };
  
 const handleRunHull = async (type: 'convex' | 'concave') => {
    const inputLayer = vectorLayers.find(l => l.id === hullInputLayerId);
    if (!inputLayer) {
      toast({ description: "Por favor, seleccione una capa de entrada.", variant: "destructive" });
      return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
      toast({ description: "La capa de entrada no tiene entidades.", variant: "destructive" });
      return;
    }
    const safeSelectedFeatures = selectedFeatures || [];
    const relevantSelectedFeatures = safeSelectedFeatures.filter(f => inputSource.getFeatureById(f.getId() as string | number) !== null);
    const featuresToProcess = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : inputSource.getFeatures();
    
    const operationName = type === 'convex' ? "Envolvente Convexa" : "Envolvente Cóncava";
    const outputName = hullOutputName.trim() || `${operationName} de ${inputLayer.name}`;

    toast({ description: `Calculando ${operationName}...` });

    try {
        const hullFeatures = type === 'convex'
            ? await performConvexHull({ features: featuresToProcess })
            : await performConcaveHull({ features: featuresToProcess, concavity: concavity });
        
        if (!hullFeatures) {
             throw new Error("No se pudo generar el polígono. Pruebe con un valor de concavidad mayor o verifique la distribución de los puntos.");
        }
        
        hullFeatures.forEach(f => f.setId(nanoid()));
        const newLayerId = `${type}-hull-result-${nanoid()}`;
        const newSource = new VectorSource({ features: hullFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);

        toast({ description: `Se creó la capa "${outputName}".` });
        setHullInputLayerId('');
        setHullOutputName('');

    } catch (error: any) {
        console.error(`${operationName} failed:`, error);
        toast({ title: `Error de ${operationName}`, description: error.message, variant: "destructive" });
    }
  };

  const handleSuggestConcavity = async () => {
    const inputLayer = vectorLayers.find(l => l.id === hullInputLayerId);
    if (!inputLayer) {
      toast({ description: "Por favor, seleccione una capa de entrada para calcular la concavidad.", variant: "destructive" });
      return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
      toast({ description: "La capa de entrada no tiene entidades.", variant: "destructive" });
      return;
    }
    
    setIsCalculatingConcavity(true);
    toast({ description: 'Calculando valor de concavidad sugerido...' });
    
    const safeSelectedFeatures = selectedFeatures || [];
    const relevantSelectedFeatures = safeSelectedFeatures.filter(f => inputSource.getFeatureById(f.getId() as string | number) !== null);
    const featuresToProcess = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : inputSource.getFeatures();

    try {
        const { suggestedConcavity, meanDistance, stdDev } = await calculateOptimalConcavity({ features: featuresToProcess });
        setConcavity(suggestedConcavity);
        setConcavityStats({ mean: meanDistance, stdDev });
        toast({ description: `Valor de concavidad sugerido: ${suggestedConcavity.toFixed(2)} km` });
    } catch (error: any) {
        console.error("Error calculating optimal concavity:", error);
        toast({ title: "Error de Cálculo", description: error.message, variant: "destructive" });
    } finally {
        setIsCalculatingConcavity(false);
    }
  };

 const handleRunUnion = () => {
    if (unionLayerIds.length < 2) {
      toast({ description: "Por favor, seleccione al menos dos capas para unir.", variant: "destructive" });
      return;
    }

    const layersToUnion = vectorLayers.filter(l => unionLayerIds.includes(l.id));
    const allFeatures: Feature<Geometry>[] = [];
    const allAttributeKeys = new Set<string>();

    // First, gather all features and discover all unique attribute keys
    layersToUnion.forEach(layer => {
        const source = layer.olLayer.getSource();
        if (source) {
            const features = source.getFeatures();
            features.forEach(f => {
                Object.keys(f.getProperties()).forEach(key => {
                    if (key !== 'geometry') { // Exclude geometry from attribute keys
                        allAttributeKeys.add(key);
                    }
                });
            });
            allFeatures.push(...features.map(f => f.clone())); // Clone features
        }
    });

    if (allFeatures.length === 0) {
        toast({ description: "Las capas seleccionadas no contienen entidades para unir.", variant: "destructive" });
        return;
    }

    const outputName = unionOutputName.trim() || `Unión de ${layersToUnion.length} capas`;
    
    // Normalize features to have all attribute keys
    const normalizedFeatures = allFeatures.map(f => {
        f.setId(nanoid());
        const properties = f.getProperties();
        for (const key of allAttributeKeys) {
            if (!(key in properties)) {
                f.set(key, null); // Add missing keys with null value
            }
        }
        return f;
    });

    const newLayerId = `union-result-${nanoid()}`;
    const newSource = new VectorSource({ features: normalizedFeatures });
    const newOlLayer = new VectorLayer({
        source: newSource,
        properties: { id: newLayerId, name: outputName, type: 'analysis' },
        style: layersToUnion[0].olLayer.getStyle(),
    });

    onAddLayer({
        id: newLayerId,
        name: outputName,
        olLayer: newOlLayer,
        visible: true,
        opacity: 1,
        type: 'analysis',
    }, true);

    toast({ description: `Se creó la capa de unión "${outputName}" con ${allFeatures.length} entidades.` });
    setUnionLayerIds([]);
    setUnionOutputName('');
  };

  const handleRunDissolve = async () => {
    const inputLayer = vectorLayers.find(l => l.id === dissolveInputLayerId);
    if (!inputLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada para disolver.", variant: "destructive" });
        return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
        toast({ description: "La capa de entrada no tiene entidades.", variant: "destructive" });
        return;
    }

    const outputName = dissolveOutputName.trim() || `Disuelta_${inputLayer.name}`;
    toast({ description: "Ejecutando operación de disolución..." });

    try {
        const dissolvedFeatures = await dissolveFeatures({ features: inputSource.getFeatures() });
        
        if (dissolvedFeatures.length === 0) {
            throw new Error("La operación de disolución no produjo resultados.");
        }

        dissolvedFeatures.forEach(f => f.setId(nanoid()));

        const newLayerId = `dissolve-result-${nanoid()}`;
        const newSource = new VectorSource({ features: dissolvedFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
            style: inputLayer.olLayer.getStyle(),
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);

        toast({ description: `Se creó la capa disuelta "${outputName}".` });
        setDissolveInputLayerId('');
        setDissolveOutputName('');

    } catch (error: any) {
        console.error("Dissolve operation failed:", error);
        toast({ title: "Error de Disolución", description: error.message, variant: "destructive" });
    }
  };
  
  const handleConcavityStep = (direction: 'increment' | 'decrement') => {
    const step = concavityStats ? concavityStats.stdDev * 0.1 : 0.1;
    setConcavity(prev => {
        const newValue = direction === 'increment' ? prev + step : prev - step;
        return Math.max(0.01, parseFloat(newValue.toFixed(2)));
    });
  };

  const handleRunProjection = () => {
      const p1 = parseInt(pop2001, 10);
      const p2 = parseInt(pop2010, 10);
      const p3 = parseInt(pop2022, 10);
      const year = parseInt(projectionYear, 10);

      if (isNaN(p1) || isNaN(p2) || isNaN(p3) || isNaN(year)) {
          toast({ title: "Entrada Inválida", description: "Por favor, ingrese valores numéricos para todos los campos de población y para el año.", variant: "destructive" });
          return;
      }
      
      try {
          const result = projectPopulationGeometric({ p2001: p1, p2010: p2, p2022: p3, targetYear: year });
          setProjectionResult(result);
          toast({ description: "Cálculo de proyección completado." });
      } catch (error: any) {
          setProjectionResult(null);
          toast({ title: "Error de Cálculo", description: error.message, variant: "destructive" });
      }
  };

  const handleRunCrossSections = async () => {
    const inputLayer = lineLayers.find(l => l.id === crossSectionInputLayerId);
    if (!inputLayer) {
        toast({ description: "Por favor, seleccione una capa de línea.", variant: "destructive" });
        return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
        toast({ description: "La capa de entrada no tiene entidades.", variant: "destructive" });
        return;
    }

    setIsGeneratingCrossSections(true);
    const outputName = crossSectionOutputName.trim() || `Perfiles de ${inputLayer.name}`;
    toast({ description: `Generando perfiles transversales...` });

    try {
        const crossSectionFeatures = await generateCrossSections({
            lineFeatures: inputSource.getFeatures(),
            distance: crossSectionDistance,
            length: crossSectionLength,
            units: crossSectionUnits,
        });

        if (crossSectionFeatures.length === 0) {
            throw new Error("No se pudieron generar los perfiles.");
        }

        crossSectionFeatures.forEach(f => f.setId(nanoid()));
        const newLayerId = `cross-sections-${nanoid()}`;
        const newSource = new VectorSource({ features: crossSectionFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);

        toast({ description: `Se creó la capa "${outputName}" con ${crossSectionFeatures.length} perfiles.` });

        setCrossSectionInputLayerId('');
        setCrossSectionOutputName('');

    } catch (error: any) {
        console.error("Cross-section generation failed:", error);
        toast({ title: "Error al Generar Perfiles", description: error.message, variant: "destructive" });
    } finally {
        setIsGeneratingCrossSections(false);
    }
  };


  return (
    <DraggablePanel
      title="Análisis Espacial"
      icon={DraftingCompass}
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
      minSize={{ width: 300, height: 250 }}
    >
       <Accordion
          type="single"
          collapsible
          value={activeAccordionItem}
          onValueChange={setActiveAccordionItem}
          className="w-full space-y-1"
        >
            <AccordionItem value="overlay-tools" className="border-b-0 bg-white/5 rounded-md">
              <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                <SectionHeader icon={Layers} title="Herramientas de Superposición" />
              </AccordionTrigger>
              <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                  <div className="space-y-1">
                      <Label className="text-xs font-semibold">Recorte (Clip)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="clip-input-layer" className="text-xs">Capa de Entrada (a recortar)</Label>
                              <Select value={clipInputLayerId} onValueChange={setClipInputLayerId}>
                                <SelectTrigger id="clip-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="clip-mask-layer" className="text-xs">Capa de Recorte (molde)</Label>
                              <Select value={clipMaskLayerId} onValueChange={setClipMaskLayerId}>
                                <SelectTrigger id="clip-mask-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de polígonos..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {polygonLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="clip-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="clip-output-name" value={clipOutputName} onChange={(e) => setClipOutputName(e.target.value)} placeholder="Ej: Recorte_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunClip} size="sm" className="w-full h-8 text-xs" disabled={!clipInputLayerId || !clipMaskLayerId}>
                              <Scissors className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Recorte
                          </Button>
                      </div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-xs font-semibold">Diferencia (Erase)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="erase-input-layer" className="text-xs">Capa de Entrada (a borrar)</Label>
                              <Select value={eraseInputLayerId} onValueChange={setEraseInputLayerId}>
                                <SelectTrigger id="erase-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-400 mt-1">Si hay entidades seleccionadas, se usará la selección.</p>
                          </div>
                          <div>
                              <Label htmlFor="erase-mask-layer" className="text-xs">Capa de Borrado (molde)</Label>
                              <Select value={eraseMaskLayerId} onValueChange={setEraseMaskLayerId}>
                                <SelectTrigger id="erase-mask-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de polígonos..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {polygonLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="erase-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="erase-output-name" value={eraseOutputName} onChange={(e) => setEraseOutputName(e.target.value)} placeholder="Ej: Diferencia_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunErase} size="sm" className="w-full h-8 text-xs" disabled={!eraseInputLayerId || !eraseMaskLayerId}>
                              <MinusSquare className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Diferencia
                          </Button>
                      </div>
                  </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="proximity-tools" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={CircleDotDashed} title="Herramientas de Proximidad" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Área de Influencia (Buffer)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                           <div>
                              <Label htmlFor="buffer-input-layer" className="text-xs">Capa de Entrada</Label>
                              <Select value={bufferInputLayerId} onValueChange={setBufferInputLayerId}>
                                <SelectTrigger id="buffer-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-400 mt-1">Si hay entidades seleccionadas, se usará la selección. Si no, se usará la capa completa.</p>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <Label htmlFor="buffer-distance" className="text-xs">Distancia</Label>
                                <Input id="buffer-distance" type="number" value={bufferDistance} onChange={(e) => setBufferDistance(Number(e.target.value))} min="0" className="h-8 text-xs bg-black/20"/>
                            </div>
                             <div>
                                <Label htmlFor="buffer-units" className="text-xs">Unidades</Label>
                                <Select value={bufferUnits} onValueChange={(v) => setBufferUnits(v as any)}>
                                    <SelectTrigger id="buffer-units" className="h-8 text-xs bg-black/20 w-[120px]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                      <SelectItem value="meters" className="text-xs">Metros</SelectItem>
                                      <SelectItem value="kilometers" className="text-xs">Kilómetros</SelectItem>
                                      <SelectItem value="miles" className="text-xs">Millas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                          </div>
                          <div>
                              <Label htmlFor="buffer-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="buffer-output-name" value={bufferOutputName} onChange={(e) => setBufferOutputName(e.target.value)} placeholder="Ej: Buffer_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunBuffer} size="sm" className="w-full h-8 text-xs" disabled={!bufferInputLayerId}>
                              <CircleDotDashed className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Buffer
                          </Button>
                      </div>
                    </div>
                     <div className="space-y-1">
                        <Label className="text-xs font-semibold">Generar Perfiles Transversales</Label>
                        <div className="space-y-2 p-2 border border-white/10 rounded-md">
                            <div>
                                <Label htmlFor="cs-input-layer" className="text-xs">Capa de Eje (Línea)</Label>
                                <Select value={crossSectionInputLayerId} onValueChange={setCrossSectionInputLayerId}>
                                    <SelectTrigger id="cs-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de línea..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {lineLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-grow">
                                    <Label htmlFor="cs-distance" className="text-xs">Distancia entre perfiles</Label>
                                    <Input id="cs-distance" type="number" value={crossSectionDistance} onChange={(e) => setCrossSectionDistance(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20"/>
                                </div>
                                <div className="flex-grow">
                                    <Label htmlFor="cs-length" className="text-xs">Longitud del perfil</Label>
                                    <Input id="cs-length" type="number" value={crossSectionLength} onChange={(e) => setCrossSectionLength(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20"/>
                                </div>
                            </div>
                             <div>
                                <Label htmlFor="cs-units" className="text-xs">Unidades (Distancia y Longitud)</Label>
                                <Select value={crossSectionUnits} onValueChange={(v) => setCrossSectionUnits(v as any)}>
                                    <SelectTrigger id="cs-units" className="h-8 text-xs bg-black/20 w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        <SelectItem value="meters" className="text-xs">Metros</SelectItem>
                                        <SelectItem value="kilometers" className="text-xs">Kilómetros</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="cs-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                                <Input id="cs-output-name" value={crossSectionOutputName} onChange={(e) => setCrossSectionOutputName(e.target.value)} placeholder="Ej: Perfiles_del_RioX" className="h-8 text-xs bg-black/20"/>
                            </div>
                            <Button onClick={handleRunCrossSections} size="sm" className="w-full h-8 text-xs" disabled={!crossSectionInputLayerId || isGeneratingCrossSections}>
                                {isGeneratingCrossSections ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CrosshairIcon className="mr-2 h-3.5 w-3.5" />}
                                Ejecutar Generación
                            </Button>
                        </div>
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="geometry-tools" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={BoxSelect} title="Herramientas de Geometría" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Envolvente (Convex/Concave Hull)</Label>
                        <div className="space-y-2 p-2 border border-white/10 rounded-md">
                            <div>
                                <Label htmlFor="hull-input-layer" className="text-xs">Capa de Entrada</Label>
                                <Select value={hullInputLayerId} onValueChange={setHullInputLayerId}>
                                    <SelectTrigger id="hull-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-400 mt-1">Se usará la selección o la capa completa.</p>
                            </div>
                            <div>
                                <Label htmlFor="hull-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                                <Input id="hull-output-name" value={hullOutputName} onChange={(e) => setHullOutputName(e.target.value)} placeholder="Ej: Envolvente_CapaX" className="h-8 text-xs bg-black/20"/>
                            </div>
                            <div className="space-y-2 pt-2 border-t border-white/20">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="concavity-input" className="text-xs">Concavidad (km)</Label>
                                  <Button onClick={handleSuggestConcavity} size="sm" variant="ghost" className="h-6 text-xs" disabled={!hullInputLayerId || isCalculatingConcavity}>
                                    {isCalculatingConcavity ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                                    Sugerir
                                  </Button>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button onClick={() => handleConcavityStep('decrement')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Minus className="h-4 w-4"/></Button>
                                    <Input
                                        id="concavity-input"
                                        type="number"
                                        value={concavity}
                                        onChange={(e) => setConcavity(Number(e.target.value))}
                                        step={concavityStats ? concavityStats.stdDev / 10 : 0.1}
                                        min="0.01"
                                        className="h-8 text-xs bg-black/20 text-center"
                                    />
                                    <Button onClick={() => handleConcavityStep('increment')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Plus className="h-4 w-4"/></Button>
                                </div>
                                {concavityStats && (
                                    <div className="text-xs text-gray-400 space-y-0.5 pt-1">
                                        <p>Promedio: {concavityStats.mean.toFixed(2)} km</p>
                                        <p>Desvío Est.: {concavityStats.stdDev.toFixed(2)} km</p>
                                    </div>
                                )}
                                <p className="text-xs text-gray-400">Controla el detalle del polígono cóncavo (distancia máxima de los lados). Un valor más bajo genera una forma más ajustada.</p>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <Button onClick={() => handleRunHull('convex')} size="sm" className="w-full h-8 text-xs" disabled={!hullInputLayerId}>
                                    <BoxSelect className="mr-2 h-3.5 w-3.5" />
                                    Convexa
                                </Button>
                                <Button onClick={() => handleRunHull('concave')} size="sm" className="w-full h-8 text-xs" disabled={!hullInputLayerId}>
                                    <Droplet className="mr-2 h-3.5 w-3.5" />
                                    Cóncava
                                </Button>
                            </div>
                        </div>
                    </div>
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="aggregation-tools" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={Combine} title="Herramientas de Agregación" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                   <div className="space-y-1">
                      <Label className="text-xs font-semibold">Unión de Capas</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label className="text-xs">Capas a unir (seleccione 2 o más)</Label>
                              <ScrollArea className="h-24 border border-white/10 p-2 rounded-md bg-black/10 mt-1">
                                  <div className="space-y-1">
                                      {vectorLayers.map(layer => (
                                          <div key={layer.id} className="flex items-center space-x-2">
                                              <Checkbox
                                                  id={`union-layer-${layer.id}`}
                                                  checked={unionLayerIds.includes(layer.id)}
                                                  onCheckedChange={(checked) => {
                                                      setUnionLayerIds(prev =>
                                                          checked ? [...prev, layer.id] : prev.filter(id => id !== layer.id)
                                                      );
                                                  }}
                                              />
                                              <Label htmlFor={`union-layer-${layer.id}`} className="text-xs font-normal">{layer.name}</Label>
                                          </div>
                                      ))}
                                  </div>
                              </ScrollArea>
                          </div>
                          <div>
                              <Label htmlFor="union-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="union-output-name" value={unionOutputName} onChange={(e) => setUnionOutputName(e.target.value)} placeholder="Ej: Capas_Unidas" className="h-8 text-xs bg-black/20"/>
                          </div>
                          <Button onClick={handleRunUnion} size="sm" className="w-full h-8 text-xs" disabled={unionLayerIds.length < 2}>
                              <Combine className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Unión
                          </Button>
                      </div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-xs font-semibold">Disolver Entidades (Dissolve)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="dissolve-input-layer" className="text-xs">Capa de Entrada</Label>
                              <Select value={dissolveInputLayerId} onValueChange={setDissolveInputLayerId}>
                                <SelectTrigger id="dissolve-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="dissolve-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="dissolve-output-name" value={dissolveOutputName} onChange={(e) => setDissolveOutputName(e.target.value)} placeholder="Ej: Disuelta_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                          <Button onClick={handleRunDissolve} size="sm" className="w-full h-8 text-xs" disabled={!dissolveInputLayerId}>
                              <Merge className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Disolución
                          </Button>
                      </div>
                  </div>
                </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="topographic-profile" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={LineChart} title="Perfil Topográfico" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Perfil Topográfico desde Línea</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="profile-input-layer" className="text-xs">Capa de Perfil (Línea)</Label>
                              <Select value={profileInputLayerId} onValueChange={(value) => { setProfileInputLayerId(value); }}>
                                <SelectTrigger id="profile-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de línea..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {lineLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="profile-dem-layer" className="text-xs">Modelo de Elevación (DEM)</Label>
                               <Select value={profileDemLayer} onValueChange={(v) => setProfileDemLayer(v as any)}>
                                    <SelectTrigger id="profile-dem-layer" className="h-8 text-xs bg-black/20 w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                      <SelectItem value="NASADEM_ELEVATION" className="text-xs">NASADEM (30m)</SelectItem>
                                      <SelectItem value="ALOS_DSM" className="text-xs">ALOS DSM (30m)</SelectItem>
                                    </SelectContent>
                                </Select>
                          </div>
                          <Button onClick={handleRunProfile} size="sm" className="w-full h-8 text-xs" disabled={!profileInputLayerId || isGeneratingProfile}>
                              {isGeneratingProfile ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LineChart className="mr-2 h-3.5 w-3.5" />}
                              Generar Perfil
                          </Button>
                      </div>
                    </div>
                </AccordionContent>
            </AccordionItem>

            <AccordionItem value="demographic-projection" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={TrendingUp} title="Proyección Demográfica" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Proyección de Población</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <p className="text-xs text-gray-400">Ingrese la población total para una entidad o área seleccionada para los años censales.</p>
                          <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label htmlFor="pop2001" className="text-xs">Población 2001</Label>
                                <Input id="pop2001" type="number" value={pop2001} onChange={(e) => setPop2001(e.target.value)} className="h-8 text-xs bg-black/20" />
                              </div>
                              <div>
                                <Label htmlFor="pop2010" className="text-xs">Población 2010</Label>
                                <Input id="pop2010" type="number" value={pop2010} onChange={(e) => setPop2010(e.target.value)} className="h-8 text-xs bg-black/20" />
                              </div>
                              <div>
                                <Label htmlFor="pop2022" className="text-xs">Población 2022</Label>
                                <Input id="pop2022" type="number" value={pop2022} onChange={(e) => setPop2022(e.target.value)} className="h-8 text-xs bg-black/20" />
                              </div>
                          </div>
                          <div>
                            <Label htmlFor="projection-year" className="text-xs">Año a Proyectar</Label>
                            <Input id="projection-year" type="number" value={projectionYear} onChange={(e) => setProjectionYear(e.target.value)} className="h-8 text-xs bg-black/20" />
                          </div>
                          <Button onClick={handleRunProjection} size="sm" className="w-full h-8 text-xs">
                              <TrendingUp className="mr-2 h-3.5 w-3.5" />
                              Calcular Proyección
                          </Button>
                          {projectionResult && (
                            <div className="pt-2 border-t border-white/10">
                                <Table>
                                  <TableBody>
                                      <TableRow>
                                        <TableCell className="text-xs text-gray-300 p-1.5 font-semibold">Población Proyectada ({projectionYear})</TableCell>
                                        <TableCell className="text-xs text-white p-1.5 text-right font-mono">{Math.round(projectionResult.projectedPopulation).toLocaleString()}</TableCell>
                                      </TableRow>
                                       <TableRow>
                                        <TableCell className="text-xs text-gray-300 p-1.5 font-semibold">Tasa de Crecimiento Anual</TableCell>
                                        <TableCell className="text-xs text-white p-1.5 text-right font-mono">{(projectionResult.averageAnnualRate * 100).toFixed(4)}%</TableCell>
                                      </TableRow>
                                  </TableBody>
                                </Table>
                            </div>
                          )}
                      </div>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default AnalysisPanel;


    

    
