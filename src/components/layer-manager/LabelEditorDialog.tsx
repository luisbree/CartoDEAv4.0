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
import type { LabelOptions, VectorMapLayer } from '@/lib/types';
import { Switch } from '../ui/switch';

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


const LabelEditorDialog: React.FC<LabelEditorDialogProps> = ({
  isOpen,
  onClose,
  onApply,
  layer,
}) => {
  const [labelOptions, setLabelOptions] = useState<LabelOptions>({
    enabled: false,
    field: null,
    fontSize: 12,
    fontFamily: 'sans-serif',
    textColor: 'negro',
    outlineColor: 'blanco',
  });

  const attributeFields = useMemo(() => {
    const source = layer?.olLayer.getSource();
    if (!source) return [];
    const features = source.getFeatures();
    if (features.length === 0) return [];
    
    const keys = new Set<string>();
    features.forEach(feature => {
        Object.keys(feature.getProperties()).forEach(key => {
            if (key !== 'geometry') { // Exclude geometry
                keys.add(key);
            }
        });
    });
    return Array.from(keys).sort();
  }, [layer]);

  useEffect(() => {
    // Initialize state from layer's current label options if they exist
    const existingOptions = layer?.olLayer.get('labelOptions');
    if (existingOptions) {
      setLabelOptions(existingOptions);
    } else {
      // Reset to default if no options exist
       setLabelOptions({
        enabled: false,
        field: attributeFields[0] || null,
        fontSize: 12,
        fontFamily: 'sans-serif',
        textColor: 'negro',
        outlineColor: 'blanco',
      });
    }
  }, [isOpen, layer, attributeFields]);

  const handleApply = () => {
    onApply(labelOptions);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 sm:max-w-[500px] p-4">
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
          
          <div className="space-y-1.5">
            <Label htmlFor="label-field" className="text-xs">
              Campo para Etiqueta
            </Label>
            <Select
              value={labelOptions.field || ''}
              onValueChange={(value) => setLabelOptions(prev => ({ ...prev, field: value }))}
              disabled={!labelOptions.enabled}
            >
              <SelectTrigger id="label-field" className="h-8 text-xs bg-black/20 w-full">
                <SelectValue placeholder="Seleccionar un campo..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 text-white border-gray-600">
                {attributeFields.map(field => (
                  <SelectItem key={field} value={field} className="text-xs">{field}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
