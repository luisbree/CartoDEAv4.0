
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import { Database } from 'lucide-react';


interface LayersPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void; 
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties; 
}


const LayersPanel: React.FC<LayersPanelProps> = ({
  panelRef, isCollapsed, onToggleCollapse, onClosePanel, onMouseDownHeader,
  style, 
}) => {
  
  return (
    <DraggablePanel
      title="Datos y Vista"
      icon={Database}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }} 
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style} 
      zIndex={style?.zIndex as number | undefined} 
      overflowY='visible'
    >
      <div className="space-y-3">
        {/* Content has been moved to the top bar in GeoMapperClient */}
        <p className="text-xs text-gray-400 text-center p-4">
          Los controles de la capa base ahora se encuentran en la barra superior.
        </p>
      </div>
    </DraggablePanel>
  );
};

export default LayersPanel;
