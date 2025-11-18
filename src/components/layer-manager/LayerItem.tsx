

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger, 
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  allLayers: MapLayer[];
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
  
  isDraggable: boolean;
  onDragStart?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnter?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLLIElement>) => void;
  isDragging?: boolean;
  isDragOver?: boolean;

  isSelected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLLIElement>) => void;

  activeTool: InteractionToolId | null;
  onToggleEditing: (tool: InteractionToolId) => void;
  
  isSharedView?: boolean;
  
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

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(layer.name);
  
  const [isStyleEditorOpen, setIsStyleEditorOpen] = useState(false);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);
  const [isGraduatedEditorOpen, setIsGraduatedEditorOpen] = useState(false);
  const [isCategorizedEditorOpen, setIsCategorizedEditorOpen] = useState(false);

  useEffect(() => {
    // Reset editing name when dialog opens
    if (isRenameDialogOpen) {
      setEditingName(layer.name);
    }
  }, [isRenameDialogOpen, layer.name]);

  const handleRenameSubmit = () => {
    if (editingName.trim() && editingName.trim() !== layer.name) {
      onRenameLayer(layer.id, editingName.trim());
    }
    setIsRenameDialogOpen(false);
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
          <li 
            className={cn(
              "flex items-center justify-between px-1.5 py-1 transition-all",
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
            <div className="flex items-center flex-1 min-w-0">
                {isDraggable && <GripVertical className="h-4 w-4 text-gray-500 mr-1 flex-shrink-0 cursor-grab" />}
                    
                {props.groupDisplayMode === 'single' ? (
                    <RadioGroup value={layer.visible ? layer.id : ''} onValueChange={() => props.onToggleVisibility(layer.id, layer.groupId)} className="flex items-center">
                        <RadioGroupItem value={layer.id} id={`vis-${layer.id}`} className="h-3.5 w-3.5 mr-1" />
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

                {!props.isSharedView && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:bg-white/10 mr-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={(e) => e.stopPropagation()} side="right" align="start" sideOffset={240} className="bg-gray-700 text-white border-gray-600 w-56">
                        <DropdownMenuItem onSelect={() => props.onZoomToExtent(layer.id)} className="text-xs">
                          <ZoomIn className="mr-2 h-3.5 w-3.5" /> Ir a la extensión
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsRenameDialogOpen(true); }} className="text-xs">
                          <Edit className="mr-2 h-3.5 w-3.5" /> Renombrar Capa
                        </DropdownMenuItem>
                        
                        {isVectorLayer && (
                            <DropdownMenuItem onSelect={() => props.onToggleEditing('modify')} className={cn("text-xs", props.activeTool === 'modify' && "bg-primary/30")}>
                              <Edit className="mr-2 h-3.5 w-3.5" />{props.activeTool === 'modify' ? 'Dejar de Editar Geometría' : 'Editar Geometría'}
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-xs"><Palette className="mr-2 h-3.5 w-3.5" />Simbología</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                              {isVectorLayer && <DropdownMenuItem onSelect={() => setIsStyleEditorOpen(true)} className="text-xs"><Palette className="mr-2 h-3.5 w-3.5" />Simple</DropdownMenuItem>}
                              {isVectorLayer && <DropdownMenuItem onSelect={() => setIsCategorizedEditorOpen(true)} className="text-xs"><AppWindow className="mr-2 h-3.5 w-3.5" />Por Categorías</DropdownMenuItem>}
                              {(isVectorLayer || layer.type === 'geotiff' || layer.type === 'gee') && <DropdownMenuItem onSelect={() => setIsGraduatedEditorOpen(true)} className="text-xs"><Waypoints className="mr-2 h-3.5 w-3.5" />Graduada</DropdownMenuItem>}
                              {layer.type === 'wfs' && (
                                <>
                                  <DropdownMenuSeparator className="bg-gray-500/50 my-1" />
                                  <DropdownMenuCheckboxItem checked={layer.wmsStyleEnabled} onSelect={(e) => {e.preventDefault(); props.onToggleWmsStyle(layer.id);}} className="text-xs">Usar Estilo del Servidor (WMS)</DropdownMenuCheckboxItem>
                                </>
                              )}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        {isVectorLayer && <DropdownMenuItem onSelect={() => setIsLabelEditorOpen(true)} className="text-xs"><Tags className="mr-2 h-3.5 w-3.5" />Etiquetar</DropdownMenuItem>}
                        {isVectorLayer && <DropdownMenuItem onSelect={() => props.onShowLayerTable(layer.id)} className="text-xs"><Table2 className="mr-2 h-3.5 w-3.5" />Ver tabla de atributos</DropdownMenuItem>}
                        {isVectorLayer && <DropdownMenuItem onSelect={() => props.onShowStatistics(layer.id)} className="text-xs"><BarChartHorizontal className="mr-2 h-3.5 w-3.5" />Estadísticas</DropdownMenuItem>}
                        
                        {isVectorLayer && (
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="text-xs disabled:opacity-50" disabled={props.allLayers.filter(l => l.id !== layer.id && ('olLayer' in l && l.olLayer instanceof VectorLayer)).length === 0}><Target className="mr-2 h-3.5 w-3.5" />Seleccionar por Capa</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                                    {props.allLayers.filter((l): l is VectorMapLayer => l.id !== layer.id && l.olLayer instanceof VectorLayer).map(selectorLayer => (
                                        <DropdownMenuItem key={selectorLayer.id} onSelect={() => props.onSelectByLayer(layer.id, selectorLayer.id)} className="text-xs">{selectorLayer.name}</DropdownMenuItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        )}

                        {(isVectorLayer || layer.type === 'wms' || layer.type === 'geotiff' || layer.type === 'gee') && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="text-xs"><Download className="mr-2 h-3.5 w-3.5" />Exportar Capa</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                              {isVectorLayer && <DropdownMenuItem onSelect={() => props.onExportLayer(layer.id, 'geojson')} className="text-xs">GeoJSON</DropdownMenuItem>}
                              {isVectorLayer && <DropdownMenuItem onSelect={() => props.onExportLayer(layer.id, 'kml')} className="text-xs">KML</DropdownMenuItem>}
                              {isVectorLayer && <DropdownMenuItem onSelect={() => props.onExportLayer(layer.id, 'shp')} className="text-xs">Shapefile (.zip)</DropdownMenuItem>}
                              {(layer.type === 'wms' || layer.type === 'geotiff' || layer.type === 'gee') && <DropdownMenuItem onSelect={() => props.onExportWmsAsGeotiff(layer.id)} className="text-xs">GeoTIFF (Vista Actual)</DropdownMenuItem>}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}

                        {isVectorLayer && <DropdownMenuSeparator className="bg-gray-500/50" />}

                        {isVectorLayer && (
                          <>
                            <DropdownMenuItem onSelect={() => props.onExtractByPolygon(layer.id)} disabled={props.isDrawingSourceEmptyOrNotPolygon} className="text-xs disabled:opacity-50"><Scissors className="mr-2 h-3.5 w-3.5" />Extraer por polígono</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => props.onExtractBySelection()} disabled={props.isSelectionEmpty} className="text-xs disabled:opacity-50"><CopyPlus className="mr-2 h-3.5 w-3.5" />Crear capa desde selección</DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-gray-500/50" />
                          </>
                        )}

                        <DropdownMenuLabel className="text-xs text-gray-300 px-2 py-1 flex items-center"><Percent className="mr-2 h-3.5 w-3.5" />Opacidad: {Math.round(layer.opacity * 100)}%</DropdownMenuLabel>
                        <div className="p-2"><Slider defaultValue={[layer.opacity * 100]} max={100} step={1} onValueChange={(value) => props.onSetLayerOpacity(layer.id, value[0] / 100)} className="w-full" /></div>
                        
                        <DropdownMenuSeparator className="bg-gray-500/50" />
                        <DropdownMenuItem onSelect={() => props.onRemoveLayer(layer.id)} className="text-xs text-red-300 focus:bg-red-500/40 focus:text-red-200"><Trash2 className="mr-2 h-3.5 w-3.5" />Eliminar capa</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}


                <label
                    htmlFor={`vis-${layer.id}`}
                    className={cn(
                        "cursor-pointer text-xs font-medium truncate select-none block",
                        layer.visible ? "text-white" : "text-gray-400"
                    )}
                    title={layer.name}
                >
                    {layer.name}
                </label>
                
                <div className="flex-grow"></div>
                <GoesMetadataTooltip />
            </div>
          </li>
      </TooltipProvider>

      {!props.isSharedView && (
        <>
            <AlertDialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
              <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                <AlertDialogHeader><AlertDialogTitle>Renombrar Capa</AlertDialogTitle><AlertDialogDescription>Ingrese el nuevo nombre para la capa "{layer.name}".</AlertDialogDescription></AlertDialogHeader>
                <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()} autoFocus/>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleRenameSubmit}>Guardar</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {isVectorLayer && (<StyleEditorDialog isOpen={isStyleEditorOpen} onClose={() => setIsStyleEditorOpen(false)} onApply={handleStyleChange} layerType={(layer.olLayer as VectorLayer<any>).getSource()?.getFeatures()[0]?.getGeometry()?.getType() || 'Point'}/>)}
            {isVectorLayer && (<LabelEditorDialog isOpen={isLabelEditorOpen} onClose={() => setIsLabelEditorOpen(false)} onApply={handleLabelChange} layer={layer as any}/>)}
            {(isVectorLayer || layer.type === 'geotiff' || layer.type === 'gee') && (<GraduatedSymbologyDialog isOpen={isGraduatedEditorOpen} onClose={() => setIsGraduatedEditorOpen(false)} onApply={handleGraduatedSymbologyApply} layer={layer}/>)}
            {isVectorLayer && (<CategorizedSymbologyDialog isOpen={isCategorizedEditorOpen} onClose={() => setIsCategorizedEditorOpen(false)} onApply={handleCategorizedSymbologyApply} layer={layer as any}/>)}
        </>
      )}
    </>
  );
};

export default LayerItem;

    






    