import type { default as Layer } from 'ol/layer/Layer';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type Source from 'ol/source/Source';
import type { Style } from 'ol/style';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';

export interface MapLayer {
  id: string;
  name: string;
  olLayer: Layer<Source, any>;
  visible: boolean;
  opacity: number;
  type: 'wms' | 'wfs' | 'vector' | 'osm' | 'drawing' | 'sentinel' | 'landsat' | 'gee' | 'geotiff';
  isDeas?: boolean;
}

export interface VectorMapLayer extends MapLayer {
  olLayer: VectorLayer<VectorSource<Feature<Geometry>>>;
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
export type InteractionToolId = 'inspect' | 'selectBox';

export interface ActiveTool {
  type: 'draw' | 'measure' | 'interaction' | null;
  id: DrawToolId | MeasureToolId | InteractionToolId | null;
}

export interface LabelOptions {
    enabled: boolean;
    field: string | null;
    fontSize: number;
    fontFamily: string;
    textColor: string;
    outlineColor: string;
    placement: 'horizontal' | 'parallel';
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
