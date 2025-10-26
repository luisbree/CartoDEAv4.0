

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger, 
  ContextMenuPortal,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider"; 
import { Eye, EyeOff, Settings2, ZoomIn, Table2, Trash2, Scissors, Percent, GripVertical, CopyPlus, Download, Edit, Palette, Tags, Waypoints, AppWindow, BarChartHorizontal, Target, Image as ImageIcon, Info, Check, Dot } from 'lucide-react';
import type { CategorizedSymbology, GeoTiffStyle, GraduatedSymbology, InteractionToolId, LabelOptions, MapLayer, VectorMapLayer } from '@/lib/types';
import VectorLayer from 'ol/layer/Vector'; 
import WebGLTileLayer from 'ol/layer/WebGLTile';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import StyleEditorDialog, { type StyleOptions } from './StyleEditorDialog';
import LabelEditorDialog from './LabelEditorDialog';
import GraduatedSymbologyDialog from './GraduatedSymbologyDialog';
import CategorizedSymbologyDialog from './CategorizedSymbologyDialog';
import { useLayerManager } from '@/hooks/layer-manager/useLayerManager';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';


interface LayerItemProps {
  layer: MapLayer;
  allLayers: MapLayer[]; // For the "Select by Layer" submenu
  onToggleVisibility: (layerId: string, groupId?: string) => void;
  onZoomToExtent: (layerId: string) => void;
  onShowLayerTable: (layerId: string) => void;
  onShowStatistics: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onExtractByPolygon: (layerId: string) => void;
  onExtractBySelection: () => void;
  onSelectByLayer: (targetLayerId: string, selectorLayerId: string) => void;
  onExportLayer: (layerId: string, format: 'geojson' | 'kml' | 'shp') => void;
  onExportWmsAsGeotiff: (layerId: string) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onChangeLayerStyle: (layerId: string, styleOptions: StyleOptions) => void;
  onChangeLayerLabels: (layerId: string, labelOptions: LabelOptions) => void;
  onApplyGraduatedSymbology: (layerId: string, symbology: GraduatedSymbology) => void;
  onApplyCategorizedSymbology: (layerId: string, symbology: CategorizedSymbology) => void;
  onApplyGeoTiffStyle: (layerId: string, style: GeoTiffStyle) => void;
  onToggleWmsStyle: (layerId: string) => void;
  isDrawingSourceEmptyOrNotPolygon: boolean;
  isSelectionEmpty: boolean;
  onSetLayerOpacity: (layerId: string, opacity: number) => void;
  
  // Drag and Drop props
  isDraggable: boolean;
  onDragStart?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnter?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLLIElement>) => void;
  isDragging?: boolean;
  isDragOver?: boolean;

  // Selection props
  isSelected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLLIElement>) => void;

  // Editing props
  activeTool: InteractionToolId | null;
  onToggleEditing: (tool: InteractionToolId) => void;
  
  isSharedView?: boolean;
  
  // Group context
  groupDisplayMode?: 'single' | 'multiple';
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  isDraggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  isDragging,
  isDragOver,
  isSelected,
  onClick,
  onRenameLayer,
  ...props
}) => {
  const isVectorLayer = layer.olLayer instanceof VectorLayer;

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(layer.name);
  const [isStyleEditorOpen, setIsStyleEditorOpen] = useState(false);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);
  const [isGraduatedEditorOpen, setIsGraduatedEditorOpen] = useState(false);
  const [isCategorizedEditorOpen, setIsCategorizedEditorOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isEditing]);
  
  const handleDoubleClick = () => {
    if (props.isSharedView) return;
    setIsEditing(true);
  };
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  };

  const handleNameSubmit = () => {
    if (editingName.trim() && editingName.trim() !== layer.name) {
      onRenameLayer(layer.id, editingName.trim());
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditingName(layer.name);
      setIsEditing(false);
    }
  };

  const handleRenameSelect = (e: Event) => {
    e.preventDefault();
    setIsEditing(true);
  };

  const handleStyleChange = (styleOptions: StyleOptions) => {
    props.onChangeLayerStyle(layer.id, styleOptions);
    setIsStyleEditorOpen(false);
  };
  
  const handleLabelChange = (labelOptions: LabelOptions) => {
    props.onChangeLayerLabels(layer.id, labelOptions);
    setIsLabelEditorOpen(false);
  };

  const handleGraduatedSymbologyApply = (symbology: GraduatedSymbology) => {
    if (layer.type === 'geotiff' || layer.type === 'gee') {
        props.onApplyGeoTiffStyle(layer.id, symbology as GeoTiffStyle);
    } else {
        props.onApplyGraduatedSymbology(layer.id, symbology);
    }
    setIsGraduatedEditorOpen(false);
  };
  
  const handleCategorizedSymbologyApply = (symbology: CategorizedSymbology) => {
    props.onApplyCategorizedSymbology(layer.id, symbology);
    setIsCategorizedEditorOpen(false);
  };
  
  const GoesMetadataTooltip = () => {
    const isGoesLayer = (layer.type === 'geotiff' || layer.type === 'gee') && layer.olLayer.get('geeParams')?.bandCombination === 'GOES_CLOUDTOP';
    const metadata = layer.olLayer.get('geeParams')?.metadata;
    if (!isGoesLayer || !metadata) return null;

    const timestamp = metadata.timestamp ? format(new Date(metadata.timestamp), "dd/MM/yyyy HH:mm:ss 'UTC'", { locale: es }) : 'N/D';
    const satellite = metadata.satellite || 'N/D';
    const sceneId = metadata.scene_id || 'N/D';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-gray-400 hover:text-white ml-2 flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-gray-700 text-white border-gray-600 text-xs">
                <div className="space-y-1">
                    <p><strong>Fecha:</strong> {timestamp}</p>
                    <p><strong>Satélite:</strong> {satellite}</p>
                    <p><strong>ID Escena:</strong> <span className="break-all">{sceneId}</span></p>
                </div>
            </TooltipContent>
        </Tooltip>
    );
  };

  return (
    <>
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <li 
            className={cn(
              "flex items-center px-1.5 py-1 transition-all overflow-hidden relative",
              "hover:bg-gray-700/30",
              isSelected && !props.isSharedView ? "bg-primary/20 ring-1 ring-primary/70 rounded-md" : "",
              isDraggable && "cursor-grab",
              isDragging && "opacity-50 bg-primary/30",
              isDragOver && "border-t-2 border-accent"
            )}
            draggable={isDraggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onClick}
          >
            {isDraggable && <GripVertical className="h-4 w-4 text-gray-500 mr-1 flex-shrink-0 cursor-grab" />}
            
            {props.groupDisplayMode === 'single' ? (
                <RadioGroup value={layer.visible ? layer.id : ''} onValueChange={() => props.onToggleVisibility(layer.id, layer.groupId)} className="flex items-center">
                    <RadioGroupItem value={layer.id} id={`vis-${layer.id}`} className="h-3.5 w-3.5" />
                </RadioGroup>
            ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); props.onToggleVisibility(layer.id); }}
                  className="h-6 w-6 text-white hover:bg-gray-600/80 p-0 mr-1 flex-shrink-0"
                  aria-label={`Alternar visibilidad para ${layer.name}`}
                  title={layer.visible ? "Ocultar capa" : "Mostrar capa"}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
            )}

            {isEditing ? (
              <Input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={handleNameChange}
                  onBlur={handleNameSubmit}
                  onKeyDown={handleKeyDown}
                  className="h-6 text-xs p-1 bg-gray-900/80 border-primary focus-visible:ring-primary/50 ml-1"
                  onClick={(e) => e.stopPropagation()} // Prevent list item click handler from firing
                />
            ) : (
              <label
                htmlFor={`vis-${layer.id}`}
                className={cn(
                  "flex-1 cursor-pointer text-xs font-medium truncate min-w-0 select-none",
                  props.groupDisplayMode === 'single' ? 'ml-2' : '',
                  layer.visible ? "text-white" : "text-gray-400"
                )}
                title={layer.name}
                onDoubleClick={handleDoubleClick}
              >
                {layer.name}
              </label>
            )}
            
            <div className="flex items-center space-x-0.5 flex-shrink-0">
              <GoesMetadataTooltip />
            </div>
          </li>
        </ContextMenuTrigger>
        <ContextMenuPortal>
            <ContextMenuContent onOpenAutoFocus={(e) => e.preventDefault()} side="right" align="start" className="bg-gray-700 text-white border-gray-600 w-56">
              <ContextMenuItem
                className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                onSelect={() => props.onZoomToExtent(layer.id)}
              >
                <ZoomIn className="mr-2 h-3.5 w-3.5" />
                Ir a la extensión
              </ContextMenuItem>
            
            {!props.isSharedView ? (
              <>
                <ContextMenuItem
                  className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                  onSelect={handleRenameSelect}
                >
                  <Edit className="mr-2 h-3.5 w-3.5" />
                  Renombrar Capa
                </ContextMenuItem>
        
                {isVectorLayer && (
                  <ContextMenuItem
                      className={cn(
                          "text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer",
                          props.activeTool === 'modify' && "bg-primary/30"
                      )}
                      onSelect={() => props.onToggleEditing('modify')}
                    >
                      <Edit className="mr-2 h-3.5 w-3.5" />
                      {props.activeTool === 'modify' ? 'Dejar de Editar Geometría' : 'Editar Geometría'}
                    </ContextMenuItem>
                )}
        
                <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600">
                        <Palette className="mr-2 h-3.5 w-3.5" />
                        <span>Simbología</span>
                    </ContextMenuSubTrigger>
                    {(isVectorLayer || layer.type === 'geotiff' || layer.type === 'gee') && (
                      <ContextMenuPortal>
                          <ContextMenuSubContent className="bg-gray-700 text-white border-gray-600">
                            {isVectorLayer && (
                              <ContextMenuItem onSelect={(e) => { e.preventDefault(); setIsStyleEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                  <Palette className="mr-2 h-3.5 w-3.5" /> Simple
                              </ContextMenuItem>
                            )}
                            {isVectorLayer && (
                                <ContextMenuItem onSelect={(e) => { e.preventDefault(); setIsCategorizedEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                  <AppWindow className="mr-2 h-3.5 w-3.5" /> Por Categorías
                                </ContextMenuItem>
                            )}
                            <ContextMenuItem onSelect={(e) => { e.preventDefault(); setIsGraduatedEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                              <Waypoints className="mr-2 h-3.5 w-3.5" /> Graduada
                            </ContextMenuItem>
                            {layer.type === 'wfs' && (
                              <>
                                <ContextMenuSeparator className="bg-gray-500/50 my-1" />
                                <ContextMenuCheckboxItem
                                  checked={layer.wmsStyleEnabled}
                                  onSelect={(e) => {
                                      e.preventDefault();
                                      props.onToggleWmsStyle(layer.id);
                                  }}
                                  className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                                >
                                  Usar Estilo del Servidor (WMS)
                                </ContextMenuCheckboxItem>
                              </>
                            )}
                          </ContextMenuSubContent>
                      </ContextMenuPortal>
                    )}
                </ContextMenuSub>
        
        
                {isVectorLayer && (
                  <ContextMenuItem
                      className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                      onSelect={(e) => { e.preventDefault(); setIsLabelEditorOpen(true); }}
                    >
                      <Tags className="mr-2 h-3.5 w-3.5" />
                      Etiquetar
                    </ContextMenuItem>
                )}
        
                {isVectorLayer && (
                  <ContextMenuItem
                    className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                    onSelect={() => props.onShowLayerTable(layer.id)}
                  >
                    <Table2 className="mr-2 h-3.5 w-3.5" />
                    Ver tabla de atributos
                  </ContextMenuItem>
                )}
        
                {isVectorLayer && (
                  <ContextMenuItem
                    className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                    onSelect={() => props.onShowStatistics(layer.id)}
                  >
                    <BarChartHorizontal className="mr-2 h-3.5 w-3.5" />
                    Estadísticas
                  </ContextMenuItem>
                )}
        
                {isVectorLayer && (
                  <ContextMenuSub>
                      <ContextMenuSubTrigger className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600 disabled:opacity-50" disabled={props.allLayers.filter(l => l.type === 'vector' || l.type === 'wfs' || l.type === 'osm' || l.type === 'drawing').length === 0}>
                          <Target className="mr-2 h-3.5 w-3.5" />
                          <span>Seleccionar por Capa</span>
                      </ContextMenuSubTrigger>
                      <ContextMenuPortal>
                          <ContextMenuSubContent className="bg-gray-700 text-white border-gray-600">
                              {props.allLayers.filter((l): l is VectorMapLayer => l.id !== layer.id && l.olLayer instanceof VectorLayer).map(selectorLayer => (
                                  <ContextMenuItem key={selectorLayer.id} onSelect={() => props.onSelectByLayer(layer.id, selectorLayer.id)} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                      {selectorLayer.name}
                                  </ContextMenuItem>
                              ))}
                          </ContextMenuSubContent>
                      </ContextMenuPortal>
                  </ContextMenuSub>
                )}
        
                {(isVectorLayer || layer.type === 'wms' || layer.type === 'geotiff' || layer.type === 'gee') && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600">
                      <Download className="mr-2 h-3.5 w-3.5" />
                      <span>Exportar Capa</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuPortal>
                      <ContextMenuSubContent className="bg-gray-700 text-white border-gray-600">
                        {isVectorLayer && <ContextMenuItem onSelect={() => props.onExportLayer(layer.id, 'geojson')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">GeoJSON</ContextMenuItem>}
                        {isVectorLayer && <ContextMenuItem onSelect={() => props.onExportLayer(layer.id, 'kml')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">KML</ContextMenuItem>}
                        {isVectorLayer && <ContextMenuItem onSelect={() => props.onExportLayer(layer.id, 'shp')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">Shapefile (.zip)</ContextMenuItem>}
                        {(layer.type === 'wms' || layer.type === 'geotiff' || layer.type === 'gee') && <ContextMenuItem onSelect={() => props.onExportWmsAsGeotiff(layer.id)} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">GeoTIFF (Vista Actual)</ContextMenuItem>}
                      </ContextMenuSubContent>
                    </ContextMenuPortal>
                  </ContextMenuSub>
                )}
        
                <ContextMenuSeparator className="bg-gray-500/50" />
        
                {isVectorLayer && (
                  <>
                    <ContextMenuItem
                      className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      onSelect={() => props.onExtractByPolygon(layer.id)}
                      disabled={props.isDrawingSourceEmptyOrNotPolygon}
                    >
                      <Scissors className="mr-2 h-3.5 w-3.5" />
                      <span title={props.isDrawingSourceEmptyOrNotPolygon ? "Dibuje un polígono primero" : `Extraer de ${layer.name} por polígono`}>
                        Extraer por polígono
                      </span>
                    </ContextMenuItem>
                
                    <ContextMenuItem
                      className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      onSelect={() => props.onExtractBySelection()}
                      disabled={props.isSelectionEmpty}
                    >
                      <CopyPlus className="mr-2 h-3.5 w-3.5" />
                      <span title={props.isSelectionEmpty ? "Seleccione una o más entidades primero" : `Crear una nueva capa a partir de la selección actual`}>
                        Crear capa desde selección
                      </span>
                    </ContextMenuItem>
                    <ContextMenuSeparator className="bg-gray-500/50" />
                  </>
                )}
              </>
            ) : null}
            
            <ContextMenuLabel className="text-xs text-gray-300 px-2 py-1 flex items-center">
                <Percent className="mr-2 h-3.5 w-3.5" /> Opacidad: {Math.round(layer.opacity * 100)}%
            </ContextMenuLabel>
            <ContextMenuItem onSelect={(e) => e.preventDefault()} className="focus:bg-transparent hover:bg-transparent cursor-default p-2">
                <Slider
                    defaultValue={[layer.opacity * 100]}
                    max={100}
                    step={1}
                    onValueChange={(value) => props.onSetLayerOpacity(layer.id, value[0] / 100)}
                    className="w-full"
                    aria-label={`Opacidad para ${layer.name}`}
                />
            </ContextMenuItem>
            
            {!props.isSharedView && (
              <>
                <ContextMenuSeparator className="bg-gray-500/50" />
                <ContextMenuItem
                  className="text-xs hover:bg-red-500/30 focus:bg-red-500/40 text-red-300 focus:text-red-200 cursor-pointer"
                  onSelect={() => props.onRemoveLayer(layer.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Eliminar capa
                </ContextMenuItem>
              </>
            )}
            </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
      </TooltipProvider>
      {!props.isSharedView && (
        <>
          {isVectorLayer && (
            <StyleEditorDialog
              isOpen={isStyleEditorOpen}
              onClose={() => setIsStyleEditorOpen(false)}
              onApply={handleStyleChange}
              layerType={(layer.olLayer as VectorLayer<any>).getSource()?.getFeatures()[0]?.getGeometry()?.getType() || 'Point'}
            />
          )}
           {isVectorLayer && (
            <LabelEditorDialog
                isOpen={isLabelEditorOpen}
                onClose={() => setIsLabelEditorOpen(false)}
                onApply={handleLabelChange}
                layer={layer as any}
            />
           )}
           {(isVectorLayer || layer.type === 'geotiff' || layer.type === 'gee') && (
            <GraduatedSymbologyDialog
                isOpen={isGraduatedEditorOpen}
                onClose={() => setIsGraduatedEditorOpen(false)}
                onApply={handleGraduatedSymbologyApply}
                layer={layer}
            />
           )}
           {isVectorLayer && (
            <CategorizedSymbologyDialog
                isOpen={isCategorizedEditorOpen}
                onClose={() => setIsCategorizedEditorOpen(false)}
                onApply={handleCategorizedSymbologyApply}
                layer={layer as any}
            />
           )}
        </>
      )}
    </>
  );
};

export default LayerItem;
