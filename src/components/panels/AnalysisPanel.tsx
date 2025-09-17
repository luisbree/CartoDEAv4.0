
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import { DraftingCompass } from 'lucide-react';

interface AnalysisPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  return (
    <DraggablePanel
      title="Análisis Espacial"
      icon={DraftingCompass}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: 400 }}
      minSize={{ width: 300, height: 250 }}
    >
      <div className="flex flex-col h-full items-center justify-center p-4">
        <DraftingCompass className="w-16 h-16 text-gray-500 mb-4" />
        <h3 className="text-lg font-semibold text-white">Herramientas de Geoprocesamiento</h3>
        <p className="text-sm text-center text-gray-400 mt-2">
          Este panel contendrá herramientas de análisis como Buffer, Intersección, Unión Espacial y más.
        </p>
      </div>
    </DraggablePanel>
  );
};

export default AnalysisPanel;
