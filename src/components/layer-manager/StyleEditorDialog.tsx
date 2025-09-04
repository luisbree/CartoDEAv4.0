"use client";

import React, { useState, useEffect } from 'react';
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

const hexToDecimal = (hex: string) => parseInt(hex.replace(/^#/, ''), 16);
const decimalToHex = (dec: number) => '#' + dec.toString(16).padStart(6, '0');

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColorInput, setCustomColorInput] = useState('#000000');
  
  useEffect(() => {
    if (isOpen) {
      if (isValidHex(value)) {
        setCustomColorInput(value);
      } else {
        const hexFromName = colorOptions.find(c => c.value === value)?.hex;
        setCustomColorInput(hexFromName || '#000000');
      }
    }
  }, [isOpen, value]);

  const selectedColor = colorOptions.find(c => c.value === value) || { hex: isValidHex(value) ? value : '#000000', iconClass: '' };
  
  const handleCustomColorApply = () => {
      if (isValidHex(customColorInput)) {
          onChange(customColorInput);
          setIsOpen(false);
      }
  };
  
  const handleSliderChange = (value: number[]) => {
      setCustomColorInput(decimalToHex(value[0]));
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val.startsWith('#')) {
          setCustomColorInput(val);
      } else {
          setCustomColorInput(`#${val}`);
      }
  };

  const sliderValue = isValidHex(customColorInput) ? hexToDecimal(customColorInput) : 0;

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
        <div className="mt-3 pt-3 border-t border-gray-600 space-y-2">
            <Label className="text-xs font-medium text-white/90">Color Personalizado</Label>
            <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded-md border border-white/30" style={{ backgroundColor: isValidHex(customColorInput) ? customColorInput : 'transparent' }} />
                 <Input 
                    type="text" 
                    value={customColorInput}
                    onChange={handleInputChange}
                    className="h-8 text-xs bg-black/20 w-24 text-white/90"
                    placeholder="#RRGGBB"
                 />
                 <Button onClick={handleCustomColorApply} size="sm" className="h-8 text-xs" disabled={!isValidHex(customColorInput)}>
                    Aplicar
                 </Button>
            </div>
            <Slider
                value={[sliderValue]}
                onValueChange={handleSliderChange}
                max={16777215} // #FFFFFF
                step={1}
                className="w-full"
            />
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
