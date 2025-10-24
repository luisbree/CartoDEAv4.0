

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
  DropdownMenuPortal,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider"; 
import { Eye, EyeOff, Settings2, ZoomIn, Table2, Trash2, Scissors, Percent, GripVertical, CopyPlus, Download, Edit, Palette, Tags, Waypoints, AppWindow, BarChartHorizontal, Target, Image as ImageIcon, Info } from 'lucide-react';
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


interface LayerItemProps {
  layer: MapLayer;
  allLayers: MapLayer[]; // For the "Select by Layer" submenu
  onToggleVisibility: (layerId: string) => void;
  onZoomToExtent: (layerId: string) => void;
  onShowLayerTable: (layerId: string) => void;
  onShowStatistics: (layerId: string) => void;
  onRemove: (layerId: string) => void;
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
  onApplyGeoTiffStyle: (layerId: string, symbology: GeoTiffStyle) => void;
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
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  allLayers,
  onToggleVisibility,
  onZoomToExtent,
  onShowLayerTable,
  onShowStatistics,
  onRemove,
  onExtractByPolygon,
  onExtractBySelection,
  onSelectByLayer,
  onExportLayer,
  onExportWmsAsGeotiff,
  onRenameLayer,
  onChangeLayerStyle,
  onChangeLayerLabels,
  onApplyGraduatedSymbology,
  onApplyCategorizedSymbology,
  onApplyGeoTiffStyle,
  onToggleWmsStyle,
  isDrawingSourceEmptyOrNotPolygon,
  isSelectionEmpty,
  onSetLayerOpacity,
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
  activeTool,
  onToggleEditing,
  isSharedView = false,
}) => {
  const isVectorLayer = layer.olLayer instanceof VectorLayer;
  const isWfsLayer = layer.type === 'wfs';
  const isGeoTiffLayer = layer.type === 'geotiff' || layer.type === 'gee';
  const isGoesLayer = isGeoTiffLayer && layer.olLayer.get('geeParams')?.bandCombination === 'GOES_CLOUDTOP';
  const isWmsLayer = layer.type === 'wms';
  const currentOpacityPercentage = Math.round(layer.opacity * 100);

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(layer.name);
  const [isStyleEditorOpen, setIsStyleEditorOpen] = useState(false);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);
  const [isGraduatedEditorOpen, setIsGraduatedEditorOpen] = useState(false);
  const [isCategorizedEditorOpen, setIsCategorizedEditorOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const polygonLayersForSelection = allLayers.filter(
    (l): l is VectorMapLayer =>
      l.id !== layer.id &&
      l.olLayer instanceof VectorLayer &&
      l.olLayer.getSource()?.getFeatures().some(f => {
        const geomType = f.getGeometry()?.getType();
        return geomType === 'Polygon' || geomType === 'MultiPolygon';
      })
  );

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
    if (isSharedView) return;
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
    onChangeLayerStyle(layer.id, styleOptions);
    setIsStyleEditorOpen(false);
    setIsDropdownOpen(false); // Close the main dropdown menu
  };
  
  const handleLabelChange = (labelOptions: LabelOptions) => {
    onChangeLayerLabels(layer.id, labelOptions);
    setIsLabelEditorOpen(false);
    setIsDropdownOpen(false);
  };

  const handleGraduatedSymbologyApply = (symbology: GraduatedSymbology) => {
    if (isGeoTiffLayer) {
        onApplyGeoTiffStyle(layer.id, symbology as GeoTiffStyle);
    } else {
        onApplyGraduatedSymbology(layer.id, symbology);
    }
    setIsGraduatedEditorOpen(false);
    setIsDropdownOpen(false);
  };
  
  const handleCategorizedSymbologyApply = (symbology: CategorizedSymbology) => {
    onApplyCategorizedSymbology(layer.id, symbology);
    setIsCategorizedEditorOpen(false);
    setIsDropdownOpen(false);
  };
  
  const GoesMetadataTooltip = () => {
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
          "flex items-center px-1.5 py-1 transition-all overflow-hidden relative",
          "hover:bg-gray-700/30",
          isSelected && !isSharedView ? "bg-primary/20 ring-1 ring-primary/70 rounded-md" : "",
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
        
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
          className="h-6 w-6 text-white hover:bg-gray-600/80 p-0 mr-2 flex-shrink-0"
          aria-label={`Alternar visibilidad para ${layer.name}`}
          title={layer.visible ? "Ocultar capa" : "Mostrar capa"}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>

        {isEditing ? (
          <Input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={handleNameChange}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              className="h-6 text-xs p-1 bg-gray-900/80 border-primary focus-visible:ring-primary/50"
              onClick={(e) => e.stopPropagation()} // Prevent list item click handler from firing
            />
        ) : (
          <span
            className={cn(
              "flex-1 cursor-pointer text-xs font-medium truncate min-w-0 select-none",
              layer.visible ? "text-white" : "text-gray-400"
            )}
            title={layer.name}
            onDoubleClick={handleDoubleClick}
          >
            {layer.name}
          </span>
        )}
        
        <div className="flex items-center space-x-0.5 flex-shrink-0">
          <GoesMetadataTooltip />
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-gray-600/80 p-0"
                aria-label={`Acciones para ${layer.name}`}
                title="Más acciones"
                onClick={(e) => e.stopPropagation()}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="bg-gray-700 text-white border-gray-600 w-56">
                <DropdownMenuItem
                  className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                  onSelect={() => onZoomToExtent(layer.id)}
                >
                  <ZoomIn className="mr-2 h-3.5 w-3.5" />
                  Ir a la extensión
                </DropdownMenuItem>
              
              {!isSharedView ? (
                <>
                  <DropdownMenuItem
                    className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                    onSelect={handleRenameSelect}
                  >
                    <Edit className="mr-2 h-3.5 w-3.5" />
                    Renombrar Capa
                  </DropdownMenuItem>

                  {isVectorLayer && (
                    <DropdownMenuItem
                        className={cn(
                            "text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer",
                            activeTool === 'modify' && "bg-primary/30"
                        )}
                        onSelect={() => onToggleEditing('modify')}
                      >
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        {activeTool === 'modify' ? 'Dejar de Editar Geometría' : 'Editar Geometría'}
                      </DropdownMenuItem>
                  )}

                  <DropdownMenuSub>
                      <DropdownMenuSubTrigger 
                        className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600"
                        disabled={isGoesLayer}
                      >
                          <Palette className="mr-2 h-3.5 w-3.5" />
                          <span>Simbología</span>
                      </DropdownMenuSubTrigger>
                      {(isVectorLayer || isGeoTiffLayer) && !isGoesLayer && (
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                             {isVectorLayer && (
                               <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsStyleEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                  <Palette className="mr-2 h-3.5 w-3.5" /> Simple
                               </DropdownMenuItem>
                             )}
                             {isVectorLayer && (
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsCategorizedEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                  <AppWindow className="mr-2 h-3.5 w-3.5" /> Por Categorías
                                </DropdownMenuItem>
                             )}
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsGraduatedEditorOpen(true); }} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                              <Waypoints className="mr-2 h-3.5 w-3.5" /> Graduada
                            </DropdownMenuItem>
                            {isVectorLayer && (
                              <>
                                <DropdownMenuSeparator className="bg-gray-500/50 my-1" />
                                <DropdownMenuCheckboxItem
                                  checked={layer.wmsStyleEnabled}
                                  onSelect={(e) => {
                                      e.preventDefault();
                                      onToggleWmsStyle(layer.id);
                                  }}
                                  disabled={!isWfsLayer}
                                  className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Usar Estilo del Servidor (WMS)
                                </DropdownMenuCheckboxItem>
                              </>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      )}
                  </DropdownMenuSub>


                  {isVectorLayer && (
                    <DropdownMenuItem
                        className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                        onSelect={(e) => { e.preventDefault(); setIsLabelEditorOpen(true); }}
                      >
                        <Tags className="mr-2 h-3.5 w-3.5" />
                        Etiquetar
                      </DropdownMenuItem>
                  )}

                  {isVectorLayer && (
                    <DropdownMenuItem
                      className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                      onSelect={() => onShowLayerTable(layer.id)}
                    >
                      <Table2 className="mr-2 h-3.5 w-3.5" />
                      Ver tabla de atributos
                    </DropdownMenuItem>
                  )}

                  {isVectorLayer && (
                    <DropdownMenuItem
                      className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer"
                      onSelect={() => onShowStatistics(layer.id)}
                    >
                      <BarChartHorizontal className="mr-2 h-3.5 w-3.5" />
                      Estadísticas
                    </DropdownMenuItem>
                  )}

                  {isVectorLayer && (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600 disabled:opacity-50" disabled={polygonLayersForSelection.length === 0}>
                            <Target className="mr-2 h-3.5 w-3.5" />
                            <span>Seleccionar por Capa</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                                {polygonLayersForSelection.map(selectorLayer => (
                                    <DropdownMenuItem key={selectorLayer.id} onSelect={() => onSelectByLayer(layer.id, selectorLayer.id)} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                        {selectorLayer.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                  )}

                  {(isVectorLayer || isWmsLayer || isGeoTiffLayer) && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer data-[state=open]:bg-gray-600">
                        <Download className="mr-2 h-3.5 w-3.5" />
                        <span>Exportar Capa</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="bg-gray-700 text-white border-gray-600">
                          {isVectorLayer && <DropdownMenuItem onSelect={() => onExportLayer(layer.id, 'geojson')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">GeoJSON</DropdownMenuItem>}
                          {isVectorLayer && <DropdownMenuItem onSelect={() => onExportLayer(layer.id, 'kml')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">KML</DropdownMenuItem>}
                          {isVectorLayer && <DropdownMenuItem onSelect={() => onExportLayer(layer.id, 'shp')} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">Shapefile (.zip)</DropdownMenuItem>}
                          {(isWmsLayer || isGeoTiffLayer) && <DropdownMenuItem onSelect={() => onExportWmsAsGeotiff(layer.id)} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">GeoTIFF (Vista Actual)</DropdownMenuItem>}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  )}

                  <DropdownMenuSeparator className="bg-gray-500/50" />

                  {isVectorLayer && (
                    <>
                      <DropdownMenuItem
                        className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        onSelect={() => onExtractByPolygon(layer.id)}
                        disabled={isDrawingSourceEmptyOrNotPolygon}
                      >
                        <Scissors className="mr-2 h-3.5 w-3.5" />
                        <span title={isDrawingSourceEmptyOrNotPolygon ? "Dibuje un polígono primero" : `Extraer de ${layer.name} por polígono`}>
                          Extraer por polígono
                        </span>
                      </DropdownMenuItem>
                  
                      <DropdownMenuItem
                        className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        onSelect={() => onExtractBySelection()}
                        disabled={isSelectionEmpty}
                      >
                        <CopyPlus className="mr-2 h-3.5 w-3.5" />
                        <span title={isSelectionEmpty ? "Seleccione una o más entidades primero" : `Crear una nueva capa a partir de la selección actual`}>
                          Crear capa desde selección
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-gray-500/50" />
                    </>
                  )}
                </>
              ) : null}
              
              <DropdownMenuLabel className="text-xs text-gray-300 px-2 py-1 flex items-center">
                  <Percent className="mr-2 h-3.5 w-3.5" /> Opacidad: {currentOpacityPercentage}%
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="focus:bg-transparent hover:bg-transparent cursor-default p-2">
                  <Slider
                      defaultValue={[currentOpacityPercentage]}
                      max={100}
                      step={1}
                      onValueChange={(value) => onSetLayerOpacity(layer.id, value[0] / 100)}
                      className="w-full"
                      aria-label={`Opacidad para ${layer.name}`}
                  />
              </DropdownMenuItem>
              
              {!isSharedView && (
                <>
                  <DropdownMenuSeparator className="bg-gray-500/50" />
                  <DropdownMenuItem
                    className="text-xs hover:bg-red-500/30 focus:bg-red-500/40 text-red-300 focus:text-red-200 cursor-pointer"
                    onSelect={() => onRemove(layer.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar capa
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
      </TooltipProvider>
      {!isSharedView && (
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
           {(isVectorLayer || isGeoTiffLayer) && (
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


    