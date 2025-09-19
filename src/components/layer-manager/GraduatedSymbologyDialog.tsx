

"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import type { GraduatedSymbology, VectorMapLayer, ColorRampId, ClassificationMethod } from '@/lib/types';
import { cn } from "@/lib/utils";
import { Minus, Plus } from 'lucide-react';
import { Slider } from '../ui/slider';
import { ScrollArea } from '../ui/scroll-area';

// --- Color Interpolation Helpers ---

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

// --- Jenks Natural Breaks Algorithm (Corrected Implementation) ---

function jenks(data: number[], n_classes: number): number[] {
  if (n_classes > data.length) return [];

  data = data.slice().sort((a, b) => a - b);

  const matrices = (() => {
    const mat1 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    const mat2 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    
    for (let i = 1; i <= n_classes; i++) {
        mat1[1][i] = 1;
        mat2[1][i] = 0;
        for (let j = 2; j <= data.length; j++) {
            mat2[j][i] = Infinity;
        }
    }

    let v = 0.0;
    for (let l = 2; l <= data.length; l++) {
        let s1 = 0.0, s2 = 0.0, w = 0.0;
        for (let m = 1; m <= l; m++) {
            const i4 = l - m + 1;
            const val = data[i4 - 1];
            w++;
            s1 += val;
            s2 += val * val;
            v = s2 - (s1 * s1) / w;
            const i3 = i4 - 1;
            if (i3 !== 0) {
                for (let j = 2; j <= n_classes; j++) {
                    if (mat2[l][j] >= (v + mat2[i3][j - 1])) {
                        mat1[l][j] = i4;
                        mat2[l][j] = v + mat2[i3][j - 1];
                    }
                }
            }
        }
        mat1[l][1] = 1;
        mat2[l][1] = v;
    }
    return { backlinkMatrix: mat1 };
  })();

  const { backlinkMatrix } = matrices;
  const breaks = [];
  let k = data.length;
  for (let i = n_classes; i > 1; i--) {
    breaks.push(data[backlinkMatrix[k][i] - 2]);
    k = backlinkMatrix[k][i] - 1;
  }
  
  return breaks.reverse();
}



// Define ramps by start and end colors for interpolation
const COLOR_RAMP_DEFINITIONS: Record<Exclude<ColorRampId, 'custom'>, { start: string, end: string }> = {
  reds: { start: '#fee5d9', end: '#a50f15' },
  blues: { start: '#eff3ff', end: '#08519c' },
  greens: { start: '#edf8e9', end: '#006d2c' },
  viridis: { start: '#440154', end: '#fde725' },
  pinks: { start: '#ffcce1', end: '#c70063'},
};

// --- Reusable Color Picker Component ---
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  const handleStep = (direction: 'increment' | 'decrement') => {
      setCustomColorInput(prevColor => {
          let currentValue = isValidHex(prevColor) ? hexToDecimal(prevColor) : 0;
          const stepAmount = 1;
          if (direction === 'increment') {
              currentValue = Math.min(16777215, currentValue + stepAmount);
          } else {
              currentValue = Math.max(0, currentValue - stepAmount);
          }
          return decimalToHex(currentValue);
      });
  };
  
  const stopStepping = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
  
  const handleStepMouseDown = (direction: 'increment' | 'decrement') => {
    handleStep(direction); // Immediate step on click
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        handleStep(direction);
      }, 50); // Speed of fast stepping
    }, 500); // Delay before fast stepping starts
  };

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
            <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-6 w-6 flex-shrink-0" 
                  onMouseDown={() => handleStepMouseDown('decrement')}
                  onMouseUp={stopStepping}
                  onMouseLeave={stopStepping}
                >
                    <Minus className="h-3 w-3" />
                </Button>
                <Slider
                    value={[sliderValue]}
                    onValueChange={handleSliderChange}
                    max={16777215} // #FFFFFF
                    step={1}
                    className="w-full"
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-6 w-6 flex-shrink-0" 
                  onMouseDown={() => handleStepMouseDown('increment')}
                  onMouseUp={stopStepping}
                  onMouseLeave={stopStepping}
                >
                    <Plus className="h-3 w-3" />
                </Button>
            </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};


interface GraduatedSymbologyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (symbology: GraduatedSymbology) => void;
  layer: VectorMapLayer;
}

const GraduatedSymbologyDialog: React.FC<GraduatedSymbologyDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const [field, setField] = useState<string>('');
  const [method, setMethod] = useState<ClassificationMethod>('quantiles');
  const [classes, setClasses] = useState<number>(5);
  const [colorRamp, setColorRamp] = useState<ColorRampId>('reds');
  const [customColors, setCustomColors] = useState({ start: '#ffffff', end: '#000000' });
  const [classification, setClassification] = useState<{ breaks: number[]; colors: string[] } | null>(null);
  const [strokeColor, setStrokeColor] = useState('negro');
  const [strokeWidth, setStrokeWidth] = useState(1);

  const numericFields = useMemo(() => {
    const source = layer?.olLayer.getSource();
    if (!source) return [];
    const features = source.getFeatures();
    if (features.length === 0) return [];

    const keys = new Set<string>();
    const firstFeatureProps = features[0].getProperties();
    for (const key in firstFeatureProps) {
      if (typeof firstFeatureProps[key] === 'number') {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  }, [layer]);

  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      const existingSymbology = layer.graduatedSymbology;
      const initialField = existingSymbology?.field || numericFields[0] || '';
      setField(initialField);
      setMethod(existingSymbology?.method || 'quantiles');
      setClasses(existingSymbology?.classes || 5);
      setColorRamp(existingSymbology?.colorRamp || 'reds');
      setCustomColors(existingSymbology?.customColors || { start: '#f0f9e8', end: '#08589e' });
      setStrokeColor(existingSymbology?.strokeColor || 'negro');
      setStrokeWidth(existingSymbology?.strokeWidth === undefined ? 1 : existingSymbology.strokeWidth);
      setClassification(null);
    }
  }, [isOpen, numericFields, layer]);

  const handleGenerateClassification = () => {
    const source = layer?.olLayer.getSource();
    if (!source || !field) {
      setClassification(null);
      return;
    }

    const values = source.getFeatures()
      .map(f => f.get(field))
      .filter(v => typeof v === 'number' && isFinite(v)) as number[];
    
    if (values.length === 0) {
      setClassification(null);
      return;
    }

    values.sort((a, b) => a - b);

    let breaks: number[] = [];
    let startColor: string, endColor: string;

    if (colorRamp === 'custom') {
        startColor = customColors.start;
        endColor = customColors.end;
    } else {
        const rampDefinition = COLOR_RAMP_DEFINITIONS[colorRamp];
        startColor = rampDefinition.start;
        endColor = rampDefinition.end;
    }
    
    const numClasses = Math.max(2, classes);
    
    if (method === 'natural-breaks') {
      breaks = jenks(values, numClasses);
      // Ensure the last break is the max value of the dataset
      if (breaks.length > 0 && breaks[breaks.length - 1] < values[values.length - 1]) {
        breaks.push(values[values.length - 1]);
      } else if (breaks.length === 0) {
        // Handle case where jenks fails or returns no breaks
        breaks.push(values[values.length - 1]);
      }
    } else { // quantiles
      const step = Math.max(1, Math.floor(values.length / numClasses));
      for (let i = 1; i < numClasses; i++) {
        const breakIndex = Math.min(i * step, values.length - 1);
        breaks.push(values[breakIndex]);
      }
      breaks.push(values[values.length - 1]);
    }
    
    // Ensure breaks are unique and handle cases with few unique values
    breaks = [...new Set(breaks)].sort((a, b) => a - b);
    const finalNumClasses = breaks.length;
    const finalColors = generateColorRamp(startColor, endColor, finalNumClasses);

    setClassification({
      breaks,
      colors: finalColors,
    });
  };

  const handleApply = () => {
    if (classification && field && classification.breaks.length > 0) {
        const symbology: GraduatedSymbology = {
            field,
            method,
            classes: classification.breaks.length,
            colorRamp,
            breaks: classification.breaks,
            colors: classification.colors,
            strokeColor,
            strokeWidth,
        };
        if (colorRamp === 'custom') {
            symbology.customColors = customColors;
        }
        onApply(symbology);
    }
  };
  
  const formatNumber = (num: number) => {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const handleCustomColorChange = (type: 'start' | 'end', colorValue: string) => {
      const hex = colorOptions.find(c => c.value === colorValue)?.hex || (isValidHex(colorValue) ? colorValue : '#000000');
      setCustomColors(prev => ({ ...prev, [type]: hex }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-[480px] p-4">
        <DialogHeader>
          <DialogTitle className="text-base">Simbología Graduada: {layer.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-1">
          
          <div className="p-2 border border-white/10 rounded-md space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="field-select" className="text-xs">Campo</Label>
                <Select value={field} onValueChange={setField}>
                  <SelectTrigger id="field-select" className="h-8 text-xs bg-black/20">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    {numericFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="method-select" className="text-xs">Método</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as ClassificationMethod)}>
                  <SelectTrigger id="method-select" className="h-8 text-xs bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
                    <SelectItem value="quantiles" className="text-xs">Cuantiles (Equal Count)</SelectItem>
                    <SelectItem value="natural-breaks" className="text-xs">Natural Breaks (Jenks)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="classes-input" className="text-xs">Clases</Label>
                <Input
                  id="classes-input"
                  type="number"
                  min="2"
                  max="20"
                  value={classes}
                  onChange={e => setClasses(Math.max(2, Math.min(20, Number(e.target.value))))}
                  className="h-8 text-xs bg-black/20"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ramp-select" className="text-xs">Rampa de Color</Label>
                <Select value={colorRamp} onValueChange={(v) => setColorRamp(v as ColorRampId)}>
                  <SelectTrigger id="ramp-select" className="h-8 text-xs bg-black/20">
                    <SelectValue />
                  </SelectTrigger>
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

            {colorRamp === 'custom' && (
              <div className="flex items-end gap-3 w-full justify-around pt-1.5 border-t border-white/10">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Inicio</Label>
                  <ColorPicker 
                    value={customColors.start}
                    onChange={(color) => handleCustomColorChange('start', color)}
                  />
                </div>
                <div className="flex-1 h-3 rounded-full mt-auto mb-2.5" style={{ background: `linear-gradient(to right, ${customColors.start}, ${customColors.end})` }} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Fin</Label>
                   <ColorPicker 
                    value={customColors.end}
                    onChange={(color) => handleCustomColorChange('end', color)}
                  />
                </div>
              </div>
            )}
            
            <Button onClick={handleGenerateClassification} disabled={!field} className="h-8 text-xs w-full">
              Clasificar
            </Button>
          </div>

          <div className="p-2 border border-white/10 rounded-md">
             <div className="flex items-center justify-between gap-3 w-full">
                <h4 className="text-xs font-semibold">Contorno</h4>
                <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <Label htmlFor="stroke-color" className="text-xs">Color</Label>
                      <ColorPicker 
                        value={strokeColor}
                        onChange={setStrokeColor}
                      />
                    </div>
                     <div className="flex flex-col items-center gap-1">
                        <Label htmlFor="stroke-width" className="text-xs">Grosor</Label>
                        <Input
                          id="stroke-width"
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          value={strokeWidth}
                          onChange={(e) => setStrokeWidth(Number(e.target.value))}
                          className="h-8 text-xs bg-black/20 w-16"
                        />
                    </div>
                </div>
             </div>
          </div>

          {classification && (
            <div className="space-y-1">
              <ScrollArea className="h-32">
                <div className="space-y-1 rounded-md bg-black/10 p-2">
                  {classification.colors.map((color, index) => {
                    const lowerBound = index === 0 ? 'Mín' : formatNumber(classification.breaks[index - 1]);
                    const upperBound = formatNumber(classification.breaks[index]);
                    return (
                      <div key={index} className="flex items-center gap-2 text-xs">
                        <div className="h-4 w-4 rounded-sm border" style={{ backgroundColor: color, borderColor: colorOptions.find(c => c.value === strokeColor)?.hex || strokeColor, borderWidth: `${strokeWidth}px` }} />
                        <span>{lowerBound} - {upperBound}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

        </div>
        <DialogFooter className="justify-center pt-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button>
          <Button onClick={handleApply} disabled={!classification} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GraduatedSymbologyDialog;
