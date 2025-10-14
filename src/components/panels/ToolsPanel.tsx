
"use client";

import React, { useState } from 'react';
import DraggablePanel from './DraggablePanel';
import DrawingToolbar from '@/components/drawing-tools/DrawingToolbar';
import MeasurementToolbar from '@/components/map-tools/MeasurementToolbar';
import OSMCategorySelector from '@/components/osm-integration/OSMCategorySelector';
import OSMDownloadOptions from '@/components/osm-integration/OSMDownloadOptions';
import { Wrench, Map as MapIcon, Loader2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';
import type { useOsmQuery } from '@/hooks/osm-integration/useOsmQuery';
import type { useMeasurement } from '@/hooks/map-tools/useMeasurement';
import type { DrawToolId } from '@/lib/types';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';


interface OSMCategory {
  id: string;
  name: string;
}

interface ToolsPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void; 
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;

  // Drawing props
  activeDrawTool: DrawToolId | null;
  onToggleDrawingTool: (toolType: DrawToolId) => void;
  onClearDrawnFeatures: () => void;
  onConvertDrawingsToLayer: () => void;
  
  // Measurement props
  measurementHook: ReturnType<typeof useMeasurement>;

  // OSM props
  isFetchingOSM: boolean;
  onFetchOSMDataTrigger: () => void;
  onFetchCustomOSMData: (key: string, value: string) => Promise<void>; // New prop
  osmCategoriesForSelection: OSMCategory[];
  selectedOSMCategoryIds: string[];
  onSelectedOSMCategoriesChange: (ids: string[]) => void;
  isDownloading: boolean;
  onDownloadOSMLayers: (format: 'geojson' | 'kml' | 'shp') => void;
  osmQueryHook: ReturnType<typeof useOsmQuery>;
  style?: React.CSSProperties;
}

const SectionHeader: React.FC<{ title: string; description?: string; icon: React.ElementType }> = ({ title, description, icon: Icon }) => (
  <div className="flex items-center w-full">
    <Icon className="mr-2 h-4 w-4 text-primary" />
    <div className="flex-1 text-left">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {description && <p className="text-xs text-gray-300/80">{description}</p>}
    </div>
  </div>
);

const ToolsPanel: React.FC<ToolsPanelProps> = ({
  panelRef, isCollapsed, onToggleCollapse, onClosePanel, onMouseDownHeader,
  activeDrawTool, onToggleDrawingTool, onClearDrawnFeatures, onConvertDrawingsToLayer,
  measurementHook,
  isFetchingOSM, onFetchOSMDataTrigger, onFetchCustomOSMData, osmCategoriesForSelection, selectedOSMCategoryIds, 
  onSelectedOSMCategoriesChange,
  isDownloading, onDownloadOSMLayers,
  osmQueryHook,
  style,
}) => {

  const [activeAccordionItem, setActiveAccordionItem] = React.useState<string | undefined>('openstreetmap-section');
  const [customOsmKey, setCustomOsmKey] = useState('');
  const [customOsmValue, setCustomOsmValue] = useState('');
  const [isFetchingCustom, setIsFetchingCustom] = useState(false);

  const handleCustomSearch = async () => {
    if (!customOsmKey.trim()) {
      // Assuming you have a toast mechanism
      console.error("La clave de etiqueta OSM es obligatoria.");
      return;
    }
    setIsFetchingCustom(true);
    await onFetchCustomOSMData(customOsmKey.trim(), customOsmValue.trim());
    setIsFetchingCustom(false);
  };
  
  return (
    <DraggablePanel
      title="Herramientas"
      icon={Wrench}
      panelRef={panelRef}
      initialPosition={{ x:0, y:0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel} 
      showCloseButton={true} 
      style={style}
      zIndex={style?.zIndex as number | undefined}
    >
        <div className="w-full bg-white/5 rounded-md p-2 space-y-1">
            <DrawingToolbar
                activeDrawTool={activeDrawTool}
                onToggleDrawingTool={onToggleDrawingTool}
                onClearDrawnFeatures={onClearDrawnFeatures}
                onConvertDrawingsToLayer={onConvertDrawingsToLayer}
            />
            <MeasurementToolbar
                activeMeasureTool={measurementHook.activeTool}
                onToggleMeasureTool={measurementHook.toggleTool}
                onClearMeasurements={measurementHook.clearMeasurements}
            />
        </div>

        <Separator className="my-2 bg-white/10" />

        <Accordion
          type="single"
          collapsible
          value={activeAccordionItem}
          onValueChange={setActiveAccordionItem}
          className="w-full space-y-1"
        >
            <AccordionItem value="openstreetmap-section" className="border-b-0 bg-white/5 rounded-md">
              <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                <SectionHeader
                  title="OpenStreetMap"
                  icon={MapIcon}
                />
              </AccordionTrigger>
              <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                <div className="space-y-2">
                   <h4 className="text-xs font-semibold text-white">Búsqueda por Categorías</h4>
                   <div className="flex items-center justify-start gap-1">
                      <OSMDownloadOptions
                        isFetchingOSM={isFetchingOSM}
                        onFetchOSMDataTrigger={onFetchOSMDataTrigger}
                        isDownloading={isDownloading}
                        onDownloadOSMLayers={onDownloadOSMLayers}
                        isQueryToolActive={osmQueryHook.isActive}
                        onToggleQueryTool={osmQueryHook.toggle}
                      />
                    </div>
                  <OSMCategorySelector
                      osmCategoriesForSelection={osmCategoriesForSelection}
                      selectedOSMCategoryIds={selectedOSMCategoryIds}
                      onSelectedOSMCategoriesChange={onSelectedOSMCategoriesChange} 
                  />
                </div>
                <Separator className="bg-white/10" />
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-white">Búsqueda Personalizada</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label htmlFor="osm-key" className="text-xs">Clave</Label>
                            <Input id="osm-key" value={customOsmKey} onChange={(e) => setCustomOsmKey(e.target.value)} placeholder="Ej: waterway" className="h-8 text-xs bg-black/20" />
                        </div>
                        <div className="space-y-1">
                             <Label htmlFor="osm-value" className="text-xs">Valor (opcional)</Label>
                            <Input id="osm-value" value={customOsmValue} onChange={(e) => setCustomOsmValue(e.target.value)} placeholder="Ej: river" className="h-8 text-xs bg-black/20" />
                        </div>
                    </div>
                    <Button onClick={handleCustomSearch} disabled={!customOsmKey.trim() || isFetchingCustom || isFetchingOSM} className="w-full h-8 text-xs">
                        {isFetchingCustom ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Buscar y Cargar Etiqueta
                    </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default ToolsPanel;
