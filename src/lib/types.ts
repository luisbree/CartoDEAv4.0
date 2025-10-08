import type { default as Layer } from 'ol/layer/Layer';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type Source from 'ol/source/Source';
import type { Style } from 'ol/style';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import { nanoid } from 'nanoid';
import type { GeeTileLayerInput } from '@/ai/flows/gee-types';

export type ColorRampId = 'reds' | 'blues' | 'greens' | 'viridis' | 'pinks' | 'custom';
export type ClassificationMethod = 'quantiles' | 'natural-breaks';

export interface GraduatedSymbology {
  field: string;
  method: ClassificationMethod;
  classes: number;
  colorRamp: ColorRampId;
  breaks: number[]; // The upper bound for each class
  colors: string[]; // The hex color for each class
  strokeColor: string;
  strokeWidth: number;
  customColors?: { start: string; end: string };
}

export interface CategorizedSymbology {
  field: string;
  colorRamp: ColorRampId;
  // An array of objects, where each object represents a unique value and its assigned color
  categories: { value: string | number; color: string }[];
  strokeColor: string;
  strokeWidth: number;
  customColors?: { start: string; end: string };
}

export interface MapLayer {
  id: string;
  name: string;
  olLayer: Layer<Source, any>;
  visible: boolean;
  opacity: number;
  type: 'wms' | 'wfs' | 'vector' | 'osm' | 'drawing' | 'sentinel' | 'landsat' | 'gee' | 'geotiff' | 'analysis';
  isDeas?: boolean;
  graduatedSymbology?: GraduatedSymbology;
  categorizedSymbology?: CategorizedSymbology;
  wmsStyleEnabled?: boolean; // For hybrid WFS/WMS layers
}

export interface VectorMapLayer extends MapLayer {
  olLayer: VectorLayer<VectorSource<Feature<Geometry>>>;
  type: 'wfs' | 'vector' | 'osm' | 'drawing' | 'sentinel' | 'landsat' | 'analysis';
}

export interface OSMCategoryConfig {
  id: string;
  name: string;
  overpassQueryFragment: (bboxStr: string) => string;
  style: Style;
}

export interface GeoServerDiscoveredLayer {
  name: string;
  title: string;
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  styleName?: string;
  wmsAddedToMap: boolean;
  wfsAddedToMap: boolean;
}

export interface BaseLayerOptionForSelect {
  id: string;
  name: string;
}

export interface BaseLayerSettings {
  opacity: number;
  brightness: number;
  contrast: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[]; // [southLat, northLat, westLon, eastLon]
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
}

export interface PlainFeatureData {
  id: string;
  attributes: Record<string, any>;
}

// Types for tool management
export type DrawToolId = 'Polygon' | 'LineString' | 'Point' | 'Rectangle' | 'FreehandPolygon';
export type MeasureToolId = 'LineString' | 'Polygon';
export type InteractionToolId = 'inspect' | 'selectBox' | 'queryRaster' | 'modify';
export type MapActionToolId = 'zoomToArea';

export interface ActiveTool {
  type: 'draw' | 'measure' | 'interaction' | 'mapAction' | null;
  id: DrawToolId | MeasureToolId | InteractionToolId | MapActionToolId | null;
}

export interface LabelPart {
  id: string; // Unique ID for drag-and-drop
  type: 'field' | 'text' | 'newline';
  value: string;
}

export interface LabelOptions {
    enabled: boolean;
    labelParts: LabelPart[];
    fontSize: number;
    fontFamily: string;
    textColor: string;
    outlineColor: string;
    placement: 'horizontal' | 'parallel';
    offsetY: number;
    overflow: boolean; // For polygon labels to draw outside
}


export interface TrelloCardInfo {
  name: string;
  url: string;
}

export interface StyleOptions {
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  pointSize: number;
}


// --- GEE Profile Types ---
export interface ProfilePoint {
    distance: number;
    elevation: number;
    location: number[]; // [lon, lat]
}

export interface ElevationPoint {
  lon: number;
  lat: number;
  distance: number;
}

export interface GeeProfileOutput {
    profile: ProfilePoint[];
}


// --- Map Sharing Types ---

// Represents a layer that can be recreated remotely
export interface RemoteSerializableLayer {
    type: 'wms' | 'wfs' | 'gee';
    name: string;
    url: string | null;
    layerName: string | null;
    opacity: number;
    visible: boolean;
    wmsStyleEnabled: boolean;
    styleName: string | null;
    geeParams: {
        bandCombination: string | null;
        tileUrl: string | null;
    } | null;
}

// Represents a layer that was local and cannot be recreated, but we note its presence
export interface LocalSerializableLayer {
    type: 'local-placeholder';
    name: string;
}

export type SerializableMapLayer = RemoteSerializableLayer | LocalSerializableLayer;


export interface MapState {
    subject: string; // The title or subject of the shared map
    layers: SerializableMapLayer[];
    view: {
        center: number[]; // [lon, lat]
        zoom: number;
    };
    baseLayerId: string;
}
