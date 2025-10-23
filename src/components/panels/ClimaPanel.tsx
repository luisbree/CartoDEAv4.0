
"use client";

import React, { useState } from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower, Satellite, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';

interface ClimaPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddGoesLayer: () => Promise<void>; // Updated prop
  style?: React.CSSProperties;
}

const ClimaPanel: React.FC<ClimaPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onAddGoesLayer,
  style,
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            await onAddGoesLayer();
        } catch (error) {
            console.error("Error en el panel de clima al generar capa GOES:", error);
            toast({
                title: "Error",
                description: "No se pudo generar la capa de GOES.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

  return (
    <DraggablePanel
      title="Clima y Radar"
      icon={CloudRain}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 380, height: "auto" }}
    >
      <div className="p-3 space-y-4">
        <div className="space-y-2">
            <h3 className="text-sm font-semibold">Temperatura de Topes Nubosos (GOES-16)</h3>
            <p className="text-xs text-gray-400">
                Visualiza la temperatura de los topes de las nubes a partir de la banda infrarroja del satélite GOES-16. Las temperaturas más frías (violeta/blanco) indican nubes de mayor desarrollo vertical, asociadas a tormentas intensas.
            </p>
            <Button className="w-full" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Satellite className="mr-2 h-4 w-4" />
                )}
                Añadir / Actualizar Capa GOES
            </Button>
        </div>
        <div className="text-center text-gray-300 border-t border-gray-700 pt-4">
            <p className="text-sm">
                Próximos pasos: Análisis de movimiento y predicción.
            </p>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
