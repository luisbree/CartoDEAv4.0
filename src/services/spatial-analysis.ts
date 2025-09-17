
"use client";

import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry } from 'geojson';
import { area as turfArea, intersect, featureCollection } from '@turf/turf';
import { multiPolygon } from '@turf/helpers';

interface IntersectionParams {
    analysisFeaturesGeoJSON: TurfFeatureCollection;
    drawingPolygonGeoJSON: TurfPolygon | TurfMultiPolygon;
    field: string;
}

/**
 * Calculates a surface-weighted average of a numeric field based on the intersection
 * with a drawing polygon using Turf.js.
 * @param params - The parameters for the calculation.
 * @returns A promise that resolves to the calculated weighted average.
 */
export async function calculateWeightedSum({
    analysisFeaturesGeoJSON,
    drawingPolygonGeoJSON,
    field
}: IntersectionParams): Promise<number> {
    
    if (!analysisFeaturesGeoJSON || !drawingPolygonGeoJSON || !field) {
        throw new Error("Parámetros inválidos para el cálculo.");
    }
    
    const unifiedMask = multiPolygon(
        drawingPolygonGeoJSON.type === 'Polygon'
            ? [drawingPolygonGeoJSON.coordinates]
            : drawingPolygonGeoJSON.coordinates
    );

    let totalWeightedSum = 0;
    let totalIntersectionArea = 0;

    for (const featureGeoJSON of analysisFeaturesGeoJSON.features) {
        const featureValue = featureGeoJSON.properties?.[field];

        if (
            featureGeoJSON.geometry &&
            (featureGeoJSON.geometry.type === 'Polygon' || featureGeoJSON.geometry.type === 'MultiPolygon') &&
            typeof featureValue === 'number' &&
            isFinite(featureValue)
        ) {
            try {
                const intersectionResult = intersect(featureCollection([unifiedMask, featureGeoJSON]));

                if (intersectionResult) {
                    const intersectionArea = turfArea(intersectionResult);
                    if (intersectionArea > 0) {
                        const weightedValue = featureValue * intersectionArea;
                        totalWeightedSum += weightedValue;
                        totalIntersectionArea += intersectionArea;
                    }
                }
            } catch (error) {
                console.warn(`Error procesando intersección para una entidad:`, error);
                continue;
            }
        }
    }

    return totalIntersectionArea > 0 ? totalWeightedSum / totalIntersectionArea : 0;
}

/**
 * Calculates a proportional sum of a numeric field based on the intersection
 * with a drawing polygon.
 * @param params - The parameters for the calculation.
 * @returns A promise that resolves to the calculated proportional sum.
 */
export async function calculateProportionalSum({
    analysisFeaturesGeoJSON,
    drawingPolygonGeoJSON,
    field
}: IntersectionParams): Promise<number> {
    
    if (!analysisFeaturesGeoJSON || !drawingPolygonGeoJSON || !field) {
        throw new Error("Parámetros inválidos para el cálculo.");
    }
    
    const unifiedMask = multiPolygon(
        drawingPolygonGeoJSON.type === 'Polygon'
            ? [drawingPolygonGeoJSON.coordinates]
            : drawingPolygonGeoJSON.coordinates
    );
    
    let totalProportionalSum = 0;

    for (const featureGeoJSON of analysisFeaturesGeoJSON.features) {
        const featureValue = featureGeoJSON.properties?.[field];

        if (
            featureGeoJSON.geometry &&
            (featureGeoJSON.geometry.type === 'Polygon' || featureGeoJSON.geometry.type === 'MultiPolygon') &&
            typeof featureValue === 'number' &&
            isFinite(featureValue)
        ) {
            try {
                const intersectionResult = intersect(featureCollection([unifiedMask, featureGeoJSON]));
                
                if (intersectionResult) {
                    const intersectionArea = turfArea(intersectionResult);
                    const originalArea = turfArea(featureGeoJSON);

                    if (originalArea > 0) {
                        const proportion = intersectionArea / originalArea;
                        totalProportionalSum += featureValue * proportion;
                    }
                }
            } catch (error) {
                console.warn(`Error procesando intersección para una entidad:`, error);
                continue;
            }
        }
    }
    return totalProportionalSum;
}
