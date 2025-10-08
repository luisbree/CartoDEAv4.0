
"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
import type { ColorRampId, GeoTiffStyle, MapLayer } from '@/lib/types';
import { ColorPicker } from './StyleEditorDialog';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import GeoTIFF from 'ol/source/GeoTIFF';

const COLOR_RAMP_DEFINITIONS: Record<Exclude<ColorRampId, 'custom'>, { start: string, end: string }> = {
  reds: { start: '#fee5d9', end: '#a50f15' },
  blues: { start: '#eff3ff', end: '#08519c' },
  greens: { start: '#edf8e9', end: '#006d2c' },
  viridis: { start: '#440154', end: '#fde725' },
  pinks: { start: '#ffcce1', end: '#c70063'},
};

const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

const colorOptions = [
  { value: 'rojo', hex: '#e63946' },
  { value: 'verde', hex: '#2a9d8f' },
  { value: 'azul', hex: '#0077b6' },
  { value: 'amarillo', hex: '#ffbe0b' },
  { value: 'naranja', hex: '#f4a261' },
  { value: 'violeta', hex: '#8338ec' },
  { value: 'negro', hex: '#000000' },
  { value: 'blanco', hex: '#ffffff' },
  { value: 'gris', hex: '#adb5bd' },
];

interface GeoTiffStyleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (style: GeoTiffStyle) => void;
  layer: MapLayer | null;
}

const GeoTiffStyleEditorDialog: React.FC<GeoTiffStyleEditorDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const [band, setBand] = useState<number>(1);
  const [colorRamp, setColorRamp] = useState<ColorRampId>('viridis');
  const [customColors, setCustomColors] = useState({ start: '#440154', end: '#fde725' });
  const [min, setMin] = useState<number>(0);
  const [max, setMax] = useState<number>(255);
  const [bandCount, setBandCount] = useState<number>(1);

  useEffect(() => {
    if (isOpen && layer && layer.olLayer instanceof WebGLTileLayer) {
        const source = layer.olLayer.getSource() as GeoTIFF;
        source.getView().then(view => {
            setBandCount(view.bands);
        });
        const existingStyle = layer.geoTiffStyle;
        setBand(existingStyle?.band || 1);
        setColorRamp(existingStyle?.colorRamp || 'viridis');
        setCustomColors(existingStyle?.customColors || { start: '#440154', end: '#fde725' });
        setMin(existingStyle?.min ?? 0);
        setMax(existingStyle?.max ?? 255);
    }
  }, [isOpen, layer]);

  const handleApply = () => {
    const style: GeoTiffStyle = {
      band,
      colorRamp,
      min,
      max,
    };
    if (colorRamp === 'custom') {
      style.customColors = customColors;
    }
    onApply(style);
  };

  const handleCustomColorChange = (type: 'start' | 'end', colorValue: string) => {
    const hex = colorOptions.find(c => c.value === colorValue)?.hex || (isValidHex(colorValue) ? colorValue : '#000000');
    setCustomColors(prev => ({ ...prev, [type]: hex }));
  };
  
  if (!layer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-[480px] p-4">
        <DialogHeader>
          <DialogTitle className="text-base">Estilo de Capa GeoTIFF: {layer.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-1">
          <div className="p-2 border border-white/10 rounded-md space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="band-select" className="text-xs">Banda</Label>
                <Select value={String(band)} onValueChange={(v) => setBand(Number(v))} disabled={bandCount <= 1}>
                  <SelectTrigger id="band-select" className="h-8 text-xs bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {Array.from({ length: bandCount }, (_, i) => i + 1).map(b => (
                      <SelectItem key={b} value={String(b)} className="text-xs">Banda {b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ramp-select" className="text-xs">Rampa de Color</Label>
                <Select value={colorRamp} onValueChange={(v) => setColorRamp(v as ColorRampId)}>
                  <SelectTrigger id="ramp-select" className="h-8 text-xs bg-black/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {Object.entries(COLOR_RAMP_DEFINITIONS).map(([rampId, {start, end}]) => (
                      <SelectItem key={rampId} value={rampId} className="text-xs">
                        <div className="flex items-center gap-2">
                          <div className="flex h-4 w-16 rounded-sm overflow-hidden" style={{ background: `linear-gradient(to right, ${start}, ${end})` }} />
                          {rampId.charAt(0).toUpperCase() + rampId.slice(1)}
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="custom" className="text-xs">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label htmlFor="min-input" className="text-xs">Valor Mínimo</Label>
                    <Input id="min-input" type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} className="h-8 text-xs bg-black/20"/>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="max-input" className="text-xs">Valor Máximo</Label>
                    <Input id="max-input" type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="h-8 text-xs bg-black/20"/>
                </div>
            </div>

            {colorRamp === 'custom' && (
              <div className="flex items-end gap-3 w-full justify-around pt-1.5 border-t border-white/10">
                <div className="flex flex-col gap-1"><Label className="text-xs">Inicio</Label><ColorPicker value={customColors.start} onChange={(color) => handleCustomColorChange('start', color)}/></div>
                <div className="flex-1 h-3 rounded-full mt-auto mb-2.5" style={{ background: `linear-gradient(to right, ${customColors.start}, ${customColors.end})` }} />
                <div className="flex flex-col gap-1"><Label className="text-xs">Fin</Label><ColorPicker value={customColors.end} onChange={(color) => handleCustomColorChange('end', color)}/></div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="justify-center pt-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button>
          <Button onClick={handleApply} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GeoTiffStyleEditorDialog;
