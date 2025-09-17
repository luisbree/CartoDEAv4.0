
"use client";

import React, { useState, useMemo } from 'react';
import DraggablePanel from './DraggablePanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftingCompass, Scissors, Layers, CircleDotDashed } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import * as turf from '@turf/turf';
import bboxClip from '@turf/bbox-clip';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, BBox, FeatureCollection as TurfFeatureCollection } from 'geojson';


interface AnalysisPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  allLayers: MapLayer[];
  onAddLayer: (layer: MapLayer, bringToTop?: boolean) => void;
  style?: React.CSSProperties;
}

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; }> = ({ icon: Icon, title }) => (
    <div className="flex items-center w-full">
        <Icon className="h-4 w-4 mr-3 text-primary/90" />
        <span className="text-sm font-semibold">{title}</span>
    </div>
);


const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  allLayers,
  onAddLayer,
  style,
}) => {
  const [activeAccordionItem, setActiveAccordionItem] = useState<string | undefined>('overlay-tools');
  const [clipInputLayerId, setClipInputLayerId] = useState<string>('');
  const [clipMaskLayerId, setClipMaskLayerId] = useState<string>('');
  const [clipOutputName, setClipOutputName] = useState('');
  const { toast } = useToast();

  const vectorLayers = useMemo(() => {
    return allLayers.filter((l): l is VectorMapLayer => l.type !== 'wms' && l.type !== 'gee' && l.type !== 'geotiff');
  }, [allLayers]);
  
  const polygonLayers = useMemo(() => {
    return vectorLayers.filter(l => {
      const source = l.olLayer.getSource();
      const features = source?.getFeatures();
      if (features && features.length > 0) {
        const geomType = features[0].getGeometry()?.getType();
        return geomType === 'Polygon' || geomType === 'MultiPolygon';
      }
      return false;
    });
  }, [vectorLayers]);

 const handleRunClip = () => {
    const inputLayer = vectorLayers.find(l => l.id === clipInputLayerId);
    const maskLayer = polygonLayers.find(l => l.id === clipMaskLayerId);

    if (!inputLayer || !maskLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada y una de recorte.", variant: "destructive" });
        return;
    }
    
    const inputSource = inputLayer.olLayer.getSource();
    const maskSource = maskLayer.olLayer.getSource();
    if (!inputSource || !maskSource || maskSource.getFeatures().length === 0) {
        toast({ description: "Una de las capas seleccionadas no tiene entidades.", variant: "destructive" });
        return;
    }

    const outputName = clipOutputName.trim() || `Recorte de ${inputLayer.name}`;
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });

    // Convert mask layer to a single GeoJSON feature collection for bbox calculation
    const maskFeatures = maskSource.getFeatures();
    const maskGeoJSON = format.writeFeaturesObject(maskFeatures);
    
    // Calculate the bounding box of the entire mask layer
    const maskBbox = turf.bbox(maskGeoJSON);

    // Convert input features to GeoJSON
    const inputFeatures = inputSource.getFeatures();
    const inputGeoJSON = format.writeFeaturesObject(inputFeatures);

    const clippedFeaturesGeoJSON: TurfFeature[] = [];

    // Iterate through each feature of the input layer and clip it
    for (const feature of inputGeoJSON.features) {
        try {
            // Clip the individual feature
            const clippedFeature = bboxClip(feature, maskBbox);

            // *** THIS IS THE CRITICAL FIX ***
            // Check if the clipped geometry has actual coordinates.
            // bboxClip can return a geometry with an empty coordinates array if there's no overlap.
            if (clippedFeature.geometry && clippedFeature.geometry.coordinates && clippedFeature.geometry.coordinates.length > 0) {
                // Ensure nested arrays for polygons also aren't empty
                if (Array.isArray(clippedFeature.geometry.coordinates[0]) && clippedFeature.geometry.coordinates[0].length > 0) {
                    clippedFeaturesGeoJSON.push(clippedFeature);
                }
            }
        } catch (e) {
            console.warn("Error clipping a feature, skipping it.", e);
        }
    }
    
    if (clippedFeaturesGeoJSON.length > 0) {
        const formatForReading = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
        const finalOLFeatures = formatForReading.readFeatures({
            type: 'FeatureCollection',
            features: clippedFeaturesGeoJSON
        });

        finalOLFeatures.forEach(f => f.setId(nanoid()));

        const newLayerId = `clip-result-${nanoid()}`;
        const newSource = new VectorSource({ features: finalOLFeatures });
        const newOlLayer = new VectorLayer({
            source: newSource,
            properties: { id: newLayerId, name: outputName, type: 'analysis' },
            style: inputLayer.olLayer.getStyle(),
        });

        onAddLayer({
            id: newLayerId,
            name: outputName,
            olLayer: newOlLayer,
            visible: true,
            opacity: 1,
            type: 'analysis',
        }, true);
        toast({ description: `Se creó la capa de recorte "${outputName}" con ${finalOLFeatures.length} entidades.` });
        
        setClipInputLayerId('');
        setClipMaskLayerId('');
        setClipOutputName('');

    } else {
        toast({ description: "No se encontraron entidades resultantes de la operación de recorte." });
    }
  };


  return (
    <DraggablePanel
      title="Análisis Espacial"
      icon={DraftingCompass}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: "auto" }}
      minSize={{ width: 300, height: 250 }}
    >
       <Accordion
          type="single"
          collapsible
          value={activeAccordionItem}
          onValueChange={setActiveAccordionItem}
          className="w-full space-y-1"
        >
            <AccordionItem value="overlay-tools" className="border-b-0 bg-white/5 rounded-md">
              <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                <SectionHeader icon={Layers} title="Herramientas de Superposición" />
              </AccordionTrigger>
              <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                  <div className="space-y-1">
                      <Label className="text-xs font-semibold">Recorte (Clip)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="clip-input-layer" className="text-xs">Capa de Entrada (a recortar)</Label>
                              <Select value={clipInputLayerId} onValueChange={setClipInputLayerId}>
                                <SelectTrigger id="clip-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="clip-mask-layer" className="text-xs">Capa de Recorte (molde)</Label>
                              <Select value={clipMaskLayerId} onValueChange={setClipMaskLayerId}>
                                <SelectTrigger id="clip-mask-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de polígonos..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {polygonLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="clip-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="clip-output-name" value={clipOutputName} onChange={(e) => setClipOutputName(e.target.value)} placeholder="Ej: Recorte_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunClip} size="sm" className="w-full h-8 text-xs" disabled={!clipInputLayerId || !clipMaskLayerId}>
                              <Scissors className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Recorte
                          </Button>
                      </div>
                  </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="proximity-tools" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={CircleDotDashed} title="Herramientas de Proximidad" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 border-t border-white/10 bg-transparent rounded-b-md">
                    <p className="text-center text-xs text-gray-400 p-4">
                        Próximamente: Buffer, Unión Espacial y más.
                    </p>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default AnalysisPanel;
