
"use client";

import React, { useState, useMemo } from 'react';
import DraggablePanel from './DraggablePanel';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DraftingCompass, Scissors, Layers, CircleDotDashed, MinusSquare } from 'lucide-react';
import type { MapLayer, VectorMapLayer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { intersect, featureCollection } from '@turf/turf';
import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry } from 'geojson';
import { multiPolygon } from '@turf/helpers';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { performBufferAnalysis, performDifferenceAnalysis } from '@/services/spatial-analysis';


interface AnalysisPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  allLayers: MapLayer[];
  selectedFeatures: Feature<Geometry>[];
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
  selectedFeatures,
  onAddLayer,
  style,
}) => {
  const [activeAccordionItem, setActiveAccordionItem] = useState<string | undefined>('proximity-tools');
  
  // State for Clip tool
  const [clipInputLayerId, setClipInputLayerId] = useState<string>('');
  const [clipMaskLayerId, setClipMaskLayerId] = useState<string>('');
  const [clipOutputName, setClipOutputName] = useState('');

  // State for Difference (Erase) tool
  const [eraseInputLayerId, setEraseInputLayerId] = useState<string>('');
  const [eraseMaskLayerId, setEraseMaskLayerId] = useState<string>('');
  const [eraseOutputName, setEraseOutputName] = useState('');
  
  // State for Buffer tool
  const [bufferInputLayerId, setBufferInputLayerId] = useState<string>('');
  const [bufferDistance, setBufferDistance] = useState<number>(100);
  const [bufferUnits, setBufferUnits] = useState<'meters' | 'kilometers' | 'miles'>('meters');
  const [bufferOutputName, setBufferOutputName] = useState('');

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
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    const maskFeatures = maskSource.getFeatures();
    const maskGeoJSON = format.writeFeaturesObject(maskFeatures) as TurfFeatureCollection<TurfPolygon | TurfMultiPolygon>;
    
    const maskPolygons = maskGeoJSON.features.flatMap(f => 
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    );
    if (maskPolygons.length === 0) {
        toast({ description: "La capa de máscara no contiene polígonos válidos.", variant: "destructive" });
        return;
    }
    const unifiedMask = multiPolygon(maskPolygons);

    const inputFeatures = inputSource.getFeatures();
    const inputGeoJSON = format.writeFeaturesObject(inputFeatures) as TurfFeatureCollection;

    const clippedFeaturesGeoJSON: TurfFeature<TurfGeometry>[] = [];

    for (const inputFeature of inputGeoJSON.features) {
        try {
            const intersectionResult = intersect(featureCollection([unifiedMask, inputFeature]));

            if (intersectionResult && intersectionResult.geometry && intersectionResult.geometry.coordinates.length > 0) {
                intersectionResult.properties = inputFeature.properties;
                clippedFeaturesGeoJSON.push(intersectionResult);
            }
        } catch (e) {
            console.warn("Error intersecting a feature, skipping it.", e);
        }
    }
    
    if (clippedFeaturesGeoJSON.length > 0) {
        const finalOLFeatures = formatForMap.readFeatures({
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

  const handleRunErase = async () => {
    const inputLayer = vectorLayers.find(l => l.id === eraseInputLayerId);
    const maskLayer = polygonLayers.find(l => l.id === eraseMaskLayerId);
    if (!inputLayer || !maskLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada y una de borrado.", variant: "destructive" });
        return;
    }
    const inputSource = inputLayer.olLayer.getSource();
    const maskSource = maskLayer.olLayer.getSource();
    if (!inputSource || !maskSource || maskSource.getFeatures().length === 0) {
        toast({ description: "Una de las capas seleccionadas no tiene entidades.", variant: "destructive" });
        return;
    }

    const outputName = eraseOutputName.trim() || `Diferencia de ${inputLayer.name}`;
    toast({ description: `Calculando diferencia para ${inputLayer.name}...` });

    try {
        const erasedFeatures = await performDifferenceAnalysis({
            inputFeatures: inputSource.getFeatures(),
            eraseFeatures: maskSource.getFeatures(),
        });

        if (erasedFeatures.length === 0) {
            toast({ description: "La operación de diferencia no produjo entidades resultantes." });
            return;
        }

        erasedFeatures.forEach(f => f.setId(nanoid()));
        const newLayerId = `erase-result-${nanoid()}`;
        const newSource = new VectorSource({ features: erasedFeatures });
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

        toast({ description: `Se creó la capa de diferencia "${outputName}" con ${erasedFeatures.length} entidades.` });
        setEraseInputLayerId('');
        setEraseMaskLayerId('');
        setEraseOutputName('');

    } catch (error: any) {
        console.error("Difference analysis failed:", error);
        toast({ title: "Error de Diferencia", description: error.message, variant: "destructive" });
    }
  };


 const handleRunBuffer = async () => {
    const inputLayer = vectorLayers.find(l => l.id === bufferInputLayerId);
    if (!inputLayer) {
        toast({ description: "Por favor, seleccione una capa de entrada para el buffer.", variant: "destructive" });
        return;
    }

    const inputSource = inputLayer.olLayer.getSource();
    if (!inputSource || inputSource.getFeatures().length === 0) {
        toast({ description: "La capa de entrada seleccionada no tiene entidades.", variant: "destructive" });
        return;
    }
    
    const safeSelectedFeatures = selectedFeatures || [];
    const relevantSelectedFeatures = safeSelectedFeatures.filter(feature => 
        inputSource.getFeatureById(feature.getId() as string | number) !== null
    );

    const featuresToBuffer = relevantSelectedFeatures.length > 0 ? relevantSelectedFeatures : inputSource.getFeatures();
    const outputName = bufferOutputName.trim() || `Buffer de ${inputLayer.name}`;

    toast({ description: `Calculando buffer para ${featuresToBuffer.length} entidad(es)...` });

    try {
      const bufferedFeatures = await performBufferAnalysis({
        features: featuresToBuffer,
        distance: bufferDistance,
        units: bufferUnits,
      });

      bufferedFeatures.forEach(f => f.setId(nanoid()));

      const newLayerId = `buffer-result-${nanoid()}`;
      const newSource = new VectorSource({ features: bufferedFeatures });
      const newOlLayer = new VectorLayer({
          source: newSource,
          properties: { id: newLayerId, name: outputName, type: 'analysis' },
      });

      onAddLayer({
          id: newLayerId,
          name: outputName,
          olLayer: newOlLayer,
          visible: true,
          opacity: 1,
          type: 'analysis',
      }, true);

      toast({ description: `Se creó la capa de buffer "${outputName}".` });

      setBufferInputLayerId('');
      setBufferOutputName('');
      setBufferDistance(100);

    } catch (error: any) {
        console.error("Buffer analysis failed:", error);
        toast({ title: "Error de Buffer", description: error.message, variant: "destructive" });
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
                  <div className="space-y-1">
                      <Label className="text-xs font-semibold">Diferencia (Erase)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                          <div>
                              <Label htmlFor="erase-input-layer" className="text-xs">Capa de Entrada (a borrar)</Label>
                              <Select value={eraseInputLayerId} onValueChange={setEraseInputLayerId}>
                                <SelectTrigger id="erase-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="erase-mask-layer" className="text-xs">Capa de Borrado (molde)</Label>
                              <Select value={eraseMaskLayerId} onValueChange={setEraseMaskLayerId}>
                                <SelectTrigger id="erase-mask-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa de polígonos..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {polygonLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                          </div>
                          <div>
                              <Label htmlFor="erase-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="erase-output-name" value={eraseOutputName} onChange={(e) => setEraseOutputName(e.target.value)} placeholder="Ej: Diferencia_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunErase} size="sm" className="w-full h-8 text-xs" disabled={!eraseInputLayerId || !eraseMaskLayerId}>
                              <MinusSquare className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Diferencia
                          </Button>
                      </div>
                  </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="proximity-tools" className="border-b-0 bg-white/5 rounded-md">
                <AccordionTrigger className="p-3 hover:no-underline hover:bg-white/10 rounded-t-md data-[state=open]:rounded-b-none">
                    <SectionHeader icon={CircleDotDashed} title="Herramientas de Proximidad" />
                </AccordionTrigger>
                <AccordionContent className="p-3 pt-2 space-y-3 border-t border-white/10 bg-transparent rounded-b-md">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Área de Influencia (Buffer)</Label>
                      <div className="space-y-2 p-2 border border-white/10 rounded-md">
                           <div>
                              <Label htmlFor="buffer-input-layer" className="text-xs">Capa de Entrada</Label>
                              <Select value={bufferInputLayerId} onValueChange={setBufferInputLayerId}>
                                <SelectTrigger id="buffer-input-layer" className="h-8 text-xs bg-black/20"><SelectValue placeholder="Seleccionar capa..." /></SelectTrigger>
                                <SelectContent className="bg-gray-700 text-white border-gray-600">
                                  {vectorLayers.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-400 mt-1">Si hay entidades seleccionadas, se usará la selección. Si no, se usará la capa completa.</p>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-grow">
                                <Label htmlFor="buffer-distance" className="text-xs">Distancia</Label>
                                <Input id="buffer-distance" type="number" value={bufferDistance} onChange={(e) => setBufferDistance(Number(e.target.value))} min="0" className="h-8 text-xs bg-black/20"/>
                            </div>
                             <div>
                                <Label htmlFor="buffer-units" className="text-xs">Unidades</Label>
                                <Select value={bufferUnits} onValueChange={(v) => setBufferUnits(v as any)}>
                                    <SelectTrigger id="buffer-units" className="h-8 text-xs bg-black/20 w-[120px]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-gray-700 text-white border-gray-600">
                                      <SelectItem value="meters" className="text-xs">Metros</SelectItem>
                                      <SelectItem value="kilometers" className="text-xs">Kilómetros</SelectItem>
                                      <SelectItem value="miles" className="text-xs">Millas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                          </div>
                          <div>
                              <Label htmlFor="buffer-output-name" className="text-xs">Nombre de la Capa de Salida</Label>
                              <Input id="buffer-output-name" value={bufferOutputName} onChange={(e) => setBufferOutputName(e.target.value)} placeholder="Ej: Buffer_de_CapaX" className="h-8 text-xs bg-black/20"/>
                          </div>
                           <Button onClick={handleRunBuffer} size="sm" className="w-full h-8 text-xs" disabled={!bufferInputLayerId}>
                              <CircleDotDashed className="mr-2 h-3.5 w-3.5" />
                              Ejecutar Buffer
                          </Button>
                      </div>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </DraggablePanel>
  );
};

export default AnalysisPanel;
