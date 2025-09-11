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
import type { GraduatedSymbology, VectorMapLayer, ColorRampId, ClassificationMethod } from '@/lib/types';

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

// --- Jenks Natural Breaks Algorithm ---

function jenks(data: number[], n_classes: number): number[] {
  if (n_classes > data.length) return [];

  data = data.slice().sort((a, b) => a - b);

  const matrices = (() => {
    const lower_class_limits = Array(data.length).fill(0).map(() => Array(n_classes + 1).fill(0));
    const variance_combinations = Array(data.length).fill(0).map(() => Array(n_classes + 1).fill(0));
    let variance = 0;

    for (let i = 0; i < data.length; i++) {
      let sum = 0, sum_sq = 0;
      for (let j = i; j < data.length; j++) {
        sum += data[j];
        sum_sq += data[j] * data[j];
        variance = sum_sq - (sum * sum) / (j - i + 1);
        lower_class_limits[i][1] = data[i];
        variance_combinations[i][1] = variance;
      }
    }
    return { lower_class_limits, variance_combinations };
  })();

  const { lower_class_limits, variance_combinations } = matrices;

  for (let k = 2; k <= n_classes; k++) {
    for (let i = 0; i < data.length; i++) {
      let min_variance = Infinity;
      for (let j = i; j < data.length; j++) {
        const current_variance = variance_combinations[i][k - 1] + (j < data.length - 1 ? variance_combinations[j + 1][1] : 0);
        if (current_variance < min_variance) {
          min_variance = current_variance;
          lower_class_limits[i][k] = data[j];
        }
      }
      variance_combinations[i][k] = min_variance;
    }
  }
  
  const breaks = [];
  let k = n_classes;
  let i = 0;
  while (k > 1) {
    const resolved_break = lower_class_limits[i][k];
    breaks.push(resolved_break);
    while (i < data.length -1 && data[i] <= resolved_break) {
      i++;
    }
    k--;
  }
  
  return breaks.reverse();
}


// Define ramps by start and end colors for interpolation
const COLOR_RAMP_DEFINITIONS: Record<ColorRampId, { start: string, end: string }> = {
  reds: { start: '#fee5d9', end: '#a50f15' },
  blues: { start: '#eff3ff', end: '#08519c' },
  greens: { start: '#edf8e9', end: '#006d2c' },
  viridis: { start: '#440154', end: '#fde725' },
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
  const [classification, setClassification] = useState<{ breaks: number[]; colors: string[] } | null>(null);

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
      const initialField = layer.graduatedSymbology?.field || numericFields[0] || '';
      setField(initialField);
      setMethod(layer.graduatedSymbology?.method || 'quantiles');
      setClasses(layer.graduatedSymbology?.classes || 5);
      setColorRamp(layer.graduatedSymbology?.colorRamp || 'reds');
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
    const rampDefinition = COLOR_RAMP_DEFINITIONS[colorRamp];
    const numClasses = Math.max(2, classes);
    
    if (method === 'natural-breaks') {
      breaks = jenks(values, numClasses);
      // Ensure the last break is the max value of the dataset
      if (breaks.length > 0 && breaks[breaks.length - 1] < values[values.length - 1]) {
        breaks[breaks.length - 1] = values[values.length - 1];
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
    breaks = [...new Set(breaks)];
    const finalNumClasses = breaks.length;
    const finalColors = generateColorRamp(rampDefinition.start, rampDefinition.end, finalNumClasses);

    setClassification({
      breaks,
      colors: finalColors,
    });
  };

  const handleApply = () => {
    if (classification && field && classification.breaks.length > 0) {
      onApply({
        field,
        method,
        classes: classification.breaks.length,
        colorRamp,
        breaks: classification.breaks,
        colors: classification.colors,
      });
    }
  };
  
  const formatNumber = (num: number) => {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-md p-4">
        <DialogHeader>
          <DialogTitle>Simbología Graduada para "{layer.name}"</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 space-y-3">

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-select">Campo</Label>
              <Select value={field} onValueChange={setField}>
                <SelectTrigger id="field-select" className="h-8 text-xs bg-black/20">
                  <SelectValue placeholder="Seleccionar campo..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 text-white border-gray-600">
                  {numericFields.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="method-select">Método</Label>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="classes-input">Clases</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="ramp-select">Rampa de Color</Label>
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
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button onClick={handleGenerateClassification} disabled={!field} className="h-8 text-xs">
            Clasificar
          </Button>

          {classification && (
            <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
              <Label className="text-sm">Vista Previa de la Leyenda</Label>
              <div className="space-y-1 rounded-md bg-black/10 p-2 max-h-32 overflow-y-auto">
                {classification.colors.map((color, index) => {
                  const lowerBound = index === 0 ? 'Mín' : formatNumber(classification.breaks[index - 1]);
                  const upperBound = formatNumber(classification.breaks[index]);
                  return (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div className="h-4 w-4 rounded-sm border border-white/20" style={{ backgroundColor: color }} />
                      <span>{lowerBound} - {upperBound}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        <DialogFooter className="justify-center">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs bg-gray-200 text-black hover:bg-gray-300">Cancelar</Button>
          <Button onClick={handleApply} disabled={!classification} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GraduatedSymbologyDialog;
