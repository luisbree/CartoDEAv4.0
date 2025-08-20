
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import type Feature from 'ol/Feature';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useToast } from "@/hooks/use-toast";
import type { Geometry } from 'ol/geom';
import Select, { type SelectEvent } from 'ol/interaction/Select';
import DragBox from 'ol/interaction/DragBox';
import { singleClick } from 'ol/events/condition';
import type { PlainFeatureData } from '@/lib/types';

interface UseFeatureInspectionProps {
  mapRef: React.RefObject<Map | null>;
  mapElementRef: React.RefObject<HTMLDivElement | null>;
  isMapReady: boolean;
  onNewSelection: () => void;
}

export type ActiveInteractionTool = 'inspect' | 'selectClick' | 'selectBox' | null;

const highlightStyle = new Style({
  stroke: new Stroke({
    color: '#00FFFF', // Cyan
    width: 4,
  }),
  fill: new Fill({
    color: 'rgba(0, 255, 255, 0.2)',
  }),
  image: new CircleStyle({
    radius: 8,
    fill: new Fill({ color: 'rgba(0, 255, 255, 0.4)' }),
    stroke: new Stroke({ color: '#00FFFF', width: 2 }),
  }),
  zIndex: Infinity,
});

export const useFeatureInspection = ({
  mapRef,
  mapElementRef,
  isMapReady,
  onNewSelection,
}: UseFeatureInspectionProps) => {
  const { toast } = useToast();
  const [activeTool, setActiveTool] = useState<ActiveInteractionTool>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Feature<Geometry>[]>([]);
  const [inspectedFeatureData, setInspectedFeatureData] = useState<PlainFeatureData[] | null>(null);
  const [currentInspectedLayerName, setCurrentInspectedLayerName] = useState<string | null>(null);

  const selectInteractionRef = useRef<Select | null>(null);
  const dragBoxInteractionRef = useRef<DragBox | null>(null);
  
  const onNewSelectionRef = useRef(onNewSelection);
  useEffect(() => {
    onNewSelectionRef.current = onNewSelection;
  }, [onNewSelection]);

  const extractPlainAttributes = (features: Feature<Geometry>[]): PlainFeatureData[] => {
    if (!features) return [];
    return features.map(feature => ({
        id: feature.getId() as string,
        attributes: feature.getProperties(),
    }));
  };

  const processAndDisplayFeatures = useCallback((plainData: PlainFeatureData[], layerName: string) => {
    if (plainData.length === 0) {
      setInspectedFeatureData([]);
      setCurrentInspectedLayerName(null);
      return;
    }
    
    setInspectedFeatureData(plainData);
    setCurrentInspectedLayerName(layerName);
    if (plainData.length > 0) {
       setTimeout(() => toast({ description: `${plainData.length} entidad(es) de "${layerName}" inspeccionada(s).` }), 0);
    }
    
    onNewSelectionRef.current();
  }, [toast, onNewSelectionRef]);
  
  const clearSelection = useCallback(() => {
    if (selectInteractionRef.current) {
      selectInteractionRef.current.getFeatures().clear();
    }
    setSelectedFeatures([]);
    setInspectedFeatureData(null);
    setCurrentInspectedLayerName(null);
  }, []);

  const selectFeaturesById = useCallback((featureIds: string[]) => {
    if (!selectInteractionRef.current || !mapRef.current) return;

    const featuresToSelect: Feature<Geometry>[] = [];
    mapRef.current.getLayers().forEach(layer => {
        if (layer instanceof VectorLayer) {
            const source = layer.getSource();
            if (source) {
                featureIds.forEach(id => {
                    const feature = source.getFeatureById(id);
                    if (feature) {
                        featuresToSelect.push(feature as Feature<Geometry>);
                    }
                });
            }
        }
    });
    
    selectInteractionRef.current.getFeatures().clear();
    selectInteractionRef.current.getFeatures().extend(featuresToSelect);
    setSelectedFeatures(featuresToSelect);
  }, [mapRef]);
  
  const handleSetActiveTool = useCallback((tool: ActiveInteractionTool) => {
    setActiveTool(tool);
    clearSelection();
    
    const toolMessages = {
      inspect: 'Modo Inspección activado. Haga clic en una entidad.',
      selectClick: 'Modo Selección por Clic activado.',
      selectBox: 'Modo Selección por Caja activado.',
    };

    if (tool && toolMessages[tool]) {
      toast({ description: toolMessages[tool] });
    } else {
      toast({ description: 'Modo interactivo desactivado.' });
    }
  }, [clearSelection, toast]);

  
  // Effect to manage interactions based on active state and mode
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Clean up previous interactions to avoid duplicates
    if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
    if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
    selectInteractionRef.current = null;
    dragBoxInteractionRef.current = null;
    if (mapElementRef.current) mapElementRef.current.style.cursor = 'default';

    if (activeTool) {
      const isBoxMode = activeTool === 'selectBox';
      if (mapElementRef.current) {
         mapElementRef.current.style.cursor = isBoxMode ? 'crosshair' : 'help';
      }

      // --- Select interaction for clicks ---
      const select = new Select({
        style: highlightStyle,
        multi: true, // Always allow multi for simplicity, Ctrl key will handle it
        condition: singleClick,
        filter: (feature, layer) => !layer.get('isBaseLayer') && !layer.get('isDrawingLayer'),
      });
      selectInteractionRef.current = select;
      map.addInteraction(select);
      
      select.on('select', (e: SelectEvent) => {
        if (isBoxMode) return; // Ignore click events when in box mode

        const newlySelectedFeatures = e.target.getFeatures().getArray();
        setSelectedFeatures(newlySelectedFeatures);

        if (activeTool === 'inspect') {
            const plainData = extractPlainAttributes(newlySelectedFeatures);
            processAndDisplayFeatures(plainData, 'Inspección');
        } else if (activeTool === 'selectClick') {
            if (e.selected.length > 0 || e.deselected.length > 0) {
               toast({ description: `${newlySelectedFeatures.length} entidad(es) seleccionada(s).` });
            }
        }
      });

      // --- DragBox interaction for box selection ---
      if (isBoxMode) {
        const dragBox = new DragBox({});
        dragBoxInteractionRef.current = dragBox;
        map.addInteraction(dragBox);

        dragBox.on('boxend', () => {
            const extent = dragBox.getGeometry().getExtent();
            const featuresInBox: Feature<Geometry>[] = [];
            
            map.getLayers().forEach(layer => {
              if (layer instanceof VectorLayer && layer.getVisible() && !layer.get('isBaseLayer') && !layer.get('isDrawingLayer')) {
                const source = layer.getSource();
                if (source) {
                  source.forEachFeatureIntersectingExtent(extent, (feature) => {
                    featuresInBox.push(feature as Feature<Geometry>);
                  });
                }
              }
            });
          
          const currentSelectedFeatures = select.getFeatures();
          currentSelectedFeatures.clear();
          currentSelectedFeatures.extend(featuresInBox);
          
          setSelectedFeatures(featuresInBox);
          toast({ description: `${featuresInBox.length} entidad(es) seleccionada(s).` });
        });
      }
    }

    // Cleanup function
    return () => {
      if (map) {
        if (selectInteractionRef.current) map.removeInteraction(selectInteractionRef.current);
        if (dragBoxInteractionRef.current) map.removeInteraction(dragBoxInteractionRef.current);
      }
    };
  }, [activeTool, isMapReady, mapRef, mapElementRef, processAndDisplayFeatures, toast]);

  return {
    activeTool,
    setActiveTool: handleSetActiveTool,
    selectedFeatures,
    inspectedFeatureData,
    currentInspectedLayerName,
    clearSelection,
    processAndDisplayFeatures,
    selectFeaturesById,
    extractPlainAttributes, // Export helper function
  };
};
