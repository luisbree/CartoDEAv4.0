

'use client';

import React,
{
    useState,
    useMemo,
    useCallback,
    useEffect,
    useRef
} from 'react';
import DraggablePanel from './DraggablePanel';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    DraftingCompass,
    Scissors,
    Layers,
    CircleDotDashed,
    MinusSquare,
    BoxSelect,
    Droplet,
    Sparkles,
    Loader2,
    Combine,
    Minus,
    Plus,
    TrendingUp,
    Waypoints as CrosshairIcon,
    Merge,
    LineChart,
    PenLine,
    Eraser,
    Brush,
    ZoomIn,
    Download,
    FileImage,
    FileText,
    CheckCircle,
    GitCommit,
    GitBranch,
    Wind,
    Layers as LayersIcon,
    LocateFixed,
    Eye,
    Activity,
    Sigma
} from 'lucide-react';
import type {
    MapLayer,
    VectorMapLayer,
    ProfilePoint,
    PlainFeatureData
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {
    intersect,
    featureCollection,
    difference,
    cleanCoords,
    length as turfLength,
    along as turfAlong,
    clustersDbscan,
    nearestPoint as turfNearestPoint,
    bearing as turfBearing,
    destination,
    bezierSpline,
    centroid,
    distance as turfDistance,
    lineArc
} from '@turf/turf';
import type {
    Feature as TurfFeature,
    Polygon as TurfPolygon,
    MultiPolygon as TurfMultiPolygon,
    FeatureCollection as TurfFeatureCollection,
    Geometry as TurfGeometry,
    Point as TurfPoint,
    LineString as TurfLineString
} from 'geojson';
import {
    multiPolygon,
    lineString as turfLineString,
    point as turfPoint,
    polygon as turfPolygon,
    convex
} from '@turf/helpers';
import Feature from 'ol/Feature';
import {
    type Geometry,
    type LineString as OlLineString,
    Point
} from 'ol/geom';
import { getLength as olGetLength } from 'ol/sphere';
import {
    performBufferAnalysis,
    performConvexHull,
    performConcaveHull,
    calculateOptimalConcavity,
    projectPopulationGeometric,
    generateCrossSections,
    dissolveFeatures,
    performBezierSmoothing,
    DATASET_DEFINITIONS,
    jenks,
    performFeatureTracking
} from '@/services/spatial-analysis';
import { getValuesForPoints } from '@/ai/flows/gee-flow';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
    TableHead,
    TableHeader
} from "@/components/ui/table";
import {
    Style,
    Text as TextStyle,
    Fill,
    Stroke,
    Circle as CircleStyle,
    Icon as IconStyle
} from 'ol/style';
import type { Map } from 'ol';
import Draw, { createBox } from 'ol/interaction/Draw';
import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    AreaChart,
    Area,
    CartesianGrid,
    ReferenceLine,
    Legend,
    ScatterChart,
    Scatter,
    Line,
    Bar,
    Cell
} from 'recharts';
import { cn } from '@/lib/utils';
import { transform } from 'ol/proj';
import { Slider } from '../ui/slider';
import Overlay from 'ol/Overlay';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { Separator } from '../ui/separator';


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
    onShowTableRequest: (plainData: PlainFeatureData[], layerName: string, layerId: string) => void;
}

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; }> = ({ icon: Icon, title }) => (
    <div className="flex items-center w-full">
        <Icon className="h-4 w-4 mr-3 text-primary/90" />
        <span className="text-sm font-semibold">{title}</span>
    </div>
);

const analysisLayerStyle = new Style({
    stroke: new Stroke({ color: 'rgba(255, 107, 107, 1)', width: 2.5, }),
    fill: new Fill({ color: 'rgba(244, 162, 97, 0.2)' }),
});

const profilePointsStyle = new Style({
    image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: 'rgba(255, 107, 107, 0.8)' }), // Red-orange
        stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
    }),
});

type DatasetId = 'NASADEM_ELEVATION' | 'ALOS_DSM' | 'JRC_WATER_OCCURRENCE';

interface ProfileDataSeries {
    datasetId: string; // Can be a DatasetId or a layer ID
    name: string;
    color: string;
    unit: string;
    points: ProfilePoint[];
    stats: ProfileStats;
}

interface ProfileStats {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    jenksBreaks: number[];
}


interface HistogramEntry {
    value: number;
    count: number;
    key: string;
    color: string;
}

interface CorrelationResult {
    coefficient: number;
    trendline: { slope: number; intercept: number };
    scatterData: { x: number, y: number }[];
    xDatasetId: string;
    yDatasetId: string;
}

interface CombinedChartDataPoint {
    distance: number;
    location: number[]; // [lon, lat] in EPSG:4326
    [key: string]: number | number[]; // Will hold values for each datasetId, e.g., NASADEM_ELEVATION: 45.3
}

// Custom component for inverted histogram bar
const InvertedBar = (props: any) => {
    const { fill, x, y, width, height, background } = props;
    if (background) {
        // This is a dummy component for the background, so it doesn't draw anything visible
        return null;
    }
    // Draw the bar "hanging" from the top (y=0 in this case)
    return <rect x={x} y={0} width={width} height={height} fill={fill} />;
};

interface CoherenceStats {
    avgDirection: number;
    stdDevDirection: number;
    avgMagnitude: number;
    stdDevMagnitude: number;
}

const tooltipStyle = {
    backgroundColor: 'rgba(240, 240, 240, 0.75)',
    border: '1px solid #ccc',
    color: '#000000',
    fontSize: '12px',
};


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
    mapRef,
    onShowTableRequest,
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

    // State for Bezier Smoothing
    const [smoothInputLayerId, setSmoothInputLayerId] = useState<string>('');
    const [smoothOutputName, setSmoothOutputName] = useState<string>('');
    const [smoothness, setSmoothness] = useState<number>(5000);

    // State for Topographic Profile
    const [profileLine, setProfileLine] = useState<Feature<OlLineString> | null>(null);
    const [profileData, setProfileData] = useState<ProfileDataSeries[] | null>(null);
    const [activeProfileDrawTool, setActiveProfileDrawTool] = useState<'LineString' | 'FreehandLine' | null>(null);
    const [isGeneratingProfile, setIsGeneratingProfile] = useState(false);
    const [selectedProfileDatasets, setSelectedProfileDatasets] = useState<string[]>(['NASADEM_ELEVATION']);
    const [profileLayerId, setProfileLayerId] = useState<string>('');
    const [yAxisDomainLeft, setYAxisDomainLeft] = useState<{ min: number | 'auto'; max: number | 'auto' }>({ min: 'auto', max: 'auto' });
    const [yAxisDomainRight, setYAxisDomainRight] = useState<{ min: number | 'auto'; max: number | 'auto' }>({ min: 'auto', max: 'auto' });
    const [jenksClasses, setJenksClasses] = useState<number>(3);
    const [correlationResult, setCorrelationResult] = useState<CorrelationResult | null>(null);
    const [corrAxisX, setCorrAxisX] = useState<string>('');
    const [corrAxisY, setCorrAxisY] = useState<string>('');

    // State for Trajectory Analysis
    const [clusterInputLayerId, setClusterInputLayerId] = useState('');
    const [clusterDistance, setClusterDistance] = useState(50);
    const [clusterOutputName, setClusterOutputName] = useState('');
    const [trajectoryLayer1Id, setTrajectoryLayer1Id] = useState('');
    const [trajectoryLayer2Id, setTrajectoryLayer2Id] = useState('');
    const [trajectorySearchRadius, setTrajectorySearchRadius] = useState(100);
    const [trajectoryOutputName, setTrajectoryOutputName] = useState('');
    const [coherenceLayerId, setCoherenceLayerId] = useState('');
    const [coherenceMagnitudeField, setCoherenceMagnitudeField] = useState('velocidad_kmh');
    const [coherenceStats, setCoherenceStats] = useState<CoherenceStats | null>(null);
    const [useClustering, setUseClustering] = useState(false);
    const [showAverageVector, setShowAverageVector] = useState(true);
    const [clusterStdDevMultiplier, setClusterStdDevMultiplier] = useState(1);
    const [clusterDistanceStats, setClusterDistanceStats] = useState<{ mean: number, stdDev: number } | null>(null);

    // State for Feature Tracking
    const [trackingIsLoading, setTrackingIsLoading] = useState(false);
    const [trackingLayer1Id, setTrackingLayer1Id] = useState('');
    const [trackingLayer2Id, setTrackingLayer2Id] = useState('');
    const [trackingField, setTrackingField] = useState('');
    const [trackingRadius, setTrackingRadius] = useState(100);
    const [trackingOutputName, setTrackingOutputName] = useState('');

    // State for clicked profile points
    const [profilePoints, setProfilePoints] = useState<Feature<Point>[]>([]);
    const profilePointsLayerRef = useRef<VectorLayer<VectorSource<Point>> | null>(null);
    const profilePointsSourceRef = useRef<VectorSource<Point> | null>(null);
    const averageVectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);


    const analysisLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
    const drawInteractionRef = useRef<Draw | null>(null);
    const liveTooltipRef = useRef<Overlay | null>(null);
    const liveTooltipElementRef = useRef<HTMLDivElement | null>(null);
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const profileHoverMarkerRef = useRef<Overlay | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

    const clearAnalysisGeometries = useCallback((showToast = true) => {
        if (analysisLayerRef.current) {
            analysisLayerRef.current.getSource()?.clear();
        }
        setProfileLine(null);
        setProfileData(null);
        setCorrelationResult(null);
        setCorrAxisX('');
        setCorrAxisY('');
        setProfileLayerId('');
        if (profilePointsSourceRef.current) { // Clear marked points
            profilePointsSourceRef.current.clear();
            setProfilePoints([]);
        }
        stopDrawing();
        if (showToast) {
            toast({ description: "Análisis de perfil limpiado." });
        }
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

        // Ensure clicked points layer exists on mount
        if (mapRef.current && !profilePointsLayerRef.current) {
            profilePointsSourceRef.current = new VectorSource();
            const layer = new VectorLayer({
                source: profilePointsSourceRef.current,
                style: profilePointsStyle,
                properties: { id: 'internal-profile-points-layer' },
                zIndex: 10000,
            });
            profilePointsLayerRef.current = layer;
            mapRef.current.addLayer(layer);
        }

        // Add the hover marker overlay to the map
        if (mapRef.current && !profileHoverMarkerRef.current) {
            const markerElement = document.createElement('div');
            markerElement.className = 'w-3 h-3 bg-orange-500 rounded-full border-2 border-white shadow-lg pointer-events-none';
            const marker = new Overlay({
                element: markerElement,
                positioning: 'center-center',
                stopEvent: false,
            });
            profileHoverMarkerRef.current = marker;
            mapRef.current.addOverlay(marker);
        }

        // Cleanup on unmount
        return () => {
            if (mapRef.current) {
                if (analysisLayerRef.current) mapRef.current.removeLayer(analysisLayerRef.current);
                if (profilePointsLayerRef.current) mapRef.current.removeLayer(profilePointsLayerRef.current);
                if (profileHoverMarkerRef.current) mapRef.current.removeOverlay(profileHoverMarkerRef.current);
            }
            analysisLayerRef.current = null;
            profilePointsLayerRef.current = null;
            profilePointsSourceRef.current = null;
            profileHoverMarkerRef.current = null;
            stopDrawing();
        };
    }, [mapRef, stopDrawing]);

    const handleToggleDrawProfile = useCallback((tool: 'LineString' | 'FreehandLine') => {
        if (!mapRef.current) return;

        const isDeactivating = activeProfileDrawTool === tool;
        stopDrawing();

        if (isDeactivating) {
            setActiveProfileDrawTool(null);
            return;
        }

        clearAnalysisGeometries(false);
        setProfileLayerId('');
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
        clearAnalysisGeometries(false);

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
            if (analysisLayerRef.current) {
                const clonedFeature = feature.clone();
                clonedFeature.setStyle(analysisLayerStyle);
                analysisLayerRef.current.getSource()?.clear();
                analysisLayerRef.current.getSource()?.addFeature(clonedFeature);
            }
            toast({ description: `Línea de la capa "${layer.name}" seleccionada para el perfil.` });
        } else {
            toast({ description: "La entidad de la capa no es una línea.", variant: "destructive" });
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
                const staticDef = DATASET_DEFINITIONS[datasetId as DatasetId];
                let name, color, unit, band, isGoesLayer = false, imageId;

                if (staticDef) {
                    // It's a predefined GEE dataset
                    imageId = staticDef.id;
                    name = staticDef.name;
                    color = staticDef.color;
                    unit = staticDef.unit;
                    band = staticDef.band;
                } else {
                    // It's a dynamic raster layer from the map
                    const rasterLayer = allRasterLayersForProfile.find(l => l.id === datasetId);
                    if (!rasterLayer || !rasterLayer.geeParams?.imageId) {
                        console.warn(`Capa ráster con ID ${datasetId} no encontrada o sin imageId, omitiendo.`);
                        continue;
                    }
                    imageId = rasterLayer.geeParams.imageId;
                    name = rasterLayer.name;
                    color = '#ff6b6b'; // Default color for custom raster layers
                    unit = rasterLayer.geeParams?.bandCombination === 'GOES_CLOUDTOP' ? '°C' : 'valor';
                    band = rasterLayer.geeParams?.bandCombination === 'GOES_CLOUDTOP' ? 'CMI_C13' : 'first'; // Fallback band name
                    isGoesLayer = rasterLayer.geeParams?.bandCombination === 'GOES_CLOUDTOP';
                }

                const values = await getValuesForPoints({ points: pointsToQuery, datasetId: imageId, bandName: band, isGoesLayer });

                if (!values || values.length !== pointsToQuery.length) {
                    throw new Error(`No se obtuvieron datos válidos para ${name}.`);
                }

                const points: ProfilePoint[] = pointsToQuery.map((point, index) => ({
                    distance: point.distance,
                    value: values[index] === null || values[index] === -9999 ? 0 : parseFloat(values[index]!.toFixed(2)),
                    location: [point.lon, point.lat],
                }));

                // For GOES temperature, convert from Kelvin to Celsius for stats and charting
                const valuesForStats = isGoesLayer
                    ? points.map(p => (p.value !== 0 ? p.value - 273.15 : 0))
                    : points.map(p => p.value);

                const validValues = valuesForStats.filter(e => e !== 0);
                let stats: ProfileStats = { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, jenksBreaks: [] };
                if (validValues.length > 0) {
                    const sum = validValues.reduce((a, b) => a + b, 0);
                    stats.mean = sum / validValues.length;
                    stats.min = Math.min(...validValues);
                    stats.max = Math.max(...validValues);
                    const variance = validValues.reduce((sq, n) => sq + Math.pow(n - stats.mean, 2), 0) / validValues.length;
                    stats.stdDev = Math.sqrt(variance);
                    stats.jenksBreaks = jenks(validValues, jenksClasses);
                    validValues.sort((a, b) => a - b);
                    const mid = Math.floor(validValues.length / 2);
                    stats.median = validValues.length % 2 !== 0 ? validValues[mid] : (validValues[mid - 1] + validValues[mid]) / 2;
                }

                allProfileData.push({ datasetId, name, color, unit, points, stats });
            }

            if (allProfileData.length > 0) {
                setProfileData(allProfileData);
                const firstStat = allProfileData[0].stats;
                setYAxisDomainLeft({ min: Math.floor(firstStat.min), max: Math.ceil(firstStat.max) });

                if (allProfileData.length > 1) {
                    const secondStat = allProfileData[1].stats;
                    setYAxisDomainRight({ min: Math.floor(secondStat.min), max: Math.ceil(secondStat.max) });
                } else {
                    setYAxisDomainRight({ min: 'auto', max: 'auto' });
                }

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

    const combinedChartData = useMemo(() => {
        if (!profileData || profileData.length === 0) return [];

        const combined: CombinedChartDataPoint[] = [];
        if (profileData[0].points.length === 0) return [];

        const numPoints = profileData[0].points.length;

        for (let i = 0; i < numPoints; i++) {
            const dataPoint: CombinedChartDataPoint = {
                distance: profileData[0].points[i].distance,
                location: profileData[0].points[i].location,
            };
            for (const series of profileData) {
                if (series.points && i < series.points.length) {
                    // Convert GOES data from K to C for charting
                    const value = series.unit === '°C' ? series.points[i].value - 273.15 : series.points[i].value;
                    dataPoint[series.datasetId] = value;
                }
            }
            combined.push(dataPoint);
        }
        return combined;
    }, [profileData]);

    const combinedHistogramData = useMemo(() => {
        if (!profileData || combinedChartData.length === 0) return [];

        return profileData.flatMap((series) => {
            const isGoes = series.unit === '°C';
            const isLeftAxis = series.datasetId === profileData[0].datasetId;
            const domain = isLeftAxis ? yAxisDomainLeft : yAxisDomainRight;

            let min = domain.min === 'auto' ? series.stats.min : domain.min;
            let max = domain.max === 'auto' ? series.stats.max : domain.max;

            if (typeof min !== 'number' || typeof max !== 'number' || min === max) {
                min = series.stats.min;
                max = series.stats.max;
            }

            if (isGoes) {
                [min, max] = [max, min]; // Invert for hanging bars
            }

            if (min === max) return [];

            const allValues = series.points.map(p =>
                isGoes ? p.value - 273.15 : p.value
            ).filter(v => v >= Math.min(min, max) && v <= Math.max(min, max));

            if (allValues.length === 0) return [];

            const HISTOGRAM_BINS = 30;
            const binSize = (max - min) / HISTOGRAM_BINS;
            const histogram: { value: number; count: number; }[] = [];
            let maxCount = 0;

            for (let i = 0; i < HISTOGRAM_BINS; i++) {
                const binMin = min + i * binSize;
                const binMax = binMin + binSize;
                const count = allValues.filter(v => v >= Math.min(binMin, binMax) && v < Math.max(binMin, binMax)).length;
                if (count > maxCount) maxCount = count;
                histogram.push({
                    value: (binMin + binMax) / 2,
                    count,
                });
            }

            const totalDistance = combinedChartData[combinedChartData.length - 1]?.distance || 1;

            return histogram.map(bin => ({
                key: `${series.datasetId}-${bin.value}`,
                [series.datasetId]: bin.value,
                [`${series.datasetId}_hist`]: (bin.count / (maxCount || 1)) * (totalDistance * 0.3),
                color: series.color,
            }));
        });
    }, [profileData, yAxisDomainLeft, yAxisDomainRight, combinedChartData]);

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

        setCorrelationResult({ coefficient, trendline: { slope, intercept }, scatterData, xDatasetId: dataX.datasetId, yDatasetId: dataY.datasetId });
        toast({ description: `Correlación calculada: r = ${coefficient.toFixed(4)}` });
    };

    const handleYAxisDomainChange = (axis: 'left' | 'right', key: 'min' | 'max', value: string) => {
        const numValue = value === '' ? 'auto' : parseFloat(value);
        if (value !== '' && isNaN(numValue as number)) return; // Ignore invalid numbers

        const setDomain = axis === 'left' ? setYAxisDomainLeft : setYAxisDomainRight;
        setDomain(prev => ({ ...prev, [key]: numValue }));
    };

    const useSteppedChange = (setter: () => void) => {
        const start = () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setter(); // Initial change
            intervalRef.current = setInterval(() => setter(), 100);
        };
        const stop = () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
        return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop };
    };

    const handleYAxisDomainStep = (axis: 'left' | 'right', key: 'min' | 'max', direction: 'inc' | 'dec') => {
        const setDomain = axis === 'left' ? setYAxisDomainLeft : setYAxisDomainRight;

        return () => setDomain(prev => {
            const currentValue = prev[key];
            if (currentValue === 'auto') return prev; // Cannot step from 'auto'
            const change = direction === 'inc' ? 1 : -1;
            return { ...prev, [key]: currentValue + change };
        });
    };

    const YAxisControl = ({ axis, domain, setDomain, color }: { axis: 'left' | 'right', domain: typeof yAxisDomainLeft, setDomain: typeof setYAxisDomainLeft, color?: string }) => {
        const minIncHandlers = useSteppedChange(handleYAxisDomainStep(axis, 'min', 'inc'));
        const minDecHandlers = useSteppedChange(handleYAxisDomainStep(axis, 'min', 'dec'));
        const maxIncHandlers = useSteppedChange(handleYAxisDomainStep(axis, 'max', 'inc'));
        const maxDecHandlers = useSteppedChange(handleYAxisDomainStep(axis, 'max', 'dec'));

        return (
            <div className="p-1 space-y-1">
                <div className="flex flex-col items-center">
                    <Label className="text-xs">Min</Label>
                    <div className="flex items-center gap-1">
                        <Button {...minDecHandlers} variant="ghost" size="icon" className="h-6 w-6"><Minus className="h-3 w-3" /></Button>
                        <Input type="text" value={domain.min} onChange={(e) => handleYAxisDomainChange(axis, 'min', e.target.value)} className="h-7 w-12 text-xs bg-black/20 text-center" placeholder="auto" />
                        <Button {...minIncHandlers} variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <Label className="text-xs">Max</Label>
                    <div className="flex items-center gap-1">
                        <Button {...maxDecHandlers} variant="ghost" size="icon" className="h-6 w-6"><Minus className="h-3 w-3" /></Button>
                        <Input type="text" value={domain.max} onChange={(e) => handleYAxisDomainChange(axis, 'max', e.target.value)} className="h-7 w-12 text-xs bg-black/20 text-center" placeholder="auto" />
                        <Button {...maxIncHandlers} variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
                    </div>
                </div>
            </div>
        );
    };


    const handleDownloadProfile = (format: 'csv' | 'jpg' | 'pdf') => {
        if (!profileData) {
            toast({ description: "No hay datos de perfil para descargar.", variant: "destructive" });
            return;
        }
        const chartElement = document.getElementById('profile-chart-to-export');
        if (!chartElement) {
            toast({ description: "El contenedor del gráfico no está listo.", variant: "destructive" });
            return;
        }

        toast({ description: `Exportando como ${format.toUpperCase()}...` });

        if (format === 'csv') {
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

        } else if (format === 'jpg') {
            htmlToImage.toJpeg(chartElement, { quality: 0.95, backgroundColor: 'hsl(var(--background))' })
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
            htmlToImage.toCanvas(chartElement, { backgroundColor: 'hsl(var(--background))' })
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
    };

    const handleChartMouseMove = (data: any) => {
        if (data?.activePayload?.[0]?.payload?.location && profileHoverMarkerRef.current && mapRef.current) {
            const [lon, lat] = data.activePayload[0].payload.location;
            const mapCoords = transform([lon, lat], 'EPSG:4326', 'EPSG:3857');
            profileHoverMarkerRef.current.setPosition(mapCoords);
        }
    };

    const handleChartMouseLeave = () => {
        if (profileHoverMarkerRef.current) {
            profileHoverMarkerRef.current.setPosition(undefined);
        }
    };

    const handleChartClick = useCallback((data: any) => {
        if (data?.activePayload?.[0]?.payload?.location && profilePointsSourceRef.current && mapRef.current) {
            const [lon, lat] = data.activePayload[0].payload.location;
            const mapCoords = transform([lon, lat], 'EPSG:4326', 'EPSG:3857');

            const pointFeature = new Feature({
                geometry: new Point(mapCoords)
            });
            pointFeature.setId(nanoid());
            pointFeature.setProperties(data.activePayload.reduce((acc: any, payload: any) => {
                acc[payload.name] = payload.value;
                return acc;
            }, {}));

            profilePointsSourceRef.current.addFeature(pointFeature);
            setProfilePoints(prev => [...prev, pointFeature]);
        }
    }, [mapRef]);

    const onConvertProfilePointsToLayer = useCallback(() => {
        if (profilePoints.length === 0) {
            toast({ description: 'No hay puntos marcados para crear una capa.' });
            return;
        }
        const clonedFeatures = profilePoints.map(f => f.clone());

        const newLayerId = `puntos-perfil-${nanoid()}`;
        const newLayerName = "Puntos de Perfil";
        const newSource = new VectorSource({ features: clonedFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: newLayerName, type: 'vector' },
            style: profilePointsStyle
        });

        onAddLayer({
            id: newLayerId,
            name: newLayerName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'vector'
        }, true);

        // Clear temporary points
        profilePointsSourceRef.current?.clear();
        setProfilePoints([]);

        toast({ description: `Capa "${newLayerName}" creada con ${clonedFeatures.length} puntos.` });
    }, [profilePoints, onAddLayer, toast]);
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

    const pointLayers = useMemo(() => {
        return vectorLayers.filter(l => {
            const source = l.olLayer.getSource();
            if (!source) return false;
            const features = source.getFeatures();
            if (features.length === 0) return false;
            const geomType = features[0].getGeometry()?.getType();
            return geomType === 'Point' || geomType === 'MultiPoint';
        });
    }, [vectorLayers]);

    const allRasterLayersForProfile = useMemo(() => {
        return allLayers.flatMap(item => 'layers' in item ? item.layers : [item])
            .filter((l): l is MapLayer =>
                (l.type === 'gee' || l.type === 'geotiff') && !!l.geeParams?.imageId
            );
    }, [allLayers]);


    const trajectoryLayers = useMemo(() => {
        return vectorLayers.filter(l => l.name.toLowerCase().startsWith('trayectoria') || l.name.toLowerCase().startsWith('seguimiento'));
    }, [vectorLayers]);

    const coherenceNumericFields = useMemo(() => {
        const layer = trajectoryLayers.find(l => l.id === coherenceLayerId);
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
    }, [trajectoryLayers, coherenceLayerId]);

    const trackingNumericFields = useMemo(() => {
        const layer1 = pointLayers.find(l => l.id === trackingLayer1Id);
        if (!layer1) return [];

        const source = layer1.olLayer.getSource();
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
    }, [pointLayers, trackingLayer1Id]);

    useEffect(() => {
        if (trackingNumericFields.length > 0 && !trackingNumericFields.includes(trackingField)) {
            setTrackingField(trackingNumericFields[0]);
        } else if (trackingNumericFields.length === 0) {
            setTrackingField('');
        }
    }, [trackingNumericFields, trackingField]);

    useEffect(() => {
        if (coherenceNumericFields.length > 0 && !coherenceNumericFields.includes(coherenceMagnitudeField)) {
            setCoherenceMagnitudeField(coherenceNumericFields.find(f => f.includes('velocidad')) || coherenceNumericFields[0]);
        } else if (coherenceNumericFields.length === 0) {
            setCoherenceMagnitudeField('');
        }
    }, [coherenceNumericFields, coherenceMagnitudeField]);


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

    const handleRunBezier = async () => {
        const inputLayer = vectorLayers.find(l => l.id === smoothInputLayerId);
        if (!inputLayer) {
            toast({ description: "Por favor, seleccione una capa para suavizar.", variant: "destructive" });
            return;
        }
        const inputSource = inputLayer.olLayer.getSource();
        if (!inputSource || inputSource.getFeatures().length === 0) {
            toast({ description: "La capa de entrada no tiene entidades.", variant: "destructive" });
            return;
        }

        const outputName = smoothOutputName.trim() || `Suavizado_${inputLayer.name}`;
        toast({ description: "Aplicando suavizado Bezier..." });

        try {
            const smoothedFeatures = await performBezierSmoothing({
                features: inputSource.getFeatures(),
                resolution: smoothness,
            });

            if (smoothedFeatures.length === 0) {
                throw new Error("La operación de suavizado no produjo resultados.");
            }

            smoothedFeatures.forEach(f => f.setId(nanoid()));

            const newLayerId = `smooth-result-${nanoid()}`;
            const newSource = new VectorSource({ features: smoothedFeatures });
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

            toast({ description: `Se creó la capa suavizada "${outputName}".` });
            setSmoothInputLayerId('');
            setSmoothOutputName('');

        } catch (error: any) {
            console.error("Bezier smoothing failed:", error);
            throw new Error(`Turf.js bezierSpline failed: ${error.message}`);
        }
    };

    const handleRunTrajectory = () => {
        const layer1 = allLayers.find(l => l.id === trajectoryLayer1Id) as VectorMapLayer | undefined;
        const layer2 = allLayers.find(l => l.id === trajectoryLayer2Id) as VectorMapLayer | undefined;

        if (!layer1 || !layer2 || trajectorySearchRadius <= 0) {
            toast({ description: "Seleccione dos capas de puntos y un radio de búsqueda válido.", variant: 'destructive' });
            return;
        }

        const source1 = layer1.olLayer.getSource();
        const source2 = layer2.olLayer.getSource();
        if (!source1 || !source2 || source1.getFeatures().length === 0 || source2.getFeatures().length === 0) {
            toast({ description: 'Una o ambas capas no tienen entidades.', variant: 'destructive' });
            return;
        }

        // Correctly get timestamp from geeParams.metadata
        const time1 = layer1.geeParams?.metadata?.timestamp;
        const time2 = layer2.geeParams?.metadata?.timestamp;

        if (!time1 || !time2) {
            toast({
                title: "Faltan Metadatos",
                description: "No se encontró la información de tiempo en una o ambas capas. Asegúrese de que provengan de la herramienta de detección de núcleos.",
                variant: "destructive"
            });
            return;
        }

        const timeDiffMs = Math.abs(new Date(time2).getTime() - new Date(time1).getTime());
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

        if (timeDiffHours <= 0) {
            toast({ description: "El intervalo de tiempo entre las capas es cero o inválido.", variant: 'destructive' });
            return;
        }

        const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
        const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
        const features1GeoJSON = format.writeFeaturesObject(source1.getFeatures());
        const features2GeoJSON = format.writeFeaturesObject(source2.getFeatures());

        const vectorFeatures: Feature<OlLineString>[] = [];
        for (const point1 of features1GeoJSON.features) {
            const nearest = turfNearestPoint(point1, features2GeoJSON);
            const distance = turfDistance(point1, nearest, { units: 'kilometers' });

            if (distance <= trajectorySearchRadius) {
                const line = turfLineString([point1.geometry.coordinates, nearest.geometry.coordinates]);
                const bearingVal = turfBearing(point1, nearest);
                const speed = distance / timeDiffHours;

                const olFeature = formatForMap.readFeature(line) as Feature<OlLineString>;
                olFeature.setProperties({
                    velocidad_kmh: parseFloat(speed.toFixed(2)),
                    sentido_grados: parseFloat(bearingVal.toFixed(2)),
                    distancia_km: parseFloat(distance.toFixed(2))
                });
                olFeature.setId(nanoid());
                vectorFeatures.push(olFeature);
            }
        }

        if (vectorFeatures.length === 0) {
            toast({ description: "No se encontraron trayectorias entre las capas con los parámetros dados." });
            return;
        }

        const outputName = trajectoryOutputName.trim() || `Trayectoria ${layer1.name} a ${layer2.name}`;
        const newLayerId = `trajectory-result-${nanoid()}`;
        const newSource = new VectorSource({ features: vectorFeatures });

        const vectorStyle = (feature: Feature) => {
            const speed = feature.get('velocidad_kmh') as number || 0;
            const color = speed > 100 ? '#e63946' : speed > 50 ? '#f4a261' : '#2a9d8f';

            const line = new Style({
                stroke: new Stroke({ color: color, width: 2 })
            });

            const arrow = new Style({
                geometry: new Point((feature.getGeometry() as OlLineString).getLastCoordinate()),
                image: new CircleStyle({
                    fill: new Fill({ color: color }),
                    radius: 3
                })
            });

            const label = new Style({
                geometry: new Point((feature.getGeometry() as OlLineString).getFlatMidpoint()),
                text: new TextStyle({
                    text: `${speed.toFixed(1)} km/h`,
                    font: '10px sans-serif',
                    fill: new Fill({ color: '#fff' }),
                    stroke: new Stroke({ color: '#000', width: 2 }),
                    offsetY: -12
                })
            });

            return [line, arrow, label];
        };

        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
            style: vectorStyle
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);

        toast({ description: `Se generaron ${vectorFeatures.length} vectores de trayectoria.` });
    };

    const handleAnalyzeCoherence = () => {
        const layer = trajectoryLayers.find(l => l.id === coherenceLayerId) as VectorMapLayer | undefined;
        if (!layer) {
            toast({ description: "Por favor, seleccione una capa de trayectorias para analizar.", variant: "destructive" });
            return;
        }
        const source = layer.olLayer.getSource();
        if (!source || source.getFeatures().length === 0) {
            toast({ description: 'La capa de trayectorias no tiene entidades.', variant: 'destructive' });
            return;
        }
        if (!coherenceMagnitudeField || !coherenceNumericFields.includes(coherenceMagnitudeField)) {
            toast({ description: "Por favor, seleccione un campo de magnitud válido.", variant: "destructive" });
            return;
        }
    
        const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
        const allFeatures = source.getFeatures();
    
        if (useClustering) {
            const geojsonFeatures = format.writeFeaturesObject(allFeatures);
            const centroids = featureCollection(geojsonFeatures.features.map((f, i) => {
                const center = centroid(f as TurfFeature<TurfLineString>);
                center.properties = { ...f.properties, _originalFeatureId: allFeatures[i].getId() || `feat-${i}` };
                return center;
            }));

            // Calculate NN distances for epsilon
            const nnDistances = centroids.features.map((point, i, arr) => {
                const otherPoints = featureCollection(arr.filter((_, j) => i !== j));
                if (otherPoints.features.length === 0) return 0;
                return turfNearestPoint(point, otherPoints).properties.distanceToPoint;
            });
            const meanDistance = nnDistances.reduce((a, b) => a + b, 0) / nnDistances.length;
            const stdDevDistance = Math.sqrt(nnDistances.map(d => Math.pow(d - meanDistance, 2)).reduce((a, b) => a + b, 0) / nnDistances.length);
            setClusterDistanceStats({ mean: meanDistance, stdDev: stdDevDistance });

            const dbscanDistance = meanDistance + (clusterStdDevMultiplier * stdDevDistance);
            toast({ description: `Distancia de clustering: ${dbscanDistance.toFixed(2)} km` });
            
            const clusters = clustersDbscan(centroids, dbscanDistance, { minPoints: 2 });
    
            const clusterGroups: Record<string, Feature<Geometry>[]> = {};
            const clusteredFeatureIds = new Set<string>();

            clusters.features.forEach(feature => {
                const clusterId = feature.properties!.cluster;
                if (clusterId === undefined) return; // Skip noise points for now
    
                const idStr = String(clusterId);
                const originalFeatureId = feature.properties!._originalFeatureId;
                const originalFeature = allFeatures.find(f => f.getId() === originalFeatureId);
    
                if (originalFeature) {
                    if (!clusterGroups[idStr]) {
                        clusterGroups[idStr] = [];
                    }
                    clusterGroups[idStr].push(originalFeature);
                    clusteredFeatureIds.add(originalFeatureId as string);
                }
            });
    
            // Process actual clusters
            for (const clusterId in clusterGroups) {
                const featuresInCluster = clusterGroups[clusterId];
                if (featuresInCluster.length < 2) continue; // Should not happen with minPoints=2, but good practice
    
                const directions = featuresInCluster.map(f => f.get('sentido_grados')).filter(d => typeof d === 'number') as number[];
                const magnitudes = featuresInCluster.map(f => f.get(coherenceMagnitudeField)).filter(s => typeof s === 'number') as number[];
    
                if (directions.length === 0 || magnitudes.length === 0) continue;
    
                const avgMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
                const avgX = directions.reduce((sum, d) => sum + Math.cos(d * Math.PI / 180), 0) / directions.length;
                const avgY = directions.reduce((sum, d) => sum + Math.sin(d * Math.PI / 180), 0) / directions.length;
                const avgAngleRad = Math.atan2(avgY, avgX);
                let avgDirection = (avgAngleRad * 180 / Math.PI + 360) % 360;
    
                const stdDevDirection = Math.sqrt(directions.reduce((sum, d) => {
                    let dirDiff = Math.abs(d - avgDirection);
                    if (dirDiff > 180) dirDiff = 360 - dirDiff;
                    return sum + Math.pow(dirDiff, 2);
                }, 0) / directions.length);
                const stdDevMagnitude = Math.sqrt(magnitudes.reduce((sum, s) => sum + Math.pow(s - avgMagnitude, 2), 0) / magnitudes.length);
    
                featuresInCluster.forEach(olFeature => {
                    const direction = olFeature.get('sentido_grados');
                    const magnitude = olFeature.get(coherenceMagnitudeField);
    
                    let dirDiff = Math.abs(direction - avgDirection);
                    if (dirDiff > 180) dirDiff = 360 - dirDiff;
                    const magDiff = Math.abs(magnitude - avgMagnitude);
    
                    let coherence = 'Coherente';
                    if (dirDiff > stdDevDirection * 2 || magDiff > stdDevMagnitude * 2) {
                        coherence = 'Atípico';
                    } else if (dirDiff > stdDevDirection * 1 || magDiff > stdDevMagnitude * 1) {
                        coherence = 'Moderado';
                    }
                    olFeature.set('coherencia', coherence);
                    olFeature.set('cluster_id', clusterId);
                });
            }

            // Handle noise features
            allFeatures.forEach(f => {
                if (!clusteredFeatureIds.has(f.getId() as string)) {
                    f.set('coherencia', 'Aislado');
                    f.set('cluster_id', 'ruido');
                }
            });
    
        } else { // Global analysis (no clustering)
            const directions = allFeatures.map(f => f.get('sentido_grados')).filter(d => typeof d === 'number') as number[];
            const magnitudes = allFeatures.map(f => f.get(coherenceMagnitudeField)).filter(m => typeof m === 'number') as number[];

            if (directions.length === 0 || magnitudes.length === 0) {
                toast({ description: 'No hay datos válidos de dirección o magnitud para analizar.', variant: 'destructive' });
                return;
            }

            const avgMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
            const avgX = directions.reduce((sum, d) => sum + Math.cos(d * Math.PI / 180), 0) / directions.length;
            const avgY = directions.reduce((sum, d) => sum + Math.sin(d * Math.PI / 180), 0) / directions.length;
            const avgAngleRad = Math.atan2(avgY, avgX);
            const avgDirection = (avgAngleRad * 180 / Math.PI + 360) % 360;

            const stdDevDirection = Math.sqrt(directions.reduce((sum, d) => {
                let dirDiff = Math.abs(d - avgDirection);
                if (dirDiff > 180) dirDiff = 360 - dirDiff;
                return sum + Math.pow(dirDiff, 2);
            }, 0) / directions.length);
            const stdDevMagnitude = Math.sqrt(magnitudes.reduce((sum, s) => sum + Math.pow(s - avgMagnitude, 2), 0) / magnitudes.length);
            
            setCoherenceStats({ avgDirection, stdDevDirection, avgMagnitude, stdDevMagnitude });

            allFeatures.forEach(feature => {
                const direction = feature.get('sentido_grados');
                const magnitude = feature.get(coherenceMagnitudeField);
                let dirDiff = Math.abs(direction - avgDirection);
                if (dirDiff > 180) dirDiff = 360 - dirDiff;
                const magDiff = Math.abs(magnitude - avgMagnitude);
                
                let coherence = 'Coherente';
                if (dirDiff > stdDevDirection * 2 || magDiff > stdDevMagnitude * 2) coherence = 'Atípico';
                else if (dirDiff > stdDevDirection || magDiff > stdDevMagnitude) coherence = 'Moderado';
                
                feature.set('coherencia', coherence);
            });
            
            if (showAverageVector) {
                if (!averageVectorLayerRef.current) {
                    averageVectorLayerRef.current = new VectorLayer({
                        source: new VectorSource(),
                        properties: { id: 'average-vector-layer' }
                    });
                    mapRef.current?.addLayer(averageVectorLayerRef.current);
                }
                const vectorSource = averageVectorLayerRef.current.getSource();
                vectorSource?.clear();

                const centerOfMass = centroid(format.writeFeaturesObject(allFeatures));
                const vectorLengthKm = 200; // Fixed length for visualization
                const endPoint = destination(centerOfMass, vectorLengthKm, avgDirection, { units: 'kilometers' });

                const avgVectorFeature = formatForMap.readFeature(turfLineString([
                    centerOfMass.geometry.coordinates,
                    endPoint.geometry.coordinates
                ]));

                avgVectorFeature.setStyle(new Style({ stroke: new Stroke({ color: '#ff00ff', width: 4, lineDash: [10, 10] })}));
                vectorSource?.addFeature(avgVectorFeature);
            } else {
                averageVectorLayerRef.current?.getSource()?.clear();
            }
        }
    
        layer.olLayer.setStyle((feature) => {
            const coherence = feature.get('coherencia');
            let color = '#3b82f6'; // Azul para Coherente
            if (coherence === 'Moderado') color = '#facc15'; // Amarillo para Moderado
            if (coherence === 'Atípico') color = '#ef4444'; // Rojo para Atípico
            if (coherence === 'Aislado') color = '#9ca3af'; // Gris para Aislado
    
            return new Style({
                stroke: new Stroke({ color, width: 2.5 }),
                image: new CircleStyle({ radius: 4, fill: new Fill({ color }) })
            });
        });
    
        source.changed(); // Force redraw
        onShowTableRequest(
            source.getFeatures().map(f => ({ id: f.getId() as string, attributes: f.getProperties() })),
            layer.name,
            layer.id
        );
        toast({ description: `Análisis de coherencia completado.` });
    };


    const handleRunFeatureTracking = async () => {
        const layer1 = pointLayers.find(l => l.id === trackingLayer1Id) as VectorMapLayer | undefined;
        const layer2 = pointLayers.find(l => l.id === trackingLayer2Id) as VectorMapLayer | undefined;
    
        if (!layer1 || !layer2 || trackingRadius <= 0 || !trackingField) {
            toast({ description: "Seleccione dos capas de puntos, un campo de atributo y un radio de búsqueda válido.", variant: "destructive" });
            return;
        }
    
        const time1 = layer1.olLayer.get('geeParams')?.metadata?.timestamp;
        const time2 = layer2.olLayer.get('geeParams')?.metadata?.timestamp;
    
        if (!time1 || !time2) {
            toast({
                title: "Faltan Metadatos de Tiempo",
                description: "No se pudo encontrar la información de tiempo en las capas de centroides. Asegúrese de que fueron generadas por la herramienta 'Detectar Núcleos de Tormenta'.",
                variant: "destructive",
            });
            return;
        }
    
        setTrackingIsLoading(true);
        toast({ description: "Iniciando seguimiento de entidades..." });
    
        try {
            const trackingResultFeatures = await performFeatureTracking({
                sourceFeatures: layer1.olLayer.getSource()!.getFeatures(),
                targetFeatures: layer2.olLayer.getSource()!.getFeatures(),
                attributeField: trackingField,
                maxDistanceKm: trackingRadius,
                time1,
                time2
            });
    
            if (trackingResultFeatures.length === 0) {
                toast({ description: "No se encontraron puntos homólogos con los parámetros dados." });
                setTrackingIsLoading(false);
                return;
            }
    
            const outputName = trackingOutputName.trim() || `Seguimiento de ${layer1.name}`;
            const newLayerId = `tracking-result-${nanoid()}`;
            const newSource = new VectorSource({ features: trackingResultFeatures });
            
            const newOlLayer = new VectorLayer({
                source: newSource,
                properties: { 
                    id: newLayerId, 
                    name: outputName, 
                    type: 'analysis',
                    // Store timestamps for recalculation
                    time1: time1,
                    time2: time2,
                },
            });
    
            onAddLayer({
                id: newLayerId,
                name: outputName,
                olLayer: newOlLayer,
                visible: true,
                opacity: 1,
                type: 'analysis',
            }, true);
    
            toast({ description: `Se generaron ${trackingResultFeatures.length} vectores de seguimiento.` });
    
        } catch (error: any) {
            console.error("Feature tracking failed:", error);
            toast({ title: "Error de Seguimiento", description: error.message, variant: "destructive" });
        } finally {
            setTrackingIsLoading(false);
        }
    };

    const trendlineData = useMemo(() => {
        if (!correlationResult) return [];
        const { slope, intercept, scatterData } = correlationResult;
        if (scatterData.length === 0) return [];
        const minX = Math.min(...scatterData.map(d => d.x));
        const maxX = Math.max(...scatterData.map(d => d.x));
        return [
            { x: minX, y: slope * minX + intercept },
            { x: maxX, y: slope * maxX + intercept },
        ];
    }, [correlationResult]);

    const isAnyGoesProfile = profileData?.some(d => d.unit === '°C') ?? false;



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
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button onClick={() => handleToggleDrawProfile('LineString')} size="icon" className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeProfileDrawTool === 'LineString' && "bg-primary hover:bg-primary/90")} title="Dibujar Línea">
                                        <PenLine className="h-4 w-4" />
                                    </Button>
                                    <Button onClick={() => handleToggleDrawProfile('FreehandLine')} size="icon" className={cn("h-8 w-8 text-xs border-white/30 bg-black/20", activeProfileDrawTool === 'FreehandLine' && "bg-primary hover:bg-primary/90")} title="Dibujar a Mano Alzada">
                                        <Brush className="h-4 w-4" />
                                    </Button>
                                    <Button onClick={() => clearAnalysisGeometries(true)} size="icon" variant="destructive" className="h-8 w-8 flex-shrink-0">
                                        <Eraser className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex-grow border-l border-dashed border-gray-600 pl-2">
                                    <Select value={profileLayerId} onValueChange={handleSelectProfileLayer}>
                                        <SelectTrigger className="h-8 text-xs bg-black/20 w-full"><SelectValue placeholder="o seleccionar capa..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {lineLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 p-2 border border-white/10 rounded-md">
                            <div className="space-y-2">
                                <Label className="text-xs">Datasets a Perfilar</Label>
                                <ScrollArea className="h-28">
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
                                    {allRasterLayersForProfile.length > 0 && <Separator className="bg-white/10 my-2" />}
                                    {allRasterLayersForProfile.map(layer => (
                                        <div key={layer.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`profile-ds-${layer.id}`}
                                                checked={selectedProfileDatasets.includes(layer.id)}
                                                onCheckedChange={(checked) => {
                                                    setSelectedProfileDatasets(prev =>
                                                        checked ? [...prev, layer.id] : prev.filter(item => item !== layer.id)
                                                    );
                                                }}
                                            />
                                            <Label htmlFor={`profile-ds-${layer.id}`} className="text-xs font-normal text-amber-300">{layer.name}</Label>
                                        </div>
                                    ))}
                                </ScrollArea>
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-white/10 mt-2">
                                <Label htmlFor="jenks-classes" className="text-xs whitespace-nowrap">Clases Jenks</Label>
                                <Input id="jenks-classes" type="number" value={jenksClasses} onChange={(e) => setJenksClasses(Math.max(2, Number(e.target.value)))} className="h-7 w-16 text-xs bg-black/20 p-1 text-center" min="2" max="10" />
                            </div>
                            <Button onClick={handleRunProfile} size="sm" className="w-full h-8 text-xs" disabled={!profileLine || selectedProfileDatasets.length === 0 || isGeneratingProfile}>
                                {isGeneratingProfile ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LineChart className="mr-2 h-3.5 w-3.5" />}
                                Generar Perfil(es)
                            </Button>
                        </div>
                        {profileData && (
                            <div className="pt-2 border-t border-white/10 flex flex-col gap-3">
                                <div id="profile-chart-to-export" className="bg-background p-2 rounded">
                                    <div ref={chartContainerRef} className="h-64 w-full">
                                        <ResponsiveContainer>
                                            <AreaChart
                                                data={combinedChartData}
                                                margin={{ top: 5, right: 10, left: -20, bottom: 20 }}
                                                onMouseMove={handleChartMouseMove}
                                                onMouseLeave={handleChartMouseLeave}
                                                onClick={handleChartClick}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                <XAxis
                                                    dataKey="distance"
                                                    tickFormatter={(val) => `${(val / 1000).toFixed(1)}km`}
                                                    stroke="hsl(var(--foreground))"
                                                    fontSize={10}
                                                />
                                                <YAxis
                                                    yAxisId="left"
                                                    orientation="left"
                                                    stroke={profileData[0]?.color}
                                                    fontSize={10}
                                                    reversed={profileData[0]?.unit === '°C'}
                                                    domain={profileData[0]?.unit === '°C' ? [yAxisDomainLeft.max, yAxisDomainLeft.min] : [yAxisDomainLeft.min, yAxisDomainLeft.max]}
                                                />
                                                {profileData.length > 1 && (
                                                    <YAxis
                                                        yAxisId="right"
                                                        orientation="right"
                                                        stroke={profileData[1]?.color}
                                                        fontSize={10}
                                                        reversed={profileData[1]?.unit === '°C'}
                                                        domain={profileData[1]?.unit === '°C' ? [yAxisDomainRight.max, yAxisDomainRight.min] : [yAxisDomainRight.min, yAxisDomainRight.max]}
                                                    />
                                                )}
                                                <Tooltip
                                                    contentStyle={tooltipStyle}
                                                    labelFormatter={(label) => `Distancia: ${(label / 1000).toFixed(2)} km`}
                                                    formatter={(value: number, name: string) => [`${value.toFixed(2)} ${profileData.find(d => d.datasetId === name)?.unit || ''}`, profileData.find(d => d.datasetId === name)?.name]}
                                                />
                                                <Legend wrapperStyle={{ fontSize: "10px", paddingTop: '20px' }} />
                                                {profileData[0]?.stats.jenksBreaks.map((br, i) => (
                                                    <ReferenceLine key={`jenks-left-${i}`} y={br} yAxisId="left" stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeOpacity={0.7}>
                                                        <Label value={br.toFixed(1)} position="insideLeft" fontSize={9} fill="hsl(var(--muted-foreground))" />
                                                    </ReferenceLine>
                                                ))}
                                                {profileData.length > 1 && profileData[1]?.stats.jenksBreaks.map((br, i) => (
                                                    <ReferenceLine key={`jenks-right-${i}`} y={br} yAxisId="right" stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeOpacity={0.7}>
                                                        <Label value={br.toFixed(1)} position="insideRight" fontSize={9} fill="hsl(var(--muted-foreground))" />
                                                    </ReferenceLine>
                                                ))}
                                                {profileData.map((series, index) => (
                                                    <Area
                                                        key={series.datasetId}
                                                        yAxisId={index === 0 ? "left" : "right"}
                                                        type="monotone"
                                                        dataKey={series.datasetId}
                                                        name={series.name}
                                                        stroke={series.color}
                                                        fill={series.color}
                                                        fillOpacity={0.2}
                                                        strokeWidth={1.5}
                                                    />
                                                ))}
                                                {profileData.map((series, index) => (
                                                    <Bar
                                                        key={`${series.datasetId}_hist`}
                                                        dataKey={`${series.datasetId}_hist`}
                                                        yAxisId={index === 0 ? "left" : "right"}
                                                        barSize={4}
                                                        fill={series.color}
                                                        fillOpacity={0.3}
                                                        shape={series.unit === '°C' ? <InvertedBar /> : undefined}
                                                        data={combinedHistogramData}
                                                    />
                                                ))}
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div className="space-y-2 p-2 border border-white/10 rounded-md">
                                    <Label className="text-xs font-semibold">Dominio del Eje Y</Label>
                                    <Table>
                                        <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="p-1 h-auto text-center text-xs">Eje Izquierdo ({profileData[0].unit})</TableHead>{profileData.length > 1 && <TableHead className="p-1 h-auto text-center text-xs">Eje Derecho ({profileData[1]?.unit || '...'})</TableHead>}</TableRow></TableHeader>
                                        <TableBody><TableRow className="hover:bg-transparent"><td className="p-0"><YAxisControl axis="left" domain={yAxisDomainLeft} setDomain={setYAxisDomainLeft} color={profileData[0]?.color} /></td>{profileData.length > 1 && <td className="p-0"><YAxisControl axis="right" domain={yAxisDomainRight} setDomain={setYAxisDomainRight} color={profileData[1]?.color} /></td>}</TableRow></TableBody>
                                    </Table>
                                </div>
                                <div className="space-y-1">
                                    {profileData.map(series => (
                                        <details key={series.datasetId}>
                                            <summary className="text-xs font-semibold cursor-pointer py-1" style={{ color: series.color }}>Estadísticas: {series.name}</summary>
                                            <Table>
                                                <TableBody>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Media</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.mean.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Mediana</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.median.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Mín</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.min.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Máx</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.max.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Desv. Est.</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.stdDev.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell className="text-xs text-gray-300 p-1">Cortes Jenks</TableCell><TableCell className="text-xs text-white p-1 text-right font-mono">{series.stats.jenksBreaks.map(b => b.toFixed(1)).join(', ')}</TableCell></TableRow>
                                                </TableBody>
                                            </Table>
                                        </details>
                                    ))}
                                </div>
                                {profileData && profileData.length > 1 && (
                                    <div className="space-y-2 pt-2 border-t border-white/10">
                                        <h4 className="text-xs font-semibold">Análisis de Correlación</h4>
                                        <div className="flex items-end gap-2">
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor="corr-x" className="text-xs">Eje X</Label>
                                                <Select value={corrAxisX} onValueChange={setCorrAxisX}>
                                                    <SelectTrigger id="corr-x" className="h-7 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                                        {profileData.map(d => <SelectItem key={d.datasetId} value={d.datasetId} className="text-xs">{d.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <Label htmlFor="corr-y" className="text-xs">Eje Y</Label>
                                                <Select value={corrAxisY} onValueChange={setCorrAxisY}>
                                                    <SelectTrigger id="corr-y" className="h-7 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                                        {profileData.map(d => <SelectItem key={d.datasetId} value={d.datasetId} className="text-xs">{d.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button onClick={handleCalculateCorrelation} size="sm" className="h-7 text-xs" disabled={!corrAxisX || !corrAxisY || corrAxisX === corrAxisY}>
                                                Calcular
                                            </Button>
                                        </div>
                                        {correlationResult && (
                                            <div className="pt-2">
                                                <p className="text-center text-sm font-mono mb-1">r = {correlationResult.coefficient.toFixed(4)}</p>
                                                <div className="h-48 w-full">
                                                    <ResponsiveContainer>
                                                        <ScatterChart margin={{ top: 5, right: 20, bottom: 20, left: -20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                            <XAxis type="number" dataKey="x" name={profileData.find(d => d.datasetId === correlationResult.xDatasetId)?.name} domain={['dataMin', 'dataMax']} fontSize={10} tickFormatter={(v) => v.toFixed(0)} />
                                                            <YAxis type="number" dataKey="y" name={profileData.find(d => d.datasetId === correlationResult.yDatasetId)?.name} domain={['dataMin', 'dataMax']} fontSize={10} tickFormatter={(v) => v.toFixed(0)} />
                                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} />
                                                            <Scatter data={correlationResult.scatterData} fill="#8884d8" fillOpacity={0.6} shape="circle" />
                                                            <Line data={trendlineData} dataKey="y" stroke="#ff7300" dot={false} strokeWidth={2} name="Tendencia" />
                                                        </ScatterChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-end items-center gap-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-7 text-xs bg-gray-600/70 hover:bg-gray-500/70 border-gray-500 text-white">
                                                <Download className="mr-2 h-3.5 w-3.5" /> Exportar
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onSelect={() => handleDownloadProfile('csv')} className="text-xs"><FileText className="mr-2 h-3.5 w-3.5" />CSV</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => handleDownloadProfile('jpg')} className="text-xs"><FileImage className="mr-2 h-3.5 w-3.5" />JPG</DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => handleDownloadProfile('pdf')} className="text-xs"><FileImage className="mr-2 h-3.5 w-3.5" />PDF</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    {profilePoints.length > 0 && (
                                        <Button onClick={onConvertProfilePointsToLayer} variant="outline" size="sm" className="h-7 text-xs bg-primary/30 text-white border-primary/50">
                                            <LayersIcon className="mr-2 h-3.5 w-3.5" />Crear Capa de Puntos ({profilePoints.length})
                                        </Button>
                                    )}
                                </div>
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
                                    <Input id="clip-output-name" value={clipOutputName} onChange={(e) => setClipOutputName(e.target.value)} placeholder="Ej: Recorte_de_CapaX" className="h-8 text-xs bg-black/20" />
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
                                    <Input id="erase-output-name" value={eraseOutputName} onChange={(e) => setEraseOutputName(e.target.value)} placeholder="Ej: Diferencia_de_CapaX" className="h-8 text-xs bg-black/20" />
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
                                        <Input id="buffer-distance" type="number" value={bufferDistance} onChange={(e) => setBufferDistance(Number(e.target.value))} min="0" className="h-8 text-xs bg-black/20" />
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
                                    <Input id="buffer-output-name" value={bufferOutputName} onChange={(e) => setBufferOutputName(e.target.value)} placeholder="Ej: Buffer_de_CapaX" className="h-8 text-xs bg-black/20" />
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
                                        <Input id="cs-distance" type="number" value={crossSectionDistance} onChange={(e) => setCrossSectionDistance(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20" />
                                    </div>
                                    <div className="flex-grow">
                                        <Label htmlFor="cs-length" className="text-xs">Longitud del perfil</Label>
                                        <Input id="cs-length" type="number" value={crossSectionLength} onChange={(e) => setCrossSectionLength(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20" />
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
                                    <Input id="cs-output-name" value={crossSectionOutputName} onChange={(e) => setCrossSectionOutputName(e.target.value)} placeholder="Ej: Perfiles_del_RioX" className="h-8 text-xs bg-black/20" />
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
                                    <Input id="hull-output-name" value={hullOutputName} onChange={(e) => setHullOutputName(e.target.value)} placeholder="Ej: Envolvente_CapaX" className="h-8 text-xs bg-black/20" />
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
                                        <Button onClick={() => handleConcavityStep('decrement')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Minus className="h-4 w-4" /></Button>
                                        <Input
                                            id="concavity-input"
                                            type="number"
                                            value={concavity}
                                            onChange={(e) => setConcavity(Number(e.target.value))}
                                            step={concavityStats ? concavityStats.stdDev / 10 : 0.1}
                                            min="0.01"
                                            className="h-8 text-xs bg-black/20 text-center"
                                        />
                                        <Button onClick={() => handleConcavityStep('increment')} variant="outline" size="icon" className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border-white/30 text-white/90"><Plus className="h-4 w-4" /></Button>
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
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Suavizado de Geometría (Bezier)</Label>
                            <div className="space-y-2 p-2 border border-white/10 rounded-md">
                                <div>
                                    <Label htmlFor="smooth-input-layer" className="text-xs">Capa de Entrada (Líneas o Polígonos)</Label>
                                    <Select value={smoothInputLayerId} onValueChange={setSmoothInputLayerId}>
                                        <SelectTrigger id="smooth-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="smoothness-slider" className="text-xs">Nivel de Suavizado</Label>
                                    <Slider
                                        id="smoothness-slider"
                                        min={100}
                                        max={20000}
                                        step={100}
                                        value={[smoothness]}
                                        onValueChange={(value) => setSmoothness(value[0])}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Valores más altos producen curvas más suaves y detalladas.</p>
                                </div>
                                <div>
                                    <Label htmlFor="smooth-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                                    <Input id="smooth-output-name" value={smoothOutputName} onChange={(e) => setSmoothOutputName(e.target.value)} placeholder="Ej: Suavizado_CapaX" className="h-8 text-xs bg-black/20" />
                                </div>
                                <Button onClick={handleRunBezier} size="sm" className="w-full h-8 text-xs" disabled={!smoothInputLayerId}>
                                    <GitCommit className="mr-2 h-3.5 w-3.5" />
                                    Ejecutar Suavizado
                                </Button>
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
                                    <Input id="union-output-name" value={unionOutputName} onChange={(e) => setUnionOutputName(e.target.value)} placeholder="Ej: Capas_Unidas" className="h-8 text-xs bg-black/20" />
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
                                    <Input id="dissolve-output-name" value={dissolveOutputName} onChange={(e) => setDissolveOutputName(e.target.value)} placeholder="Ej: Disuelta_CapaX" className="h-8 text-xs bg-black/20" />
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
                <AccordionItem value="trajectory-analysis" className="border-b-0 bg-white/5 rounded-md">
                    <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                        <SectionHeader icon={Wind} title="Análisis de Trayectorias" />
                    </AccordionTrigger>
                    <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Cálculo de Vectores de Desplazamiento</Label>
                            <div className="space-y-2 p-2 border border-white/10 rounded-md">
                                <div>
                                    <Label htmlFor="traj-layer1" className="text-xs">Capa de Origen (Tiempo 1)</Label>
                                    <Select value={trajectoryLayer1Id} onValueChange={setTrajectoryLayer1Id}>
                                        <SelectTrigger id="traj-layer1" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de centroides..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {pointLayers.map(l => l.name.toLowerCase().startsWith('centroides')).map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="traj-layer2" className="text-xs">Capa de Destino (Tiempo 2)</Label>
                                    <Select value={trajectoryLayer2Id} onValueChange={setTrajectoryLayer2Id}>
                                        <SelectTrigger id="traj-layer2" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de centroides..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {pointLayers.map(l => l.name.toLowerCase().startsWith('centroides')).map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="traj-radius" className="text-xs">Radio Máx. de Búsqueda (km)</Label>
                                    <Input id="traj-radius" type="number" value={trajectorySearchRadius} onChange={(e) => setTrajectorySearchRadius(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20" />
                                </div>
                                <div>
                                    <Label htmlFor="traj-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                                    <Input id="traj-output-name" value={trajectoryOutputName} onChange={(e) => setTrajectoryOutputName(e.target.value)} placeholder="Ej: Trayectoria_Nucleos" className="h-8 text-xs bg-black/20" />
                                </div>
                                <Button onClick={handleRunTrajectory} size="sm" className="w-full h-8 text-xs" disabled={!trajectoryLayer1Id || !trajectoryLayer2Id}>
                                    <Wind className="mr-2 h-3.5 w-3.5" />
                                    Calcular Trayectorias
                                </Button>
                            </div>
                        </div>
                        <Separator className="bg-white/10" />
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Análisis de Coherencia de Movimiento</Label>
                            <div className="space-y-2 p-2 border border-white/10 rounded-md">
                                <div>
                                    <Label htmlFor="coherence-layer" className="text-xs">Capa de Trayectorias</Label>
                                    <Select value={coherenceLayerId} onValueChange={(id) => { setCoherenceLayerId(id); setCoherenceStats(null); }}>
                                        <SelectTrigger id="coherence-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de trayectoria..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {trajectoryLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="coherence-field" className="text-xs">Campo de Magnitud (Intensidad)</Label>
                                    <Select value={coherenceMagnitudeField} onValueChange={setCoherenceMagnitudeField} disabled={!coherenceLayerId}>
                                        <SelectTrigger id="coherence-field" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar campo..." /></SelectTrigger>
                                        <SelectContent className="bg-gray-700 text-white border-gray-600">
                                            {coherenceNumericFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center space-x-2 pt-1">
                                    <Checkbox
                                        id="use-clustering"
                                        checked={useClustering}
                                        onCheckedChange={(checked) => setUseClustering(!!checked)}
                                    />
                                    <Label htmlFor="use-clustering" className="text-xs font-normal">Analizar por clusters espaciales</Label>
                                </div>
                                {useClustering && (
                                    <div className="pl-6 space-y-2">
                                        <Label htmlFor="stdev-multiplier" className="text-xs">Multiplicador Desv. Est.: <span className="font-bold">{clusterStdDevMultiplier.toFixed(1)}</span></Label>
                                        <Slider
                                            id="stdev-multiplier"
                                            min={0.1} max={5} step={0.1}
                                            value={[clusterStdDevMultiplier]}
                                            onValueChange={(val) => setClusterStdDevMultiplier(val[0])}
                                        />
                                        {clusterDistanceStats && (
                                            <p className="text-xs text-gray-400">Dist. Búsqueda: {(clusterDistanceStats.mean + (clusterStdDevMultiplier * clusterDistanceStats.stdDev)).toFixed(2)} km</p>
                                        )}
                                        <p className="text-xs text-gray-400">Ajusta la sensibilidad del agrupamiento.</p>
                                    </div>
                                )}
                                <div className="flex items-center space-x-2 pt-1">
                                    <Checkbox
                                        id="show-avg-vector"
                                        checked={showAverageVector}
                                        onCheckedChange={(checked) => setShowAverageVector(!!checked)}
                                        disabled={useClustering}
                                    />
                                    <Label htmlFor="show-avg-vector" className={cn("text-xs font-normal", useClustering && "text-gray-500")}>Dibujar vector promedio</Label>
                                </div>
                                <Button onClick={handleAnalyzeCoherence} size="sm" className="w-full h-8 text-xs" disabled={!coherenceLayerId || !coherenceMagnitudeField}>
                                    <Activity className="mr-2 h-3.5 w-3.5" />
                                    Analizar Coherencia
                                </Button>
                                <p className="text-xs text-gray-400">Colorea los vectores según su coherencia con el patrón de movimiento general (o por cluster).</p>
                                {coherenceStats && (
                                    <div className="pt-2 border-t border-white/10">
                                        <p className="text-xs font-semibold text-center mb-1">Estadísticas Globales</p>
                                        <Table>
                                            <TableBody>
                                                <TableRow>
                                                    <TableCell className="text-xs text-gray-300 p-1.5">Dirección Promedio</TableCell>
                                                    <TableCell className="text-xs text-white p-1.5 text-right font-mono">{coherenceStats.avgDirection.toFixed(1)}° (±{coherenceStats.stdDevDirection.toFixed(1)}°)</TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="text-xs text-gray-300 p-1.5">Magnitud Promedio</TableCell>
                                                    <TableCell className="text-xs text-white p-1.5 text-right font-mono">{coherenceStats.avgMagnitude.toFixed(2)} (±{coherenceStats.stdDevMagnitude.toFixed(2)})</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="tracking-analysis" className="border-b-0 bg-white/5 rounded-md">
                    <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                        <SectionHeader icon={LocateFixed} title="Seguimiento de Entidades" />
                    </AccordionTrigger>
                    <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                        <div className="space-y-2 p-2 border border-white/10 rounded-md">
                            <div>
                                <Label htmlFor="track-layer1" className="text-xs">Capa de Origen (Tiempo 1)</Label>
                                <Select value={trackingLayer1Id} onValueChange={setTrackingLayer1Id}>
                                    <SelectTrigger id="track-layer1" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de puntos..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {pointLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="track-layer2" className="text-xs">Capa de Destino (Tiempo 2)</Label>
                                <Select value={trackingLayer2Id} onValueChange={setTrackingLayer2Id}>
                                    <SelectTrigger id="track-layer2" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de puntos..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {pointLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="track-field" className="text-xs">Campo Numérico de Similitud</Label>
                                <Select value={trackingField} onValueChange={setTrackingField} disabled={trackingNumericFields.length === 0}>
                                    <SelectTrigger id="track-field" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar campo numérico..." /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {trackingNumericFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="track-radius" className="text-xs">Radio Máx. de Búsqueda (km)</Label>
                                <Input id="track-radius" type="number" value={trackingRadius} onChange={(e) => setTrackingRadius(Number(e.target.value))} min="1" className="h-8 text-xs bg-black/20" />
                            </div>
                            <div>
                                <Label htmlFor="track-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                                <Input id="track-output-name" value={trackingOutputName} onChange={(e) => setTrackingOutputName(e.target.value)} placeholder="Ej: Seguimiento_Nucleos" className="h-8 text-xs bg-black/20" />
                            </div>
                            <Button onClick={handleRunFeatureTracking} size="sm" className="w-full h-8 text-xs" disabled={trackingIsLoading || !trackingLayer1Id || !trackingLayer2Id || !trackingField}>
                                {trackingIsLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="mr-2 h-3.5 w-3.5" />}
                                Ejecutar Seguimiento
                            </Button>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </DraggablePanel>
    );
};

export default AnalysisPanel;

