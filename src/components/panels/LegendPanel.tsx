
"use client";

import React, { useState, useMemo } from 'react';
import DraggablePanel from './DraggablePanel';
import LayerList from '@/components/layer-manager/LayerList';
import FileUploadControl from '@/components/layer-manager/FileUploadControl';
import FeatureInteractionToolbar from '@/components/feature-inspection/FeatureInteractionToolbar';
import { Separator } from '@/components/ui/separator';
import type { MapLayer, GeoServerDiscoveredLayer, LabelOptions, GraduatedSymbology, CategorizedSymbology, VectorMapLayer } from '@/lib/types';
import { ListTree, Trash2, Database, Search, X as ClearIcon, RefreshCw, Loader2, Undo2 } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import type { StyleOptions } from '../layer-manager/StyleEditorDialog';
import type { InteractionToolId } from '@/lib/types';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';


interface LegendPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;

  layers: MapLayer[];
  onToggleLayerVisibility: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onRemoveLayers: (layerIds: string[]) => void;
  onZoomToLayerExtent: (layerId: string) => void;
  onShowLayerTable: (layerId: string) => void;
  onShowStatistics: (layerId: string) => void;
  onExtractByPolygon: (layerId: string, onSuccess?: () => void) => void;
  onExtractBySelection: (onSuccess?: () => void) => void;
  onSelectByLayer: (targetLayerId: string, selectorLayerId: string) => void;
  onExportLayer: (layerId: string, format: 'geojson' | 'kml' | 'shp') => void;
  isDrawingSourceEmptyOrNotPolygon: boolean;
  isSelectionEmpty: boolean;
  onSetLayerOpacity: (layerId: string, opacity: number) => void; 
  onReorderLayers: (draggedIds: string[], targetId: string | null) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onChangeLayerStyle: (layerId: string, styleOptions: StyleOptions) => void;
  onChangeLayerLabels: (layerId: string, labelOptions: LabelOptions) => void;
  onApplyGraduatedSymbology: (layerId: string, symbology: GraduatedSymbology) => void;
  onApplyCategorizedSymbology: (layerId: string, symbology: CategorizedSymbology) => void;
  onToggleWmsStyle: (layerId: string) => void;

  onAddLayer: (layer: MapLayer) => void;

  activeTool: InteractionToolId | null;
  onSetActiveTool: (tool: InteractionToolId | null) => void;
  onClearSelection: () => void;

  // DEAS props
  discoveredDeasLayers: GeoServerDiscoveredLayer[];
  onAddDeasLayer: (layer: GeoServerDiscoveredLayer) => void;
  isFetchingDeasLayers: boolean;
  onReloadDeasLayers: () => void;
  
  // Undo props
  canUndoRemove: boolean;
  onUndoRemove: () => void;
  
  // Selection props
  selectedFeaturesForSelection: Feature<Geometry>[];

  style?: React.CSSProperties;
}

// Type definitions for the hierarchical structure
type DeasLayerNode = GeoServerDiscoveredLayer;
type DeasProjectNode = { [projectName: string]: DeasLayerNode[] };
type DeasOrgNode = { [orgName: string]: DeasProjectNode };


const LegendPanel: React.FC<LegendPanelProps> = ({
  panelRef, isCollapsed, onToggleCollapse, onClosePanel, onMouseDownHeader,
  layers, onToggleLayerVisibility, onRemoveLayer, onRemoveLayers, onZoomToLayerExtent, onShowLayerTable, onShowStatistics,
  onExtractByPolygon, onExtractBySelection, onSelectByLayer, onExportLayer, isDrawingSourceEmptyOrNotPolygon, isSelectionEmpty, onSetLayerOpacity, onReorderLayers, onRenameLayer,
  onChangeLayerStyle, onChangeLayerLabels, onApplyGraduatedSymbology, onApplyCategorizedSymbology, onToggleWmsStyle,
  onAddLayer, 
  activeTool, onSetActiveTool, onClearSelection,
  discoveredDeasLayers, onAddDeasLayer, isFetchingDeasLayers, onReloadDeasLayers,
  canUndoRemove, onUndoRemove,
  selectedFeaturesForSelection,
  style,
}) => {
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [deasSearchTerm, setDeasSearchTerm] = useState('');

  const hierarchicalDeasLayers = useMemo(() => {
    const lowercasedFilter = deasSearchTerm.toLowerCase();
    
    const filteredLayers = discoveredDeasLayers.filter(layer => {
        if (!deasSearchTerm) return true;
        const [workspace = '', layerNameOnly = ''] = layer.name.split(':');
        return (
            layer.title.toLowerCase().includes(lowercasedFilter) ||
            workspace.toLowerCase().includes(lowercasedFilter) ||
            layerNameOnly.toLowerCase().includes(lowercasedFilter)
        );
    });

    return filteredLayers.reduce<DeasOrgNode>((orgs, layer) => {
        const [workspace, layerNameOnly] = layer.name.split(':');
        if (!layerNameOnly) return orgs;
        
        // Match pattern like: ARR001_some_layer_name
        const match = layerNameOnly.match(/^([a-zA-Z]+)(\d{3,})(_.*)?$/);

        if (match) {
            const orgCode = match[1].toUpperCase(); // e.g., ARR
            const projectCode = `${orgCode}${match[2]}`; // e.g., ARR001

            if (!orgs[orgCode]) orgs[orgCode] = {};
            if (!orgs[orgCode][projectCode]) orgs[orgCode][projectCode] = [];
            
            orgs[orgCode][projectCode].push(layer);
        } else {
            // Fallback for layers that don't match the pattern
            const orgCode = workspace.toUpperCase() || 'OTROS';
            const projectCode = 'General';

            if (!orgs[orgCode]) orgs[orgCode] = {};
            if (!orgs[orgCode][projectCode]) orgs[orgCode][projectCode] = [];
            
            orgs[orgCode][projectCode].push(layer);
        }
        
        return orgs;
    }, {});
  }, [discoveredDeasLayers, deasSearchTerm]);


  const handleLayerClick = (clickedIndex: number, event: React.MouseEvent<HTMLLIElement>) => {
    const clickedLayerId = layers[clickedIndex].id;

    if (event.ctrlKey || event.metaKey) { // Ctrl/Cmd click
      setSelectedLayerIds(prev =>
        prev.includes(clickedLayerId)
          ? prev.filter(id => id !== clickedLayerId) // Deselect if already selected
          : [...prev, clickedLayerId] // Select if not selected
      );
    } else if (event.shiftKey && lastClickedIndex !== null) { // Shift click
      const start = Math.min(lastClickedIndex, clickedIndex);
      const end = Math.max(lastClickedIndex, clickedIndex);
      const rangeIds = layers.slice(start, end + 1).map(l => l.id);
      setSelectedLayerIds(rangeIds);
    } else { // Normal click
      setSelectedLayerIds([clickedLayerId]);
    }
    setLastClickedIndex(clickedIndex);
  };
  
  const handleDeleteSelected = () => {
    if (selectedLayerIds.length > 0) {
      onRemoveLayers(selectedLayerIds);
      setSelectedLayerIds([]);
      setLastClickedIndex(null);
    }
  };

  const clearLayerSelection = () => {
    setSelectedLayerIds([]);
    setLastClickedIndex(null);
  };

  const handleToggleEditing = (tool: InteractionToolId) => {
    onSetActiveTool(activeTool === tool ? null : tool);
  };


  return (
    <DraggablePanel
      title="Capas"
      icon={ListTree} 
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }} 
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style} 
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: "80vh" }}
      minSize={{ width: 300, height: 300 }}
    >
      <div className="flex flex-col h-full">
        {/* --- Top Toolbar --- */}
        <div className="flex-shrink-0 space-y-2 mb-2"> 
          <div className="flex items-center gap-1 p-1 bg-white/5 rounded-md"> 
            <FileUploadControl onAddLayer={onAddLayer} uniqueIdPrefix="legendpanel-upload" />
            <TooltipProvider delayDuration={300}>
                <Tooltip>
                    <TooltipTrigger asChild>
                      <div> {/* Wrapper for disabled button */}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 bg-black/20 hover:bg-white/10 border border-white/30 text-white/90 disabled:opacity-50 disabled:bg-black/20 disabled:text-white/50"
                          onClick={onUndoRemove}
                          disabled={!canUndoRemove}
                          aria-label="Deshacer última eliminación"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                      <p className="text-xs">Deshacer Eliminación</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div> {/* Wrapper for disabled button */}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-red-700/30 hover:bg-red-600/50 border border-red-500/50 text-white/90 disabled:opacity-50 disabled:bg-black/20 disabled:text-white/90 disabled:border-white/30"
                        onClick={handleDeleteSelected}
                        disabled={selectedLayerIds.length === 0}
                        aria-label="Eliminar capas seleccionadas"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                    <p className="text-xs">Eliminar seleccionadas</p>
                  </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <FeatureInteractionToolbar
              activeTool={activeTool}
              onSetActiveTool={onSetActiveTool}
              onClearSelection={onClearSelection}
            />
          </div>
        </div>

        {/* --- Main Content Area (split into two scrollable sections) --- */}
        <div className="flex-grow flex flex-col min-h-0">
            {/* --- Active Layers List --- */}
            <div className="flex-grow flex flex-col basis-2/3">
                <ScrollArea className="flex-grow">
                    <div className="pr-3">
                        <LayerList
                            layers={layers}
                            onToggleVisibility={onToggleLayerVisibility}
                            onZoomToExtent={onZoomToExtent}
                            onShowLayerTable={onShowLayerTable}
                            onShowStatistics={onShowStatistics}
                            onRemoveLayer={onRemoveLayer}
                            onExtractByPolygon={onExtractByPolygon}
                            onExtractBySelection={() => onExtractBySelection(clearLayerSelection)}
                            onSelectByLayer={onSelectByLayer}
                            onExportLayer={onExportLayer}
                            onRenameLayer={onRenameLayer}
                            onChangeLayerStyle={onChangeLayerStyle}
                            onChangeLayerLabels={onChangeLayerLabels}
                            onApplyGraduatedSymbology={onApplyGraduatedSymbology}
                            onApplyCategorizedSymbology={onApplyCategorizedSymbology}
                            onToggleWmsStyle={onToggleWmsStyle}
                            isDrawingSourceEmptyOrNotPolygon={isDrawingSourceEmptyOrNotPolygon}
                            isSelectionEmpty={isSelectionEmpty}
                            onSetLayerOpacity={onSetLayerOpacity}
                            onReorderLayers={onReorderLayers}
                            selectedLayerIds={selectedLayerIds}
                            onLayerClick={handleLayerClick}
                            activeTool={activeTool}
                            onToggleEditing={handleToggleEditing}
                        />
                    </div>
                </ScrollArea>
            </div>

            {/* --- DEAS Catalog Section --- */}
            <div className="flex flex-col pt-2 basis-1/3">
                <Separator className="bg-white/10 mb-2" />
                <div className="flex items-center justify-between px-2 pb-2 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-white">Capas Predefinidas (DEAS)</h3>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
                                onClick={onReloadDeasLayers}
                                disabled={isFetchingDeasLayers}
                            >
                                {isFetchingDeasLayers ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-gray-700 text-white border-gray-600">
                           <p className="text-xs">Recargar capas</p>
                        </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                 <div className="relative mb-2 px-2">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                        placeholder="Buscar capa, proyecto u org..."
                        value={deasSearchTerm}
                        onChange={(e) => setDeasSearchTerm(e.target.value)}
                        className="text-xs h-8 border-white/30 bg-black/20 text-white/90 focus:ring-primary pl-8 pr-8"
                    />
                    {deasSearchTerm && (
                        <button
                            onClick={() => setDeasSearchTerm('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400/80 hover:text-white"
                            aria-label="Limpiar búsqueda"
                        >
                            <ClearIcon className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <ScrollArea className="flex-grow min-h-0 border-t border-gray-700/50">
                <div className="pr-3">
                  {Object.keys(hierarchicalDeasLayers).length > 0 ? (
                      <Accordion type="multiple" className="w-full">
                        {Object.entries(hierarchicalDeasLayers).sort(([orgA], [orgB]) => orgA.localeCompare(orgB)).map(([orgName, projects]) => (
                          <AccordionItem value={orgName} key={orgName} className="border-b border-gray-700/50">
                            <AccordionTrigger className="p-2 text-xs font-semibold text-white/90 hover:no-underline hover:bg-gray-700/30 rounded-t-md">
                              {orgName} ({Object.values(projects).reduce((acc, p) => acc + p.length, 0)})
                            </AccordionTrigger>
                            <AccordionContent className="p-1 pl-2 bg-black/20">
                                <Accordion type="multiple" className="w-full">
                                    {Object.entries(projects).sort(([projA], [projB]) => projA.localeCompare(projB)).map(([projectName, projectLayers]) => (
                                        <AccordionItem value={projectName} key={projectName} className="border-b-0">
                                            <AccordionTrigger className="p-1.5 text-xs font-medium text-white/70 hover:no-underline hover:bg-white/5 rounded-md">
                                                {projectName} ({projectLayers.length})
                                            </AccordionTrigger>
                                            <AccordionContent className="p-1 pl-4">
                                                <div className="space-y-1">
                                                  {projectLayers.sort((a,b) => a.title.localeCompare(b.title)).map(layer => (
                                                    <div key={layer.name} className="flex items-center space-x-2 p-1 rounded-md hover:bg-white/5">
                                                        <Button 
                                                          variant="outline" 
                                                          size="icon" 
                                                          className="h-6 w-6 p-0"
                                                          title={`Añadir capa`}
                                                          onClick={() => onAddDeasLayer(layer)}
                                                          disabled={layer.wfsAddedToMap}
                                                          >
                                                          <Database className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Label
                                                          className="text-xs font-medium text-white/80 cursor-pointer flex-1 capitalize"
                                                          title={layer.name}
                                                        >
                                                          {layer.title.toLowerCase()}
                                                        </Label>
                                                    </div>
                                                  ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                  ) : (
                      <p className="p-4 text-center text-xs text-gray-400">
                        {isFetchingDeasLayers ? "Cargando capas..." : "No se encontraron resultados."}
                      </p>
                  )}
                  </div>
                </ScrollArea>
            </div>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default LegendPanel;
