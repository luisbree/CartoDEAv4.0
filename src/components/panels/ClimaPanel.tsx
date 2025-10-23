
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower } from 'lucide-react';
import { Button } from '../ui/button';

interface ClimaPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddSmnRadarLayer: () => void; // New prop
  style?: React.CSSProperties;
}

const ClimaPanel: React.FC<ClimaPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onAddSmnRadarLayer, // New prop
  style,
}) => {
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
            <h3 className="text-sm font-semibold">Radar Meteorológico Nacional</h3>
            <p className="text-xs text-gray-400">
                Visualiza el mosaico de radares del SINARAME (SMN) para ver la reflectividad de las tormentas en tiempo real.
            </p>
            <Button className="w-full" onClick={onAddSmnRadarLayer}>
                <RadioTower className="mr-2 h-4 w-4" />
                Añadir / Actualizar Radar del SMN
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
