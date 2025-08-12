
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import DrawingToolbar from '@/components/drawing-tools/DrawingToolbar';
import OSMCategorySelector from '@/components/osm-integration/OSMCategorySelector';
import OSMDownloadOptions from '@/components/osm-integration/OSMDownloadOptions';
import { Wrench, Map as MapIcon, HelpCircle } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';
import type { MapLayer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { useOsmQuery } from '@/hooks/osm-integration/useOsmQuery';


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
  activeDrawTool: string | null;
  onToggleDrawingTool: (toolType: 'Polygon' | 'LineString' | 'Point' | 'Rectangle' | 'FreehandPolygon') => void;
  onClearDrawnFeatures: () => void;
  onSaveDrawnFeaturesAsKML: () => void;

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
        <div className="w-full bg-white/5 rounded-md p-2">
            <DrawingToolbar
                activeDrawTool={activeDrawTool}
                onToggleDrawingTool={onToggleDrawingTool}
                onClearDrawnFeatures={onClearDrawnFeatures}
                onSaveDrawnFeaturesAsKML={onSaveDrawnFeaturesAsKML}
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
                
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">Consulta Puntual de OSM</h4>
                   <Button
                    onClick={osmQueryHook.toggle}
                    variant="outline"
                    className={cn(
                      "w-full h-8 text-xs border-dashed",
                      osmQueryHook.isActive ? "bg-primary/80 text-white border-primary" : "bg-black/20 hover:bg-black/40 border-white/30 text-white/90"
                    )}
                   >
                     <HelpCircle className="h-4 w-4 mr-2" />
                     {osmQueryHook.isActive ? 'Desactivar Consulta OSM' : 'Activar Consulta OSM'}
                   </Button>
                </div>
                
                 <Separator className="my-2 bg-white/10" />

                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">Obtener Datos OSM por Área</h4>
                  <OSMCategorySelector
                      osmCategoriesForSelection={osmCategoriesForSelection}
                      selectedOSMCategoryIds={selectedOSMCategoryIds}
                      onSelectedOSMCategoriesChange={onSelectedOSMCategoriesChange} 
                  />
                </div>
                <OSMDownloadOptions
                    isFetchingOSM={isFetchingOSM}
                    onFetchOSMDataTrigger={onFetchOSMDataTrigger}
                    isDownloading={isDownloading}
                    onDownloadOSMLayers={onDownloadOSMLayers}
                />
              </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default ToolsPanel;
