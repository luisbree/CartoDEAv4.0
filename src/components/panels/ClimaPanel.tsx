
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain } from 'lucide-react';

interface ClimaPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

const ClimaPanel: React.FC<ClimaPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
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
      <div className="p-4 text-center text-gray-300">
        <p className="text-sm">
          Panel de Clima en desarrollo.
        </p>
        <p className="text-xs mt-2">
          Aquí integraremos la visualización y análisis de datos de radar del SMN.
        </p>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
