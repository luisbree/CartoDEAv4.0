
"use client";

import React, { useState, useEffect, useRef } from 'react';
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
import type { StyleOptions } from '@/lib/types';
import { Slider } from '../ui/slider';
import { Minus, Plus, Palette } from 'lucide-react';


interface StyleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (options: StyleOptions) => void;
  layerType: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'Circle' | 'GeometryCollection';
}

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

// --- Color Conversion Helpers ---
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s: number, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
    r = Math.round((r + m) * 255); g = Math.round((g + m) * 255); b = Math.round((b + m) * 255);
    return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0');
}


interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customColor, setCustomColor] = useState({ h: 0, s: 100, l: 50 });
    const [hexInput, setHexInput] = useState('#000000');

    useEffect(() => {
        if (isOpen) {
            const initialHex = value === 'transparent' ? '#000000' : colorOptions.find(c => c.value === value)?.hex || (isValidHex(value) ? value : '#000000');
            setHexInput(initialHex);
            const rgb = hexToRgb(initialHex);
            if (rgb) {
                setCustomColor(rgbToHsl(rgb.r, rgb.g, rgb.b));
            }
        }
    }, [isOpen, value]);

    const handleHslChange = (newHsl: Partial<{ h: number; s: number; l: number }>) => {
        const updatedHsl = { ...customColor, ...newHsl };
        setCustomColor(updatedHsl);
        const { r, g, b } = hslToRgb(updatedHsl.h, updatedHsl.s, updatedHsl.l);
        setHexInput(rgbToHex(r, g, b));
    };

    const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newHex = e.target.value;
        setHexInput(newHex);
        if (isValidHex(newHex)) {
            const rgb = hexToRgb(newHex);
            if (rgb) {
                setCustomColor(rgbToHsl(rgb.r, rgb.g, rgb.b));
            }
        }
    };
    
    const handleApply = () => {
        if (isValidHex(hexInput)) {
            onChange(hexInput);
            setIsOpen(false);
        }
    };
    
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
                        <Button key={color.value} variant="outline" className={cn("h-7 w-7 p-0", value === color.value ? "ring-2 ring-offset-2 ring-offset-gray-700 ring-white" : "border-white/30")} onClick={() => { onChange(color.value); setIsOpen(false); }}>
                            <div className={cn("w-5 h-5 rounded-full border border-white/20", color.iconClass)} style={{ backgroundColor: color.hex }} />
                        </Button>
                    ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-600 space-y-3">
                    <Label className="text-xs font-medium text-white/90">Color Personalizado</Label>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md border border-white/30" style={{ backgroundColor: hexInput }} />
                        <Input type="text" value={hexInput} onChange={handleHexInputChange} className="h-8 text-xs bg-black/20 w-24 text-white/90" placeholder="#RRGGBB" />
                        <Button onClick={handleApply} size="sm" className="h-8 text-xs" disabled={!isValidHex(hexInput)}>Aplicar</Button>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs">Tono</Label>
                        <Slider value={[customColor.h]} onValueChange={(val) => handleHslChange({ h: val[0] })} max={360} step={1} className="w-full [&>span:first-child]:bg-gradient-to-r from-red-500 via-yellow-500 to-red-500" />
                    </div>
                     <div className="space-y-2">
                        <Label className="text-xs">Saturación</Label>
                        <Slider value={[customColor.s]} onValueChange={(val) => handleHslChange({ s: val[0] })} max={100} step={1} className="w-full" />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};


const StyleEditorDialog: React.FC<StyleEditorDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layerType,
}) => {
  const [styleOptions, setStyleOptions] = useState<StyleOptions>({
    strokeColor: 'azul',
    fillColor: 'azul',
    lineWidth: 2,
    lineStyle: 'solid',
    pointSize: 5,
  });

  const handleApply = () => {
    onApply(styleOptions);
  };
  
  const isPolygon = layerType.includes('Polygon');
  const isPoint = layerType.includes('Point');
  const isLine = layerType.includes('LineString');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-md p-4">
        <DialogHeader>
          <DialogTitle>Editor de Simbología</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2">
            <div className="flex items-end gap-3 w-full justify-around flex-wrap">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stroke-color" className="text-xs">
                  {isPoint ? 'Borde' : 'Contorno'}
                </Label>
                <ColorPicker 
                  value={styleOptions.strokeColor}
                  onChange={(value) => setStyleOptions(prev => ({ ...prev, strokeColor: value }))}
                />
              </div>
              
              {(isPolygon || isPoint) && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fill-color" className="text-xs">
                    Relleno
                  </Label>
                  <ColorPicker 
                    value={styleOptions.fillColor}
                    onChange={(value) => setStyleOptions(prev => ({ ...prev, fillColor: value }))}
                  />
                </div>
              )}
              
              {isPoint && (
                 <div className="flex flex-col gap-1.5">
                  <Label htmlFor="point-size" className="text-xs">
                    Tamaño (px)
                  </Label>
                  <Input
                    id="point-size"
                    type="number"
                    min="1"
                    max="30"
                    value={styleOptions.pointSize}
                    onChange={(e) => setStyleOptions(prev => ({ ...prev, pointSize: Number(e.target.value) }))}
                    className="h-8 text-xs bg-black/20 w-20"
                  />
                </div>
              )}

              {(isLine || isPolygon) && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="line-style" className="text-xs">
                    Estilo Línea
                  </Label>
                  <Select
                    value={styleOptions.lineStyle}
                    onValueChange={(value: StyleOptions['lineStyle']) => setStyleOptions(prev => ({ ...prev, lineStyle: value }))}
                  >
                    <SelectTrigger id="line-style" className="h-8 text-xs bg-black/20 w-28">
                      <SelectValue placeholder="Seleccionar estilo" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                      <SelectItem value="solid" className="text-xs">Continua</SelectItem>
                      <SelectItem value="dashed" className="text-xs">Trazos</SelectItem>
                      <SelectItem value="dotted" className="text-xs">Puntos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="line-width" className="text-xs">
                  Grosor (px)
                </Label>
                <Input
                  id="line-width"
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={styleOptions.lineWidth}
                  onChange={(e) => setStyleOptions(prev => ({ ...prev, lineWidth: Number(e.target.value) }))}
                  className="h-8 text-xs bg-black/20 w-20"
                />
              </div>
            </div>
        </div>
        <DialogFooter className="justify-center">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button>
          <Button onClick={handleApply} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StyleEditorDialog;
