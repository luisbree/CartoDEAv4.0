
"use client";

import React, { useState, useRef } from 'react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, Loader2, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as htmlToImage from 'html-to-image';
import { useToast } from '@/hooks/use-toast';

interface PrintComposerPanelProps {
    mapImage: string;
    panelRef: React.RefObject<HTMLDivElement>;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onClosePanel: () => void;
    onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
    style?: React.CSSProperties;
}

// Reusable Layout Component
const PrintLayout = React.forwardRef<HTMLDivElement, { mapImage: string; title: string; subtitle: string }>(
  ({ mapImage, title, subtitle }, ref) => {
    return (
      <div ref={ref} id="print-layout-content" className="bg-white shadow-lg p-4 flex flex-col text-black h-full w-full">
        {/* Main Content Area */}
        <div className="flex-grow flex border border-black min-h-0">
          {/* Map Area */}
          <div className="flex-grow h-full relative">
            {mapImage ? (
                <img src={mapImage} alt="Mapa Capturado" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500">Cargando imagen del mapa...</div>
            )}
          </div>
        </div>
        {/* Footer Area */}
        <div className="h-20 flex-shrink-0 flex pt-2">
          {/* Titles */}
          <div className="flex-grow flex flex-col justify-start overflow-hidden">
            <h1 className="text-xl font-bold uppercase truncate" title={title}>{title}</h1>
            <h2 className="text-lg truncate" title={subtitle}>{subtitle}</h2>
          </div>
        </div>
      </div>
    );
  }
);
PrintLayout.displayName = "PrintLayout";


const PrintComposerPanel: React.FC<PrintComposerPanelProps> = ({
  mapImage,
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  const [title, setTitle] = useState("TÍTULO DEL MAPA");
  const [subtitle, setSubtitle] = useState("Subtítulo del mapa");
  const [dpi, setDpi] = useState(150);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const printLayoutRef = useRef<HTMLDivElement>(null);


  const handlePrint = () => {
    setTimeout(() => {
        window.print();
    }, 100);
  };
  
  const handleDownloadJpeg = async () => {
    if (!printLayoutRef.current) {
        toast({ description: "El layout de impresión no está listo.", variant: "destructive" });
        return;
    }
    setIsExporting(true);
    toast({ description: `Generando JPEG a ${dpi} DPI... Esto puede tardar unos segundos.` });

    try {
        const dataUrl = await htmlToImage.toJpeg(printLayoutRef.current, {
            quality: 0.98,
            pixelRatio: dpi / 96, 
            backgroundColor: '#ffffff',
            canvasWidth: printLayoutRef.current.offsetWidth * (dpi / 96),
            canvasHeight: printLayoutRef.current.offsetHeight * (dpi / 96),
        });

        const link = document.createElement('a');
        link.download = `${title.replace(/ /g, '_')}_${dpi}dpi.jpeg`;
        link.href = dataUrl;
        link.click();
        link.remove();
        toast({ description: "Descarga de JPEG iniciada." });
    } catch (error) {
        console.error('Error al generar JPEG:', error);
        toast({ description: "Error al generar el JPEG.", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };


  return (
    <>
      <DraggablePanel
        title="Compositor de Impresión"
        icon={Printer}
        panelRef={panelRef}
        initialPosition={{ x: 0, y: 0 }}
        onMouseDownHeader={onMouseDownHeader}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onClose={onClosePanel}
        showCloseButton={true}
        style={style}
        zIndex={style?.zIndex as number | undefined}
        initialSize={{ width: 550, height: 650 }}
        minSize={{ width: 400, height: 400 }}
      >
        <div className="flex flex-col h-full">
            <div className="space-y-2 mb-2 flex-shrink-0">
                <div>
                    <Label htmlFor="map-title-input" className="text-xs text-white">Título</Label>
                    <Input id="map-title-input" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm bg-black/20" />
                </div>
                <div>
                    <Label htmlFor="map-subtitle-input" className="text-xs text-white">Subtítulo</Label>
                    <Input id="map-subtitle-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="h-8 text-sm bg-black/20" />
                </div>
                 <div className="flex items-end gap-2 pt-1">
                    <div>
                        <Label htmlFor="print-dpi" className="text-xs text-white/90">DPI (JPEG)</Label>
                        <Select value={String(dpi)} onValueChange={(val) => setDpi(Number(val))}>
                            <SelectTrigger id="print-dpi" className="h-9 w-[150px] text-sm bg-black/20">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-700 text-white border-gray-600">
                                <SelectItem value="96" className="text-xs">96 (Borrador)</SelectItem>
                                <SelectItem value="150" className="text-xs">150 (Estándar)</SelectItem>
                                <SelectItem value="300" className="text-xs">300 (Alta Calidad)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button className="flex-grow h-9 bg-primary hover:bg-primary/90" disabled={isExporting}>
                                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                                Imprimir / Exportar
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-gray-700 text-white border-gray-600 w-56">
                            <DropdownMenuItem onSelect={handlePrint} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                <Printer className="mr-2 h-3.5 w-3.5" />
                                Imprimir / Guardar como PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleDownloadJpeg} className="text-xs hover:bg-gray-600 focus:bg-gray-600 cursor-pointer">
                                <Download className="mr-2 h-3.5 w-3.5" />
                                Descargar como JPEG
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            
            <div className="relative flex-grow overflow-auto bg-gray-900 p-2 rounded-md border border-gray-700 flex items-center justify-center">
                {/* Scaled preview */}
                <div 
                    className="w-[1058px] h-[748px] transform-origin-top-left flex-shrink-0" 
                    style={{ transform: `scale(0.45)` }}
                >
                    <PrintLayout mapImage={mapImage} title={title} subtitle={subtitle} />
                </div>
            </div>
        </div>
      </DraggablePanel>

      {/* Hidden, full-size div for printing and exporting */}
      <div id="print-layout-container" className="fixed top-0 left-[-9999px] z-[-1] bg-white">
        <div ref={printLayoutRef} className="w-[29.7cm] h-[21cm] bg-white">
          <PrintLayout mapImage={mapImage} title={title} subtitle={subtitle} />
        </div>
      </div>
    </>
  );
};

export default PrintComposerPanel;
