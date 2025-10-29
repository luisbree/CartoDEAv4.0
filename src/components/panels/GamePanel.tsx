
"use client";

import React from 'react';
import { Swords, User, Loader2 } from 'lucide-react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';

interface GamePanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSignIn: () => void; // Simplified prop
  style?: React.CSSProperties;
}

const GamePanel: React.FC<GamePanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onSignIn,
  style,
}) => {
  return (
    <DraggablePanel
      title="Operación: Despliegue"
      icon={Swords}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: "auto" }}
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center p-4">
        <h3 className="font-semibold">¡Bienvenido a la Operación: Despliegue!</h3>
        <p className="text-xs text-gray-300">Para participar, debes identificarte como agente.</p>
        <Button onClick={onSignIn} className="w-full">
          <User className="mr-2 h-4 w-4" />
          Iniciar Sesión / Crear Agente
        </Button>
      </div>
    </DraggablePanel>
  );
};

export default GamePanel;
