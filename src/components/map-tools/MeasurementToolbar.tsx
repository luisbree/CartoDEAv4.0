
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Ruler, Minus, Eraser } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MeasureToolId } from '@/lib/types';

// A simple square-with-dots icon for area
const AreaIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.5 2.5H13.5V13.5H2.5V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="5" cy="5" r="1" fill="currentColor"/>
        <circle cx="11" cy="5" r="1" fill="currentColor"/>
        <circle cx="5" cy="11" r="1" fill="currentColor"/>
        <circle cx="11" cy="11" r="1" fill="currentColor"/>
    </svg>
);


interface MeasurementToolbarProps {
  activeMeasureTool: MeasureToolId | null;
  onToggleMeasureTool: (toolType: MeasureToolId) => void;
  onClearMeasurements: () => void;
}

const MeasurementToolbar: React.FC<MeasurementToolbarProps> = ({
  activeMeasureTool,
  onToggleMeasureTool,
  onClearMeasurements,
}) => {
  const iconButtonBaseClass = "h-8 w-8 p-0 flex items-center justify-center focus-visible:ring-primary";
  const activeClass = "bg-primary hover:bg-primary/90 text-primary-foreground";
  const inactiveClass = "border border-white/30 text-white/90 bg-black/20 hover:bg-black/40";

  return (
    <TooltipProvider delayDuration={300}>
        <div className="flex items-center justify-start w-full gap-1">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button 
                        onClick={() => onToggleMeasureTool('LineString')} 
                        className={`${iconButtonBaseClass} ${
                            activeMeasureTool === 'LineString' ? activeClass : inactiveClass
                        }`}
                        aria-label={activeMeasureTool === 'LineString' ? "Detener medición de distancia" : "Medir Distancia"}
                    >
                        <Ruler className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                    <p className="text-xs">{activeMeasureTool === 'LineString' ? "Detener medición de distancia" : "Medir Distancia"}</p>
                </TooltipContent>
            </Tooltip>
            
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button 
                        onClick={() => onToggleMeasureTool('Polygon')} 
                        className={`${iconButtonBaseClass} ${
                            activeMeasureTool === 'Polygon' ? activeClass : inactiveClass
                        }`}
                        aria-label={activeMeasureTool === 'Polygon' ? "Detener medición de área" : "Medir Área"}
                    >
                        <AreaIcon />
                    </Button>
                </TooltipTrigger>
                 <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                    <p className="text-xs">{activeMeasureTool === 'Polygon' ? "Detener medición de área" : "Medir Área"}</p>
                </TooltipContent>
            </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                    <Button 
                        onClick={onClearMeasurements} 
                        className={`${iconButtonBaseClass} border border-white/30 text-white/90 bg-black/20 hover:bg-red-500/20 hover:text-red-300`}
                        aria-label="Limpiar mediciones del mapa"
                    >
                        <Eraser className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
                    <p className="text-xs">Limpiar Mediciones</p>
                </TooltipContent>
            </Tooltip>
        </div>
    </TooltipProvider>
  );
};

export default MeasurementToolbar;
