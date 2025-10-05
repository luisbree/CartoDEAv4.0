
"use client";

import React, { useRef, useState } from 'react';
import LayerItem from './LayerItem';
import type { CategorizedSymbology, GraduatedSymbology, InteractionToolId, LabelOptions, MapLayer } from '@/lib/types';
import { Layers } from 'lucide-react';
import type { StyleOptions } from './StyleEditorDialog';

interface LayerListProps {
  layers: MapLayer[];
  onToggleVisibility: (layerId: string) => void;
  onZoomToExtent: (layerId: string) => void; 
  onShowLayerTable: (layerId: string) => void;
  onShowStatistics: (layerId: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onExtractByPolygon: (layerId: string) => void;
  onExtractBySelection: () => void;
  onSelectByLayer: (targetLayerId: string, selectorLayerId: string) => void;
  onExportLayer: (layerId: string, format: 'geojson' | 'kml' | 'shp') => void;
  isDrawingSourceEmptyOrNotPolygon: boolean;
  isSelectionEmpty: boolean;
  onSetLayerOpacity: (layerId: string, opacity: number) => void;
  onReorderLayers?: (draggedIds: string[], targetId: string | null) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onChangeLayerStyle: (layerId: string, styleOptions: StyleOptions) => void;
  onChangeLayerLabels: (layerId: string, labelOptions: LabelOptions) => void;
  onApplyGraduatedSymbology: (layerId: string, symbology: GraduatedSymbology) => void;
  onApplyCategorizedSymbology: (layerId: string, symbology: CategorizedSymbology) => void;
  onToggleWmsStyle: (layerId: string) => void;

  // Selection props
  selectedLayerIds: string[];
  onLayerClick: (index: number, event: React.MouseEvent<HTMLLIElement>) => void;

  // Editing props
  activeTool: InteractionToolId | null;
  onToggleEditing: (tool: InteractionToolId) => void;
  
  isSharedView?: boolean;
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
  isDrawingSourceEmptyOrNotPolygon,
  isSelectionEmpty,
  onSetLayerOpacity,
  onReorderLayers,
  onRenameLayer,
  onChangeLayerStyle,
  onChangeLayerLabels,
  onApplyGraduatedSymbology,
  onApplyCategorizedSymbology,
  onToggleWmsStyle,
  selectedLayerIds,
  onLayerClick,
  activeTool,
  onToggleEditing,
  isSharedView = false,
}) => {
  const dragItemIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
      dragItemIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLIElement>, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault();
      setDragOverIndex(null);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLLIElement>, dropIndex: number) => {
    e.preventDefault();
    if (dragItemIndex.current === null || !onReorderLayers) return;

    const draggedItem = layers[dragItemIndex.current];
    const dropTargetItem = layers[dropIndex];
    
    const isMultiDrag = selectedLayerIds.includes(draggedItem.id);
    const draggedIds = isMultiDrag ? selectedLayerIds : [draggedItem.id];

    if (draggedIds.includes(dropTargetItem.id)) {
        dragItemIndex.current = null;
        setDragOverIndex(null);
        return;
    }
    
    onReorderLayers(draggedIds, dropTargetItem.id);
  
    dragItemIndex.current = null;
    setDragOverIndex(null);
  };
  
  const handleDragEnd = (e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault();
      dragItemIndex.current = null;
      setDragOverIndex(null);
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
      {layers.map((layer, index) => (
        <LayerItem
          key={layer.id}
          layer={layer}
          allLayers={layers}
          onToggleVisibility={onToggleVisibility}
          onZoomToExtent={onZoomToExtent}
          onShowLayerTable={onShowLayerTable}
          onShowStatistics={onShowStatistics}
          onRemove={onRemoveLayer}
          onExtractByPolygon={onExtractByPolygon}
          onExtractBySelection={onExtractBySelection}
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
          isDraggable={!isSharedView} // Dragging is disabled in shared view
          onDragStart={(e) => handleDragStart(e, index)}
          onDragEnter={(e) => handleDragEnter(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          isDragging={dragItemIndex.current === index}
          isDragOver={dragOverIndex === index}
          isSelected={selectedLayerIds.includes(layer.id)}
          onClick={(e) => onLayerClick(index, e)}
          activeTool={activeTool}
          onToggleEditing={onToggleEditing}
          isSharedView={isSharedView}
        />
      ))}
    </ul>
  );
};

export default LayerList;

    