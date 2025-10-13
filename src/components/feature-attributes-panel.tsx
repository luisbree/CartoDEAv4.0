
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DraggablePanel from './panels/DraggablePanel'; 
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  AlertDialogPortal,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, ListChecks, Link as LinkIcon, ExternalLink, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlainFeatureData } from '@/lib/types';


interface AttributesPanelComponentProps {
  plainFeatureData: PlainFeatureData[] | null;
  layerId?: string | null; // Added layerId
  layerName?: string | null;
  
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void; 
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;

  // Selection props
  selectedFeatureIds: string[];
  onFeatureSelect: (featureId: string, isCtrlOrMeta: boolean, isShift: boolean) => void;

  // Editing props
  onAttributeChange: (featureId: string, key: string, value: any) => void;
  onAddField: (layerId: string, fieldName: string, defaultValue: any) => void;
  
  // Sorting props
  sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
  onSortChange: (config: { key: string; direction: 'ascending' | 'descending' } | null) => void;
}

const ITEMS_PER_PAGE = 50;
const READ_ONLY_FIELDS = ['id', 'fid', 'gmlgeometry', 'geometry', 'preview_url', 'browser_url', 'description'];

const AttributesPanelComponent: React.FC<AttributesPanelComponentProps> = ({
  plainFeatureData,
  layerId,
  layerName,
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel, 
  onMouseDownHeader,
  style,
  selectedFeatureIds,
  onFeatureSelect,
  onAttributeChange,
  onAddField,
  sortConfig,
  onSortChange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{ featureId: string; key: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldDefaultValue, setNewFieldDefaultValue] = useState('');
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const featureData = useMemo(() => plainFeatureData || [], [plainFeatureData]);

  useEffect(() => {
    if (featureData.length > 0) {
      setCurrentPage(1);
      // Sort config is now managed by the parent
    }
  }, [featureData]);

  useEffect(() => {
    if (editingCell) {
      inputRef.current?.focus();
    }
  }, [editingCell]);


  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    onSortChange({ key, direction });
  };
  
  const handleNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const handlePrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  
  const handleRowClick = useCallback((featureId: string, event: React.MouseEvent) => {
      onFeatureSelect(featureId, event.ctrlKey || event.metaKey, event.shiftKey);
  }, [onFeatureSelect]);

  const handleCellDoubleClick = (featureId: string, key: string, value: any) => {
    if (READ_ONLY_FIELDS.includes(key.toLowerCase())) return;
    setEditingCell({ featureId, key });
    setEditingValue(value);
  };
  
  const handleSaveEdit = () => {
    if (editingCell) {
      onAttributeChange(editingCell.featureId, editingCell.key, editingValue);
      setEditingCell(null);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleAddFieldSubmit = () => {
    if (newFieldName.trim() && layerId) {
        onAddField(layerId, newFieldName.trim(), newFieldDefaultValue);
        setIsAddFieldDialogOpen(false);
        setNewFieldName('');
        setNewFieldDefaultValue('');
    }
  };

  const isValidUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  };

  const hasFeatures = featureData && featureData.length > 0;
  const totalPages = Math.ceil((featureData?.length || 0) / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentVisibleFeatures = featureData?.slice(startIndex, endIndex) || [];

  const allKeys = useMemo(() => Array.from(
    new Set(currentVisibleFeatures.flatMap(item => (item.attributes ? Object.keys(item.attributes) : [])))
  )
  .filter(key => key !== 'gmlgeometry' && key !== 'geometry')
  .sort((a, b) => {
    const order = ['preview_url', 'browser_url']; 
    const aIsSpecial = order.includes(a);
    const bIsSpecial = order.includes(b);

    if (aIsSpecial && bIsSpecial) {
      return order.indexOf(a) - order.indexOf(b);
    }
    if (aIsSpecial) return 1;
    if (bIsSpecial) return -1;
    return a.localeCompare(b);
  }), [currentVisibleFeatures]);


  const panelTitle = layerName && hasFeatures
    ? `Atributos: ${layerName} (${featureData.length})` 
    : 'Atributos';
    
  const addFieldTrigger = hasFeatures ? (
    <AlertDialogTrigger asChild>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-gray-600/80" title="Añadir Campo">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Añadir Campo</span>
      </Button>
    </AlertDialogTrigger>
  ) : null;


  return (
    <DraggablePanel
      title={panelTitle}
      icon={ListChecks}
      panelRef={panelRef}
      initialPosition={{ x:0, y:0}} 
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel} 
      showCloseButton={true}
      initialSize={{ width: 450, height: 350 }} 
      minSize={{ width: 300, height: 250 }}
      style={style} 
      overflowX="auto"
      overflowY="auto"
      zIndex={style?.zIndex as number | undefined}
      headerActions={
        <AlertDialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
          {addFieldTrigger}
          <AlertDialogPortal>
            <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Añadir Nuevo Campo a "{layerName}"</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esto añadirá una nueva columna a todas las entidades de esta capa. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="new-field-name">Nombre del Campo</Label>
                        <Input
                            id="new-field-name"
                            value={newFieldName}
                            onChange={(e) => setNewFieldName(e.target.value)}
                            placeholder="Ej: observacion"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-field-default-value">Valor por Defecto (Opcional)</Label>
                        <Input
                            id="new-field-default-value"
                            value={newFieldDefaultValue}
                            onChange={(e) => setNewFieldDefaultValue(e.target.value)}
                            placeholder="Ej: sin datos"
                        />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAddFieldSubmit} disabled={!newFieldName.trim()}>
                        Añadir Campo
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      }
    >
      <div className="flex-grow flex flex-col h-full"> 
          {hasFeatures && allKeys.length > 0 ? (
            <>
                <div className="flex-grow min-w-0"> 
                  <Table><TableHeader>
                      <TableRow className="hover:bg-gray-800/70">
                        {allKeys.map(key => (
                          <TableHead
                            key={key}
                            className="px-3 py-2 text-xs font-medium text-gray-300 whitespace-nowrap bg-gray-700/50 cursor-pointer hover:bg-gray-600/50"
                            onClick={() => requestSort(key)}
                          >
                            <div className="flex items-center gap-2">
                               {key === 'preview_url' ? 'Vista Previa' : key === 'browser_url' ? 'Navegador' : key}
                               {sortConfig?.key === key && (
                                   sortConfig.direction === 'ascending' 
                                       ? <ArrowUp className="h-3 w-3" /> 
                                       : <ArrowDown className="h-3 w-3" />
                               )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader><TableBody>
                      {currentVisibleFeatures.map((item) => {
                        const featureId = item.id;
                        const isSelected = selectedFeatureIds.includes(featureId);
                        const attrs = item.attributes || {};

                        return (
                          <TableRow 
                            key={featureId}
                            data-state={isSelected ? "selected" : "unselected"}
                            className="cursor-pointer"
                            onClick={(e) => handleRowClick(featureId, e)}
                          >
                            {allKeys.map(key => (
                              <TableCell
                                key={`${featureId}-${key}`}
                                className="px-3 py-1.5 text-xs text-slate-200 dark:text-slate-200 border-b border-gray-700/50 whitespace-normal break-words"
                                onDoubleClick={() => handleCellDoubleClick(featureId, key, attrs[key])}
                              >
                                {editingCell?.featureId === featureId && editingCell?.key === key ? (
                                    <Input
                                        ref={inputRef}
                                        type="text"
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onBlur={handleSaveEdit}
                                        onKeyDown={handleEditKeyDown}
                                        className="h-6 text-xs bg-black/50"
                                    />
                                ) : key === 'preview_url' && attrs[key] && isValidUrl(String(attrs[key])) ? (
                                  <a
                                    href={String(attrs[key])}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline flex items-center"
                                    title={`Abrir vista previa`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <LinkIcon className="h-3 w-3 mr-1" />
                                    Abrir Vista
                                  </a>
                                ) : key === 'browser_url' && attrs[key] && isValidUrl(String(attrs[key])) ? (
                                  <a
                                    href={String(attrs[key])}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-400 hover:text-green-300 underline flex items-center"
                                    title={`Ver escena en el navegador de Copernicus`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Ver en Navegador
                                  </a>
                                ) : (
                                  String(attrs[key] === null || attrs[key] === undefined ? '' : attrs[key])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        )
                      })}
                    </TableBody></Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center p-2 border-t border-gray-700/50 bg-gray-800/50 mt-auto shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="text-xs h-7 bg-gray-600/70 hover:bg-gray-500/70 border-gray-500 text-white"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Anterior
                    </Button>
                    <span className="text-xs text-gray-300 whitespace-nowrap">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className="text-xs h-7 bg-gray-600/70 hover:bg-gray-500/70 border-gray-500 text-white"
                    >
                      Siguiente
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                )}
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center p-3">
                <p className="text-sm text-center text-gray-300">
                    Use la herramienta de inspección para ver los atributos de una entidad.
                </p>
            </div>
          )}
      </div>
    </DraggablePanel>
  );
};

export default AttributesPanelComponent;

    
