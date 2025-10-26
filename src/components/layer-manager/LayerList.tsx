

"use client";

import React, { useRef, useState } from 'react';
import LayerItem from './LayerItem';
import LayerGroupItem from './LayerGroupItem';
import type { CategorizedSymbology, GeoTiffStyle, GraduatedSymbology, InteractionToolId, LabelOptions, MapLayer, LayerGroup } from '@/lib/types';
import { Layers } from 'lucide-react';
import type { StyleOptions } from './StyleEditorDialog';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';


interface LayerListProps {
  layers: (MapLayer | LayerGroup)[]; // The list can contain layers or groups
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
  isDrawingSourceEmptyOrNotPolygon: boolean;
  isSelectionEmpty: boolean;
  onSetLayerOpacity: (layerId: string, opacity: number) => void;
  onReorderLayers?: (draggedIds: string[], targetId: string | null) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onChangeLayerStyle: (layerId: string, styleOptions: StyleOptions) => void;
  onChangeLayerLabels: (layerId: string, labelOptions: LabelOptions) => void;
  onApplyGraduatedSymbology: (layerId: string, symbology: GraduatedSymbology) => void;
  onApplyCategorizedSymbology: (layerId: string, symbology: CategorizedSymbology) => void;
  onApplyGeoTiffStyle: (layerId: string, style: GeoTiffStyle) => void;
  onToggleWmsStyle: (layerId: string) => void;

  // Selection props
  selectedItemIds: string[]; // Can be layer or group IDs
  onItemClick: (itemId: string, itemType: 'layer' | 'group', event: React.MouseEvent<HTMLLIElement>) => void;

  // Editing props
  activeTool: InteractionToolId | null;
  onToggleEditing: (tool: InteractionToolId) => void;
  
  isSharedView?: boolean;

  // Group props
  onToggleGroupExpanded: (groupId: string) => void;
  onSetGroupDisplayMode: (groupId: string, mode: 'single' | 'multiple') => void;
  onUngroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  
  allLayersForSelection: MapLayer[];
  selectedFeaturesForSelection: Feature<Geometry>[];
}

const LayerList: React.FC<LayerListProps> = ({
  layers,
  onToggleVisibility,
  onZoomToExtent, 
  onShowLayerTable,
  onShowStatistics,
  onRemoveLayer,
  onExtractByPolygon,
  onExtractBySelection,
  onSelectByLayer,
  onExportLayer,
  onExportWmsAsGeotiff,
  isDrawingSourceEmptyOrNotPolygon,
  isSelectionEmpty,
  onSetLayerOpacity,
  onReorderLayers,
  onRenameLayer,
  onChangeLayerStyle,
  onChangeLayerLabels,
  onApplyGraduatedSymbology,
  onApplyCategorizedSymbology,
  onApplyGeoTiffStyle,
  onToggleWmsStyle,
  selectedItemIds,
  onItemClick,
  activeTool,
  onToggleEditing,
  isSharedView = false,
  onToggleGroupExpanded,
  onSetGroupDisplayMode,
  onUngroup,
  onRenameGroup,
  allLayersForSelection,
  selectedFeaturesForSelection,
}) => {
  const dragItemId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, id: string) => {
      dragItemId.current = id;
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, id: string) => {
      e.preventDefault();
      setDragOverId(id);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault();
      setDragOverId(null);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLLIElement>, dropId: string) => {
    e.preventDefault();
    if (dragItemId.current === null || !onReorderLayers) return;

    const isMultiDrag = selectedItemIds.includes(dragItemId.current);
    const draggedIds = isMultiDrag ? selectedItemIds : [dragItemId.current];

    if (draggedIds.includes(dropId)) {
        dragItemId.current = null;
        setDragOverId(null);
        return;
    }
    
    onReorderLayers(draggedIds, dropId);
  
    dragItemId.current = null;
    setDragOverId(null);
  };
  
  const handleDragEnd = (e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault();
      dragItemId.current = null;
      setDragOverId(null);
  };

  if (layers.length === 0) {
    return (
      <div className="text-center py-6 px-3 border border-dashed border-white/10 rounded-md">
        <Layers className="mx-auto h-10 w-10 text-gray-400/40" />
        <p className="mt-1.5 text-xs text-gray-300/90">
            {isSharedView ? "No hay capas compartidas." : "No hay capas cargadas."}
        </p>
        {!isSharedView && <p className="text-xs text-gray-400/70">Use el botón "Importar" para añadir.</p>}
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {layers.map((item, index) => {
        if ('layers' in item) { // It's a LayerGroup
            return (
                <LayerGroupItem
                    key={item.id}
                    group={item}
                    allLayers={allLayersForSelection}
                    onToggleVisibility={onToggleVisibility}
                    onZoomToExtent={onZoomToExtent}
                    onShowLayerTable={onShowLayerTable}
                    onShowStatistics={onShowStatistics}
                    onRemoveLayer={onRemoveLayer}
                    onExtractByPolygon={onExtractByPolygon}
                    onExtractBySelection={onExtractBySelection}
                    onSelectByLayer={onSelectByLayer}
                    onExportLayer={onExportLayer}
                    onExportWmsAsGeotiff={onExportWmsAsGeotiff}
                    onRenameLayer={onRenameLayer}
                    onChangeLayerStyle={onChangeLayerStyle}
                    onChangeLayerLabels={onChangeLayerLabels}
                    onApplyGraduatedSymbology={onApplyGraduatedSymbology}
                    onApplyCategorizedSymbology={onApplyCategorizedSymbology}
                    onApplyGeoTiffStyle={onApplyGeoTiffStyle}
                    onToggleWmsStyle={onToggleWmsStyle}
                    isDrawingSourceEmptyOrNotPolygon={isDrawingSourceEmptyOrNotPolygon}
                    isSelectionEmpty={isSelectionEmpty}
                    onSetLayerOpacity={onSetLayerOpacity}
                    onReorderLayers={onReorderLayers}
                    selectedItemIds={selectedItemIds}
                    onItemClick={(childId, childType, e) => onItemClick(childId, childType, e)}
                    activeTool={activeTool}
                    onToggleEditing={onToggleEditing}
                    isSharedView={isSharedView}
                    onToggleGroupExpanded={onToggleGroupExpanded}
                    onSetGroupDisplayMode={onSetGroupDisplayMode}
                    onUngroup={onUngroup}
                    onRenameGroup={onRenameGroup}
                    selectedFeaturesForSelection={selectedFeaturesForSelection}
                    // Drag and Drop for the group itself
                    isDraggable={!isSharedView}
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragEnter={(e) => handleDragEnter(e, item.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    isDragging={dragItemId.current === item.id}
                    isDragOver={dragOverId === item.id}
                />
            );
        } else { // It's a MapLayer
          return (
            <LayerItem
              key={item.id}
              layer={item}
              allLayers={allLayersForSelection}
              onToggleVisibility={onToggleVisibility}
              onZoomToExtent={onZoomToExtent}
              onShowLayerTable={onShowLayerTable}
              onShowStatistics={onShowStatistics}
              onRemove={onRemoveLayer}
              onExtractByPolygon={onExtractByPolygon}
              onExtractBySelection={onExtractBySelection}
              onSelectByLayer={onSelectByLayer}
              onExportLayer={onExportLayer}
              onExportWmsAsGeotiff={onExportWmsAsGeotiff}
              onRenameLayer={onRenameLayer}
              onChangeLayerStyle={onChangeLayerStyle}
              onChangeLayerLabels={onChangeLayerLabels}
              onApplyGraduatedSymbology={onApplyGraduatedSymbology}
              onApplyCategorizedSymbology={onApplyCategorizedSymbology}
              onApplyGeoTiffStyle={onApplyGeoTiffStyle}
              onToggleWmsStyle={onToggleWmsStyle}
              isDrawingSourceEmptyOrNotPolygon={isDrawingSourceEmptyOrNotPolygon}
              isSelectionEmpty={isSelectionEmpty}
              onSetLayerOpacity={onSetLayerOpacity}
              isDraggable={!isSharedView}
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragEnter={(e) => handleDragEnter(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              isDragging={dragItemId.current === item.id}
              isDragOver={dragOverId === item.id}
              isSelected={selectedItemIds.includes(item.id)}
              onClick={(e) => onItemClick(item.id, 'layer', e)}
              activeTool={activeTool}
              onToggleEditing={onToggleEditing}
              isSharedView={isSharedView}
              selectedFeaturesForSelection={selectedFeaturesForSelection}
            />
          );
        }
      })}
    </ul>
  );
};

export default LayerList;
