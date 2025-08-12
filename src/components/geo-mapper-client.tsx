
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MapPin, Database, Wrench, ListTree, ListChecks, Sparkles, ClipboardCheck, Library, LifeBuoy, Printer, Server, BrainCircuit, Camera, Loader2, SlidersHorizontal } from 'lucide-react';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
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
import WfsLoadingIndicator from '@/components/feedback/WfsLoadingIndicator';
import LocationSearch from '@/components/location-search/LocationSearch';
import BaseLayerSelector from '@/components/layer-manager/BaseLayerSelector';
import BaseLayerControls from '@/components/layer-manager/BaseLayerControls';
import { StreetViewIcon } from '@/components/icons/StreetViewIcon';


import { useOpenLayersMap } from '@/hooks/map-core/useOpenLayersMap';
import { useLayerManager } from '@/hooks/layer-manager/useLayerManager';
import { useFeatureInspection } from '@/hooks/feature-inspection/useFeatureInspection';
import { useDrawingInteractions } from '@/hooks/drawing-tools/useDrawingInteractions';
import { useOSMData } from '@/hooks/osm-integration/useOSMData';
import { useGeoServerLayers } from '@/hooks/geoserver-connection/useGeoServerLayers';
import { useFloatingPanels } from '@/hooks/panels/useFloatingPanels';
import { useMapCapture, type MapCaptureData } from '@/hooks/map-tools/useMapCapture';
import { useWfsLibrary } from '@/hooks/wfs-library/useWfsLibrary';
import { useOsmQuery } from '@/hooks/osm-integration/useOsmQuery';
import { useToast } from "@/hooks/use-toast";

import type { OSMCategoryConfig, GeoServerDiscoveredLayer, BaseLayerOptionForSelect, MapLayer, ChatMessage, BaseLayerSettings, NominatimResult, PlainFeatureData } from '@/lib/types';
import { chatWithMapAssistant, type MapAssistantOutput } from '@/ai/flows/find-layer-flow';
import { searchTrelloCard } from '@/ai/flows/trello-actions';
import { authenticateWithGee } from '@/ai/flows/gee-flow';


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
    overpassQueryFragment: (bboxStr) => `nwr[amenity~"^(hospital|clinic|doctors|pharmacy)$"](${bboxStr});`,
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
  { id: 'legend', IconComponent: ListTree, name: "Capas" },
  { id: 'wfsLibrary', IconComponent: Library, name: "Biblioteca de Servidores" },
  { id: 'tools', IconComponent: Wrench, name: "Herramientas" },
  { id: 'trello', IconComponent: ClipboardCheck, name: "Trello" },
  { id: 'attributes', IconComponent: ListChecks, name: "Atributos" },
  { id: 'printComposer', IconComponent: Printer, name: "Impresión" },
  { id: 'gee', IconComponent: BrainCircuit, name: "Procesamiento GEE" },
  { id: 'ai', IconComponent: Sparkles, name: "Asistente IA" },
  { id: 'help', IconComponent: LifeBuoy, name: "Ayuda" },
];


export default function GeoMapperClient() {
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

  const { mapRef, mapElementRef, setMapInstanceAndElement, isMapReady, drawingSourceRef } = useOpenLayersMap();
  const { toast } = useToast();

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
    mapAreaRef,
    panelWidth: PANEL_WIDTH,
    panelPadding: PANEL_PADDING,
  });

  const [activeBaseLayerId, setActiveBaseLayerId] = useState<string>(BASE_LAYER_DEFINITIONS[0].id);
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

  const featureInspectionHook = useFeatureInspection({
    mapRef, 
    mapElementRef, 
    isMapReady,
    onNewSelection: () => {
      if (panels.attributes.isMinimized) {
        togglePanelMinimize('attributes');
      }
    }
  });

  const [isWfsLoading, setIsWfsLoading] = useState(false);
  const [discoveredGeoServerLayers, setDiscoveredGeoServerLayers] = useState<GeoServerDiscoveredLayer[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "¡Buenas! Soy Drax, tu asistente de mapas. Pedime que cargue una capa, que la saque o que le haga zoom." }
  ]);
  const [isTrelloLoading, setIsTrelloLoading] = useState(false);
  const [printLayoutData, setPrintLayoutData] = useState<MapCaptureData | null>(null);
  const [isGeeAuthenticated, setIsGeeAuthenticated] = useState(false);
  const [isGeeAuthenticating, setIsGeeAuthenticating] = useState(true); // Start as true
  const [isCapturing, setIsCapturing] = useState(false);


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
    onShowTableRequest: featureInspectionHook.processAndDisplayFeatures,
    updateGeoServerDiscoveredLayerState: updateDiscoveredLayerState,
    clearSelectionAfterExtraction: featureInspectionHook.clearSelection,
    setIsWfsLoading,
  });
  
  const {
    handleFetchGeoServerLayers,
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

  const initialGeoServerUrl = 'http://www.minfra.gba.gob.ar/ambientales/geoserver';

  // Effect for initial GeoServer layer loading
  useEffect(() => {
    const loadInitialLayers = async () => {
      try {
        const discovered = await handleFetchGeoServerLayers(initialGeoServerUrl);
        if (discovered && discovered.length > 0) {
          setDiscoveredGeoServerLayers(discovered);
        }
      } catch (error) {
        console.error("Failed to load initial DEAS layers:", error);
        toast({ description: `No se pudo obtener la lista de capas de DEAS. Es posible que el asistente no las encuentre.`, variant: 'destructive' });
      }
    };
    
    if (isMapReady) {
       loadInitialLayers();
    }
  }, [isMapReady, handleFetchGeoServerLayers, toast]);

  // Effect for automatic GEE authentication on load
  useEffect(() => {
    const runGeeAuth = async () => {
        setIsGeeAuthenticating(true);
        try {
            const result = await authenticateWithGee();
            if (result.success) {
                toast({
                    title: "GEE Conectado",
                    description: result.message,
                });
                setIsGeeAuthenticated(true);
            }
        } catch (error: any) {
            console.error("Error de autenticación automática con GEE:", error);
            toast({
                title: "Error de Autenticación GEE",
                description: error.message || "No se pudo autenticar con Google Earth Engine.",
                variant: "destructive",
            });
            setIsGeeAuthenticated(false);
        } finally {
            setIsGeeAuthenticating(false);
        }
    };

    if (isMapReady) {
        runGeeAuth();
    }
  }, [isMapReady, toast]);

  const osmDataHook = useOSMData({ 
    mapRef, 
    drawingSourceRef, 
    addLayer: layerManagerHook.addLayer, 
    osmCategoryConfigs: osmCategoryConfig 
  });

  // Orchestration between drawing and feature inspection tools
  const drawingInteractions = useDrawingInteractions({
    mapRef, isMapReady, drawingSourceRef: drawingSourceRef,
    isInspectModeActive: featureInspectionHook.isInspectModeActive,
    toggleInspectMode: featureInspectionHook.toggleInspectMode,
  });

  const { captureMapDataUrl } = useMapCapture({ mapRef, activeBaseLayerId });

  // This effect sets up and cleans up the event listener for map movement.
  // It re-attaches the listener when dependencies change, ensuring it never has a "stale" state.
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;

    const view = mapRef.current.getView();

    const handleMoveEnd = async () => {
      // Logic is directly inside the listener, using the latest state from the component's render scope.
      if (panels.printComposer.isMinimized || isCapturing) {
        return;
      }

      const layoutData = await captureMapDataUrl();
      if (layoutData) {
        setPrintLayoutData(layoutData);
      } else {
        toast({
          title: "Error de Captura",
          description: "No se pudo actualizar la imagen del mapa.",
          variant: "destructive",
        });
      }
    };

    view.on('moveend', handleMoveEnd);

    // The cleanup function removes the exact listener that was added.
    return () => {
      if (view && typeof view.un === 'function') { // Ensure view and .un are available on cleanup
        view.un('moveend', handleMoveEnd);
      }
    };
  }, [isMapReady, mapRef, panels, isCapturing, captureMapDataUrl, toast]); // Dependency array ensures the listener is always fresh.


  const handleTogglePrintComposer = async () => {
    if (panels.printComposer.isMinimized) {
        const layoutData = await captureMapDataUrl();
        if (layoutData) {
            setPrintLayoutData(layoutData);
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

    // Logic for layersToAdd and layersToAddAsWFS now calls handleAddHybridLayer
    const layersToAddHybrid = (action.layersToAdd || []).concat(action.layersToAddAsWFS || []);
    if (layersToAddHybrid.length > 0) {
        layersToAddHybrid.forEach(layerNameToAdd => {
            const layerData = discoveredGeoServerLayers.find(l => l.name === layerNameToAdd);
            if (layerData) {
                layerManagerHook.handleAddHybridLayer(layerData.name, layerData.title, initialGeoServerUrl, layerData.bbox);
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
                    lineWidth: styleRequest.lineWidth
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
        osmDataHook.fetchOSMForCurrentView(action.fetchOsmForView);
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

  const handleSearchTrelloCard = useCallback(async (searchTerm: string) => {
    setIsTrelloLoading(true);
    try {
      const result = await searchTrelloCard({ query: searchTerm });
      toast({ description: result.message });
      if (result.cardUrl) {
        window.open(result.cardUrl, '_blank', 'noopener,noreferrer');
        toast({ description: `Abriendo Trello en una nueva pestaña...` });
      }
    } catch (error: any) {
      console.error("Trello card search error:", error);
      toast({ description: error.message || 'Error al buscar la tarjeta en Trello.', variant: 'destructive' });
    } finally {
      setIsTrelloLoading(false);
    }
  }, [toast]);

  const handleDeasAddWfsLayer = useCallback((layer: GeoServerDiscoveredLayer) => {
    layerManagerHook.handleAddHybridLayer(layer.name, layer.title, initialGeoServerUrl, layer.bbox);
  }, [layerManagerHook, initialGeoServerUrl]);

  const handleAttributeTableFeatureSelect = useCallback((featureId: string, isCtrlOrMeta: boolean) => {
      // NEW: Automatically enable inspection mode if it's off
      if (!featureInspectionHook.isInspectModeActive) {
        featureInspectionHook.toggleInspectMode();
        toast({ description: 'Modo Inspección activado para mostrar selección.' });
      }

      const currentSelectedIds = featureInspectionHook.selectedFeatures.map(f => f.getId() as string);
      let newSelectedIds: string[];

      if (isCtrlOrMeta) {
          newSelectedIds = currentSelectedIds.includes(featureId)
              ? currentSelectedIds.filter(id => id !== featureId)
              : [...currentSelectedIds, featureId];
      } else {
          newSelectedIds = [featureId];
      }
      featureInspectionHook.selectFeaturesById(newSelectedIds);
  }, [featureInspectionHook, toast]);

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
        window.open(url, '_blank', 'noopener,noreferrer');
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


  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="bg-gray-800/80 backdrop-blur-md text-white p-2 shadow-md flex items-center justify-between z-30">
        <div className="flex items-center">
          <MapPin className="mr-2 h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Departamento de Estudios Ambientales y Sociales</h1>
        </div>
        <div className="flex flex-row space-x-1">
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
      </header>

      <div className="bg-gray-700/90 backdrop-blur-sm shadow-md p-2 z-20 flex items-center gap-2">
        <LocationSearch onLocationSelect={handleLocationSelection} className="max-w-sm" />
        <div className="max-w-sm w-full">
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
            onClick={handleCaptureAndDownload}
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 bg-black/20 hover:bg-black/40 border border-white/30 text-white/90"
            title="Capturar imagen UHD del mapa base"
            disabled={isCapturing}
        >
          {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </Button>
      </div>

      <div ref={mapAreaRef} className="relative flex-1 overflow-visible">
        <MapView
          setMapInstanceAndElement={setMapInstanceAndElement}
          activeBaseLayerId={activeBaseLayerId}
          baseLayerSettings={baseLayerSettings}
        />

        {/* Center Crosshair */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none z-10">
            <div className="absolute top-1/2 left-0 w-full h-px bg-gray-400/70 -translate-y-1/2"></div>
            <div className="absolute left-1/2 top-0 h-full w-px bg-gray-400/70 -translate-x-1/2"></div>
        </div>

        <WfsLoadingIndicator isVisible={isWfsLoading || wfsLibraryHook.isLoading} />

        {panels.tools && !panels.tools.isMinimized && (
          <ToolsPanel
            panelRef={toolsPanelRef}
            isCollapsed={panels.tools.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('tools')}
            onClosePanel={() => togglePanelMinimize('tools')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'tools')}
            activeDrawTool={drawingInteractions.activeDrawTool}
            onToggleDrawingTool={drawingInteractions.toggleDrawingTool}
            onClearDrawnFeatures={drawingInteractions.clearDrawnFeatures}
            onSaveDrawnFeaturesAsKML={drawingInteractions.saveDrawnFeaturesAsKML}
            isFetchingOSM={osmDataHook.isFetchingOSM}
            onFetchOSMDataTrigger={osmDataHook.fetchOSMData}
            osmCategoriesForSelection={osmCategoriesForSelection}
            selectedOSMCategoryIds={osmDataHook.selectedOSMCategoryIds}
            onSelectedOSMCategoriesChange={osmDataHook.setSelectedOSMCategoryIds}
            isDownloading={osmDataHook.isDownloading}
            onDownloadOSMLayers={osmDataHook.handleDownloadOSMLayers}
            osmQueryHook={osmQueryHook}
            style={{ top: `${panels.tools.position.y}px`, left: `${panels.tools.position.x}px`, zIndex: panels.tools.zIndex }}
          />
        )}

        {panels.legend && !panels.legend.isMinimized && (
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
            onExtractByPolygon={layerManagerHook.handleExtractByPolygon}
            onExtractBySelection={() => layerManagerHook.handleExtractBySelection(featureInspectionHook.selectedFeatures)}
            onExportLayer={layerManagerHook.handleExportLayer}
            onRenameLayer={layerManagerHook.renameLayer}
            isDrawingSourceEmptyOrNotPolygon={layerManagerHook.isDrawingSourceEmptyOrNotPolygon}
            isSelectionEmpty={featureInspectionHook.selectedFeatures.length === 0}
            onSetLayerOpacity={layerManagerHook.setLayerOpacity}
            onReorderLayers={layerManagerHook.reorderLayers}
            onAddLayer={layerManagerHook.addLayer as (layer: MapLayer) => void}
            isInteractionActive={featureInspectionHook.isInspectModeActive}
            onToggleInteraction={featureInspectionHook.toggleInspectMode}
            selectionMode={featureInspectionHook.selectionMode}
            onSetSelectionMode={featureInspectionHook.setSelectionMode}
            onClearSelection={featureInspectionHook.clearSelection}
            style={{ top: `${panels.legend.position.y}px`, left: `${panels.legend.position.x}px`, zIndex: panels.legend.zIndex }}
            discoveredDeasLayers={discoveredGeoServerLayers}
            onAddDeasLayer={handleDeasAddWfsLayer}
          />
        )}

        {panels.attributes && !panels.attributes.isMinimized && (
          <AttributesPanelComponent
            panelRef={attributesPanelRef}
            isCollapsed={panels.attributes.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('attributes')}
            onClosePanel={() => {
              togglePanelMinimize('attributes'); 
              featureInspectionHook.clearSelection(); 
            }}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'attributes')}
            plainFeatureData={featureInspectionHook.inspectedFeatureData}
            layerName={featureInspectionHook.currentInspectedLayerName}
            style={{ top: `${panels.attributes.position.y}px`, left: `${panels.attributes.position.x}px`, zIndex: panels.attributes.zIndex }}
            selectedFeatureIds={featureInspectionHook.selectedFeatures.map(f => f.getId() as string)}
            onFeatureSelect={handleAttributeTableFeatureSelect}
          />
        )}
        
        {panels.printComposer && !panels.printComposer.isMinimized && printLayoutData && (
            <PrintComposerPanel
                mapImage={printLayoutData.image}
                mapExtent={printLayoutData.extent}
                scale={printLayoutData.scale}
                panelRef={printComposerPanelRef}
                isCollapsed={panels.printComposer.isCollapsed}
                onToggleCollapse={() => togglePanelCollapse('printComposer')}
                onClosePanel={() => togglePanelMinimize('printComposer')}
                onMouseDownHeader={(e) => handlePanelMouseDown(e, 'printComposer')}
                style={{ top: `${panels.printComposer.position.y}px`, left: `${panels.printComposer.position.x}px`, zIndex: panels.printComposer.zIndex }}
                isRefreshing={isCapturing}
            />
        )}

        {panels.gee && !panels.gee.isMinimized && (
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

        {panels.ai && !panels.ai.isMinimized && (
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

        {panels.trello && !panels.trello.isMinimized && (
          <TrelloPanel
            panelRef={trelloPanelRef}
            isCollapsed={panels.trello.isCollapsed}
            onToggleCollapse={() => togglePanelCollapse('trello')}
            onClosePanel={() => togglePanelMinimize('trello')}
            onMouseDownHeader={(e) => handlePanelMouseDown(e, 'trello')}
            onSearchCard={handleSearchTrelloCard}
            isLoading={isTrelloLoading}
            style={{ top: `${panels.trello.position.y}px`, left: `${panels.trello.position.x}px`, zIndex: panels.trello.zIndex }}
          />
        )}

        {panels.wfsLibrary && !panels.wfsLibrary.isMinimized && (
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

        {panels.help && !panels.help.isMinimized && (
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
