
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MapPin, Database, Wrench, ListTree, ListChecks, Sparkles, ClipboardCheck, Library, LifeBuoy, Printer, Server, BrainCircuit, Camera, Loader2, SlidersHorizontal, ZoomIn, Undo2, BarChartHorizontal, DraftingCompass, Target, Share2 } from 'lucide-react';
import { Style, Fill, Stroke, Circle as CircleStyle, Text as TextStyle } from 'ol/style';
import { transform, transformExtent } from 'ol/proj';
import type { Extent } from 'ol/extent';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';

import { Map as OLMap, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import type Layer from 'ol/layer/Layer';
import type { Source as TileSource } from 'ol/source';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';


import MapView, { BASE_LAYER_DEFINITIONS } from '@/components/map-view';
import AttributesPanelComponent from '@/components/feature-attributes-panel'; 
import ToolsPanel from '@/components/panels/ToolsPanel';
import LegendPanel from '@/components/panels/LegendPanel';
import AIPanel from '@/components/panels/AIPanel';
import TrelloPanel from '@/components/panels/TrelloPanel';
import WfsLibraryPanel from '@/components/panels/WfsLibraryPanel';
import HelpPanel from '@/components/panels/HelpPanel';
import PrintComposerPanel from '@/components/panels/PrintComposerPanel';
import GeeProcessingPanel from '@/components/panels/GeeProcessingPanel';
import StatisticsPanel from '@/components/panels/StatisticsPanel';
import AnalysisPanel from '@/components/panels/AnalysisPanel';
import WfsLoadingIndicator from '@/components/feedback/WfsLoadingIndicator';
import LocationSearch from '@/components/location-search/LocationSearch';
import BaseLayerSelector from '@/components/layer-manager/BaseLayerSelector';
import BaseLayerControls from '@/components/layer-manager/BaseLayerControls';
import { StreetViewIcon } from '@/components/icons/StreetViewIcon';
import TrelloCardNotification from '@/components/trello-integration/TrelloCardNotification';
import { DphLogoIcon } from '@/components/icons/DphLogoIcon';
import Notepad from '@/components/notepad/Notepad';
import FirebaseErrorListener from '@/components/FirebaseErrorListener';


import { useOpenLayersMap } from '@/hooks/map-core/useOpenLayersMap';
import { useLayerManager } from '@/hooks/layer-manager/useLayerManager';
import { useFeatureInspection } from '@/hooks/feature-inspection/useFeatureInspection';
import { useDrawingInteractions } from '@/hooks/drawing-tools/useDrawingInteractions';
import { useMeasurement } from '@/hooks/map-tools/useMeasurement';
import { useMapNavigation } from '@/hooks/map-tools/useMapNavigation';
import { useOSMData } from '@/hooks/osm-integration/useOSMData';
import { useGeoServerLayers } from '@/hooks/geoserver-connection/useGeoServerLayers';
import { useFloatingPanels } from '@/hooks/panels/useFloatingPanels';
import { useMapCapture } from '@/hooks/map-tools/useMapCapture';
import { useWfsLibrary } from '@/hooks/wfs-library/useWfsLibrary';
import { useOsmQuery } from '@/hooks/osm-integration/useOsmQuery';
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';
import { saveMapState, debugReadDocument } from '@/services/sharing-service';

import type { MapState, OSMCategoryConfig, GeoServerDiscoveredLayer, BaseLayerOptionForSelect, MapLayer, ChatMessage, BaseLayerSettings, NominatimResult, PlainFeatureData, ActiveTool, TrelloCardInfo, GraduatedSymbology, VectorMapLayer, CategorizedSymbology, SerializableMapLayer, RemoteSerializableLayer } from '@/lib/types';
import { chatWithMapAssistant, type MapAssistantOutput } from '@/ai/flows/find-layer-flow';
import { authenticateWithGee } from '@/ai/flows/gee-flow';
import { checkTrelloCredentials } from '@/ai/flows/trello-actions';


const osmCategoryConfig: OSMCategoryConfig[] = [
  {
    id: 'watercourses', name: 'OSM Cursos de Agua',
    overpassQueryFragment: (bboxStr) => `nwr[waterway~"^(river|stream|canal)$"](${bboxStr});`,
    style: new Style({ stroke: new Stroke({ color: '#3a86ff', width: 2 }) }),
  },
  {
    id: 'water_bodies', name: 'OSM Cuerpos de Agua',
    overpassQueryFragment: (bboxStr) => `nwr[natural="water"](${bboxStr});nwr[landuse="reservoir"](${bboxStr});`,
    style: new Style({ fill: new Fill({ color: 'rgba(58,134,255,0.4)' }), stroke: new Stroke({ color: '#3a86ff', width: 1 }) }),
  },
  {
    id: 'roads_paths', name: 'OSM Rutas y Caminos',
    overpassQueryFragment: (bboxStr) => `nwr[highway](${bboxStr});`,
    style: new Style({ stroke: new Stroke({ color: '#adb5bd', width: 2 }) }),
  },
  {
    id: 'bridges', name: 'OSM Puentes',
    overpassQueryFragment: (bboxStr) => `nwr[man_made="bridge"](${bboxStr});`,
    style: new Style({ stroke: new Stroke({ color: '#6c757d', width: 4 }) }),
  },
  {
    id: 'admin_boundaries', name: 'OSM Límites Admin.',
    overpassQueryFragment: (bboxStr) => `nwr[boundary="administrative"](${bboxStr});`,
    style: new Style({ stroke: new Stroke({ color: '#ff006e', width: 2, lineDash: [4, 8] }) }),
  },
  {
    id: 'green_areas', name: 'OSM Áreas Verdes',
    overpassQueryFragment: (bboxStr) => `nwr[leisure~"^(park|garden)$"](${bboxStr});nwr[landuse~"^(forest|meadow|village_green)$"](${bboxStr});nwr[natural="wood"](${bboxStr});`,
    style: new Style({ fill: new Fill({ color: 'rgba(13,166,75,0.4)' }), stroke: new Stroke({ color: '#0da64b', width: 1 }) }),
  },
  {
    id: 'health_centers', name: 'OSM Centros de Salud',
    overpassQueryFragment: (bboxStr) => `nwr[healthcare](${bboxStr});`,
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#d90429'}), stroke: new Stroke({color: 'white', width: 1.5})})}),
  },
  {
    id: 'educational', name: 'OSM Educacionales',
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(school|university|college|kindergarten)$"](${bboxStr});`,
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#8338ec'}), stroke: new Stroke({color: 'white', width: 1.5})})}),
  },
  {
    id: 'social_institutions', name: 'OSM Instituciones Sociales',
    overpassQueryFragment: (bboxStr) => `nwr[amenity="community_centre"](${bboxStr});`,
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#ff6b6b'}), stroke: new Stroke({color: 'white', width: 1.5})})}),
  },
  {
    id: 'cultural_heritage', name: 'OSM Patrimonio Cultural',
    overpassQueryFragment: (bboxStr) => `nwr[historic](${bboxStr});nwr[heritage](${bboxStr});`,
    style: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({color: '#8d6e63'}), stroke: new Stroke({color: 'white', width: 1.5})})}),
  },
];


const osmCategoriesForSelection = osmCategoryConfig.map(({ id, name }) => ({ id, name }));
const availableBaseLayersForSelect: BaseLayerOptionForSelect[] = BASE_LAYER_DEFINITIONS.map(def => ({ id: def.id, name: def.name }));

const PANEL_WIDTH = 350;
const PANEL_PADDING = 8;

const panelToggleConfigs = [
  { id: 'wfsLibrary', IconComponent: Library, name: "Biblioteca de Servidores" },
  { id: 'tools', IconComponent: Wrench, name: "Herramientas" },
  { id: 'analysis', IconComponent: DraftingCompass, name: "Análisis Espacial" },
  { id: 'trello', IconComponent: ClipboardCheck, name: "Trello" },
  { id: 'attributes', IconComponent: ListChecks, name: "Atributos" },
  { id: 'printComposer', IconComponent: Printer, name: "Impresión" },
  { id: 'gee', IconComponent: BrainCircuit, name: "Procesamiento GEE" },
  { id: 'ai', IconComponent: Sparkles, name: "Asistente IA" },
  { id: 'help', IconComponent: LifeBuoy, name: "Ayuda" },
];


interface GeoMapperClientProps {
    initialMapState?: MapState;
}

export function GeoMapperClient({ initialMapState }: GeoMapperClientProps) {
  const firestore = useFirestore();
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const toolsPanelRef = useRef<HTMLDivElement>(null);
  const legendPanelRef = useRef<HTMLDivElement>(null);
  const attributesPanelRef = useRef<HTMLDivElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const trelloPanelRef = useRef<HTMLDivElement>(null);
  const wfsLibraryPanelRef = useRef<HTMLDivElement>(null);
  const helpPanelRef = useRef<HTMLDivElement>(null);
  const printComposerPanelRef = useRef<HTMLDivElement>(null);
  const geePanelRef = useRef<HTMLDivElement>(null);
  const statisticsPanelRef = useRef<HTMLDivElement>(null);
  const analysisPanelRef = useRef<HTMLDivElement>(null);
  const trelloPopupRef = useRef<Window | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [mapSubject, setMapSubject] = useState('');
  const [lastClickedTableFeatureIndex, setLastClickedTableFeatureIndex] = useState<number | null>(null);
  
  const layerManagerHookRef = useRef<ReturnType<typeof useLayerManager> | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const { mapRef, mapElementRef, setMapInstanceAndElement, isMapReady, drawingSourceRef } = useOpenLayersMap({
    // Pass initial view state if available from shared map
    initialCenter: initialMapState?.view.center,
    initialZoom: initialMapState?.view.zoom,
  });

  const { toast } = useToast();

  const [activeTool, setActiveTool] = useState<ActiveTool>({ type: null, id: null });
  const lastActiveToolRef = useRef<ActiveTool>({ type: 'interaction', id: 'inspect' });

  const { panels, handlePanelMouseDown, togglePanelCollapse, togglePanelMinimize } = useFloatingPanels({
    toolsPanelRef,
    legendPanelRef,
    attributesPanelRef,
    aiPanelRef,
    trelloPanelRef,
    wfsLibraryPanelRef,
    helpPanelRef,
    printComposerPanelRef,
    geePanelRef,
    statisticsPanelRef,
    analysisPanelRef,
    mapAreaRef,
    panelWidth: PANEL_WIDTH,
    panelPadding: PANEL_PADDING,
  });

  const [activeBaseLayerId, setActiveBaseLayerId] = useState<string>(initialMapState?.baseLayerId || BASE_LAYER_DEFINITIONS[1].id);
  const [baseLayerSettings, setBaseLayerSettings] = useState<BaseLayerSettings>({
    opacity: 1,
    brightness: 100,
    contrast: 100,
  });
  
  const handleBaseLayerSettingsChange = useCallback((newSettings: Partial<BaseLayerSettings>) => {
    setBaseLayerSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handleChangeBaseLayer = useCallback((newBaseLayerId: string) => {
    setActiveBaseLayerId(newBaseLayerId);
  }, []);
  
  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool(currentTool => {
      // If the new tool is not null, it becomes the last active tool
      if (tool.type !== null) {
        lastActiveToolRef.current = tool;
      }
      // If toggling the same tool off
      if (currentTool.type === tool.type && currentTool.id === tool.id) {
        return { type: null, id: null }; // Deactivate
      }
      return tool; // Activate new tool
    });
  }, []);
  

  const featureInspectionHook = useFeatureInspection({
    mapRef, 
    mapElementRef, 
    isMapReady,
    activeTool: activeTool.type === 'interaction' ? activeTool.id : null,
    setActiveTool: (id) => handleSetActiveTool({ type: 'interaction', id }),
    onNewSelection: () => {
      if (panels.attributes.isMinimized) {
        togglePanelMinimize('attributes');
      }
    }
  });

  const [discoveredGeoServerLayers, setDiscoveredGeoServerLayers] = useState<GeoServerDiscoveredLayer[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "¡Buenas! Soy Drax, tu asistente de mapas. Pedime que cargue una capa, que la saque o que le haga zoom." }
  ]);
  const [printLayoutImage, setPrintLayoutImage] = useState<string | null>(null);
  const [isGeeAuthenticated, setIsGeeAuthenticated] = useState(false);
  const [isGeeAuthenticating, setIsGeeAuthenticating] = useState(true); // Start as true
  const [isCapturing, setIsCapturing] = useState(false);
  const [trelloCardNotification, setTrelloCardInfo] = useState<TrelloCardInfo | null>(null);
  const [statisticsLayer, setStatisticsLayer] = useState<VectorMapLayer | null>(null);
  const [tableSortConfig, setTableSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);


  const sortedInspectedFeatureData = useMemo(() => {
    const featureData = featureInspectionHook.inspectedFeatureData || [];
    let sortableItems = [...featureData];
    if (tableSortConfig !== null) {
      sortableItems.sort((a, b) => {
        const valA = a.attributes[tableSortConfig.key];
        const valB = b.attributes[tableSortConfig.key];
        
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          comparison = String(valA).localeCompare(String(valB));
        }
        
        return tableSortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return sortableItems;
  }, [featureInspectionHook.inspectedFeatureData, tableSortConfig]);


  const updateDiscoveredLayerState = useCallback((layerName: string, added: boolean, type: 'wms' | 'wfs') => {
    setDiscoveredGeoServerLayers(prev => prev.map(l => {
      if (l.name === layerName) {
        if (type === 'wms') return { ...l, wmsAddedToMap: added };
        if (type === 'wfs') return { ...l, wfsAddedToMap: added };
      }
      return l;
    }));
  }, []);

  const layerManagerHook = useLayerManager({
    mapRef,
    isMapReady,
    drawingSourceRef,
    onShowTableRequest: (data, name, id) => {
        featureInspectionHook.processAndDisplayFeatures(data, name, id);
        setTableSortConfig(null); // Reset sort when new data arrives
    },
    updateGeoServerDiscoveredLayerState: updateDiscoveredLayerState,
    clearSelectionAfterExtraction: featureInspectionHook.clearSelection,
    updateInspectedFeatureData: featureInspectionHook.updateInspectedFeatureData,
  });
  
  layerManagerHookRef.current = layerManagerHook;
  
  const {
    handleFetchGeoServerLayers,
    isFetching: isFetchingDeasLayers,
  } = useGeoServerLayers({
      onLayerStateUpdate: updateDiscoveredLayerState,
  });
  
  const wfsLibraryHook = useWfsLibrary({
    onAddLayer: layerManagerHook.handleAddHybridLayer,
  });

  const handleOsmQueryResults = (plainData: PlainFeatureData[], layerName: string) => {
    if (plainData && plainData.length > 0) {
      featureInspectionHook.processAndDisplayFeatures(plainData, layerName);
      if (panels.attributes.isMinimized) {
        togglePanelMinimize('attributes');
      }
    }
  };
  
  const osmQueryHook = useOsmQuery({
    mapRef,
    mapElementRef,
    isMapReady,
    onResults: handleOsmQueryResults,
  });

  const initialGeoServerUrl = 'https://www.minfra.gba.gob.ar/ambientales/geoserver';

  // Effect for initial authentications and data loading (if NOT in shared mode)
  useEffect(() => {
    if (initialMapState) return; // Don't run auth checks in shared map view
    if (!isMapReady || !firestore) return;

    // GEE Auth
    setIsGeeAuthenticating(true);
    authenticateWithGee().then(result => {
        if (result.success) {
            toast({ title: "GEE Conectado", description: result.message });
            setIsGeeAuthenticated(true);
        } else {
            throw new Error(result.message);
        }
    }).catch(error => {
        console.error("Error de autenticación automática con GEE:", error);
        toast({ title: "Error de Autenticación GEE", description: error.message, variant: "destructive" });
        setIsGeeAuthenticated(false);
    }).finally(() => {
        setIsGeeAuthenticating(false);
    });

    // Trello Auth Check
    checkTrelloCredentials().then(result => {
        if (result.configured) {
            if (result.success) {
                toast({ title: "Trello Conectado", description: result.message });
            } else {
                toast({ title: "Error de Conexión con Trello", description: result.message, variant: "destructive" });
            }
        }
    }).catch(error => {
        console.error("Error de verificación automática de Trello:", error);
        toast({ title: "Error de Conexión con Trello", description: error.message, variant: "destructive" });
    });
    
    // GeoServer DEAS Layers
    handleFetchGeoServerLayers(initialGeoServerUrl).then(discovered => {
        if (discovered) {
            setDiscoveredGeoServerLayers(discovered);
        }
    }).catch(error => {
        console.error("Fallo al cargar las capas iniciales de DEAS:", error);
    });
    
    debugReadDocument(firestore);


  }, [isMapReady, firestore, toast, handleFetchGeoServerLayers, initialMapState]);
  
  const handleReloadDeasLayers = useCallback(async () => {
    toast({ description: "Recargando capas desde el servidor de DEAS..." });
    try {
        const discovered = await handleFetchGeoServerLayers(initialGeoServerUrl);
        if (discovered) {
            setDiscoveredGeoServerLayers(discovered);
        }
    } catch (error: any) {
        console.error("Fallo al recargar las capas de DEAS:", error);
    }
  }, [handleFetchGeoServerLayers, toast]);

  const osmDataHook = useOSMData({ 
    mapRef, 
    drawingSourceRef, 
    addLayer: layerManagerHook.addLayer, 
    osmCategoryConfigs: osmCategoryConfig,
    onExportLayers: layerManagerHook.handleExportLayer as any,
  });
  
  const drawingInteractions = useDrawingInteractions({
    mapRef, isMapReady, drawingSourceRef: drawingSourceRef,
    activeTool: activeTool.type === 'draw' ? activeTool.id : null,
    setActiveTool: (id) => handleSetActiveTool({ type: 'draw', id }),
    addLayer: layerManagerHook.addLayer,
  });

  const measurementHook = useMeasurement({ 
    mapRef, isMapReady,
    activeTool: activeTool.type === 'measure' ? activeTool.id : null,
    setActiveTool: (id) => handleSetActiveTool({ type: 'measure', id }),
  });

  const mapNavigationHook = useMapNavigation({
    mapRef,
    mapElementRef,
    isMapReady,
    activeTool: activeTool.type === 'mapAction' ? activeTool.id : null,
    setActiveTool: (id) => handleSetActiveTool({ type: 'mapAction', id }),
  });

  const { captureMapAsDataUrl } = useMapCapture({ mapRef, activeBaseLayerId });

  const handleTogglePrintComposer = async () => {
    if (panels.printComposer.isMinimized) {
        const imageUrl = await captureMapAsDataUrl();
        if (imageUrl) {
            setPrintLayoutImage(imageUrl);
            togglePanelMinimize('printComposer');
        } else {
            toast({
                title: "Error de Captura",
                description: "No se pudo generar la imagen del mapa para la impresión.",
                variant: "destructive",
            });
        }
    } else {
        togglePanelMinimize('printComposer');
    }
  };


  const zoomToBoundingBox = useCallback((bbox: [number, number, number, number], onZoomComplete?: (completed: boolean) => void) => {
    if (!mapRef.current) {
        onZoomComplete?.(false);
        return;
    }
    const extent4326: Extent = [bbox[0], bbox[1], bbox[2], bbox[3]];
    try {
        const extent3857 = transformExtent(extent4326, 'EPSG:4326', 'EPSG:3857');

        if (extent3857 && extent3857.every(isFinite) && (extent3857[2] - extent3857[0] > 0.000001) && (extent3857[3] - extent3857[1] > 0.000001)) {
            mapRef.current.getView().fit(extent3857, {
                padding: [50, 50, 50, 50],
                duration: 1000,
                maxZoom: 17,
                callback: onZoomComplete,
            });
            setTimeout(() => {
              toast({ description: "Ubicación encontrada y centrada en el mapa." });
            }, 0);
        } else {
            setTimeout(() => {
              toast({ description: "No se pudo determinar una extensión válida para la ubicación." });
            }, 0);
            onZoomComplete?.(false);
        }
    } catch (error) {
        console.error("Error transforming extent or fitting view:", error);
        setTimeout(() => {
          toast({ description: "Error al procesar la ubicación seleccionada." });
        }, 0);
        onZoomComplete?.(false);
    }
  }, [mapRef, toast]);
  
  const handleLocationSelection = useCallback((location: NominatimResult) => {
      const [sLat, nLat, wLon, eLon] = location.boundingbox.map(coord => parseFloat(coord));
      zoomToBoundingBox([wLon, sLat, eLon, nLat]);
  }, [zoomToBoundingBox]);

  const handleAiAction = useCallback((action: MapAssistantOutput) => {
    if (action.response) {
      if (/(carg|busc|añad|mostr|quit|elimin|zoom|estilo|tabla|mapa|base|sentinel|landsat|trello)/i.test(action.response) && 
            ![action.layersToAdd, action.layersToAddAsWFS, action.layersToRemove, action.layersToStyle, action.zoomToLayer, action.showTableForLayer, action.setBaseLayer, action.zoomToBoundingBox, action.findSentinel2Footprints, action.findLandsatFootprints, action.fetchOsmForView, action.urlToOpen].some(field => field && (Array.isArray(field) ? field.length > 0 : true))) {
          toast({
              title: "Drax no identificó una acción",
              description: "No se encontró una capa o acción que coincida con tu pedido. Intenta ser más específico.",
              variant: "destructive",
              duration: 6000,
          });
      }
    }

    const layersToAdd = (action.layersToAdd || []).concat(action.layersToAddAsWFS || []);
    if (layersToAdd.length > 0) {
        layersToAdd.forEach(layerNameToAdd => {
            const layerData = discoveredGeoServerLayers.find(l => l.name === layerNameToAdd);
            if (layerData) {
                layerManagerHook.handleAddHybridLayer(layerData.name, layerData.title, initialGeoServerUrl, layerData.bbox, layerData.styleName);
            } else {
                toast({
                    title: "Capa no encontrada",
                    description: `Drax intentó añadir una capa que no existe: "${layerNameToAdd}"`,
                    variant: 'destructive'
                });
            }
        });
    }

    if (action.layersToRemove && action.layersToRemove.length > 0) {
        action.layersToRemove.forEach(layerNameToRemove => {
            const layerToRemove = layerManagerHook.layers.find(l => {
                const machineName = l.olLayer.get('gsLayerName') || l.name;
                return machineName === layerNameToRemove;
            });
            if (layerToRemove) {
                layerManagerHook.removeLayer(layerToRemove.id);
            } else {
                toast({description: `Drax intentó eliminar una capa no encontrada: ${layerNameToRemove}`});
            }
        });
    }

    if (action.zoomToLayer) {
      const layerToZoom = layerManagerHook.layers.find(l => {
          const machineName = l.olLayer.get('gsLayerName') || l.name;
          return machineName === action.zoomToLayer;
      });
       if (layerToZoom) {
        layerManagerHook.zoomToLayerExtent(layerToZoom.id);
      } else {
        toast({description: `Drax intentó hacer zoom a una capa no encontrada: ${action.zoomToLayer}`});
      }
    }

    if (action.layersToStyle && action.layersToStyle.length > 0) {
        action.layersToStyle.forEach(styleRequest => {
            const layerToStyle = layerManagerHook.layers.find(l => {
                const machineName = l.olLayer.get('gsLayerName') || l.name;
                return machineName === styleRequest.layerName;
            });
            if (layerToStyle) {
                layerManagerHook.changeLayerStyle(layerToStyle.id, {
                    strokeColor: styleRequest.strokeColor,
                    fillColor: styleRequest.fillColor,
                    lineStyle: styleRequest.lineStyle,
                    lineWidth: styleRequest.lineWidth,
                    pointSize: 5, // Default point size
                });
            } else {
                toast({description: `Drax intentó aplicar un estilo a una capa no encontrada: ${styleRequest.layerName}`});
            }
        });
    }

    if (action.showTableForLayer) {
        const layerToShowTable = layerManagerHook.layers.find(l => {
            const machineName = l.olLayer.get('gsLayerName') || l.name;
            return machineName === action.showTableForLayer;
        });
        if (layerToShowTable) {
            layerManagerHook.handleShowLayerTable(layerToShowTable.id);
            if (panels.attributes.isMinimized) {
              togglePanelMinimize('attributes');
            }
        } else {
            toast({description: `Drax intentó mostrar la tabla de una capa no encontrada: ${action.showTableForLayer}`});
        }
    }
    
    if (action.setBaseLayer) {
      handleChangeBaseLayer(action.setBaseLayer);
    }

    const shouldZoom = action.zoomToBoundingBox && action.zoomToBoundingBox.length === 4;
    const shouldFindSentinelFootprints = !!action.findSentinel2Footprints;
    const shouldFindLandsatFootprints = !!action.findLandsatFootprints;
    const shouldFetchOsm = action.fetchOsmForView && action.fetchOsmForView.length > 0;

    const performSearchAfterZoom = () => {
      if (action.findSentinel2Footprints) {
        layerManagerHook.findSentinel2FootprintsInCurrentView(action.findSentinel2Footprints);
      }
      if (action.findLandsatFootprints) {
        layerManagerHook.findLandsatFootprintsInCurrentView(action.findLandsatFootprints);
      }
      if (action.fetchOsmForView) {
        osmDataHook.fetchOSMData();
      }
    };
    
    if (shouldZoom) {
      const [sLat, nLat, wLon, eLon] = action.zoomToBoundingBox!;
      if ([sLat, nLat, wLon, eLon].every(c => !isNaN(c))) {
        const afterZoomAction = (shouldFindSentinelFootprints || shouldFindLandsatFootprints || shouldFetchOsm)
            ? (completed: boolean) => {
                if (completed) {
                    performSearchAfterZoom();
                } else {
                    toast({ description: "El zoom fue cancelado, no se realizarán búsquedas adicionales." });
                }
              }
            : undefined;

        zoomToBoundingBox([wLon, sLat, eLon, nLat], afterZoomAction);
      } else {
        toast({description: `Drax devolvió una ubicación inválida.`});
      }
    } else {
        if (shouldFindSentinelFootprints || shouldFindLandsatFootprints || shouldFetchOsm) {
            performSearchAfterZoom(); // handles non-zoom searches
        }
    }
    
    if (action.urlToOpen) {
      window.open(action.urlToOpen, '_blank', 'noopener,noreferrer');
      toast({ description: `Abriendo Trello en una nueva pestaña...` });
    }

  }, [discoveredGeoServerLayers, layerManagerHook, toast, zoomToBoundingBox, handleChangeBaseLayer, osmDataHook, initialGeoServerUrl, panels, togglePanelMinimize]);

  const handleDeasAddLayer = useCallback((layer: GeoServerDiscoveredLayer) => {
    layerManagerHook.handleAddHybridLayer(layer.name, layer.title, initialGeoServerUrl, layer.bbox, layer.styleName);
  }, [layerManagerHook, initialGeoServerUrl]);

  const handleAttributeTableFeatureSelect = useCallback((featureId: string, isCtrlOrMeta: boolean, isShift: boolean) => {
      const currentSelectedIds = featureInspectionHook.selectedFeatures.map(f => f.getId() as string);
      
      const allFeatureIds = sortedInspectedFeatureData.map(f => f.id) || []; // Use the sorted data
      const clickedIndex = allFeatureIds.indexOf(featureId);
  
      let newSelectedIds: string[];
  
      if (isShift && lastClickedTableFeatureIndex !== null && clickedIndex !== -1) {
          const start = Math.min(lastClickedTableFeatureIndex, clickedIndex);
          const end = Math.max(lastClickedTableFeatureIndex, clickedIndex);
          const rangeIds = allFeatureIds.slice(start, end + 1);
          // Combine with current selection without duplicates
          newSelectedIds = Array.from(new Set([...currentSelectedIds, ...rangeIds]));
      } else if (isCtrlOrMeta) {
          newSelectedIds = currentSelectedIds.includes(featureId)
              ? currentSelectedIds.filter(id => id !== featureId)
              : [...currentSelectedIds, featureId];
      } else {
          newSelectedIds = [featureId];
      }
  
      featureInspectionHook.selectFeaturesById(newSelectedIds);
      // Update the last clicked index for the next shift-click
      if (clickedIndex !== -1) {
        setLastClickedTableFeatureIndex(clickedIndex);
      }

  }, [featureInspectionHook, lastClickedTableFeatureIndex, sortedInspectedFeatureData]);

  const handleOpenStreetView = useCallback(() => {
    if (!mapRef.current) {
        toast({ description: "El mapa no está listo." });
        return;
    }
    const view = mapRef.current.getView();
    const center = view.getCenter();
    if (!center) {
        toast({ description: "No se pudo obtener el centro del mapa." });
        return;
    }
    try {
        const [lon, lat] = transform(center, view.getProjection(), 'EPSG:4326');
        const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
        const windowFeatures = "popup=true,width=800,height=600,scrollbars=yes,resizable=yes";
        window.open(url, '_blank', windowFeatures);
    } catch (error) {
        console.error("Error transforming coordinates for Street View:", error);
        toast({ description: "Error al obtener las coordenadas para Street View.", variant: "destructive" });
    }
  }, [mapRef, toast]);
  
  const handleCaptureAndDownload = useCallback(() => {
    if (!mapRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    toast({ description: 'Generando captura de mapa...' });

    const map = mapRef.current;

    map.once('rendercomplete', () => {
      try {
        const mapCanvas = document.createElement('canvas');
        const size = map.getSize();
        if (!size) {
          throw new Error("Map size is not available.");
        }
        mapCanvas.width = size[0];
        mapCanvas.height = size[1];
        const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });
        if (!mapContext) {
          throw new Error("Could not get canvas context.");
        }

        const canvases = map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer');
        Array.from(canvases).forEach(canvas => {
          if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
            const opacity = parseFloat(canvas.style.opacity) || 1.0;
            const filter = (canvas.style as any).filter || 'none';
            mapContext.globalAlpha = opacity;
            mapContext.filter = filter;
            mapContext.drawImage(canvas, 0, 0, canvas.width, canvas.height);
          }
        });

        const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.95);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `map_capture_${activeBaseLayerId}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({ description: 'Captura completada.' });
      } catch (e) {
        console.error('Error capturing map:', e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        toast({
          description: `Error al generar la captura: ${errorMessage}`,
          variant: 'destructive',
        });
      } finally {
        setIsCapturing(false);
      }
    });

    map.renderSync();
  }, [mapRef, isCapturing, toast, activeBaseLayerId]);
  
  const handleShareMap = useCallback(async () => {
    if (!mapRef.current || !layerManagerHookRef.current || !firestore) {
      toast({ description: 'El mapa o los servicios no están listos para compartir.', variant: 'destructive' });
      return;
    }
    
    if (!mapSubject.trim()) {
        toast({ description: 'Por favor, ingrese un asunto para el mapa.', variant: 'destructive' });
        return;
    }

    const { layers } = layerManagerHookRef.current;
    const map = mapRef.current;
    const view = map.getView();
    
    const center = transform(view.getCenter() || [0,0], 'EPSG:3857', 'EPSG:4326');
    const zoom = view.getZoom() || 1;

    const serializableLayers: SerializableMapLayer[] = layers
      .map((layer: MapLayer): SerializableMapLayer | null => {
        if (layer.type === 'wms' || layer.type === 'wfs' || layer.type === 'gee') {
            const remoteLayer: RemoteSerializableLayer = {
                type: layer.type as 'wms' | 'wfs' | 'gee',
                name: layer.name,
                url: layer.olLayer.get('serverUrl') || null,
                layerName: layer.olLayer.get('gsLayerName') || null,
                opacity: layer.opacity,
                visible: layer.visible,
                wmsStyleEnabled: layer.wmsStyleEnabled ?? false,
                styleName: layer.olLayer.get('styleName') || null,
                geeParams: layer.olLayer.get('geeParams') || null,
            };
            return remoteLayer;
        } else if (['vector', 'osm', 'drawing', 'sentinel', 'landsat', 'analysis', 'geotiff'].includes(layer.type)) {
            // These layers are local and won't be serialized. We return a placeholder.
            return {
                type: 'local-placeholder',
                name: layer.name,
            };
        }
        return null;
      })
      .filter((l): l is SerializableMapLayer => l !== null);

    const mapState: MapState = {
      subject: mapSubject,
      layers: serializableLayers,
      view: { center, zoom },
      baseLayerId: activeBaseLayerId,
    };

    try {
        toast({ description: 'Guardando el estado del mapa...' });
        const mapId = await saveMapState(firestore, mapState);
        const shareUrl = `${window.location.origin}/share/${mapId}`;
        
        await navigator.clipboard.writeText(shareUrl);
        toast({
            title: "¡Enlace copiado!",
            description: "El enlace para compartir el mapa se ha copiado en tu portapapeles.",
        });
        setIsShareDialogOpen(false); // Close dialog on success
        setMapSubject(''); // Reset subject
    } catch (error) {
        console.error("Failed to share map:", error);
        // Error toast is handled inside saveMapState now via the error emitter
    }
  }, [mapRef, activeBaseLayerId, firestore, toast, mapSubject]);

  // Effect for right-click tool toggling
  useEffect(() => {
    const mapEl = mapElementRef.current;
    if (!mapEl) return;

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        handleSetActiveTool(activeTool.type === null ? lastActiveToolRef.current : { type: null, id: null });
    };

    mapEl.addEventListener('contextmenu', handleContextMenu);

    return () => {
        if (mapEl) {
            mapEl.removeEventListener('contextmenu', handleContextMenu);
        }
    };
  }, [activeTool, handleSetActiveTool, mapElementRef]);

  const handleSetTrelloCard = (card: TrelloCardInfo) => {
    if (trelloPopupRef.current && !trelloPopupRef.current.closed) {
      trelloPopupRef.current.close();
    }
    setTrelloCardInfo(card);
  };

  const handleTrelloNotificationOpen = (popup: Window | null) => {
    trelloPopupRef.current = popup;
  };
  
  const handleTrelloNotificationClose = () => {
    if (trelloPopupRef.current && !trelloPopupRef.current.closed) {
      trelloPopupRef.current.close();
    }
    setTrelloCardInfo(null);
    trelloPopupRef.current = null;
  };

  const handleShowStatistics = useCallback((layerId: string) => {
      const layer = layerManagerHook.layers.find(l => l.id === layerId) as VectorMapLayer | undefined;
      if (layer) {
          setStatisticsLayer(layer);
          togglePanelMinimize('statistics');
      } else {
          toast({ description: "No se encontró la capa para calcular estadísticas.", variant: "destructive" });
      }
  }, [layerManagerHook.layers, togglePanelMinimize, toast]);

  // Effect for loading the shared map state
  useEffect(() => {
    if (!initialMapState || !isMapReady || !mapRef.current || !layerManagerHookRef.current) return;
  
    const loadSharedMap = async () => {
        toast({ description: `Cargando mapa: ${initialMapState.subject}`});
        const { handleAddHybridLayer, addGeeLayerToMap } = layerManagerHookRef.current!;
        const map = mapRef.current!;
    
        // 1. Apply View - THIS IS HANDLED BY THE useOpenLayersMap HOOK NOW
        
        // 2. Load Layers
        for (const layerState of initialMapState.layers) {
            try {
                if (layerState.type === 'wfs' && layerState.url && layerState.layerName) {
                    await handleAddHybridLayer(
                        layerState.layerName,
                        layerState.name,
                        layerState.url,
                        undefined,
                        layerState.styleName || undefined,
                        layerState.visible,
                        layerState.opacity,
                        layerState.wmsStyleEnabled
                    );
                } else if (layerState.type === 'gee' && layerState.geeParams?.tileUrl) {
                     addGeeLayerToMap(layerState.geeParams.tileUrl!, layerState.name, {
                        bandCombination: layerState.geeParams.bandCombination as any,
                        // Pass other GEE params if they exist
                    });
                } else if (layerState.type === 'local-placeholder') {
                    console.log(`Skipping local layer: ${layerState.name}`);
                }
            } catch (e) {
                console.error("Error loading shared layer", layerState, e);
            }
        }
    };
  
    loadSharedMap();
  
  }, [initialMapState, isMapReady, mapRef, toast]);


  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <FirebaseErrorListener />
      {/* Hide controls if it's a shared map view */}
      {!initialMapState && (
      <div className="bg-gray-700/90 backdrop-blur-sm shadow-md p-2 z-20 flex items-center gap-2">
        <DphLogoIcon className="h-8 w-8 flex-shrink-0" />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={"outline"}
                size="icon"
                className={`h-8 w-8 focus-visible:ring-primary flex-shrink-0 ${
                  !panels.legend.isMinimized
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary/80'
                    : 'bg-gray-700/80 text-white hover:bg-gray-600/90 border-gray-600/70'
                }`}
                onClick={() => togglePanelMinimize('legend')}
                aria-label={"Capas"}
              >
                <ListTree className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
              <p className="text-xs">{"Capas"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Search and Layer Selector Container */}
        <div className="flex-grow flex items-center gap-2 min-w-0">
            <LocationSearch onLocationSelect={handleLocationSelection} className="flex-shrink min-w-[150px] w-full max-w-sm" />
            <div className="flex-shrink-0 w-full max-w-[220px]">
                <BaseLayerSelector
                    availableBaseLayers={availableBaseLayersForSelect}
                    activeBaseLayerId={activeBaseLayerId}
                    onChangeBaseLayer={handleChangeBaseLayer}
                />
            </div>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90"
                        title="Ajustes de la capa base"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="bg-gray-700/90 text-white border-gray-600 backdrop-blur-sm"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <BaseLayerControls settings={baseLayerSettings} onChange={handleBaseLayerSettingsChange} />
                </DropdownMenuContent>
            </DropdownMenu>

            <Button
                onClick={handleOpenStreetView}
                variant="outline"
                size="icon"
                className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90"
                title="Abrir Google Street View en la ubicación actual"
            >
                <StreetViewIcon className="h-5 w-5" />
            </Button>
             <Button
                onClick={mapNavigationHook.toggleZoomToArea}
                variant="outline"
                size="icon"
                className={cn("h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90", mapNavigationHook.activeTool === 'zoomToArea' && 'bg-primary hover:bg-primary/90')}
                title="Zoom a Área"
            >
                <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
                onClick={handleCaptureAndDownload}
                variant="outline"
                size="icon"
                className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90"
                title="Capturar imagen UHD del mapa base"
                disabled={isCapturing}
            >
              {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
             <AlertDialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                onClick={() => setIsShareDialogOpen(true)}
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90"
                                title="Compartir mapa"
                            >
                                <Share2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                           <p className="text-xs">Compartir Mapa</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Compartir Mapa</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ingrese un asunto o título para identificar este mapa compartido.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="map-subject" className="text-left">Asunto</Label>
                        <Input
                            id="map-subject"
                            value={mapSubject}
                            onChange={(e) => setMapSubject(e.target.value)}
                            placeholder="Ej: Análisis de cuencas en Buenos Aires"
                            autoFocus
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setMapSubject('')}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleShareMap} disabled={!mapSubject.trim()}>
                            Guardar y Copiar Enlace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>


         {/* The rest of the panel buttons */}
        <div className="flex flex-row space-x-1 ml-auto flex-shrink-0">
          <TooltipProvider delayDuration={200}>
            {panelToggleConfigs.map((panelConfig) => {
              const panelState = panels[panelConfig.id as keyof typeof panels];
              if (!panelState) return null;

              const isPanelOpen = !panelState.isMinimized;
              const tooltipText = panelConfig.name;
              
              return (
                <Tooltip key={panelConfig.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={"outline"}
                      size="icon"
                      className={`h-8 w-8 focus-visible:ring-primary ${
                        isPanelOpen
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary/80'
                          : 'bg-gray-700/80 text-white hover:bg-gray-600/90 border-gray-600/70'
                      }`}
                      onClick={() => {
                        if (panelConfig.id === 'printComposer') {
                          handleTogglePrintComposer();
                        } else {
                          togglePanelMinimize(panelConfig.id as any);
                        }
                      }}
                      aria-label={tooltipText}
                    >
                      <panelConfig.IconComponent className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                    <p className="text-xs">{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
      )}

      <div ref={mapAreaRef} className="relative flex-1 overflow-visible">
        <MapView
          setMapInstanceAndElement={setMapInstanceAndElement}
          activeBaseLayerId={activeBaseLayerId}
          baseLayerSettings={baseLayerSettings}
        />
        
        {trelloCardNotification && (
            <TrelloCardNotification
                cardName={trelloCardNotification.name}
                cardUrl={trelloCardNotification.url}
                onOpen={handleTrelloNotificationOpen}
                onClose={handleTrelloNotificationClose}
            />
        )}


        {/* Center Crosshair */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none z-10">
            <div className="absolute top-1/2 left-0 w-full h-px bg-gray-400/70 -translate-y-1/2"></div>
            <div className="absolute left-1/2 top-0 h-full w-px bg-gray-400/70 -translate-x-1/2"></div>
        </div>

        <WfsLoadingIndicator isVisible={layerManagerHook.isWfsLoading || wfsLibraryHook.isLoading} />
        
        {!initialMapState && <Notepad />}

        {isMounted && !initialMapState && panels.tools && !panels.tools.isMinimized && (
          <ToolsPanel
            panelRef={toolsPanelRef}
            isCollapsed={panels.tools.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('tools')}
            onClosePanel={() => togglePanelMinimize('tools')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'tools')}
            activeDrawTool={drawingInteractions.activeTool}
            onToggleDrawingTool={drawingInteractions.toggleTool}
            onClearDrawnFeatures={drawingInteractions.clearDrawnFeatures}
            onConvertDrawingsToLayer={drawingInteractions.convertDrawingsToLayer}
            measurementHook={measurementHook}
            isFetchingOSM={osmDataHook.isFetchingOSM}
            onFetchOSMDataTrigger={osmDataHook.fetchOSMData}
            onFetchCustomOSMData={osmDataHook.fetchCustomOSMData}
            osmCategoriesForSelection={osmCategoriesForSelection}
            selectedOSMCategoryIds={osmDataHook.selectedOSMCategoryIds}
            onSelectedOSMCategoriesChange={osmDataHook.setSelectedOSMCategoryIds}
            isDownloading={osmDataHook.isDownloading}
            onDownloadOSMLayers={osmDataHook.handleDownloadOSMLayers}
            osmQueryHook={osmQueryHook}
            style={{ top: `${panels.tools.position.y}px`, left: `${panels.tools.position.x}px`, zIndex: panels.tools.zIndex }}
          />
        )}

        {isMounted && panels.legend && !panels.legend.isMinimized && (
          <LegendPanel
            panelRef={legendPanelRef}
            isCollapsed={panels.legend.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('legend')}
            onClosePanel={() => togglePanelMinimize('legend')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'legend')}
            layers={layerManagerHook.layers}
            onToggleLayerVisibility={layerManagerHook.toggleLayerVisibility}
            onRemoveLayer={layerManagerHook.removeLayer}
            onRemoveLayers={layerManagerHook.removeLayers}
            onZoomToLayerExtent={layerManagerHook.zoomToLayerExtent}
            onShowLayerTable={(layerId) => {
              layerManagerHook.handleShowLayerTable(layerId);
              if (panels.attributes.isMinimized) {
                  togglePanelMinimize('attributes');
              }
            }}
            onShowStatistics={handleShowStatistics}
            onExtractByPolygon={layerManagerHook.handleExtractByPolygon}
            onExtractBySelection={() => layerManagerHook.handleExtractBySelection(featureInspectionHook.selectedFeatures)}
            onSelectByLayer={featureInspectionHook.selectByLayer}
            onExportLayer={layerManagerHook.handleExportLayer}
            onRenameLayer={layerManagerHook.renameLayer}
            onChangeLayerStyle={layerManagerHook.changeLayerStyle}
            onChangeLayerLabels={layerManagerHook.changeLayerLabels}
            onApplyGraduatedSymbology={layerManagerHook.applyGraduatedSymbology}
            onApplyCategorizedSymbology={layerManagerHook.applyCategorizedSymbology}
            onApplyGeoTiffStyle={layerManagerHook.applyGeoTiffStyle}
            onToggleWmsStyle={layerManagerHook.toggleWmsStyle}
            isDrawingSourceEmptyOrNotPolygon={layerManagerHook.isDrawingSourceEmptyOrNotPolygon}
            isSelectionEmpty={featureInspectionHook.selectedFeatures.length === 0}
            onSetLayerOpacity={layerManagerHook.setLayerOpacity}
            onReorderLayers={layerManagerHook.reorderLayers}
            onAddLayer={layerManagerHook.addLayer as (layer: MapLayer) => void}
            activeTool={featureInspectionHook.activeTool}
            onSetActiveTool={featureInspectionHook.setActiveTool}
            onClearSelection={featureInspectionHook.clearSelection}
            style={{ top: `${panels.legend.position.y}px`, left: `${panels.legend.position.x}px`, zIndex: panels.legend.zIndex }}
            discoveredDeasLayers={discoveredGeoServerLayers}
            onAddDeasLayer={handleDeasAddLayer}
            isFetchingDeasLayers={isFetchingDeasLayers}
            onReloadDeasLayers={handleReloadDeasLayers}
            canUndoRemove={layerManagerHook.lastRemovedLayers.length > 0}
            onUndoRemove={layerManagerHook.undoRemove}
            selectedFeaturesForSelection={featureInspectionHook.selectedFeatures}
            isSharedView={!!initialMapState}
          />
        )}

        {isMounted && !initialMapState && panels.attributes && !panels.attributes.isMinimized && (
          <AttributesPanelComponent
            panelRef={attributesPanelRef}
            isCollapsed={panels.attributes.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('attributes')}
            onClosePanel={() => {
              togglePanelMinimize('attributes'); 
              featureInspectionHook.clearSelection(); 
            }}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'attributes')}
            plainFeatureData={sortedInspectedFeatureData}
            layerId={featureInspectionHook.currentInspectedLayerId}
            layerName={featureInspectionHook.currentInspectedLayerName}
            style={{ top: `${panels.attributes.position.y}px`, left: `${panels.attributes.position.x}px`, zIndex: panels.attributes.zIndex }}
            selectedFeatureIds={featureInspectionHook.selectedFeatures.map(f => f.getId() as string)}
            onFeatureSelect={handleAttributeTableFeatureSelect}
            onAttributeChange={layerManagerHook.updateFeatureAttribute}
            onAddField={layerManagerHook.addFieldToLayer}
            sortConfig={tableSortConfig}
            onSortChange={setTableSortConfig}
          />
        )}
        
        {isMounted && !initialMapState && panels.printComposer && !panels.printComposer.isMinimized && printLayoutImage && (
            <PrintComposerPanel
                mapImage={printLayoutImage}
                panelRef={printComposerPanelRef}
                isCollapsed={panels.printComposer.isCollapsed}
                onToggleCollapse={() => togglePanelCollapse('printComposer')}
                onClosePanel={() => togglePanelMinimize('printComposer')}
                onMouseDownHeader={(e) => handlePanelMouseDown(e, 'printComposer')}
                style={{ top: `${panels.printComposer.position.y}px`, left: `${panels.printComposer.position.x}px`, zIndex: panels.printComposer.zIndex }}
            />
        )}

        {isMounted && !initialMapState && panels.gee && !panels.gee.isMinimized && (
          <GeeProcessingPanel
            panelRef={geePanelRef}
            isCollapsed={panels.gee.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('gee')}
            onClosePanel={() => togglePanelMinimize('gee')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'gee')}
            onAddGeeLayer={layerManagerHook.addGeeLayerToMap}
            mapRef={mapRef}
            isAuthenticating={isGeeAuthenticating}
            isAuthenticated={isGeeAuthenticated}
            style={{ top: `${panels.gee.position.y}px`, left: `${panels.gee.position.x}px`, zIndex: panels.gee.zIndex }}
          />
        )}

        {isMounted && !initialMapState && panels.statistics && !panels.statistics.isMinimized && statisticsLayer && (
            <StatisticsPanel
                layer={statisticsLayer}
                allLayers={layerManagerHook.layers}
                selectedFeatures={featureInspectionHook.selectedFeatures}
                panelRef={statisticsPanelRef}
                isCollapsed={panels.statistics.isCollapsed}
                onToggleCollapse={() => togglePanelCollapse('statistics')}
                onClosePanel={() => {
                    togglePanelMinimize('statistics');
                    setStatisticsLayer(null);
                }}
                onMouseDownHeader={(e) => handlePanelMouseDown(e, 'statistics')}
                style={{ top: `${panels.statistics.position.y}px`, left: `${panels.statistics.position.x}px`, zIndex: panels.statistics.zIndex }}
                mapRef={mapRef}
            />
        )}

        {isMounted && !initialMapState && panels.analysis && !panels.analysis.isMinimized && (
          <AnalysisPanel
            panelRef={analysisPanelRef}
            isCollapsed={panels.analysis.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('analysis')}
            onClosePanel={() => togglePanelMinimize('analysis')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'analysis')}
            allLayers={layerManagerHook.layers}
            selectedFeatures={featureInspectionHook.selectedFeatures}
            onAddLayer={(layer: MapLayer, bringToTop?: boolean) => layerManagerHook.addLayer(layer, bringToTop)}
            style={{ top: `${panels.analysis.position.y}px`, left: `${panels.analysis.position.x}px`, zIndex: panels.analysis.zIndex }}
            mapRef={mapRef}
          />
        )}

        {isMounted && !initialMapState && panels.ai && !panels.ai.isMinimized && (
          <AIPanel
            panelRef={aiPanelRef}
            isCollapsed={panels.ai.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('ai')}
            onClosePanel={() => togglePanelMinimize('ai')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'ai')}
            availableLayers={discoveredGeoServerLayers.map(l => ({ name: l.name, title: l.title }))}
            activeLayers={layerManagerHook.layers.map(l => {
              const machineName = l.olLayer.get('gsLayerName') || l.name;
              return { name: machineName, title: l.name, type: l.type };
            })}
            onLayerAction={handleAiAction}
            messages={chatMessages}
            setMessages={setChatMessages}
            style={{ top: `${panels.ai.position.y}px`, left: `${panels.ai.position.x}px`, zIndex: panels.ai.zIndex }}
          />
        )}

        {isMounted && !initialMapState && panels.trello && !panels.trello.isMinimized && (
          <TrelloPanel
            panelRef={trelloPanelRef}
            isCollapsed={panels.trello.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('trello')}
            onClosePanel={() => togglePanelMinimize('trello')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'trello')}
            onSetSelectedCard={handleSetTrelloCard}
            style={{ top: `${panels.trello.position.y}px`, left: `${panels.trello.position.x}px`, zIndex: panels.trello.zIndex }}
          />
        )}

        {isMounted && !initialMapState && panels.wfsLibrary && !panels.wfsLibrary.isMinimized && (
          <WfsLibraryPanel
            panelRef={wfsLibraryPanelRef}
            isCollapsed={panels.wfsLibrary.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('wfsLibrary')}
            onClosePanel={() => togglePanelMinimize('wfsLibrary')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'wfsLibrary')}
            style={{ top: `${panels.wfsLibrary.position.y}px`, left: `${panels.wfsLibrary.position.x}px`, zIndex: panels.wfsLibrary.zIndex }}
            predefinedServers={wfsLibraryHook.PREDEFINED_SERVERS}
            isLoading={wfsLibraryHook.isLoading}
            discoveredLayers={wfsLibraryHook.discoveredLayers}
            onFetchLayers={wfsLibraryHook.fetchCapabilities}
            onAddLayer={wfsLibraryHook.addLayer}
          />
        )}

        {isMounted && !initialMapState && panels.help && !panels.help.isMinimized && (
          <HelpPanel
            panelRef={helpPanelRef}
            isCollapsed={panels.help.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('help')}
            onClosePanel={() => togglePanelMinimize('help')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'help')}
            style={{ top: `${panels.help.position.y}px`, left: `${panels.help.position.x}px`, zIndex: panels.help.zIndex }}
          />
        )}
      </div>
    </div>
  );
}
