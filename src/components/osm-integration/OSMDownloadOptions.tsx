"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CloudDownload, Download, HelpCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

interface OSMDownloadOptionsProps {
  isFetchingOSM: boolean;
  onFetchOSMDataTrigger: () => void;
  isDownloading: boolean;
  onDownloadOSMLayers: (format: 'geojson' | 'kml' | 'shp') => Promise<void>;
  isQueryToolActive: boolean;
  onToggleQueryTool: () => void;
}

const OSMDownloadOptions: React.FC<OSMDownloadOptionsProps> = ({
  isFetchingOSM,
  onFetchOSMDataTrigger,
  isDownloading,
  onDownloadOSMLayers,
  isQueryToolActive,
  onToggleQueryTool,
}) => {
  const handleDownload = async (format: 'geojson' | 'kml' | 'shp') => {
    await onDownloadOSMLayers(format);
  };

  const iconButtonBaseClass = "h-8 w-8 p-0 flex items-center justify-center focus-visible:ring-primary";
  const buttonActiveFetchingClass = "bg-primary/70 hover:bg-primary/90 text-primary-foreground animate-pulse";
  const buttonDefaultClass = "border border-white/30 text-white/90 bg-black/20 hover:bg-black/40";
  const buttonActiveQueryClass = "bg-primary hover:bg-primary/90 text-primary-foreground";
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onFetchOSMDataTrigger}
              className={`${iconButtonBaseClass} ${
                isFetchingOSM ? buttonActiveFetchingClass : buttonDefaultClass
              } ${isFetchingOSM ? buttonDisabledClass : ""}`}
              disabled={isFetchingOSM}
              aria-label={isFetchingOSM ? "Cargando..." : "Obtener Datos OSM para el área dibujada"}
            >
              {isFetchingOSM ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
            <p className="text-xs">{isFetchingOSM ? "Cargando..." : "Obtener Datos OSM"}</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  className={`${iconButtonBaseClass} ${
                    isDownloading ? buttonActiveFetchingClass : buttonDefaultClass
                  } ${isDownloading ? buttonDisabledClass : ""}`}
                  disabled={isDownloading}
                  aria-label={isDownloading ? "Descargando..." : "Descargar capas OSM"}
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
              <p className="text-xs">{isDownloading ? "Descargando..." : "Descargar Capas OSM"}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="bg-gray-700 text-white border-gray-600 w-[180px]">
            <DropdownMenuItem className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer" onSelect={() => handleDownload('geojson')}>Como GeoJSON</DropdownMenuItem>
            <DropdownMenuItem className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer" onSelect={() => handleDownload('kml')}>Como KML</DropdownMenuItem>
            <DropdownMenuItem className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer" onSelect={() => handleDownload('shp')}>Como Shapefile (ZIP)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onToggleQueryTool}
              className={`${iconButtonBaseClass} ${
                isQueryToolActive ? buttonActiveQueryClass : buttonDefaultClass
              }`}
              aria-label={isQueryToolActive ? "Desactivar Consulta OSM" : "Activar Consulta Puntual de OSM"}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-700 text-white border-gray-600">
            <p className="text-xs">{isQueryToolActive ? "Desactivar Consulta OSM" : "Activar Consulta Puntual"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default OSMDownloadOptions;
