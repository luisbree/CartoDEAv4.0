
'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { useMap } from '@/hooks/use-map';
import { useToast } from '@/hooks/use-toast';
import { suggestPoi } from '@/app/actions';
import type { SuggestPoiOutput } from '@/ai/flows/suggest-poi';
import {
  Download,
  Globe,
  Layers,
  Loader,
  MapPin,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import type { Map } from 'ol';
import Feature from 'ol/Feature';
import KML from 'ol/format/KML';
import GeoJSON from 'ol/format/GeoJSON';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import React, { useState, useRef } from 'react';
import { ScrollArea } from './ui/scroll-area';

export function AppSidebar() {
  const {
    map,
    setBaseLayer,
    addUserFeatures,
    clearUserFeatures,
    addPoiFeatures,
    clearPoiFeatures,
    downloadMapImage,
    centerOnFeature,
  } = useMap();
  const { toast } = useToast();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<
    SuggestPoiOutput['suggestions']
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSuggestPois = async () => {
    if (!map) return;
    setIsSuggesting(true);
    setSuggestions([]);
    clearPoiFeatures();

    const view = map.getView();
    const center = toLonLat(view.getCenter() || [0, 0]);
    const zoom = view.getZoom() || 1;
    const extent = view.getProjection().getExtent();
    const mapRegion = `Center: [${center.join(', ')}], Zoom: ${zoom}, Extent: [${extent.join(', ')}]`;

    const result = await suggestPoi({ mapRegion });
    setIsSuggesting(false);

    if (result.success && result.data) {
      setSuggestions(result.data.suggestions);
      const poiFeatures = result.data.suggestions.map(poi => {
        const feature = new Feature({
          geometry: new Point(fromLonLat([poi.longitude, poi.latitude])),
          ...poi,
        });
        return feature;
      });
      addPoiFeatures(poiFeatures);
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error,
      });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!map) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error('File is empty.');

        let features: Feature[];
        const formatKML = new KML({ extractStyles: true });
        const formatGeoJSON = new GeoJSON();
        const viewProjection = map.getView().getProjection();

        if (file.name.toLowerCase().endsWith('.kml')) {
          features = formatKML.readFeatures(text, {
            dataProjection: 'EPSG:4326',
            featureProjection: viewProjection,
          });
        } else if (file.name.toLowerCase().endsWith('.geojson')) {
          features = formatGeoJSON.readFeatures(text, {
            dataProjection: 'EPSG:4326',
            featureProjection: viewProjection,
          });
        } else {
          throw new Error('Unsupported file type. Please upload KML or GeoJSON.');
        }
        
        if (features.length === 0) {
            throw new Error('No features found in the file.');
        }

        clearUserFeatures();
        addUserFeatures(features);
        toast({
          title: 'Success',
          description: `${features.length} features loaded from ${file.name}.`,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: errorMessage,
        });
        console.error('File upload error:', error);
      } finally {
        // Reset file input
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Globe className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">CartoDEA v4.0</h1>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ScrollArea className="h-full">
          <SidebarGroup>
            <Accordion type="multiple" defaultValue={['layers', 'explore']} className="w-full">
              <AccordionItem value="layers">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Layers className="size-4" />
                    <span>Map Layers</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <RadioGroup
                    defaultValue="osm"
                    onValueChange={(value: 'osm' | 'satellite') =>
                      setBaseLayer(value)
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="osm" id="osm" />
                      <Label htmlFor="osm">Street Map</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="satellite" id="satellite" />
                      <Label htmlFor="satellite">Satellite</Label>
                    </div>
                  </RadioGroup>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="data">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <UploadCloud className="size-4" />
                    <span>Add Data</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Upload your own GeoJSON or KML files.</p>
                    <Input
                        id="file-upload"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".geojson,.kml"
                        className="text-sm"
                    />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="explore">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4" />
                    <span>Explore Area</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <Button
                      onClick={handleSuggestPois}
                      disabled={isSuggesting}
                      className="w-full"
                    >
                      {isSuggesting ? (
                        <Loader className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      <span>
                        {isSuggesting
                          ? 'Thinking...'
                          : 'Suggest Points of Interest'}
                      </span>
                    </Button>
                    {suggestions.length > 0 && (
                      <div className="space-y-2">
                        {suggestions.map((poi, index) => (
                          <div
                            key={index}
                            className="p-2 rounded-md border bg-card hover:bg-accent/10 cursor-pointer"
                            onClick={() =>
                              centerOnFeature(
                                fromLonLat([poi.longitude, poi.latitude])
                              )
                            }
                          >
                            <p className="font-semibold flex items-center gap-2">
                              <MapPin className="size-4 text-accent" />
                              {poi.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {poi.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
               <AccordionItem value="tools">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Download className="size-4" />
                    <span>Tools</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Button
                    onClick={downloadMapImage}
                    className="w-full"
                    variant="outline"
                  >
                    <Download className="size-4" />
                    <span>Download Map as PNG</span>
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </>
  );
}
