
"use client";

import React, { useState } from 'react';
import LayerItem from './LayerItem';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger, 
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Edit, GripVertical, Layers, Trash2, Ungroup, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapLayer, LayerGroup, LabelOptions, GraduatedSymbology, CategorizedSymbology, GeoTiffStyle, InteractionToolId } from '@/lib/types';
import type { StyleOptions } from './StyleEditorDialog';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';


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
    ...layerItemProps
}) => {

    const [isEditingName, setIsEditingName] = useState(false);
    const [editingName, setEditingName] = useState(group.name);

    const handleNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingName.trim() && editingName.trim() !== group.name) {
            onRenameGroup(group.id, editingName.trim());
        }
        setIsEditingName(false);
    };

    const isSelected = selectedItemIds.includes(group.id);

    return (
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
            <AccordionTrigger className="p-1.5 hover:no-underline hover:bg-gray-700/50 rounded-t-md data-[state=open]:rounded-b-none">
              <div className="flex items-center gap-2 w-full">
                {isDraggable && <GripVertical className="h-4 w-4 text-gray-500 cursor-grab flex-shrink-0" />}
                <Layers className="h-4 w-4 text-primary" />
                {isEditingName ? (
                    <form onSubmit={handleNameSubmit} className="flex-1">
                        <Input 
                            value={editingName} 
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            autoFocus
                            className="h-6 text-xs bg-black/50"
                            onClick={(e) => e.stopPropagation()} // Prevent accordion from toggling
                        />
                    </form>
                ) : (
                    <span className="text-xs font-semibold truncate flex-1 text-left" title={group.name}>{group.name}</span>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={(e) => e.stopPropagation()}>
                            <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={(e) => e.stopPropagation()} side="right" align="start" className="bg-gray-700 text-white border-gray-600">
                        <DropdownMenuItem onSelect={() => setIsEditingName(true)} className="text-xs">
                           <Edit className="mr-2 h-3.5 w-3.5" /> Renombrar Grupo
                        </DropdownMenuItem>
                         <DropdownMenuSeparator className="bg-gray-500/50" />
                         <DropdownMenuLabel className="text-xs px-2 py-1">Modo de Visibilidad</DropdownMenuLabel>
                         <DropdownMenuRadioGroup value={group.displayMode} onValueChange={(mode) => onSetGroupDisplayMode(group.id, mode as 'single' | 'multiple')}>
                            <DropdownMenuRadioItem value="multiple" className="text-xs">Múltiple (Checkboxes)</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="single" className="text-xs">Única (Radio Buttons)</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator className="bg-gray-500/50" />
                        <DropdownMenuItem onSelect={() => onUngroup(group.id)} className="text-xs">
                           <Ungroup className="mr-2 h-3.5 w-3.5" /> Desagrupar
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => layerItemProps.onRemoveLayer(group.id)} className="text-xs text-red-300 focus:bg-red-500/40 focus:text-red-200">
                           <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar Grupo
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </AccordionTrigger>
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
                    onDragStart={undefined} // Prevent dragging of individual items in group for now
                    isDraggable={false}
                  />
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </li>
    );
};

export default LayerGroupItem;
