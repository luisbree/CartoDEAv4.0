
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
                // Calculate the intersection using Turf.js
                const intersection = turf.intersect(drawingPolygonGeoJSON, featureGeoJSON.geometry);

                if (intersection) {
                    const intersectionArea = turf.area(intersection);
                    const totalArea = turf.area(featureGeoJSON.geometry);

                    if (totalArea > 0) {
                        const proportion = intersectionArea / totalArea;
                        totalWeightedSum += featureValue * proportion;
                    }
                }
            } catch (error) {
                // Turf can throw errors on invalid geometries, so we log and continue
                console.warn(`Error processing intersection for a feature:`, error);
                continue;
            }
        }
    }

    return totalWeightedSum;
}
