
"use client";

import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry } from 'geojson';
import { area as turfArea, intersect, featureCollection, buffer as turfBuffer, union, difference } from '@turf/turf';
import { multiPolygon } from '@turf/helpers';
import type Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type { Geometry } from 'ol/geom';


interface IntersectionParams {
    analysisFeaturesGeoJSON: TurfFeatureCollection;
    drawingPolygonGeoJSON: TurfPolygon | TurfMultiPolygon;
    field: string;
}

/**
 * Calculates both a surface-weighted average and a proportional sum of a numeric field 
 * based on the intersection with a drawing polygon using Turf.js.
 * @param params - The parameters for the calculation.
 * @returns A promise that resolves to an object containing the weighted average and proportional sum.
 */
export async function calculateSpatialStats({
    analysisFeaturesGeoJSON,
    drawingPolygonGeoJSON,
    field
}: IntersectionParams): Promise<{ weightedAverage: number; proportionalSum: number; }> {
    
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
                    
                    if (intersectionArea > 0) {
                        // For Weighted Average
                        totalWeightedSum += featureValue * intersectionArea;
                        totalIntersectionArea += intersectionArea;
                        
                        // For Proportional Sum
                        if (originalArea > 0) {
                            const proportion = intersectionArea / originalArea;
                            totalProportionalSum += featureValue * proportion;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error procesando intersección para una entidad:`, error);
                continue;
            }
        }
    }

    const weightedAverage = totalIntersectionArea > 0 ? totalWeightedSum / totalIntersectionArea : 0;
    
    return {
        weightedAverage,
        proportionalSum: totalProportionalSum
    };
}


interface BufferParams {
    features: Feature<Geometry>[];
    distance: number;
    units: 'meters' | 'kilometers' | 'miles';
}

/**
 * Creates a buffer around a set of features.
 * @param params - The parameters for the buffer operation.
 * @returns A promise that resolves to an array of buffered OpenLayers Features.
 */
export async function performBufferAnalysis({
    features,
    distance,
    units,
}: BufferParams): Promise<Feature<Geometry>[]> {
    if (!features || features.length === 0) {
        throw new Error("No features provided to buffer.");
    }
    if (distance <= 0) {
        throw new Error("Buffer distance must be positive.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        
        const bufferedFeatures: TurfFeature<TurfPolygon | TurfMultiPolygon>[] = [];
        for (const feature of featuresGeoJSON.features) {
            try {
                // Buffer each feature individually
                const buffered = turfBuffer(feature, distance, { units });
                if (buffered) {
                    bufferedFeatures.push(buffered as TurfFeature<TurfPolygon | TurfMultiPolygon>);
                }
            } catch (individualError) {
                console.warn("Skipping a feature that could not be buffered:", individualError);
            }
        }
        
        if (bufferedFeatures.length === 0) {
            throw new Error("Buffer operation resulted in empty geometry for all features.");
        }

        // Union all the buffered features into a single feature
        let finalGeometry = bufferedFeatures[0];
        if (bufferedFeatures.length > 1) {
             for (let i = 1; i < bufferedFeatures.length; i++) {
                // @ts-ignore
                finalGeometry = union(finalGeometry, bufferedFeatures[i]);
            }
        }
        
        const olFeatures = formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: [finalGeometry] // Create a collection with the single unioned feature
        });

        return olFeatures;

    } catch (error: any) {
        console.error("Error during buffer analysis:", error);
        throw new Error(`Turf.js buffer failed: ${error.message}`);
    }
}

interface DifferenceParams {
    inputFeatures: Feature<Geometry>[];
    eraseFeatures: Feature<Geometry>[];
}

/**
 * Performs a difference (erase) operation.
 * @param params - The parameters for the difference operation.
 * @returns A promise that resolves to an array of resulting OpenLayers Features.
 */
export async function performDifferenceAnalysis({
    inputFeatures,
    eraseFeatures,
}: DifferenceParams): Promise<Feature<Geometry>[]> {
    if (!inputFeatures || inputFeatures.length === 0 || !eraseFeatures || eraseFeatures.length === 0) {
        throw new Error("Se requieren entidades de entrada y de borrado.");
    }
    
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const inputGeoJSON = format.writeFeaturesObject(inputFeatures);
        const eraseGeoJSON = format.writeFeaturesObject(eraseFeatures);

        const validPolygonOrMultiPolygon = (feature: TurfFeature): feature is TurfFeature<TurfPolygon | TurfMultiPolygon> => 
            feature.geometry !== null && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');

        // 1. Union all valid input features into one single feature.
        const unionedInputFeature = inputGeoJSON.features
            .filter(validPolygonOrMultiPolygon)
            .reduce<TurfFeature<TurfPolygon | TurfMultiPolygon> | null>((acc, feature) => {
                if (!acc) return feature;
                // @ts-ignore
                return union(acc, feature);
            }, null);

        // 2. Union all valid erase features into one single mask feature.
        const eraseMaskFeature = eraseGeoJSON.features
            .filter(validPolygonOrMultiPolygon)
            .reduce<TurfFeature<TurfPolygon | TurfMultiPolygon> | null>((acc, feature) => {
                if (!acc) return feature;
                // @ts-ignore
                return union(acc, feature);
            }, null);


        if (!unionedInputFeature || !eraseMaskFeature) {
            throw new Error("Una de las capas no contiene geometrías de polígono válidas para la operación.");
        }

        // 3. Create a FeatureCollection with polygon1 and polygon2.
        const differenceCollection = featureCollection([unionedInputFeature, eraseMaskFeature]);
        
        // 4. Call turf.difference with the single FeatureCollection.
        const diffResult = difference(differenceCollection);

        if (!diffResult) {
            return []; // Return empty array if difference results in nothing
        }
        
        const olFeatures = formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: [diffResult]
        });
        
        return olFeatures;

    } catch (error: any) {
        console.error("Error during difference analysis:", error);
        throw new Error(`Turf.js difference failed: ${error.message}`);
    }
}
