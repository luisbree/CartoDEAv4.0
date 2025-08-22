
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import DrawingToolbar from '@/components/drawing-tools/DrawingToolbar';
import MeasurementToolbar from '@/components/map-tools/MeasurementToolbar';
import OSMCategorySelector from '@/components/osm-integration/OSMCategorySelector';
import OSMDownloadOptions from '@/components/osm-integration/OSMDownloadOptions';
import { Wrench, Map as MapIcon } from 'lucide-react';
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
  onSaveDrawnFeaturesAsKML: () => void;
  
  // Measurement props
  measurementHook: ReturnType<typeof useMeasurement>;

  // OSM props
  isFetchingOSM: boolean;
  onFetchOSMDataTrigger: () => void;
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
  activeDrawTool, onToggleDrawingTool, onClearDrawnFeatures, onSaveDrawnFeaturesAsKML,
  measurementHook,
  isFetchingOSM, onFetchOSMDataTrigger, osmCategoriesForSelection, selectedOSMCategoryIds, 
  onSelectedOSMCategoriesChange,
  isDownloading, onDownloadOSMLayers,
  osmQueryHook,
  style,
}) => {

  const [activeAccordionItem, setActiveAccordionItem] = React.useState<string | undefined>('openstreetmap-section');
  
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
                onSaveDrawnFeaturesAsKML={onSaveDrawnFeaturesAsKML}
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
                   <h4 className="text-xs font-semibold text-white">Obtener Datos OSM por Área</h4>
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
              </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default ToolsPanel;
