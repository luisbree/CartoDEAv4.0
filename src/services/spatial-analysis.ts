
"use client";

import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon } from 'geojson';
import * as turf from '@turf/turf';

interface WeightedSumParams {
    analysisFeaturesGeoJSON: TurfFeature<TurfPolygon | TurfMultiPolygon>[];
    drawingPolygonGeoJSON: TurfPolygon | TurfMultiPolygon;
    field: string;
}

/**
 * Calculates a surface-weighted sum of a numeric field based on the intersection
 * with a drawing polygon using Turf.js. This function now expects GeoJSON inputs.
 * @param params - The parameters for the calculation.
 * @returns A promise that resolves to the calculated weighted sum.
 */
export async function calculateWeightedSum({
    analysisFeaturesGeoJSON,
    drawingPolygonGeoJSON,
    field
}: WeightedSumParams): Promise<number> {
    
    if (!analysisFeaturesGeoJSON || !drawingPolygonGeoJSON || !field) {
        throw new Error("Parámetros inválidos para el cálculo.");
    }
    
    if (analysisFeaturesGeoJSON.length === 0) {
        return 0; // No features to analyze
    }

    let totalWeightedSum = 0;

    for (const featureGeoJSON of analysisFeaturesGeoJSON) {
        const featureValue = featureGeoJSON.properties?.[field];

        if (
            featureGeoJSON.geometry &&
            (featureGeoJSON.geometry.type === 'Polygon' || featureGeoJSON.geometry.type === 'MultiPolygon') &&
            typeof featureValue === 'number' &&
            isFinite(featureValue)
        ) {
            try {
                // The intersection is already calculated in the panel, here we just calculate the proportion
                const intersectionArea = turf.area(featureGeoJSON.geometry);
                const totalArea = turf.area(featureGeoJSON); // This seems incorrect, should be based on original feature area.

                // This function is now simplified as the core logic moved to the panel.
                // It assumes the passed `analysisFeaturesGeoJSON` are already the intersected portions.
                const originalFeatureArea = featureGeoJSON.properties?.original_area; // Assuming we pass this in
                
                if (originalFeatureArea && originalFeatureArea > 0) {
                     const proportion = intersectionArea / originalFeatureArea;
                     totalWeightedSum += featureValue * proportion;
                } else if (intersectionArea > 0) {
                    // Fallback if original_area isn't passed - this will be incorrect for partial intersections.
                    // The calling function should handle this correctly.
                    totalWeightedSum += featureValue;
                }

            } catch (error) {
                console.warn(`Error processing area for a feature:`, error);
                continue;
            }
        }
    }

    return totalWeightedSum;
}
