

"use client";

import React, { useState } from 'react';
import LayerItem from './LayerItem';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '../ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger, 
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Edit, GripVertical, Layers, Trash2, Ungroup, Settings2, Play, Pause, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapLayer, LayerGroup, LabelOptions, GraduatedSymbology, CategorizedSymbology, GeoTiffStyle, InteractionToolId } from '@/lib/types';
import type { StyleOptions } from './StyleEditorDialog';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';


interface LayerGroupItemProps {
    group: LayerGroup;
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
    onReorderLayers?: ((draggedIds: string[], targetId: string | null) => void) | undefined;
    selectedItemIds: string[];
    onItemClick: (itemId: string, itemType: 'layer' | 'group', event: React.MouseEvent) => void;
    activeTool: InteractionToolId | null;
    onToggleEditing: (tool: InteractionToolId) => void;
    isSharedView: boolean;
    onToggleGroupExpanded: (groupId: string) => void;
    onSetGroupDisplayMode: (groupId: string, mode: 'single' | 'multiple') => void;
    onUngroup: (groupId: string) => void;
    onRenameGroup: (groupId: string, newName: string) => void;
    onToggleGroupPlayback: (groupId: string) => void;
    onSetGroupPlaySpeed: (groupId: string, speed: number) => void;
    selectedFeaturesForSelection: Feature<Geometry>[];
    isDraggable: boolean;
    onDragStart?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    onDragEnd?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    onDragOver?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    onDragEnter?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    onDragLeave?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    onDrop?: ((e: React.DragEvent<HTMLLIElement>) => void) | undefined;
    isDragging?: boolean | undefined;
    isDragOver?: boolean | undefined;
}


const LayerGroupItem: React.FC<LayerGroupItemProps> = ({
    group,
    allLayers,
    isDraggable,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    isDragging,
    isDragOver,
    selectedItemIds,
    onItemClick,
    onToggleGroupExpanded,
    onSetGroupDisplayMode,
    onUngroup,
    onRenameGroup,
    onToggleGroupPlayback,
    onSetGroupPlaySpeed,
    ...layerItemProps
}) => {

    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [editingName, setEditingName] = useState(group.name);

    const handleNameSubmit = () => {
        if (editingName.trim() && editingName.trim() !== group.name) {
            onRenameGroup(group.id, editingName.trim());
        }
        setIsRenameDialogOpen(false);
    };

    const isSelected = selectedItemIds.includes(group.id);

    return (
      <ContextMenu onOpenChange={(open) => { if (!open) setIsRenameDialogOpen(false); }}>
        <ContextMenuTrigger asChild>
          <li
            className={cn(
                "bg-gray-800/30 rounded-md border border-gray-700/60",
                isSelected && !layerItemProps.isSharedView ? "ring-2 ring-primary/80" : "",
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
            onClick={(e) => onItemClick(group.id, 'group', e)}
          >
            <Accordion type="single" value={group.isExpanded ? "group-content" : ""} onValueChange={() => onToggleGroupExpanded(group.id)} collapsible>
              <AccordionItem value="group-content" className="border-b-0">
                 <div className="flex items-center p-1.5 hover:bg-gray-700/50 rounded-t-md data-[state=open]:rounded-b-none">
                    <AccordionTrigger className="p-0 flex-1 hover:no-underline">
                      <div className="flex items-center gap-2 w-full">
                        {isDraggable && <GripVertical className="h-4 w-4 text-gray-500 cursor-grab flex-shrink-0" />}
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold truncate flex-1 text-left" title={group.name}>{group.name}</span>
                      </div>
                    </AccordionTrigger>
                  </div>
                <AccordionContent className="p-1.5 border-t border-gray-700/50">
                  <ul className="space-y-1">
                    {group.layers.map(layer => (
                      <LayerItem 
                        key={layer.id} 
                        layer={layer} 
                        allLayers={allLayers}
                        {...layerItemProps}
                        groupDisplayMode={group.displayMode}
                        isSelected={selectedItemIds.includes(layer.id)}
                        onClick={(e) => onItemClick(layer.id, 'layer', e)}
                        onDragStart={undefined} 
                        isDraggable={false}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </li>
        </ContextMenuTrigger>
        <ContextMenuPortal>
            <ContextMenuContent onClick={(e) => e.stopPropagation()} side="right" align="start" className="bg-gray-700 text-white border-gray-600">
                <AlertDialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <ContextMenuItem onSelect={(e) => { e.preventDefault(); setIsRenameDialogOpen(true); }} className="text-xs">
                       <Edit className="mr-2 h-3.5 w-3.5" /> Renombrar Grupo
                    </ContextMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Renombrar Grupo</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ingrese el nuevo nombre para el grupo "{group.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                      autoFocus
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleNameSubmit}>Guardar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                 <ContextMenuSeparator className="bg-gray-500/50" />
                 <ContextMenuLabel className="text-xs px-2 py-1">Modo de Visibilidad</ContextMenuLabel>
                 <ContextMenuRadioGroup value={group.displayMode} onValueChange={(mode) => onSetGroupDisplayMode(group.id, mode as 'single' | 'multiple')}>
                    <ContextMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
                        <ContextMenuRadioItem value="multiple" className="text-xs w-full">Múltiple (Checkboxes)</ContextMenuRadioItem>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
                        <ContextMenuRadioItem value="single" className="text-xs w-full">Única (Radio Buttons)</ContextMenuRadioItem>
                    </ContextMenuItem>
                </ContextMenuRadioGroup>
                 {group.displayMode === 'single' && (
                    <>
                        <ContextMenuSeparator className="bg-gray-500/50" />
                        <ContextMenuLabel className="text-xs px-2 py-1">Reproductor</ContextMenuLabel>
                        <div className="px-2 py-1 space-y-2">
                            <Button
                                onClick={() => onToggleGroupPlayback(group.id)}
                                variant="outline"
                                className="w-full h-8 text-xs bg-black/20 hover:bg-black/40"
                            >
                                {group.isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                                {group.isPlaying ? 'Pausar' : 'Reproducir'}
                            </Button>
                            <div className="space-y-1 pt-1">
                                <Label htmlFor={`speed-slider-${group.id}`} className="text-xs flex items-center gap-2">
                                    <Clock className="h-3 w-3" />
                                    Velocidad ({group.playSpeed || 1000} ms)
                                </Label>
                                <ContextMenuItem onSelect={e => e.preventDefault()} className="p-0 focus:bg-transparent">
                                    <Slider
                                        id={`speed-slider-${group.id}`}
                                        min={100}
                                        max={5000}
                                        step={100}
                                        value={[group.playSpeed || 1000]}
                                        onValueChange={(value) => onSetGroupPlaySpeed(group.id, value[0])}
                                    />
                                </ContextMenuItem>
                            </div>
                        </div>
                    </>
                 )}
                <ContextMenuSeparator className="bg-gray-500/50" />
                <ContextMenuItem onSelect={() => onUngroup(group.id)} className="text-xs">
                   <Ungroup className="mr-2 h-3.5 w-3.5" /> Desagrupar
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => layerItemProps.onRemoveLayer(group.id)} className="text-xs text-red-300 focus:bg-red-500/40 focus:text-red-200">
                   <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar Grupo
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
    );
};

export default LayerGroupItem;
