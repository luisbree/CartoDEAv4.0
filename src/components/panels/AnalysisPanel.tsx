

'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftingCompass, Scissors, Layers, CircleDotDashed, MinusSquare, BoxSelect, Droplet, Sparkles, Loader2, Combine, Minus, Plus, TrendingUp, Waypoints as CrosshairIcon, Merge, LineChart, PenLine, Eraser, Brush, ZoomIn, Download, FileImage, FileText, CheckCircle } from 'lucide-react';
import type { MapLayer, VectorMapLayer, ProfilePoint } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { intersect, featureCollection, difference, cleanCoords, length as turfLength, along as turfAlong } from '@turf/turf';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry, LineString as TurfLineString, Point as TurfPoint } from 'geojson';
import { multiPolygon } from '@turf/helpers';
import Feature from 'ol/Feature';
import { type Geometry, type LineString as OlLineString, Point } from 'ol/geom';
import { getLength as olGetLength } from 'ol/sphere';
import { performBufferAnalysis, performConvexHull, performConcaveHull, calculateOptimalConcavity, projectPopulationGeometric, generateCrossSections, dissolveFeatures } from '@/services/spatial-analysis';
import { getValuesForPoints } from '@/ai/flows/gee-flow';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Style, Text as TextStyle, Fill, Stroke } from 'ol/style';
import type { Map } from 'ol';
import Draw, { createBox } from 'ol/interaction/Draw';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, ReferenceLine, Legend, ScatterChart, Scatter, Line } from 'recharts';
import { cn } from '@/lib/utils';
import { transform } from 'ol/proj';
import { Slider } from '../ui/slider';
import Overlay from 'ol/Overlay';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';


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
  mapRef: React.RefObject<Map | null>;
}

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; }> = ({ icon: Icon, title }) => (
    <div className="flex items-center w-full">
        <Icon className="h-4 w-4 mr-3 text-primary/90" />
        <span className="text-sm font-semibold">{title}</span>
    </div>
);

const analysisLayerStyle = new Style({
    stroke: new Stroke({ color: 'rgba(0, 255, 255, 1)', width: 2.5, lineDash: [8, 8] }),
    fill: new Fill({ color: 'rgba(0, 255, 255, 0.2)' }),
});

// --- Jenks Natural Breaks Algorithm (copied for profile stats) ---
function jenks(data: number[], n_classes: number): number[] {
  if (n_classes > data.length) return [];

  data = data.slice().sort((a, b) => a - b);

  const matrices = (() => {
    const mat1 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    const mat2 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    
    for (let i = 1; i <= n_classes; i++) {
        mat1[1][i] = 1;
        mat2[1][i] = 0;
        for (let j = 2; j <= data.length; j++) {
            mat2[j][i] = Infinity;
        }
    }

    let v = 0.0;
    for (let l = 2; l <= data.length; l++) {
        let s1 = 0.0, s2 = 0.0, w = 0.0;
        for (let m = 1; m <= l; m++) {
            const i4 = l - m + 1;
            const val = data[i4 - 1];
            w++;
            s1 += val;
            s2 += val * val;
            v = s2 - (s1 * s1) / w;
            const i3 = i4 - 1;
            if (i3 !== 0) {
                for (let j = 2; j <= n_classes; j++) {
                    if (mat2[l][j] >= (v + mat2[i3][j - 1])) {
                        mat1[l][j] = i4;
                        mat2[l][j] = v + mat2[i3][j - 1];
                    }
                }
            }
        }
        mat1[l][1] = 1;
        mat2[l][1] = v;
    }
    return { backlinkMatrix: mat1 };
  })();

  const { backlinkMatrix } = matrices;
  const breaks: number[] = [];
  let k = data.length;
  for (let i = n_classes; i > 1; i--) {
    breaks.push(data[backlinkMatrix[k][i] - 2]);
    k = backlinkMatrix[k][i] - 1;
  }
  
  return breaks.reverse();
}

type DatasetId = 'NASADEM_ELEVATION' | 'ALOS_DSM' | 'JRC_WATER_OCCURRENCE';

const DATASET_DEFINITIONS: Record<DatasetId, { id: string; band: string; name: string; color: string; }> = {
    'NASADEM_ELEVATION': { id: 'NASA/NASADEM_HGT/001', band: 'elevation', name: 'Elevación (NASADEM)', color: '#8884d8' },
    'ALOS_DSM': { id: 'JAXA/ALOS/AW3D30/V3_2', band: 'DSM', name: 'Superficie (ALOS)', color: '#82ca9d' },
    'JRC_WATER_OCCURRENCE': { id: 'JRC/GSW1_4/GlobalSurfaceWater', band: 'occurrence', name: 'Agua Superficial (JRC)', color: '#3a86ff' },
};

interface ProfileDataSeries {
    datasetId: DatasetId;
    name: string;
    color: string;
    points: ProfilePoint[];
    stats: ProfileStats;
}

interface ProfileStats {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    jenksBreaks: number[]; // For 3 classes, it will have 2 values
}

interface CorrelationResult {
    coefficient: number;
    trendline: { slope: number; intercept: number };
    scatterData: { x: number, y: number }[];
    xDataset: DatasetId;
    yDataset: DatasetId;
}


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
  mapRef
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

  // State for Topographic Profile
  const [profileLine, setProfileLine] = useState<Feature<OlLineString> | null>(null);
  const [profileData, setProfileData] = useState<ProfileDataSeries[] | null>(null);
  const [activeProfileDrawTool, setActiveProfileDrawTool] = useState<'LineString' | 'FreehandLine' | null>(null);
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);
  const [selectedProfileDatasets, setSelectedProfileDatasets] = useState<DatasetId[]>(['NASADEM_ELEVATION']);
  const [profileLayerId, setProfileLayerId] = useState<string>('');
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(1);
  const [yAxisDomain, setYAxisDomain] = useState<{min: number | 'auto'; max: number | 'auto'}>({min: 'auto', max: 'auto'});
  const analysisLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const liveTooltipRef = useRef<Overlay | null>(null);
  const liveTooltipElementRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [correlationResult, setCorrelationResult] = useState<CorrelationResult | null>(null);
  const [corrAxisX, setCorrAxisX] = useState<DatasetId | ''>('');
  const [corrAxisY, setCorrAxisY] = useState<DatasetId | ''>('');


  const { toast } = useToast();
  
  // --- START Profile Logic ---
  const stopDrawing = useCallback(() => {
    if (drawInteractionRef.current && mapRef.current) {
        mapRef.current.removeInteraction(drawInteractionRef.current);
        drawInteractionRef.current = null;
        setActiveProfileDrawTool(null);
    }
     // Clean up live tooltip
     if (liveTooltipRef.current && mapRef.current) {
        mapRef.current.removeOverlay(liveTooltipRef.current);
        liveTooltipRef.current = null;
    }
  }, [mapRef]);

  const clearAnalysisGeometries = useCallback(() => {
      if (analysisLayerRef.current) {
        analysisLayerRef.current.getSource()?.clear();
      }
      setProfileLine(null);
      setProfileData(null);
      setCorrelationResult(null);
      setCorrAxisX('');
      setCorrAxisY('');
      setProfileLayerId('');
      stopDrawing();
      toast({ description: "Línea de perfil eliminada." });
  }, [stopDrawing, toast]);

  useEffect(() => {
    // Ensure analysis layer exists on mount
    if (mapRef.current && !analysisLayerRef.current) {
        const source = new VectorSource();
        const layer = new VectorLayer({
            source,
            style: analysisLayerStyle,
            properties: { id: 'internal-analysis-profile-layer' },
            zIndex: 9999, // High z-index to draw on top
        });
        analysisLayerRef.current = layer;
        mapRef.current.addLayer(layer);
    }
    // Cleanup on unmount
    return () => {
        if (mapRef.current && analysisLayerRef.current) {
            mapRef.current.removeLayer(analysisLayerRef.current);
            analysisLayerRef.current = null;
        }
        stopDrawing();
    };
  }, [mapRef, stopDrawing]);
  
  const handleToggleDrawProfile = useCallback((tool: 'LineString' | 'FreehandLine') => {
    if (!mapRef.current) return;
    
    const isDeactivating = activeProfileDrawTool === tool;
    stopDrawing(); // Stop any current drawing first

    if (isDeactivating) {
        setActiveProfileDrawTool(null);
        return;
    }

    clearAnalysisGeometries();
    setProfileLayerId(''); // Clear layer selection
    setActiveProfileDrawTool(tool);

    const toastMessage = tool === 'LineString' ? "Dibuja una línea en el mapa para generar el perfil." : "Dibuja a mano alzada para generar el perfil.";
    toast({ description: toastMessage });

    const draw = new Draw({
        source: analysisLayerRef.current!.getSource()!,
        type: 'LineString',
        freehand: tool === 'FreehandLine',
    });
    drawInteractionRef.current = draw;
    mapRef.current.addInteraction(draw);

     draw.on('drawstart', (event) => {
        const feature = event.feature;
        if (!liveTooltipElementRef.current) {
            liveTooltipElementRef.current = document.createElement('div');
            liveTooltipElementRef.current.className = 'ol-tooltip ol-tooltip-measure';
        }
        liveTooltipRef.current = new Overlay({
            element: liveTooltipElementRef.current,
            offset: [0, -15],
            positioning: 'bottom-center',
        });
        mapRef.current?.addOverlay(liveTooltipRef.current);
    
        feature.getGeometry()?.on('change', (e) => {
            const geom = e.target as OlLineString;
            const length = olGetLength(geom, { projection: 'EPSG:3857' });
            const output = length > 1000 ? `${(length / 1000).toFixed(2)} km` : `${length.toFixed(2)} m`;
            liveTooltipElementRef.current!.innerHTML = output;
            liveTooltipRef.current!.setPosition(geom.getLastCoordinate());
        });
    });

    draw.once('drawend', (event) => {
        if (liveTooltipRef.current) {
            liveTooltipRef.current.setPosition(undefined);
        }
        const feature = event.feature as Feature<OlLineString>;
        feature.setStyle(analysisLayerStyle);
        setProfileLine(feature);
        stopDrawing();
        toast({ description: "Línea de perfil dibujada. Ahora selecciona un dataset y genera el perfil." });
    });
  }, [mapRef, activeProfileDrawTool, stopDrawing, clearAnalysisGeometries, toast]);

  const handleSelectProfileLayer = useCallback((layerId: string) => {
    setProfileLayerId(layerId);
    clearAnalysisGeometries(); // Clear any drawn line

    if (!layerId) {
        setProfileLine(null);
        return;
    }

    const layer = allLayers.find(l => l.id === layerId) as VectorMapLayer | undefined;
    const source = layer?.olLayer.getSource();
    if (!source) return;
    
    const features = source.getFeatures();
    if (features.length === 0) {
        toast({ description: "La capa seleccionada no contiene entidades.", variant: "destructive" });
        setProfileLine(null);
        return;
    }

    if (features.length > 1) {
        toast({ description: "La capa seleccionada tiene múltiples líneas. Elige una capa con una sola entidad.", variant: "destructive" });
        setProfileLine(null);
        return;
    }
    
    const feature = features[0] as Feature<OlLineString>;
    if (feature.getGeometry()?.getType().includes('LineString')) {
        setProfileLine(feature);
        toast({ description: `Línea de la capa "${layer.name}" seleccionada para el perfil.`});
    } else {
        toast({ description: "La entidad de la capa no es una línea.", variant: "destructive"});
        setProfileLine(null);
    }
  }, [allLayers, clearAnalysisGeometries, toast]);


  const handleRunProfile = async () => {
    if (!profileLine) {
        toast({ description: "Dibuja una línea o selecciona una capa de línea.", variant: "destructive" });
        return;
    }
    if (selectedProfileDatasets.length === 0) {
        toast({ description: "Selecciona al menos un dataset de GEE.", variant: "destructive" });
        return;
    }
    
    setIsGeneratingProfile(true);
    setProfileData(null);
    setCorrelationResult(null);
    setCorrAxisX('');
    setCorrAxisY('');
    toast({ description: `Generando perfil para ${selectedProfileDatasets.length} dataset(s)...` });

    try {
        const geometry = profileLine.getGeometry();
        if (!geometry) throw new Error("La geometría de la línea de perfil no es válida.");

        const lineLength = olGetLength(geometry, { projection: 'EPSG:3857' });
        const SAMPLES = 100;
        const pointsToQuery: { lon: number; lat: number; distance: number }[] = [];

        for (let i = 0; i <= SAMPLES; i++) {
            const fraction = i / SAMPLES;
            const coordinate = geometry.getCoordinateAt(fraction);
            const [lon, lat] = transform(coordinate, 'EPSG:3857', 'EPSG:4326');
            const distance = lineLength * fraction; // Distance in METERS
            pointsToQuery.push({ lon, lat, distance });
        }
        
        const allProfileData: ProfileDataSeries[] = [];
        
        for (const datasetId of selectedProfileDatasets) {
            const def = DATASET_DEFINITIONS[datasetId];
            const values = await getValuesForPoints({ points: pointsToQuery, datasetId: def.id, bandName: def.band });
            
            if (!values || values.length !== pointsToQuery.length) {
                throw new Error(`No se obtuvieron datos válidos para ${def.name}.`);
            }
            
            const points: ProfilePoint[] = pointsToQuery.map((point, index) => ({
                distance: point.distance, 
                value: values[index] === null || values[index] === -9999 ? 0 : parseFloat(values[index]!.toFixed(2)),
                location: [point.lon, point.lat],
            }));
            
            const validValues = points.map(p => p.value).filter(e => e !== 0); 
            let stats: ProfileStats = { min: 0, max: 0, mean: 0, stdDev: 0, jenksBreaks: [] };
            if (validValues.length > 0) {
                const sum = validValues.reduce((a, b) => a + b, 0);
                stats.mean = sum / validValues.length;
                stats.min = Math.min(...validValues);
                stats.max = Math.max(...validValues);
                const variance = validValues.reduce((sq, n) => sq + Math.pow(n - stats.mean, 2), 0) / validValues.length;
                stats.stdDev = Math.sqrt(variance);
                stats.jenksBreaks = jenks(validValues, 3);
            }
            
            allProfileData.push({ datasetId, name: def.name, color: def.color, points, stats });
        }

        if (allProfileData.length > 0) {
            setProfileData(allProfileData);
            const firstStat = allProfileData[0].stats;
            setYAxisDomain({ min: Math.floor(firstStat.min), max: Math.ceil(firstStat.max) });
            toast({ description: "Perfil(es) generado(s) con éxito." });
        } else {
             throw new Error("No se obtuvieron puntos válidos a lo largo de la línea.");
        }

    } catch (error: any) {
        console.error("Error generating profile:", error);
        toast({ title: "Error de Perfil", description: error.message, variant: "destructive" });
        setProfileData(null);
    } finally {
        setIsGeneratingProfile(false);
    }
  };
  
  const handleCalculateCorrelation = () => {
    if (!profileData || !corrAxisX || !corrAxisY || corrAxisX === corrAxisY) {
        toast({ description: "Selecciona dos datasets diferentes para correlacionar.", variant: "destructive" });
        return;
    }
    
    const dataX = profileData.find(d => d.datasetId === corrAxisX);
    const dataY = profileData.find(d => d.datasetId === corrAxisY);

    if (!dataX || !dataY) {
        toast({ description: "No se encontraron los datos para la correlación.", variant: "destructive" });
        return;
    }

    const n = dataX.points.length;
    const valuesX = dataX.points.map(p => p.value);
    const valuesY = dataY.points.map(p => p.value);

    const sumX = valuesX.reduce((a, b) => a + b, 0);
    const sumY = valuesY.reduce((a, b) => a + b, 0);
    const sumXY = valuesX.reduce((sum, x, i) => sum + x * valuesY[i], 0);
    const sumX2 = valuesX.reduce((sum, x) => sum + x * x, 0);
    const sumY2 = valuesY.reduce((sum, y) => sum + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    const coefficient = denominator === 0 ? 0 : numerator / denominator;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const scatterData = valuesX.map((x, i) => ({ x, y: valuesY[i] }));
    
    setCorrelationResult({ coefficient, trendline: { slope, intercept }, scatterData, xDataset: dataX.datasetId, yDataset: dataY.datasetId });
    toast({ description: `Correlación calculada: r = ${coefficient.toFixed(4)}` });
  };
  
  const exaggeratedProfileData = useMemo(() => {
    if (!profileData) return null;
    
    const firstSeries = profileData[0];
    const minElev = typeof yAxisDomain.min === 'number' ? yAxisDomain.min : firstSeries.stats.min;

    // Combine data points from all series based on distance
    const combinedPoints: { [distance: number]: any } = {};
    
    profileData.forEach(series => {
        series.points.forEach(point => {
            if (!combinedPoints[point.distance]) {
                combinedPoints[point.distance] = { distance: point.distance };
            }
            combinedPoints[point.distance][series.datasetId] = minElev + ((point.value - minElev) * verticalExaggeration);
            combinedPoints[point.distance][`${series.datasetId}_raw`] = point.value;
        });
    });

    return Object.values(combinedPoints);
  }, [profileData, verticalExaggeration, yAxisDomain]);
  
  const handleExaggerationStep = (direction: 'inc' | 'dec') => {
    setVerticalExaggeration(prev => {
        const newValue = direction === 'inc' ? prev + 1 : prev - 1;
        return Math.max(1, newValue);
    });
  };
  
  const handleYAxisDomainChange = (key: 'min' | 'max', value: string) => {
    const numValue = value === '' ? 'auto' : parseFloat(value);
    if (value !== '' && isNaN(numValue as number)) return; // Ignore invalid numbers
    setYAxisDomain(prev => ({ ...prev, [key]: numValue }));
  };

  const handleDownloadProfile = (format: 'csv' | 'jpg' | 'pdf') => {
    if (format === 'csv') {
        if (!profileData) {
            toast({ description: "No hay datos de perfil para descargar.", variant: "destructive" });
            return;
        }
        const headers = ["distance", "lon", "lat", ...profileData.map(d => d.datasetId)].join(",");
        const dataRows = profileData[0].points.map((_, i) => {
            const distance = profileData[0].points[i].distance.toFixed(2);
            const lon = profileData[0].points[i].location[0].toFixed(6);
            const lat = profileData[0].points[i].location[1].toFixed(6);
            const values = profileData.map(d => d.points[i].value.toFixed(2));
            return [distance, lon, lat, ...values].join(",");
        });

        const csvContent = `${headers}\n${dataRows.join("\n")}`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.href) {
            URL.revokeObjectURL(link.href);
        }
        link.href = URL.createObjectURL(blob);
        link.download = "perfil_topografico.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ description: "Descarga de perfil CSV iniciada." });
    } else {
        const chartElement = document.getElementById('profile-chart-to-export');
        if (!chartElement) {
            toast({ description: "El contenedor del gráfico no está listo.", variant: "destructive" });
            return;
        }
        toast({ description: `Exportando como ${format.toUpperCase()}...` });
        if (format === 'jpg') {
            htmlToImage.toJpeg(chartElement, { quality: 0.95, backgroundColor: '#1f2937' })
                .then(function (dataUrl) {
                    const link = document.createElement('a');
                    link.download = 'perfil_topografico.jpg';
                    link.href = dataUrl;
                    link.click();
                })
                .catch(function (error) {
                    console.error('Error al generar JPG:', error);
                    toast({ description: "Error al generar JPG.", variant: "destructive" });
                });
        } else if (format === 'pdf') {
            htmlToImage.toCanvas(chartElement, { backgroundColor: '#1f2937' })
                .then(function (canvas) {
                    const imgData = canvas.toDataURL('image/png');
                    const pdf = new jsPDF({
                        orientation: 'landscape',
                        unit: 'px',
                        format: [canvas.width, canvas.height]
                    });
                    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                    pdf.save("perfil_topografico.pdf");
                })
                .catch(function (error) {
                    console.error('Error al generar PDF:', error);
                    toast({ description: "Error al generar PDF.", variant: "destructive" });
                });
        }
    }
  };
  // --- END Profile Logic ---


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
        setConcavityStats({ mean: meanDistance, stdDev: stdDev });
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

  const trendlineData = useMemo(() => {
    if (!correlationResult) return [];
    const { slope, intercept, scatterData } = correlationResult;
    const minX = Math.min(...scatterData.map(d => d.x));
    const maxX = Math.max(...scatterData.map(d => d.x));
    return [
      { x: minX, y: slope * minX + intercept },
      { x: maxX, y: slope * maxX + intercept },
    ];
  }, [correlationResult]);


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
      initialSize={{ width: 380, height: "auto" }}
      minSize={{ width: 350, height: 300 }}
    >
       <Accordion
          type="single"
          collapsible
          value={activeAccordionItem}
          onValueChange={setActiveAccordionItem}
          className="w-full space-y-1"
        >
            <AccordionItem value="profile-tool" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={LineChart} title="Perfil Topográfico" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-2 p-2 border border-white/10 rounded-md">
                        <div className="flex items-center gap-2">
                            <Button onClick={() => handleToggleDrawProfile('LineString')} size="icon" className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeProfileDrawTool === 'LineString' && "bg-primary hover:bg-primary/90")} title="Dibujar Línea">
                                <PenLine className="h-4 w-4" />
                            </Button>
                            <Button onClick={() => handleToggleDrawProfile('FreehandLine')} size="icon" className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeProfileDrawTool === 'FreehandLine' && "bg-primary hover:bg-primary/90")} title="Dibujar a Mano Alzada">
                                <Brush className="h-4 w-4" />
                            </Button>
                            <Button onClick={() => clearAnalysisGeometries()} size="icon" variant="destructive" className="h-8 w-8 flex-shrink-0">
                                <Eraser className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-grow border-t border-dashed border-gray-600"></div><span className="text-xs text-gray-400">o</span><div className="flex-grow border-t border-dashed border-gray-600"></div>
                        </div>
                        <div>
                           <Select value={profileLayerId} onValueChange={handleSelectProfileLayer}>
                              <SelectTrigger className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de línea..." /></SelectTrigger>
                              <SelectContent className="bg-gray-700 text-white border-gray-600">
                                {lineLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="space-y-2 p-2 border border-white/10 rounded-md">
                         <div className="space-y-2">
                            <Label className="text-xs">Datasets de GEE a Perfilar</Label>
                            {Object.entries(DATASET_DEFINITIONS).map(([id, def]) => (
                                <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`profile-ds-${id}`}
                                        checked={selectedProfileDatasets.includes(id as DatasetId)}
                                        onCheckedChange={(checked) => {
                                            setSelectedProfileDatasets(prev => 
                                                checked ? [...prev, id as DatasetId] : prev.filter(item => item !== id)
                                            );
                                        }}
                                    />
                                    <Label htmlFor={`profile-ds-${id}`} className="text-xs font-normal">{def.name}</Label>
                                </div>
                            ))}
                        </div>
                        <Button onClick={handleRunProfile} size="sm" className="w-full h-8 text-xs" disabled={!profileLine || selectedProfileDatasets.length === 0 || isGeneratingProfile}>
                            {isGeneratingProfile ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LineChart className="mr-2 h-3.5 w-3.5" />}
                            Generar Perfil(es)
                        </Button>
                    </div>
                    {profileData && (
                        <div id="profile-chart-to-export" className="bg-gray-800/50 p-2 rounded-md">
                            <div className="space-y-2 pt-2 border-t border-white/10">
                                <div className="h-[250px] w-full mt-2" ref={chartContainerRef}>
                                <ResponsiveContainer>
                                        <AreaChart data={exaggeratedProfileData} margin={{ top: 5, right: 20, left: -25, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground), 0.3)" />
                                            <XAxis dataKey="distance" type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(val) => `${(val / 1000).toFixed(1)} km`} domain={['dataMin', 'dataMax']} />
                                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={[yAxisDomain.min, yAxisDomain.max]} tickFormatter={(val) => `${val.toFixed(0)}m`} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                                itemStyle={{ fontSize: '12px' }}
                                                labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '11px' }}
                                                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                                                labelFormatter={(label) => `Distancia: ${Number(label).toFixed(2)} m`}
                                                formatter={(value, name, props) => {
                                                    const rawValue = props.payload[`${name}_raw`];
                                                    const series = profileData.find(d => d.datasetId === name);
                                                    return [`${rawValue.toFixed(2)}`, series?.name];
                                                }}
                                            />
                                            <Legend wrapperStyle={{fontSize: "10px"}} />
                                            {profileData.map((series) => (
                                                <Area key={series.datasetId} type="monotone" dataKey={series.datasetId} name={series.name} stroke={series.color} fill={series.color} fillOpacity={0.2} />
                                            ))}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                    {profileData && profileData.length > 0 && (
                        <div className="pt-2 border-t border-white/10 flex flex-col gap-1">
                             <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">Rango Eje Y</Label>
                                    <div className="flex items-center gap-1">
                                        <Input type="number" placeholder="Mín" value={yAxisDomain.min} onChange={(e) => handleYAxisDomainChange('min', e.target.value)} className="h-8 text-xs bg-black/20 text-center"/>
                                        <Input type="number" placeholder="Máx" value={yAxisDomain.max} onChange={(e) => handleYAxisDomainChange('max', e.target.value)} className="h-8 text-xs bg-black/20 text-center"/>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Exageración Vertical</Label>
                                  <div className="flex items-center gap-1">
                                      <Button onClick={() => handleExaggerationStep('dec')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Minus className="h-4 w-4"/></Button>
                                      <Input type="number" min="1" step="1" value={verticalExaggeration} onChange={(e) => setVerticalExaggeration(Math.max(1, Number(e.target.value)))} className="h-8 text-xs bg-black/20 text-center" />
                                      <Button onClick={() => handleExaggerationStep('inc')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Plus className="h-4 w-4"/></Button>
                                  </div>
                                </div>
                            </div>
                            <ScrollArea className="max-h-32 mt-2">
                                <Table>
                                    <TableBody>
                                        {profileData.map(series => (
                                            <React.Fragment key={series.datasetId}>
                                                <TableRow className="bg-gray-700/50 hover:bg-gray-700/70"><TableCell colSpan={2} className="text-xs text-white p-1.5 font-bold">{series.name}</TableCell></TableRow>
                                                <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Mín / Máx</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{series.stats.min.toFixed(2)} / {series.stats.max.toFixed(2)}</TableCell></TableRow>
                                                <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Promedio</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{series.stats.mean.toFixed(2)}</TableCell></TableRow>
                                                <TableRow><TableCell className="text-xs text-gray-300 p-1.5">Desv. Estándar</TableCell><TableCell className="text-xs text-white p-1.5 text-right font-mono">{series.stats.stdDev.toFixed(2)}</TableCell></TableRow>
                                            </React.Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                            <div className="flex items-center gap-2 mt-2">
                                <Button onClick={() => handleDownloadProfile('csv')} size="sm" className="w-full h-8 text-xs" variant="secondary" disabled={!profileData}>
                                    <Download className="mr-2 h-3.5 w-3.5" /> CSV
                                </Button>
                                <Button onClick={() => handleDownloadProfile('jpg')} size="sm" className="w-full h-8 text-xs" variant="secondary" disabled={!profileData}>
                                    <FileImage className="mr-2 h-3.5 w-3.5" /> JPG
                                </Button>
                                <Button onClick={() => handleDownloadProfile('pdf')} size="sm" className="w-full h-8 text-xs" variant="secondary" disabled={!profileData}>
                                    <FileText className="mr-2 h-3.5 w-3.5" /> PDF
                                </Button>
                            </div>
                        </div>
                    )}
                    {profileData && profileData.length >= 2 && (
                         <div className="space-y-3 pt-3 border-t border-white/10">
                            <Label className="text-xs font-semibold">Análisis de Correlación</Label>
                             <div className="grid grid-cols-2 gap-2">
                                <Select value={corrAxisX} onValueChange={(v) => setCorrAxisX(v as DatasetId)}>
                                    <SelectTrigger className="h-8 text-xs bg-black/20"><SelectValue placeholder="Eje X..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {profileData.map(d => <SelectItem key={d.datasetId} value={d.datasetId} className="text-xs">{d.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={corrAxisY} onValueChange={(v) => setCorrAxisY(v as DatasetId)}>
                                    <SelectTrigger className="h-8 text-xs bg-black/20"><SelectValue placeholder="Eje Y..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {profileData.map(d => <SelectItem key={d.datasetId} value={d.datasetId} className="text-xs">{d.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleCalculateCorrelation} size="sm" className="w-full h-8 text-xs" disabled={!corrAxisX || !corrAxisY || corrAxisX === corrAxisY}>
                                <CheckCircle className="mr-2 h-3.5 w-3.5" />
                                Calcular Correlación
                            </Button>
                            {correlationResult && (
                                <div className="space-y-2">
                                    <div className="text-center text-sm p-2 bg-black/20 rounded-md">
                                        <span>Coeficiente de Correlación (r): </span>
                                        <span className="font-bold font-mono">{correlationResult.coefficient.toFixed(4)}</span>
                                    </div>
                                    <div className="h-48 w-full mt-2">
                                        <ResponsiveContainer>
                                            <ScatterChart margin={{ top: 5, right: 20, left: -25, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground), 0.3)" />
                                                <XAxis type="number" dataKey="x" name={DATASET_DEFINITIONS[correlationResult.xDataset].name} stroke="hsl(var(--muted-foreground))" fontSize={10} domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
                                                <YAxis type="number" dataKey="y" name={DATASET_DEFINITIONS[correlationResult.yDataset].name} stroke="hsl(var(--muted-foreground))" fontSize={10} domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1)} />
                                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: '11px' }} />
                                                <Scatter data={correlationResult.scatterData} fill="#8884d8" shape="circle" fillOpacity={0.5} />
                                                <Line dataKey="y" data={trendlineData} stroke="#e63946" dot={false} strokeWidth={2} name="Línea de Tendencia" />
                                            </ScatterChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                         </div>
                    )}
                </AccordionContent>
            </AccordionItem>
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





