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

// Color ramps
const COLOR_RAMPS: Record<ColorRampId, string[]> = {
  reds: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
  blues: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  greens: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'],
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
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
    const ramp = COLOR_RAMPS[colorRamp];
    const numClasses = Math.min(classes, ramp.length);

    if (method === 'quantiles') {
      const step = Math.max(1, Math.floor(values.length / numClasses));
      for (let i = 1; i < numClasses; i++) {
        breaks.push(values[i * step]);
      }
      breaks.push(values[values.length - 1]);
    }
    
    // Ensure breaks are unique
    breaks = [...new Set(breaks)];
     // Adjust if there are fewer unique breaks than classes
    while (breaks.length < numClasses && breaks.length < values.length) {
       // This logic can be improved, but for now we just reduce the class count
       // to the number of unique breaks found.
       setClasses(breaks.length);
       break;
    }

    setClassification({
      breaks,
      colors: ramp.slice(0, breaks.length),
    });
  };

  const handleApply = () => {
    if (classification && field) {
      onApply({
        field,
        method,
        classes,
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
                max="10"
                value={classes}
                onChange={e => setClasses(Math.max(2, Math.min(10, Number(e.target.value))))}
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
                  {Object.keys(COLOR_RAMPS).map(rampId => (
                    <SelectItem key={rampId} value={rampId} className="text-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex h-4 w-16 rounded-sm overflow-hidden">
                          {COLOR_RAMPS[rampId as ColorRampId].map(color => <div key={color} style={{ backgroundColor: color, flex: 1 }} />)}
                        </div>
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
              <div className="space-y-1 rounded-md bg-black/10 p-2">
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
