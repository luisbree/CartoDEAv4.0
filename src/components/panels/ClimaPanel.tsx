"use client";

import React, { useState } from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower, Satellite, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import type { MapLayer } from '@/lib/types';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import { nanoid } from 'nanoid';

interface ClimaPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddLayer: (layer: MapLayer, bringToTop?: boolean) => void;
  style?: React.CSSProperties;
}

const ClimaPanel: React.FC<ClimaPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onAddLayer,
  style,
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleAddRadarLayer = () => {
        setIsLoading(true);
        toast({ description: "Añadiendo capa de radar..." });

        try {
            const layerId = 'radar-weather-layer';
            const layerName = 'Radar Meteorológico (NEXRAD)';
            
            // Example NEXRAD WMS service from Iowa State University
            const radarSource = new TileWMS({
                url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi',
                params: {
                    'LAYERS': 'nexrad-n0r-900913',
                    'TILED': true,
                    'TRANSPARENT': true,
                    'FORMAT': 'image/png',
                },
                serverType: 'geoserver',
                crossOrigin: 'anonymous'
            });

            const radarLayer = new TileLayer({
                source: radarSource,
                opacity: 0.7,
                properties: {
                    id: layerId,
                    name: layerName,
                    type: 'wms'
                }
            });

            // This is a simplified addLayer; the main GeoMapperClient will handle adding to map and state
            onAddLayer({
                id: layerId,
                name: layerName,
                olLayer: radarLayer,
                visible: true,
                opacity: 0.7,
                type: 'wms'
            }, true);

            toast({ description: `Capa "${layerName}" añadida.` });

        } catch (error: any) {
            console.error("Error adding radar layer:", error);
            toast({
                title: "Error",
                description: "No se pudo añadir la capa de radar.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
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
            <h3 className="text-sm font-semibold">Radar Meteorológico (NEXRAD)</h3>
            <p className="text-xs text-gray-400">
                Visualiza la reflectividad del radar base de la red NEXRAD de EE.UU. (ejemplo). Las intensidades más altas (rojos/amarillos) indican precipitaciones más fuertes. La capa se actualiza periódicamente.
            </p>
            <Button className="w-full" onClick={handleAddRadarLayer} disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <RadioTower className="mr-2 h-4 w-4" />
                )}
                Añadir / Actualizar Capa de Radar
            </Button>
        </div>
        <div className="text-center text-gray-300 border-t border-gray-700 pt-4">
            <p className="text-sm">
                Integración con SMN pendiente.
            </p>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
