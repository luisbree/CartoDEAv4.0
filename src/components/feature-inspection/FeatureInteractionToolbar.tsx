"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { BoxSelect, Eraser, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FeatureInteractionToolbarProps {
  activeTool: 'inspect' | 'selectBox' | null;
  onSetActiveTool: (tool: 'inspect' | 'selectBox' | null) => void;
  onClearSelection: () => void;
}

const FeatureInteractionToolbar: React.FC<FeatureInteractionToolbarProps> = ({
  activeTool,
  onSetActiveTool,
  onClearSelection,
}) => {
  const iconButtonBaseClass = "h-8 w-8 p-0 flex items-center justify-center focus-visible:ring-primary";
  
  const activeClass = "bg-primary hover:bg-primary/90 text-primary-foreground";
  const inactiveClass = "border border-white/30 text-white/90 bg-black/20 hover:bg-black/40";
  
  const handleToggleTool = (tool: 'inspect' | 'selectBox') => {
    onSetActiveTool(activeTool === tool ? null : tool);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              onClick={() => handleToggleTool('inspect')}
              className={`${iconButtonBaseClass} ${
                activeTool === 'inspect' ? activeClass : inactiveClass
              }`}
              aria-label={activeTool === 'inspect' ? "Desactivar Inspección" : "Activar Inspección"}
            >
              <Info className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
            <p className="text-xs">Inspeccionar entidad (clic)</p>
          </TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              onClick={() => handleToggleTool('selectBox')}
              className={`${iconButtonBaseClass} ${
                activeTool === 'selectBox' ? activeClass : inactiveClass
              }`}
              aria-label={activeTool === 'selectBox' ? "Desactivar Selección" : "Activar Selección (clic o caja)"}
            >
              <BoxSelect className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
            <p className="text-xs">Seleccionar por clic o caja</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              onClick={onClearSelection}
              className={`${iconButtonBaseClass} border border-white/30 text-white/90 bg-black/20 hover:bg-red-500/20 hover:text-red-300`}
              aria-label="Limpiar selección e inspección"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
            <p className="text-xs">Limpiar selección actual</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default FeatureInteractionToolbar;
