

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
import type { GraduatedSymbology, VectorMapLayer, ColorRampId, ClassificationMethod, MapLayer, GeoTiffStyle } from '@/lib/types';
import { ColorPicker } from './StyleEditorDialog';
import { ScrollArea } from '../ui/scroll-area';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import GeoTIFF from 'ol/source/GeoTIFF';

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

const isValidHex = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

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


interface GraduatedSymbologyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (symbology: GraduatedSymbology) => void;
  layer: MapLayer;
}

const GraduatedSymbologyDialog: React.FC<GraduatedSymbologyDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const isRaster = layer?.type === 'geotiff' || layer?.type === 'gee';
  const [field, setField] = useState<string>('');
  const [method, setMethod] = useState<ClassificationMethod>('quantiles');
  const [classes, setClasses] = useState<number>(5);
  const [colorRamp, setColorRamp] = useState<ColorRampId>('reds');
  const [customColors, setCustomColors] = useState({ start: '#ffffff', end: '#000000' });
  const [classification, setClassification] = useState<{ breaks: number[]; colors: string[] } | null>(null);
  const [strokeColor, setStrokeColor] = useState('negro');
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [range, setRange] = useState<{min: number, max: number}>({min: 0, max: 255});

  const numericFields = useMemo(() => {
    if (isRaster) {
      return ["Pixel Value"];
    }
    const source = (layer?.olLayer as VectorMapLayer['olLayer'])?.getSource();
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
  }, [layer, isRaster]);

  useEffect(() => {
    if (isOpen) {
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
      
      const geoTiffStyle = layer.geoTiffStyle;
      if (isRaster && geoTiffStyle) {
          setRange({ min: geoTiffStyle.min, max: geoTiffStyle.max });
      } else if (isRaster) {
          // Default range for GOES (Kelvin)
          if (layer.type === 'gee' && layer.olLayer.get('geeParams')?.bandCombination === 'GOES_CLOUDTOP') {
              setRange({ min: 183, max: 323 });
          } else {
              setRange({ min: 0, max: 255 }); // Default for generic 8-bit
          }
      }

    }
  }, [isOpen, numericFields, layer, isRaster]);

  const handleGenerateClassification = async () => {
    let values: number[] = [];

    if (isRaster) {
        // For rasters, we don't calculate breaks from data, we just use min/max
        // The breaks will be evenly spaced within the min/max range.
        const numClasses = Math.max(2, classes);
        const step = (range.max - range.min) / numClasses;
        const breaks = Array.from({ length: numClasses }, (_, i) => range.min + (i + 1) * step);
        
        let startColor: string, endColor: string;
        if (colorRamp === 'custom') {
            startColor = customColors.start;
            endColor = customColors.end;
        } else {
            startColor = COLOR_RAMP_DEFINITIONS[colorRamp].start;
            endColor = COLOR_RAMP_DEFINITIONS[colorRamp].end;
        }
        
        const finalColors = generateColorRamp(startColor, endColor, numClasses);
        setClassification({ breaks, colors: finalColors });
        return;
    }

    // --- Vector Logic ---
    const source = (layer?.olLayer as VectorMapLayer['olLayer'])?.getSource();
    if (!source || !field) {
        setClassification(null);
        return;
    }
    values = source.getFeatures()
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
      if (breaks.length > 0 && breaks[breaks.length - 1] < values[values.length - 1]) {
        breaks.push(values[values.length - 1]);
      } else if (breaks.length === 0) {
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
    
    breaks = [...new Set(breaks)].sort((a, b) => a - b);
    const finalNumClasses = breaks.length;
    const finalColors = generateColorRamp(startColor, endColor, finalNumClasses);

    setClassification({
      breaks,
      colors: finalColors,
    });
  };

  const handleApply = () => {
    if (isRaster) {
        // For rasters, we apply a different kind of symbology
        onApply({
            field: 'Pixel Value', // Placeholder
            method: 'quantiles', // Method is not strictly used but needed for type
            classes: classes,
            colorRamp: colorRamp,
            breaks: classification?.breaks || [], // Pass generated breaks
            colors: classification?.colors || [], // Pass generated colors
            strokeColor: '', // Not used for rasters
            strokeWidth: 0, // Not used
            customColors: colorRamp === 'custom' ? customColors : undefined,
            // Raster-specific properties
            min: range.min,
            max: range.max,
            band: 1, // Assume band 1 for now
        });
        return;
    }

    // Vector logic
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
                <Select value={field} onValueChange={setField} disabled={isRaster}>
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
                <Select value={method} onValueChange={(v) => setMethod(v as ClassificationMethod)} disabled={isRaster}>
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
             {isRaster && (
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/10 mt-2">
                <div className="space-y-1">
                    <Label htmlFor="min-range" className="text-xs">Valor Mínimo</Label>
                    <Input id="min-range" type="number" value={range.min} onChange={(e) => setRange(prev => ({...prev, min: Number(e.target.value)}))} className="h-8 text-xs bg-black/20"/>
                </div>
                 <div className="space-y-1">
                    <Label htmlFor="max-range" className="text-xs">Valor Máximo</Label>
                    <Input id="max-range" type="number" value={range.max} onChange={(e) => setRange(prev => ({...prev, max: Number(e.target.value)}))} className="h-8 text-xs bg-black/20"/>
                </div>
              </div>
            )}

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
            
            <Button onClick={handleGenerateClassification} disabled={!isRaster && !field} className="h-8 text-xs w-full">
              Clasificar
            </Button>
          </div>

          {!isRaster && (
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
          )}


          {classification && (
            <div className="space-y-1">
              <ScrollArea className="h-32">
                <div className="space-y-1 rounded-md bg-black/10 p-2">
                  {classification.colors.map((color, index) => {
                    const lowerBoundRaw = index === 0 ? (isRaster ? range.min : 0) : classification.breaks[index - 1];
                    const lowerBound = formatNumber(lowerBoundRaw);
                    const upperBound = formatNumber(classification.breaks[index]);
                    const strokeStyle = isRaster ? {} : { borderColor: colorOptions.find(c => c.value === strokeColor)?.hex || strokeColor, borderWidth: `${strokeWidth}px` };

                    return (
                      <div key={index} className="flex items-center gap-2 text-xs">
                        <div className="h-4 w-4 rounded-sm border" style={{ backgroundColor: color, ...strokeStyle }} />
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

    