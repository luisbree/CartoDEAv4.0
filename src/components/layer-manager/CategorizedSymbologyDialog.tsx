
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { VectorMapLayer, ColorRampId, CategorizedSymbology } from '@/lib/types';
import { cn } from "@/lib/utils";
import { Minus, Plus, GripVertical } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { ColorPicker } from './StyleEditorDialog';

// --- Color Interpolation Helpers (reused) ---
function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [0, 0, 0];
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0');
}

function interpolateColors(color1: [number, number, number], color2: [number, number, number], factor: number): [number, number, number] {
    const result = color1.slice() as [number, number, number];
    for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
    }
    return result;
}

function generateColorRamp(startHex: string, endHex: string, count: number): string[] {
    if (count <= 1) return [startHex];
    const startRgb = hexToRgb(startHex);
    const endRgb = hexToRgb(endHex);
    const ramp: string[] = [];
    for (let i = 0; i < count; i++) {
        const factor = i / (count - 1);
        const interpolatedRgb = interpolateColors(startRgb, endRgb, factor);
        ramp.push(rgbToHex(interpolatedRgb[0], interpolatedRgb[1], interpolatedRgb[2]));
    }
    return ramp;
}

const COLOR_RAMP_DEFINITIONS: Record<Exclude<ColorRampId, 'custom'>, { start: string, end: string }> = {
  reds: { start: '#fee5d9', end: '#a50f15' },
  blues: { start: '#eff3ff', end: '#08519c' },
  greens: { start: '#edf8e9', end: '#006d2c' },
  viridis: { start: '#440154', end: '#fde725' },
  pinks: { start: '#ffcce1', end: '#c70063'},
};

const colorOptions = [
  { value: 'transparent', label: 'Sin color', hex: 'rgba(0,0,0,0)', iconClass: "bg-transparent border border-dashed border-white/50 bg-[conic-gradient(from_90deg_at_1px_1px,#fff_90deg,rgb(228,228,231)_0)]" },
  { value: 'rojo', label: 'Rojo', hex: '#e63946' },
  { value: 'verde', label: 'Verde', hex: '#2a9d8f' },
  { value: 'azul', label: 'Azul', hex: '#0077b6' },
  { value: 'amarillo', label: 'Amarillo', hex: '#ffbe0b' },
  { value: 'naranja', label: 'Naranja', hex: '#f4a261' },
  { value: 'violeta', label: 'Violeta', hex: '#8338ec' },
  { value: 'negro', label: 'Negro', hex: '#000000' },
  { value: 'blanco', label: 'Blanco', hex: '#ffffff' },
  { value: 'gris', label: 'Gris', hex: '#adb5bd' },
  { value: 'cian', label: 'Cian', hex: '#00ffff' },
  { value: 'magenta', label: 'Magenta', hex: '#ff00ff' },
];
const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);


interface CategorizedSymbologyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (symbology: CategorizedSymbology) => void;
  layer: VectorMapLayer;
}

interface CategoryItem {
  value: string | number;
  color: string;
}

const CategorizedSymbologyDialog: React.FC<CategorizedSymbologyDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const [field, setField] = useState<string>('');
  const [colorRamp, setColorRamp] = useState<ColorRampId>('viridis');
  const [customColors, setCustomColors] = useState({ start: '#ffffff', end: '#000000' });
  const [categories, setCategories] = useState<CategoryItem[] | null>(null);
  const [strokeColor, setStrokeColor] = useState('negro');
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [draggedItem, setDraggedItem] = useState<CategoryItem | null>(null);

  const attributeFields = useMemo(() => {
    const source = layer?.olLayer.getSource();
    if (!source) return [];
    const features = source.getFeatures();
    if (features.length === 0) return [];

    const keys = new Set<string>();
    features.forEach(feature => {
        Object.keys(feature.getProperties()).forEach(key => {
            if (key !== 'geometry') keys.add(key);
        });
    });
    return Array.from(keys).sort();
  }, [layer]);

  useEffect(() => {
    if (isOpen) {
      const existingSymbology = layer.categorizedSymbology;
      const initialField = existingSymbology?.field || attributeFields[0] || '';
      setField(initialField);
      setColorRamp(existingSymbology?.colorRamp || 'viridis');
      setCustomColors(existingSymbology?.customColors || { start: '#440154', end: '#fde725' });
      setStrokeColor(existingSymbology?.strokeColor || 'negro');
      setStrokeWidth(existingSymbology?.strokeWidth === undefined ? 1 : existingSymbology.strokeWidth);
      setCategories(existingSymbology?.categories || null);
    }
  }, [isOpen, attributeFields, layer]);

  const handleGenerateClassification = () => {
    const source = layer?.olLayer.getSource();
    if (!source || !field) {
      setCategories(null);
      return;
    }

    const uniqueValues = new Set<string | number>();
    source.getFeatures().forEach(f => {
      const value = f.get(field);
      if (value !== null && value !== undefined) {
        uniqueValues.add(value);
      }
    });
    
    const sortedValues = Array.from(uniqueValues).sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}));
    
    if (sortedValues.length === 0) {
      setCategories(null);
      return;
    }

    let startColor: string, endColor: string;
    if (colorRamp === 'custom') {
        startColor = customColors.start;
        endColor = customColors.end;
    } else {
        const rampDefinition = COLOR_RAMP_DEFINITIONS[colorRamp];
        startColor = rampDefinition.start;
        endColor = rampDefinition.end;
    }
    
    const colors = generateColorRamp(startColor, endColor, sortedValues.length);
    const newCategories = sortedValues.map((value, index) => ({
        value,
        color: colors[index]
    }));
    setCategories(newCategories);
  };

  const handleApply = () => {
    if (categories && field && categories.length > 0) {
        const symbology: CategorizedSymbology = {
            field,
            colorRamp,
            categories,
            strokeColor,
            strokeWidth,
        };
        if (colorRamp === 'custom') {
            symbology.customColors = customColors;
        }
        onApply(symbology);
    }
  };
  
  const handleCustomColorChange = (type: 'start' | 'end', colorValue: string) => {
      const hex = colorOptions.find(c => c.value === colorValue)?.hex || (isValidHex(colorValue) ? colorValue : '#000000');
      setCustomColors(prev => ({ ...prev, [type]: hex }));
  };

  const onDragStart = (e: React.DragEvent<HTMLLIElement>, item: CategoryItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const onDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLLIElement>, dropItem: CategoryItem) => {
      e.preventDefault();
      if (!draggedItem || !categories) return;
      const draggedIndex = categories.findIndex(p => p.value === draggedItem.value);
      const dropIndex = categories.findIndex(p => p.value === dropItem.value);
      
      const newCategories = [...categories];
      const [removed] = newCategories.splice(draggedIndex, 1);
      newCategories.splice(dropIndex, 0, removed);
      
      // Re-apply colors based on new order
      let startColor: string, endColor: string;
      if (colorRamp === 'custom') {
          startColor = customColors.start;
          endColor = customColors.end;
      } else {
          startColor = COLOR_RAMP_DEFINITIONS[colorRamp].start;
          endColor = COLOR_RAMP_DEFINITIONS[colorRamp].end;
      }
      const newColors = generateColorRamp(startColor, endColor, newCategories.length);
      const finalCategories = newCategories.map((cat, index) => ({...cat, color: newColors[index]}));

      setCategories(finalCategories);
      setDraggedItem(null);
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-[480px] p-4">
        <DialogHeader><DialogTitle className="text-base">Simbología por Categorías: {layer.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-1">
          <div className="p-2 border border-white/10 rounded-md space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="field-select" className="text-xs">Campo</Label>
                <Select value={field} onValueChange={setField}><SelectTrigger id="field-select" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">{attributeFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor="ramp-select" className="text-xs">Rampa de Color</Label>
                <Select value={colorRamp} onValueChange={(v) => setColorRamp(v as ColorRampId)}><SelectTrigger id="ramp-select" className="h-8 text-xs bg-black/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {Object.entries(COLOR_RAMP_DEFINITIONS).map(([rampId, {start, end}]) => (<SelectItem key={rampId} value={rampId} className="text-xs"><div className="flex items-center gap-2"><div className="flex h-4 w-16 rounded-sm overflow-hidden" style={{ background: `linear-gradient(to right, ${start}, ${end})` }} />{rampId.charAt(0).toUpperCase() + rampId.slice(1)}</div></SelectItem>))}
                    <SelectItem value="custom" className="text-xs">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {colorRamp === 'custom' && (<div className="flex items-end gap-3 w-full justify-around pt-1.5 border-t border-white/10"><div className="flex flex-col gap-1"><Label className="text-xs">Inicio</Label><ColorPicker value={customColors.start} onChange={(color) => handleCustomColorChange('start', color)}/></div><div className="flex-1 h-3 rounded-full mt-auto mb-2.5" style={{ background: `linear-gradient(to right, ${customColors.start}, ${customColors.end})` }} /><div className="flex flex-col gap-1"><Label className="text-xs">Fin</Label><ColorPicker value={customColors.end} onChange={(color) => handleCustomColorChange('end', color)}/></div></div>)}
            <Button onClick={handleGenerateClassification} disabled={!field} className="h-8 text-xs w-full">Clasificar</Button>
          </div>
          <div className="p-2 border border-white/10 rounded-md">
            <div className="flex items-center justify-between gap-3 w-full"><h4 className="text-xs font-semibold">Contorno</h4><div className="flex items-center gap-2"><div className="flex flex-col items-center gap-1"><Label htmlFor="stroke-color" className="text-xs">Color</Label><ColorPicker value={strokeColor} onChange={setStrokeColor}/></div><div className="flex flex-col items-center gap-1"><Label htmlFor="stroke-width" className="text-xs">Grosor</Label><Input id="stroke-width" type="number" min="0" max="20" step="0.1" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="h-8 text-xs bg-black/20 w-16"/></div></div></div>
          </div>
          {categories && (
            <div className="space-y-1"><ScrollArea className="h-32">
                <ul className="space-y-1 rounded-md bg-black/10 p-2">
                  {categories.map((cat) => (
                    <li key={cat.value} className="flex items-center gap-2 text-xs p-1 rounded-md hover:bg-gray-700/50" draggable onDragStart={(e) => onDragStart(e, cat)} onDragOver={onDragOver} onDrop={(e) => onDrop(e, cat)}>
                      <GripVertical className="h-4 w-4 text-gray-400 cursor-grab flex-shrink-0" />
                      <div className="h-4 w-4 rounded-sm border" style={{ backgroundColor: cat.color, borderColor: colorOptions.find(c => c.value === strokeColor)?.hex || strokeColor, borderWidth: `${strokeWidth}px` }} />
                      <span className="truncate flex-1" title={String(cat.value)}>{String(cat.value)}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea></div>
          )}
        </div>
        <DialogFooter className="justify-center pt-2"><Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button><Button onClick={handleApply} disabled={!categories} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CategorizedSymbologyDialog;
