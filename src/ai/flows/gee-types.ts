

/**
 * @fileOverview Types and schemas for the GEE flow.
 *
 * - GeeTileLayerInput - The input type for the GEE flow.
 * - GeeTileLayerOutput - The return type for the GEE flow.
 * - GeeTileLayerInputSchema - The Zod schema for the GEE flow input.
 * - GeeTileLayerOutputSchema - The Zod schema for the GEE flow output.
 */

import { z } from 'zod';

const GeeAoiSchema = z.object({
    minLon: z.number(),
    minLat: z.number(),
    maxLon: z.number(),
    maxLat: z.number(),
});

export const GeeTileLayerInputSchema = z.object({
  aoi: GeeAoiSchema.describe("The Area of Interest as a bounding box."),
  zoom: z.number().describe("The current zoom level of the map."),
  bandCombination: z.enum(['URBAN_FALSE_COLOR', 'SWIR_FALSE_COLOR', 'BSI', 'NDVI', 'JRC_WATER_OCCURRENCE', 'OPENLANDMAP_SOC', 'DYNAMIC_WORLD', 'NASADEM_ELEVATION', 'ALOS_DSM', 'TASSELED_CAP']).describe("The band combination or index to use for the layer."),
  startDate: z.string().optional().describe("The start date for the image search in YYYY-MM-DD format."),
  endDate: z.string().optional().describe("The end date for the image search in YYYY-MM-DD format."),
  minElevation: z.number().optional().describe("The minimum elevation for the visualization range."),
  maxElevation: z.number().optional().describe("The maximum elevation for the visualization range."),
});
export type GeeTileLayerInput = z.infer<typeof GeeTileLayerInputSchema>;

export const GeeTileLayerOutputSchema = z.object({
  tileUrl: z.string().describe("The XYZ tile URL template for the generated GEE layer."),
});
export type GeeTileLayerOutput = z.infer<typeof GeeTileLayerOutputSchema>;


// New schema for vectorization input
export const GeeVectorizationInputSchema = z.object({
    aoi: GeeAoiSchema.describe("The Area of Interest as a bounding box for vectorization."),
    startDate: z.string().describe("The start date for the Dynamic World image search in YYYY-MM-DD format."),
    endDate: z.string().describe("The end date for the Dynamic World image search in YYYY-MM-DD format."),
});
export type GeeVectorizationInput = z.infer<typeof GeeVectorizationInputSchema>;

// New schema for querying value at a point
export const GeeValueQueryInputSchema = z.object({
  lon: z.number().describe("The longitude of the point to query."),
  lat: z.number().describe("The latitude of the point to query."),
  // Reuse fields from the tile layer input to reconstruct the image
  bandCombination: GeeTileLayerInputSchema.shape.bandCombination,
  startDate: GeeTileLayerInputSchema.shape.startDate,
  endDate: GeeTileLayerInputSchema.shape.endDate,
  minElevation: GeeTileLayerInputSchema.shape.minElevation,
  maxElevation: GeeTileLayerInputSchema.shape.maxElevation,
});
export type GeeValueQueryInput = z.infer<typeof GeeValueQueryInputSchema>;

// New schema for GeoTIFF download input
export const GeeGeoTiffDownloadInputSchema = z.object({
  aoi: GeeAoiSchema.describe("The Area of Interest as a bounding box for the GeoTIFF export."),
  // Re-use fields from the tile layer input to reconstruct the image for download
  bandCombination: GeeTileLayerInputSchema.shape.bandCombination,
  startDate: GeeTileLayerInputSchema.shape.startDate,
  endDate: GeeTileLayerInputSchema.shape.endDate,
  minElevation: GeeTileLayerInputSchema.shape.minElevation,
  maxElevation: GeeTileLayerInputSchema.shape.maxElevation,
});
export type GeeGeoTiffDownloadInput = z.infer<typeof GeeGeoTiffDownloadInputSchema>;

// New schemas for histogram generation
export const GeeHistogramInputSchema = z.object({
    aoi: GeeAoiSchema.describe("The Area of Interest as a bounding box for the histogram calculation."),
    bandCombination: z.enum(['NASADEM_ELEVATION', 'ALOS_DSM']).describe("The elevation dataset to analyze."),
});
export type GeeHistogramInput = z.infer<typeof GeeHistogramInputSchema>;

export const GeeHistogramOutputSchema = z.object({
    histogram: z.array(z.array(z.number())).describe("The histogram data as an array of [value, count] pairs."),
});
export type GeeHistogramOutput = z.infer<typeof GeeHistogramOutputSchema>;


// New schemas for profile generation
export const GeeProfileInputSchema = z.object({
  points: z.object({
    type: z.literal('MultiPoint'),
    coordinates: z.array(z.array(z.number())),
  }).describe('A GeoJSON MultiPoint object for the profile.'),
  distances: z.array(z.number()).describe('An array of distances corresponding to each point.'),
  bandCombination: z.enum(['NASADEM_ELEVATION', 'ALOS_DSM']).describe('The elevation dataset to sample.'),
});
export type GeeProfileInput = z.infer<typeof GeeProfileInputSchema>;

// Stricter type for a single point in the profile result
export const ProfilePointSchema = z.object({
    distance: z.number().describe('Distance from the start of the line in meters.'),
    elevation: z.number().describe('Elevation value at the point.'),
    location: z.array(z.number()).length(2).describe('The [lon, lat] coordinates of the point.'),
});
export type ProfilePoint = z.infer<typeof ProfilePointSchema>;

export const GeeProfileOutputSchema = z.object({
  profile: z.array(ProfilePointSchema).describe('An array of points representing the profile.'),
});
export type GeeProfileOutput = z.infer<typeof GeeProfileOutputSchema>;

// Tasseled Cap Schemas
export const TasseledCapInputSchema = z.object({
    aoi: GeeAoiSchema,
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});
export type TasseledCapInput = z.infer<typeof TasseledCapInputSchema>;

export const TasseledCapOutputSchema = z.object({
    brightness: z.object({ tileUrl: z.string() }),
    greenness: z.object({ tileUrl: z.string() }),
    wetness: z.object({ tileUrl: z.string() }),
});
export type TasseledCapOutput = z.infer<typeof TasseledCapOutputSchema>;
