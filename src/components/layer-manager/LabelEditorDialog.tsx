
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LabelOptions, LabelPart, VectorMapLayer } from '@/lib/types';
import { Switch } from '../ui/switch';
import { GripVertical, Plus, Trash2, Type, Hash, CornerDownLeft } from 'lucide-react';
import { nanoid } from 'nanoid';


const colorOptions = [
  { value: 'transparent', label: 'Sin color', hex: 'rgba(0,0,0,0)', iconClass: "bg-transparent border border-dashed border-white/50 bg-[conic-gradient(from_90deg_at_1px_1px,#fff_90deg,rgb(228,228,231)_0)]" },
  { value: 'negro', label: 'Negro', hex: '#000000' },
  { value: 'blanco', label: 'Blanco', hex: '#ffffff' },
  { value: 'rojo', label: 'Rojo', hex: '#e63946' },
  { value: 'verde', label: 'Verde', hex: '#2a9d8f' },
  { value: 'azul', label: 'Azul', hex: '#0077b6' },
  { value: 'amarillo', label: 'Amarillo', hex: '#ffbe0b' },
  { value: 'naranja', label: 'Naranja', hex: '#f4a261' },
  { value: 'violeta', label: 'Violeta', hex: '#8338ec' },
  { value: 'gris', label: 'Gris', hex: '#adb5bd' },
];

const fontOptions = [
    { value: "'Encode Sans'", label: 'Encode Sans' },
    { value: "'Encode Sans Condensed'", label: 'Encode Sans Condensed' },
    { value: 'sans-serif', label: 'Sans-Serif (Predet.)' },
    { value: 'serif', label: 'Serif' },
    { value: 'monospace', label: 'Monospace' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Verdana', label: 'Verdana' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman' },
];


const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedColor = colorOptions.find(c => c.value === value) || { hex: isValidHex(value) ? value : '#000000', iconClass: '' };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 w-8 p-0 border-white/30 bg-black/20">
            <div className={cn("w-5 h-5 rounded-full border border-white/20", selectedColor.iconClass)} style={{ backgroundColor: selectedColor.hex }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-auto p-2 bg-gray-700/90 backdrop-blur-sm border-gray-600">
        <div className="grid grid-cols-6 gap-2">
          {colorOptions.map(color => (
            <Button
              key={color.value}
              variant="outline"
              className={cn(
                "h-7 w-7 p-0",
                value === color.value ? "ring-2 ring-offset-2 ring-offset-gray-700 ring-white" : "border-white/30"
              )}
              onClick={() => {
                onChange(color.value);
                setIsOpen(false);
              }}
            >
              <div className={cn("w-5 h-5 rounded-full border border-white/20", color.iconClass)} style={{ backgroundColor: color.hex }} />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};


interface LabelEditorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (options: LabelOptions) => void;
    layer: VectorMapLayer;
}


const LabelEditorDialog: React.FC<LabelEditorDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const [labelOptions, setLabelOptions] = useState<LabelOptions>({
    enabled: false,
    labelParts: [],
    fontSize: 12,
    fontFamily: 'sans-serif',
    textColor: 'negro',
    outlineColor: 'blanco',
    placement: 'horizontal',
    offsetY: 0,
    overflow: false,
  });

  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const attributeFields = useMemo(() => {
    const source = layer?.olLayer.getSource();
    if (!source) return [];
    const features = source.getFeatures();
    if (features.length === 0) return [];
    
    const keys = new Set<string>();
    features.forEach(feature => {
        Object.keys(feature.getProperties()).forEach(key => {
            if (key !== 'geometry') {
                keys.add(key);
            }
        });
    });
    return Array.from(keys).sort();
  }, [layer]);
  
  const layerGeomType = useMemo(() => {
    const source = layer?.olLayer.getSource();
    if (!source) return null;
    const features = source.getFeatures();
    if (features.length === 0) return null;
    return features[0].getGeometry()?.getType() || null;
  }, [layer]);

  const isLineLayer = layerGeomType === 'LineString' || layerGeomType === 'MultiLineString';
  const isPolygonLayer = layerGeomType === 'Polygon' || layerGeomType === 'MultiPolygon';

  useEffect(() => {
    const defaultOptions: LabelOptions = {
        enabled: false,
        labelParts: attributeFields.length > 0 ? [{ id: nanoid(), type: 'field', value: attributeFields[0] }] : [],
        fontSize: 12,
        fontFamily: "'Encode Sans'",
        textColor: 'negro',
        outlineColor: 'blanco',
        placement: 'horizontal',
        offsetY: 0,
        overflow: false,
    };
    
    const existingOptions = layer?.olLayer.get('labelOptions');
    if (existingOptions) {
      setLabelOptions({ ...defaultOptions, ...existingOptions });
    } else {
      setLabelOptions(defaultOptions);
    }
  }, [isOpen, layer, attributeFields]);

  const handleApply = () => { onApply(labelOptions); };
  
  const addLabelPart = (type: 'field' | 'text' | 'newline') => {
    const newPart: LabelPart = {
        id: nanoid(),
        type,
        value: type === 'field' ? (attributeFields[0] || '') : type === 'text' ? ' ' : '\n'
    };
    setLabelOptions(prev => ({ ...prev, labelParts: [...prev.labelParts, newPart] }));
  };

  const updateLabelPart = (id: string, value: string) => {
    setLabelOptions(prev => ({
        ...prev,
        labelParts: prev.labelParts.map(part => part.id === id ? { ...part, value } : part)
    }));
  };

  const removeLabelPart = (id: string) => {
    setLabelOptions(prev => ({
        ...prev,
        labelParts: prev.labelParts.filter(part => part.id !== id)
    }));
  };

  const onDragStart = (e: React.DragEvent<HTMLLIElement>, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const onDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLLIElement>, dropId: string) => {
      e.preventDefault();
      if (!draggedItem) return;
      const draggedIndex = labelOptions.labelParts.findIndex(p => p.id === draggedItem);
      const dropIndex = labelOptions.labelParts.findIndex(p => p.id === dropId);
      
      const newParts = [...labelOptions.labelParts];
      const [removed] = newParts.splice(draggedIndex, 1);
      newParts.splice(dropIndex, 0, removed);

      setLabelOptions(prev => ({...prev, labelParts: newParts}));
      setDraggedItem(null);
  };
  
  const labelPreview = useMemo(() => {
      return labelOptions.labelParts.map(part => {
        if (part.type === 'field') return `{${part.value}}`;
        if (part.type === 'newline') return '↵';
        return part.value;
      }).join('');
  }, [labelOptions.labelParts]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-[550px] p-4">
        <DialogHeader>
          <DialogTitle>Configurar Etiquetas para "{layer.name}"</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 space-y-3">
          <div className="flex items-center space-x-2">
              <Switch
                id="label-enabled"
                checked={labelOptions.enabled}
                onCheckedChange={(checked) => setLabelOptions(prev => ({ ...prev, enabled: checked }))}
              />
              <Label htmlFor="label-enabled">Mostrar Etiquetas</Label>
          </div>
          
          <div className="space-y-2 p-3 border border-white/10 bg-black/10 rounded-md">
            <Label className="text-xs font-semibold">Constructor de Etiqueta</Label>
            <div className="min-h-[100px] bg-black/20 rounded-md p-2">
                <ul className="space-y-1">
                    {labelOptions.labelParts.map(part => (
                        <li 
                           key={part.id} 
                           className="flex items-center gap-2 p-1 bg-gray-700/50 rounded-md"
                           draggable
                           onDragStart={(e) => onDragStart(e, part.id)}
                           onDragOver={onDragOver}
                           onDrop={(e) => onDrop(e, part.id)}
                           >
                            <GripVertical className="h-4 w-4 text-gray-400 cursor-grab flex-shrink-0" />
                            {part.type === 'field' && (
                                <Select value={part.value} onValueChange={(value) => updateLabelPart(part.id, value)}>
                                    <SelectTrigger className="h-7 text-xs flex-grow bg-black/30">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                        {attributeFields.map(field => (
                                            <SelectItem key={field} value={field} className="text-xs">{field}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {part.type === 'text' && (
                                <Input 
                                    value={part.value} 
                                    onChange={(e) => updateLabelPart(part.id, e.target.value)} 
                                    className="h-7 text-xs flex-grow bg-black/30" 
                                    placeholder="Texto..."
                                />
                            )}
                            {part.type === 'newline' && (
                                <div className="flex items-center justify-center flex-grow bg-black/30 rounded-md h-7 text-xs text-gray-400 italic">
                                   <CornerDownLeft className="h-3 w-3 mr-2"/> Salto de Línea
                                </div>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeLabelPart(part.id)} className="h-6 w-6 hover:bg-red-500/30 text-red-300">
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => addLabelPart('field')} className="h-7 text-xs"><Hash className="mr-1.5 h-3.5 w-3.5" />Añadir Campo</Button>
                <Button size="sm" onClick={() => addLabelPart('text')} className="h-7 text-xs"><Type className="mr-1.5 h-3.5 w-3.5" />Añadir Texto</Button>
                <Button size="sm" onClick={() => addLabelPart('newline')} className="h-7 text-xs"><CornerDownLeft className="mr-1.5 h-3.5 w-3.5" />Salto de Línea</Button>
            </div>
             <div className="mt-2 pt-2 border-t border-white/10">
                <Label className="text-xs">Vista Previa:</Label>
                <p className="text-sm font-mono bg-black/20 p-1.5 rounded-md truncate">{labelPreview || "(Vacío)"}</p>
            </div>
          </div>
          
          <div className="flex items-end gap-3 w-full justify-around">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Color Texto</Label>
              <ColorPicker 
                value={labelOptions.textColor}
                onChange={(value) => setLabelOptions(prev => ({ ...prev, textColor: value }))}
              />
            </div>
             <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Color Borde</Label>
              <ColorPicker 
                value={labelOptions.outlineColor}
                onChange={(value) => setLabelOptions(prev => ({ ...prev, outlineColor: value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="font-family" className="text-xs">Tipografía</Label>
                <Select
                  value={labelOptions.fontFamily}
                  onValueChange={(value) => setLabelOptions(prev => ({ ...prev, fontFamily: value }))}
                  disabled={!labelOptions.enabled}
                >
                  <SelectTrigger id="font-family" className="h-8 text-xs bg-black/20 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {fontOptions.map(font => (
                      <SelectItem key={font.value} value={font.value} className="text-xs" style={{ fontFamily: font.value }}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="font-size" className="text-xs">
                Tamaño (px)
              </Label>
              <Input
                id="font-size"
                type="number"
                min="8"
                max="32"
                value={labelOptions.fontSize}
                onChange={(e) => setLabelOptions(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                className="h-8 text-xs bg-black/20 w-20"
                disabled={!labelOptions.enabled}
              />
            </div>
          </div>
          
          {(isLineLayer || isPolygonLayer) && (
            <div className="space-y-3 pt-2 border-t border-gray-700/60">
                {isPolygonLayer && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="label-overflow"
                      checked={labelOptions.overflow}
                      onCheckedChange={(checked) => setLabelOptions(prev => ({ ...prev, overflow: checked }))}
                      disabled={!labelOptions.enabled}
                    />
                    <Label htmlFor="label-overflow">Permitir fuera del polígono (con guía)</Label>
                  </div>
                )}
                {isLineLayer && (
                  <div className="flex items-end gap-3">
                      <div className="flex-grow space-y-1.5">
                          <Label htmlFor="label-placement" className="text-xs">
                            Alineación de Etiqueta (Líneas)
                          </Label>
                          <Select
                            value={labelOptions.placement}
                            onValueChange={(value: 'horizontal' | 'parallel') => setLabelOptions(prev => ({ ...prev, placement: value }))}
                            disabled={!labelOptions.enabled}
                          >
                            <SelectTrigger id="label-placement" className="h-8 text-xs bg-black/20 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-700 text-white border-gray-600">
                              <SelectItem value="horizontal" className="text-xs">Horizontal</SelectItem>
                              <SelectItem value="parallel" className="text-xs">Paralelo a la línea</SelectItem>
                            </SelectContent>
                          </Select>
                      </div>
                      {labelOptions.placement === 'parallel' && (
                           <div className="space-y-1.5">
                              <Label htmlFor="offset-y" className="text-xs">
                                  Desplazamiento Y (px)
                              </Label>
                              <Input
                                  id="offset-y"
                                  type="number"
                                  step="1"
                                  value={labelOptions.offsetY}
                                  onChange={(e) => setLabelOptions(prev => ({ ...prev, offsetY: Number(e.target.value) }))}
                                  className="h-8 text-xs bg-black/20 w-28"
                                  disabled={!labelOptions.enabled}
                                  title="Valores positivos hacia arriba, negativos hacia abajo"
                              />
                          </div>
                      )}
                  </div>
                )}
            </div>
          )}

        </div>
        <DialogFooter className="justify-center">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button>
          <Button onClick={handleApply} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LabelEditorDialog;

    