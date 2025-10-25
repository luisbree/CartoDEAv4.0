
"use client";

import React, { useState } from 'react';
import DraggablePanel from './DraggablePanel';
import { CloudRain, RadioTower, Satellite, Loader2, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import type { MapLayer } from '@/lib/types';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { getGoesLayer, getGoesStormCores } from '@/ai/flows/gee-flow';
import { nanoid } from 'nanoid';
import XYZ from 'ol/source/XYZ';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Separator } from '../ui/separator';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';

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
    const [isDetecting, setIsDetecting] = useState(false);
    const [tempThreshold, setTempThreshold] = useState(-65);
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
                     const formattedDate = format(imageDate, "dd/MM/yyyy HH:mm 'UTC'", { locale: es });
                     layerName = `GOES-19 Topes Nubosos (${formattedDate})`;
                }

                const goesSource = new XYZ({
                    url: result.tileUrl,
                    crossOrigin: 'anonymous',
                });

                const geeParams = {
                    bandCombination: 'GOES_CLOUDTOP',
                    metadata: result.metadata, // Store all metadata
                };

                const goesLayer = new TileLayer({
                    source: goesSource,
                    opacity: 0.6,
                    properties: {
                        id: layerId,
                        name: layerName,
                        type: 'gee',
                        isGoesLayer: true, // Custom flag
                        geeParams: geeParams
                    }
                });

                onAddLayer({
                    id: layerId,
                    name: layerName,
                    olLayer: goesLayer,
                    visible: true,
                    opacity: 0.6,
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
    
    const handleDetectStormCores = async () => {
        setIsDetecting(true);
        toast({ description: `Detectando núcleos de tormenta (T < ${tempThreshold}°C)...` });

        try {
            const result = await getGoesStormCores({ temperatureThreshold: tempThreshold });
            if (result && result.downloadUrl) {
                const layerId = `storm-cores-${nanoid()}`;
                const layerName = `Núcleos de Tormenta (${tempThreshold}°C)`;
                
                const vectorSource = new VectorSource({
                    url: result.downloadUrl,
                    format: new GeoJSON(),
                });

                const vectorLayer = new VectorLayer({
                    source: vectorSource,
                    properties: {
                        id: layerId,
                        name: layerName,
                        type: 'analysis'
                    },
                    opacity: 0.7
                });

                onAddLayer({
                    id: layerId,
                    name: layerName,
                    olLayer: vectorLayer,
                    visible: true,
                    opacity: 0.7,
                    type: 'analysis'
                }, true);

                toast({ description: "Se añadieron los núcleos de tormenta como una nueva capa." });

            } else {
                throw new Error("No se recibió una URL de descarga para los núcleos de tormenta.");
            }
        } catch (error: any) {
            console.error("Error detecting storm cores:", error);
            toast({
                title: "Error en Detección",
                description: error.message || "No se pudieron detectar los núcleos de tormenta.",
                variant: "destructive",
            });
        } finally {
            setIsDetecting(false);
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
                Visualiza la temperatura de los topes nubosos captada por el satélite GOES-19. Las áreas más frías (rojas/negras) indican nubes de mayor desarrollo vertical, asociadas a posibles tormentas.
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

        <Separator className="bg-white/15" />

        <div className="space-y-3">
            <h3 className="text-sm font-semibold">Detección de Núcleos de Tormenta</h3>
             <div className="space-y-2">
                <Label htmlFor="temp-threshold" className="text-xs">Umbral de Temperatura: <span className="font-bold">{tempThreshold}°C</span></Label>
                <Slider
                    id="temp-threshold"
                    min={-100}
                    max={-30}
                    step={1}
                    value={[tempThreshold]}
                    onValueChange={(value) => setTempThreshold(value[0])}
                    disabled={isDetecting}
                />
            </div>
            <p className="text-xs text-gray-400">
                Vectoriza las áreas de la última imagen GOES que estén por debajo del umbral de temperatura seleccionado.
            </p>
            <Button className="w-full" onClick={handleDetectStormCores} disabled={isDetecting || isLoading}>
                {isDetecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Zap className="mr-2 h-4 w-4" />
                )}
                Detectar Núcleos de Tormenta
            </Button>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default ClimaPanel;
