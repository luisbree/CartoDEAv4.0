

"use client";

import React, { useState } from 'react';
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrainCircuit, Loader2, Image as ImageIcon, CheckCircle, AlertTriangle, Calendar as CalendarIcon, Shapes, Download, BarChart2, ChevronDown } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getGeeTileLayer, getTasseledCapLayers, getGeeVectorDownloadUrl, getGeeGeoTiffDownloadUrl, getGeeHistogram } from '@/ai/flows/gee-flow';
import type { Map } from 'ol';
import { transformExtent } from 'ol/proj';
import type { GeeTileLayerInput, GeeVectorizationInput, GeeHistogramOutput, TasseledCapInput, TasseledCapComponent } from '@/ai/flows/gee-types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';


interface GeeProcessingPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  onAddGeeLayer: (tileUrl: string, layerName: string, geeParams: Omit<GeeTileLayerInput, 'aoi' | 'zoom'>) => void;
  mapRef: React.RefObject<Map | null>;
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  style?: React.CSSProperties;
}

type BandCombination = GeeTileLayerInput['bandCombination'];

const DYNAMIC_WORLD_LEGEND = [
    { color: '#419BDF', label: 'Agua' },
    { color: '#397D49', label: 'Árboles' },
    { color: '#88B053', label: 'Césped' },
    { color: '#7A87C6', label: 'Vegetación Inundada' },
    { color: '#E49635', label: 'Cultivos' },
    { color: '#DFC35A', label: 'Arbustos' },
    { color: '#C4281B', label: 'Área Construida' },
    { color: '#A59B8F', label: 'Suelo Desnudo' },
    { color: '#B39FE1', label: 'Nieve y Hielo' },
];

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-sm border border-white/20" style={{ backgroundColor: color }} />
        <span className="text-xs text-white/90">{label}</span>
    </div>
);


const GeeProcessingPanel: React.FC<GeeProcessingPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  onAddGeeLayer,
  mapRef,
  isAuthenticating,
  isAuthenticated,
  style,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [isDownloadingTiff, setIsDownloadingTiff] = useState(false);
  const [isCalculatingHistogram, setIsCalculatingHistogram] = useState(false);
  const [histogramData, setHistogramData] = useState<GeeHistogramOutput['histogram'] | null>(null);
  const [selectedCombination, setSelectedCombination] = useState<BandCombination>('URBAN_FALSE_COLOR');
  const [date, setDate] = useState<DateRange | undefined>({
    from: addDays(new Date(), -365),
    to: new Date(),
  });
  const [elevationRange, setElevationRange] = useState<[number, number]>([0, 150]);
  const { toast } = useToast();

  const handleGenerateLayer = async () => {
    if (!mapRef.current || !isAuthenticated) {
        toast({ description: "El mapa no está listo o no estás autenticado.", variant: "destructive" });
        return;
    }
    
    setIsProcessing(true);
    setHistogramData(null);
    
    const view = mapRef.current.getView();
    const extent = view.calculateExtent(mapRef.current.getSize()!);
    const zoom = view.getZoom() || 2;
    const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');
    const aoi = { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] };
    const geeParamsBase = {
        startDate: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
        endDate: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
    };
    
    try {
        if (selectedCombination === 'TASSELED_CAP') {
            toast({ description: "Generando las tres capas de Tasseled Cap..." });
            const result = await getTasseledCapLayers({ aoi, zoom, ...geeParamsBase, bandCombination: selectedCombination });
            
            // Add Brightness layer
            onAddGeeLayer(result.brightness.tileUrl, 'Tasseled Cap: Brillo', { ...geeParamsBase, bandCombination: 'TASSELED_CAP' });
            // Add Greenness layer
            onAddGeeLayer(result.greenness.tileUrl, 'Tasseled Cap: Verdor', { ...geeParamsBase, bandCombination: 'TASSELED_CAP' });
            // Add Wetness layer
            onAddGeeLayer(result.wetness.tileUrl, 'Tasseled Cap: Humedad', { ...geeParamsBase, bandCombination: 'TASSELED_CAP' });
            
            toast({ description: "Se añadieron las 3 capas de Tasseled Cap." });

        } else {
            // Logic for all other single-layer combinations
            const geeParams: Omit<GeeTileLayerInput, 'aoi' | 'zoom'> = {
                ...geeParamsBase,
                bandCombination: selectedCombination,
                minElevation: (selectedCombination === 'NASADEM_ELEVATION' || selectedCombination === 'ALOS_DSM') ? elevationRange[0] : undefined,
                maxElevation: (selectedCombination === 'NASADEM_ELEVATION' || selectedCombination === 'ALOS_DSM') ? elevationRange[1] : undefined,
            };

            const result = await getGeeTileLayer({ aoi, zoom, ...geeParams });
            
            if (result && result.tileUrl) {
                let layerName;
                switch(selectedCombination) {
                    case 'URBAN_FALSE_COLOR': layerName = 'Sentinel-2 (Urbano) GEE'; break;
                    case 'SWIR_FALSE_COLOR': layerName = 'Sentinel-2 (SWIR) GEE'; break;
                    case 'BSI': layerName = 'Índice de Suelo Desnudo (BSI) GEE'; break;
                    case 'NDVI': layerName = 'Índice de Vegetación (NDVI) GEE'; break;
                    case 'JRC_WATER_OCCURRENCE': layerName = 'Agua Superficial (JRC)'; break;
                    case 'OPENLANDMAP_SOC': layerName = 'Carbono Org. del Suelo (OpenLandMap)'; break;
                    case 'DYNAMIC_WORLD': layerName = 'Dynamic World Land Cover'; break;
                    case 'NASADEM_ELEVATION': layerName = `NASADEM Elevación (${elevationRange[0]}-${elevationRange[1]}m)`; break;
                    case 'ALOS_DSM': layerName = `ALOS DSM (${elevationRange[0]}-${elevationRange[1]}m)`; break;
                    default: layerName = 'Capa GEE';
                }
                onAddGeeLayer(result.tileUrl, layerName, geeParams);
            } else {
                throw new Error("La respuesta del servidor no contenía una URL de teselas.");
            }
        }
    } catch (error: any) {
      console.error("Error generating GEE layer(s):", error);
      toast({ title: "Error de GEE", description: error.message || "No se pudo generar la capa de Earth Engine.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVectorizeAndDownload = async () => {
    if (!mapRef.current || !isAuthenticated || !date?.from || !date?.to) {
        toast({ description: "Asegúrese de estar autenticado y de haber seleccionado un rango de fechas.", variant: "destructive" });
        return;
    }
    setIsVectorizing(true);
    toast({ description: "Iniciando vectorización en GEE. Esto puede tardar varios segundos..." });

    const view = mapRef.current.getView();
    const extent = view.calculateExtent(mapRef.current.getSize()!);
    const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');
    
    try {
        const result = await getGeeVectorDownloadUrl({
            aoi: { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] },
            startDate: format(date.from, 'yyyy-MM-dd'),
            endDate: format(date.to, 'yyyy-MM-dd'),
        });
        
        if (result && result.downloadUrl) {
            toast({ description: "Proceso completado. Iniciando descarga..." });
            window.open(result.downloadUrl, '_blank');
        } else {
            throw new Error("No se recibió una URL de descarga del servidor.");
        }
    } catch (error: any) {
        console.error("Error vectorizing GEE layer:", error);
        toast({ title: "Error de Vectorización", description: error.message || "No se pudo vectorizar la capa.", variant: "destructive" });
    } finally {
        setIsVectorizing(false);
    }
  };
  
  const handleDownloadGeoTiff = async (tasseledCapComponent?: TasseledCapComponent) => {
    if (!mapRef.current || !isAuthenticated) {
        toast({ description: "Asegúrese de estar autenticado.", variant: "destructive" });
        return;
    }
    setIsDownloadingTiff(true);
    const componentText = tasseledCapComponent ? ` (${tasseledCapComponent.toLowerCase()})` : '';
    toast({ description: `Iniciando exportación de GeoTIFF${componentText} en GEE. Esto puede tardar...` });

    const view = mapRef.current.getView();
    const extent = view.calculateExtent(mapRef.current.getSize()!);
    const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');

    try {
        const result = await getGeeGeoTiffDownloadUrl({
            aoi: { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] },
            bandCombination: selectedCombination,
            startDate: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
            endDate: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
            minElevation: (selectedCombination === 'NASADEM_ELEVATION' || selectedCombination === 'ALOS_DSM') ? elevationRange[0] : undefined,
            maxElevation: (selectedCombination === 'NASADEM_ELEVATION' || selectedCombination === 'ALOS_DSM') ? elevationRange[1] : undefined,
            tasseledCapComponent: tasseledCapComponent,
        });
        
        if (result && result.downloadUrl) {
            toast({ description: "Exportación completada. Iniciando descarga..." });
            window.open(result.downloadUrl, '_blank');
        } else {
            throw new Error("No se recibió una URL de descarga del servidor.");
        }
    } catch (error: any) {
        console.error("Error downloading GEE GeoTIFF:", error);
        toast({ title: "Error de Descarga", description: error.message || "No se pudo generar el GeoTIFF.", variant: "destructive" });
    } finally {
        setIsDownloadingTiff(false);
    }
  };

  const handleCalculateHistogram = async () => {
      if (!mapRef.current || !isAuthenticated) {
          toast({ description: "Asegúrese de estar autenticado.", variant: "destructive" });
          return;
      }
      if (selectedCombination !== 'NASADEM_ELEVATION' && selectedCombination !== 'ALOS_DSM') return;

      setIsCalculatingHistogram(true);
      setHistogramData(null);
      toast({ description: "Calculando histograma de elevación para la vista actual..." });

      const view = mapRef.current.getView();
      const extent = view.calculateExtent(mapRef.current.getSize()!);
      const extent4326 = transformExtent(extent, view.getProjection(), 'EPSG:4326');

      try {
          const result = await getGeeHistogram({
              aoi: { minLon: extent4326[0], minLat: extent4326[1], maxLon: extent4326[2], maxLat: extent4326[3] },
              bandCombination: selectedCombination,
          });

          if (result && result.histogram) {
              const formattedData = result.histogram.map(([value, count]) => ({
                  elevation: Math.round(value),
                  count,
              }));
              setHistogramData(formattedData as any); // Cast for chart component
              toast({ description: "Histograma calculado con éxito." });
          } else {
              throw new Error("El servidor no devolvió datos para el histograma.");
          }
      } catch (error: any) {
          console.error("Error calculating GEE histogram:", error);
          toast({ title: "Error de Histograma", description: error.message || "No se pudo generar el histograma.", variant: "destructive" });
      } finally {
          setIsCalculatingHistogram(false);
      }
  };

  const getAuthStatusContent = () => {
    if (isAuthenticating) {
      return (
        <div className="flex items-center text-xs text-yellow-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Autenticando con Google Earth Engine...
        </div>
      );
    }
    if (isAuthenticated) {
      return (
        <div className="flex items-center text-xs text-green-400">
          <CheckCircle className="mr-2 h-4 w-4" />
          Autenticación con GEE exitosa.
        </div>
      );
    }
    return (
      <div className="flex items-center text-xs text-red-400">
        <AlertTriangle className="mr-2 h-4 w-4" />
        Fallo en la autenticación con GEE. Verifique la consola.
      </div>
    );
  };

  const isDateSelectionDisabled = ['JRC_WATER_OCCURRENCE', 'OPENLANDMAP_SOC', 'NASADEM_ELEVATION', 'ALOS_DSM'].includes(selectedCombination);
  const showElevationControls = selectedCombination === 'NASADEM_ELEVATION' || selectedCombination === 'ALOS_DSM';
  const showDynamicWorldLegend = selectedCombination === 'DYNAMIC_WORLD';
  const showVectorizeButton = selectedCombination === 'DYNAMIC_WORLD';

  const commonButtonDisabled = isProcessing || isVectorizing || isAuthenticating || !isAuthenticated || isDownloadingTiff;
  const tiffButtonDisabled = commonButtonDisabled || (isDateSelectionDisabled ? false : (!date?.from || !date?.to));


  return (
    <DraggablePanel
      title="Procesamiento GEE"
      icon={BrainCircuit}
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
      <div className="bg-white/5 rounded-md p-3 space-y-3">
        <div className="p-2 rounded-md bg-black/20 text-center">
            {getAuthStatusContent()}
        </div>
        <div>
            <h3 className="text-sm font-semibold text-white mb-2">Composición de Bandas / Índices</h3>
            <RadioGroup defaultValue={selectedCombination} onValueChange={(value: BandCombination) => {setSelectedCombination(value); setHistogramData(null);}}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="URBAN_FALSE_COLOR" id="urban-combo" />
                <Label htmlFor="urban-combo" className="text-xs font-normal">Falso Color (Urbano - B8, B4, B3)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="SWIR_FALSE_COLOR" id="swir-combo" />
                <Label htmlFor="swir-combo" className="text-xs font-normal">Falso Color (SWIR - B12, B8A, B4)</Label>
              </div>
               <div className="flex items-center space-x-2">
                <RadioGroupItem value="BSI" id="bsi-combo" />
                <Label htmlFor="bsi-combo" className="text-xs font-normal">Índice de Suelo Desnudo (BSI)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NDVI" id="ndvi-combo" />
                <Label htmlFor="ndvi-combo" className="text-xs font-normal">Índice de Vegetación (NDVI)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="TASSELED_CAP" id="tc-combo" />
                <Label htmlFor="tc-combo" className="text-xs font-normal">Tasseled Cap (Brillo, Verdor, Humedad)</Label>
              </div>
               <div className="flex items-center space-x-2">
                <RadioGroupItem value="DYNAMIC_WORLD" id="dw-combo" />
                <Label htmlFor="dw-combo" className="text-xs font-normal">Cobertura del Suelo (Dynamic World)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="NASADEM_ELEVATION" id="nasadem-combo" />
                <Label htmlFor="nasadem-combo" className="text-xs font-normal">Modelo de Elevación (NASADEM)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ALOS_DSM" id="alos-combo" />
                <Label htmlFor="alos-combo" className="text-xs font-normal">Modelo de Superficie (ALOS DSM)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="JRC_WATER_OCCURRENCE" id="jrc-combo" />
                <Label htmlFor="jrc-combo" className="text-xs font-normal">Agua Superficial (JRC)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="OPENLANDMAP_SOC" id="soc-combo" />
                <Label htmlFor="soc-combo" className="text-xs font-normal">Carbono Org. Suelo (OpenLandMap)</Label>
              </div>
            </RadioGroup>
        </div>
        
        {showDynamicWorldLegend && (
            <div className="pt-2 border-t border-white/10 space-y-2">
                <Label className="text-sm font-semibold text-white">Leyenda de Dynamic World</Label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-black/10 rounded-md">
                    {DYNAMIC_WORLD_LEGEND.map(item => (
                        <LegendItem key={item.label} color={item.color} label={item.label} />
                    ))}
                </div>
            </div>
        )}

        {showElevationControls && (
          <div className="pt-2 border-t border-white/10 space-y-3">
              <Label className="text-sm font-semibold text-white">Controles de Elevación</Label>
              <div className="grid grid-cols-2 gap-2">
                  <div>
                      <Label htmlFor="min-elevation-input" className="text-xs font-medium text-white/90 mb-1 block">Elev. Mínima (m)</Label>
                      <Input
                          id="min-elevation-input"
                          type="number"
                          value={elevationRange[0]}
                          onChange={(e) => {
                              const newMin = Number(e.target.value);
                              setElevationRange(prev => [newMin, Math.max(newMin, prev[1])]);
                          }}
                          className="h-8 text-xs bg-black/20"
                      />
                  </div>
                  <div>
                      <Label htmlFor="max-elevation-input" className="text-xs font-medium text-white/90 mb-1 block">Elev. Máxima (m)</Label>
                      <Input
                          id="max-elevation-input"
                          type="number"
                          value={elevationRange[1]}
                          onChange={(e) => {
                              const newMax = Number(e.target.value);
                              setElevationRange(prev => [Math.min(newMax, prev[0]), newMax]);
                          }}
                          className="h-8 text-xs bg-black/20"
                      />
                  </div>
              </div>
              <Button
                  onClick={handleCalculateHistogram}
                  disabled={isCalculatingHistogram || isAuthenticating || !isAuthenticated}
                  className="w-full h-8 text-xs"
                  variant="secondary"
              >
                  {isCalculatingHistogram ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                      <BarChart2 className="mr-2 h-4 w-4" />
                  )}
                  Calcular Histograma de la Vista
              </Button>
              {histogramData && histogramData.length > 0 && (
                  <div className="h-40 w-full mt-2">
                      <ResponsiveContainer>
                          <BarChart data={histogramData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                              <XAxis dataKey="elevation" stroke="#888888" fontSize={10} tickFormatter={(value) => `${value}m`} />
                              <YAxis stroke="#888888" fontSize={10} tickFormatter={(value) => value > 1000 ? `${(value/1000).toFixed(1)}k` : value}/>
                              <Tooltip
                                  contentStyle={{
                                      backgroundColor: 'rgba(30, 41, 59, 0.9)',
                                      borderColor: '#4b5563',
                                      fontSize: '12px'
                                  }}
                                  labelFormatter={(label) => `Elevación: ${label} m`}
                                  formatter={(value: number) => [value.toLocaleString(), 'Píxeles']}
                              />
                              <Bar dataKey="count" fill="hsl(var(--primary))" />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              )}
          </div>
        )}

        <div className="pt-2 border-t border-white/10">
          <Label className={cn("text-sm font-semibold text-white mb-2 block", isDateSelectionDisabled && "text-gray-500")}>
              Rango de Fechas (Sentinel-2 / Dynamic World / TC)
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                disabled={isDateSelectionDisabled}
                className={cn(
                  "w-full justify-start text-left font-normal h-9 text-xs border-white/30 bg-black/20 text-white/90 focus:ring-primary",
                  !date && "text-muted-foreground",
                   isDateSelectionDisabled && "bg-gray-800/50 text-gray-500 border-gray-700 cursor-not-allowed"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "LLL dd, y")} -{" "}
                      {format(date.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(date.from, "LLL dd, y")
                  )
                ) : (
                  <span>Seleccionar rango</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-gray-700 text-white border-gray-600" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                classNames={{
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary/90",
                    day_today: "bg-accent/50 text-accent-foreground",
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <Button 
             onClick={handleGenerateLayer} 
             disabled={commonButtonDisabled || (isDateSelectionDisabled ? false : (!date?.from || !date?.to))} 
             className="w-full"
           >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="mr-2 h-4 w-4" />
            )}
            Añadir como Capa(s)
          </Button>

          {selectedCombination === 'TASSELED_CAP' ? (
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="secondary" className="w-full" disabled={tiffButtonDisabled}>
                          {isDownloadingTiff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                          Descargar Vista (GeoTIFF)
                          <ChevronDown className="ml-auto h-4 w-4" />
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] bg-gray-700 text-white border-gray-600">
                      <DropdownMenuItem onSelect={() => handleDownloadGeoTiff('BRIGHTNESS')}>Brillo</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleDownloadGeoTiff('GREENNESS')}>Verdor</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleDownloadGeoTiff('WETNESS')}>Humedad</DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          ) : (
              <Button
                onClick={() => handleDownloadGeoTiff()}
                disabled={tiffButtonDisabled}
                className="w-full"
                variant="secondary"
              >
                {isDownloadingTiff ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Descargar Vista (GeoTIFF)
              </Button>
          )}

        </div>
        
        {showVectorizeButton && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <Button 
               onClick={handleVectorizeAndDownload} 
               disabled={commonButtonDisabled || !date?.from || !date?.to} 
               className="w-full"
               variant="secondary"
             >
              {isVectorizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shapes className="mr-2 h-4 w-4" />
              )}
              Vectorizar y Descargar (GeoJSON)
            </Button>
          </div>
        )}
      </div>
    </DraggablePanel>
  );
};

export default GeeProcessingPanel;
 
