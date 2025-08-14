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
  bandCombination: z.enum(['URBAN_FALSE_COLOR', 'SWIR_FALSE_COLOR', 'BSI', 'NDVI', 'JRC_WATER_OCCURRENCE', 'OPENLANDMAP_SOC', 'DYNAMIC_WORLD', 'NASADEM_ELEVATION']).describe("The band combination or index to use for the layer."),
  startDate: z.string().optional().describe("The start date for the image search in YYYY-MM-DD format."),
  endDate: z.string().optional().describe("The end date for the image search in YYYY-MM-DD format."),
  minElevation: z.number().optional().describe("The minimum elevation for the NASADEM visualization range."),
  maxElevation: z.number().optional().describe("The maximum elevation for the NASADEM visualization range."),
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
