"use client";

import React, { useState } from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower, Satellite, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import type { MapLayer } from '@/lib/types';
import TileLayer from 'ol/layer/Tile';
import { getGoesLayer } from '@/ai/flows/gee-flow';
import { nanoid } from 'nanoid';
import XYZ from 'ol/source/XYZ';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

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

    const handleAddGoesLayer = async () => {
        setIsLoading(true);
        toast({ description: "Buscando la última imagen de GOES-19..." });

        try {
            const result = await getGoesLayer();
            
            if (result && result.tileUrl) {
                const layerId = `goes-c13-layer-${nanoid()}`;
                let layerName = 'GOES-19 Topes Nubosos';
                
                if (result.metadata?.timestamp) {
                    const imageDate = new Date(result.metadata.timestamp);
                     const timeAgo = formatDistanceToNow(imageDate, { addSuffix: true, locale: es });
                     layerName = `GOES-19 Topes Nubosos (${timeAgo})`;
                }

                const goesSource = new XYZ({
                    url: result.tileUrl,
                    crossOrigin: 'anonymous',
                });

                const goesLayer = new TileLayer({
                    source: goesSource,
                    opacity: 0.8,
                    properties: {
                        id: layerId,
                        name: layerName,
                        type: 'gee', // Treat as a GEE layer type
                        geeParams: { bandCombination: 'GOES_CLOUDTOP' }
                    }
                });

                onAddLayer({
                    id: layerId,
                    name: layerName,
                    olLayer: goesLayer,
                    visible: true,
                    opacity: 0.8,
                    type: 'gee'
                }, true);

                toast({ description: `Capa "${layerName}" añadida.` });
            } else {
                 throw new Error("No se recibió una URL válida del servidor de GEE.");
            }

        } catch (error: any) {
            console.error("Error adding GOES layer:", error);
            toast({
                title: "Error al obtener capa GOES",
                description: error.message || "No se pudo añadir la capa de GOES.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

  return (
    <DraggablePanel
      title="Clima y Satélite"
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
            <h3 className="text-sm font-semibold">Satélite GOES-19 (Topes Nubosos)</h3>
            <p className="text-xs text-gray-400">
                Visualiza la temperatura de los topes nubosos captada por el satélite GOES-19. Las áreas más frías (blancas/azules) indican nubes de mayor desarrollo vertical, asociadas a posibles tormentas.
            </p>
            <Button className="w-full" onClick={handleAddGoesLayer} disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Satellite className="mr-2 h-4 w-4" />
                )}
                Añadir / Actualizar Capa GOES
            </Button>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
