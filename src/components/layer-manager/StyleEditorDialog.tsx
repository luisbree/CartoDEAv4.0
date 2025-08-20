"use client";

import React, { useState, useEffect } from 'react';
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
import { Slider } from "@/components/ui/slider";

export interface StyleOptions {
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

interface StyleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (options: StyleOptions) => void;
  layerType: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'Circle' | 'GeometryCollection';
}

const colorOptions = [
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

const ColorSelectItem: React.FC<{ hex: string; label: string }> = ({ hex, label }) => (
  <div className="flex items-center">
    <div className="w-4 h-4 rounded-full mr-2 border border-white/20" style={{ backgroundColor: hex }} />
    <span>{label}</span>
  </div>
);

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
  });

  const handleApply = () => {
    onApply(styleOptions);
  };
  
  const isPolygon = layerType.includes('Polygon');
  const isLine = layerType.includes('LineString');
  const isPoint = layerType.includes('Point');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>Editor de Estilo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="stroke-color" className="text-right text-xs">
              Contorno
            </Label>
            <Select
              value={styleOptions.strokeColor}
              onValueChange={(value) => setStyleOptions(prev => ({ ...prev, strokeColor: value }))}
            >
              <SelectTrigger id="stroke-color" className="col-span-3 h-8 text-xs bg-black/20">
                <SelectValue placeholder="Seleccionar color" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 text-white border-gray-600">
                {colorOptions.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    <ColorSelectItem hex={c.hex} label={c.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPolygon && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fill-color" className="text-right text-xs">
                Relleno
              </Label>
              <Select
                value={styleOptions.fillColor}
                onValueChange={(value) => setStyleOptions(prev => ({ ...prev, fillColor: value }))}
              >
                <SelectTrigger id="fill-color" className="col-span-3 h-8 text-xs bg-black/20">
                  <SelectValue placeholder="Seleccionar color" />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 text-white border-gray-600">
                  {colorOptions.map(c => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      <ColorSelectItem hex={c.hex} label={c.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="line-style" className="text-right text-xs">
              Estilo Línea
            </Label>
            <Select
              value={styleOptions.lineStyle}
              onValueChange={(value: StyleOptions['lineStyle']) => setStyleOptions(prev => ({ ...prev, lineStyle: value }))}
            >
              <SelectTrigger id="line-style" className="col-span-3 h-8 text-xs bg-black/20">
                <SelectValue placeholder="Seleccionar estilo" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 text-white border-gray-600">
                <SelectItem value="solid" className="text-xs">Continua</SelectItem>
                <SelectItem value="dashed" className="text-xs">Trazos</SelectItem>
                <SelectItem value="dotted" className="text-xs">Puntos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="line-width" className="text-right text-xs">
              Grosor ({styleOptions.lineWidth}px)
            </Label>
            <Slider
              id="line-width"
              min={1}
              max={10}
              step={1}
              value={[styleOptions.lineWidth]}
              onValueChange={(value) => setStyleOptions(prev => ({ ...prev, lineWidth: value[0] }))}
              className="col-span-3"
            />
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-8 text-xs">Cancelar</Button>
          <Button onClick={handleApply} className="h-8 text-xs bg-primary hover:bg-primary/90">Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StyleEditorDialog;
