
"use client";

import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry, Point as TurfPoint, LineString as TurfLineString } from 'geojson';
import { area as turfArea, intersect, featureCollection, buffer as turfBuffer, union, convex, concave, nearestPoint, along, length as turfLength, bearing, destination } from '@turf/turf';
import { multiPolygon } from '@turf/helpers';
import type Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type { Geometry, LineString as OlLineString } from 'ol/geom';


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
}: {
    analysisFeaturesGeoJSON: TurfFeatureCollection;
    drawingPolygonGeoJSON: TurfPolygon | TurfMultiPolygon;
    field: string;
}): Promise<{ weightedAverage: number; proportionalSum: number; count: number; totalArea: number; }> {
    
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
    let intersectingFeatureCount = 0;

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
                    
                    if (intersectionArea > 0.001) { // Threshold to count as a valid intersection
                        intersectingFeatureCount++;
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
    const totalMaskArea = turfArea(unifiedMask);
    
    return {
        weightedAverage,
        proportionalSum: totalProportionalSum,
        count: intersectingFeatureCount,
        totalArea: totalMaskArea,
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
                    buffered.properties = { ...feature.properties };
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
        let finalGeometry: TurfFeature<TurfPolygon | TurfMultiPolygon> | null = null;
        if (bufferedFeatures.length > 1) {
            // @ts-ignore - Turf's union typing can be tricky with spread operator
            finalGeometry = union(...bufferedFeatures);
        } else {
            finalGeometry = bufferedFeatures[0];
        }

        if (!finalGeometry) {
            throw new Error("Union of buffered features resulted in null geometry.");
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


// --- New Hull functions ---

interface HullParams {
    features: Feature<Geometry>[];
    concavity?: number; // For concave hull
}

/**
 * Creates a convex hull polygon around a set of features.
 * @param params - The parameters for the hull operation.
 * @returns A promise that resolves to an array of OpenLayers Features (containing one hull polygon).
 */
export async function performConvexHull({ features }: HullParams): Promise<Feature<Geometry>[]> {
    if (!features || features.length < 3) {
        throw new Error("Se requieren al menos 3 entidades para generar un Convex Hull.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        const hullPolygon = convex(featuresGeoJSON);

        if (!hullPolygon) {
            throw new Error("La operación Convex Hull no produjo resultados.");
        }
        
        // Add attributes to the resulting feature
        const areaKm2 = turfArea(hullPolygon) / 1000000;
        hullPolygon.properties = {
            ...hullPolygon.properties,
            analysis_type: 'convex_hull',
            area_km2: parseFloat(areaKm2.toFixed(2))
        };

        return formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: [hullPolygon]
        });
    } catch (error: any) {
        console.error("Error during Convex Hull analysis:", error);
        throw new Error(`Turf.js convex hull failed: ${error.message}`);
    }
}

/**
 * Creates a concave hull polygon around a set of point features.
 * @param params - The parameters for the hull operation, including concavity.
 * @returns A promise that resolves to an array of OpenLayers Features (containing one hull polygon).
 */
export async function performConcaveHull({ features, concavity = 2 }: HullParams): Promise<Feature<Geometry>[] | null> {
    if (!features || features.length < 3) {
        throw new Error("Se requieren al menos 3 puntos para generar un Concave Hull.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        
        // Ensure all features are points for concave hull
        const points = featuresGeoJSON.features.filter(f => f.geometry.type === 'Point');
        if (points.length < 3) {
            throw new Error("La capa de entrada no contiene suficientes puntos para la operación.");
        }
        
        const hullPolygon = concave(featureCollection(points), { maxEdge: concavity, units: 'kilometers' });

        if (!hullPolygon) {
            return null;
        }
        
        // Add attributes to the resulting feature
        const areaKm2 = turfArea(hullPolygon) / 1000000;
        hullPolygon.properties = {
            ...hullPolygon.properties,
            analysis_type: 'concave_hull',
            concavity_km: concavity,
            area_km2: parseFloat(areaKm2.toFixed(2))
        };


        return formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: [hullPolygon]
        });
    } catch (error: any) {
        console.error("Error during Concave Hull analysis:", error);
        throw new Error(`Turf.js concave hull failed: ${error.message}`);
    }
}


/**
 * Calculates a suggested concavity value, mean, and std dev for a set of features.
 * @param params - The features to analyze.
 * @returns A promise that resolves to an object with statistical values.
 */
export async function calculateOptimalConcavity({ features }: HullParams): Promise<{ suggestedConcavity: number, meanDistance: number, stdDev: number }> {
    if (!features || features.length < 2) {
        throw new Error("Se requieren al menos 2 puntos para calcular la concavidad.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        const points = featuresGeoJSON.features.filter(f => f.geometry.type === 'Point') as TurfFeature<TurfPoint>[];

        if (points.length < 2) {
            throw new Error("La capa no contiene suficientes puntos.");
        }
        
        const distances: number[] = [];
        const pointsToProcess = points.length > 5000 ? points.slice(0, 5000) : points;

        for (let i = 0; i < pointsToProcess.length; i++) {
            const currentPoint = pointsToProcess[i];
            const otherPoints = featureCollection(pointsToProcess.filter((_, index) => i !== index));
            
            if (otherPoints.features.length > 0) {
                const nearest = nearestPoint(currentPoint, otherPoints);
                distances.push(nearest.properties.distanceToPoint);
            }
        }

        if (distances.length === 0) {
            throw new Error("No se pudieron calcular las distancias entre puntos.");
        }

        // Calculate mean
        const sum = distances.reduce((a, b) => a + b, 0);
        const meanDistance = sum / distances.length;

        // Calculate standard deviation
        const variance = distances.reduce((sq, n) => sq + Math.pow(n - meanDistance, 2), 0) / distances.length;
        const stdDev = Math.sqrt(variance);
        
        const suggestedConcavity = meanDistance + (2 * stdDev);

        return {
            suggestedConcavity: Math.round(suggestedConcavity * 100) / 100,
            meanDistance: Math.round(meanDistance * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
        };

    } catch (error: any) {
        console.error("Error calculating optimal concavity:", error);
        throw new Error(`Cálculo de concavidad falló: ${error.message}`);
    }
}


/**
 * Projects population using the geometric growth rate method based on three census points.
 * @param params - The population data and target year.
 * @returns An object with the projected population and the average annual growth rate.
 */
export function projectPopulationGeometric({
    p2001,
    p2010,
    p2022,
    targetYear
}: {
    p2001: number;
    p2010: number;
    p2022: number;
    targetYear: number;
}): { projectedPopulation: number; averageAnnualRate: number } {

    if (p2001 <= 0 || p2010 <= 0 || p2022 <= 0) {
        throw new Error("Los valores de población deben ser positivos.");
    }
    if (targetYear < 2022) {
        throw new Error("El año de proyección debe ser posterior al último censo (2022).");
    }

    // Calculate annual geometric growth rate for the first period (2001-2010)
    const years1 = 2010 - 2001;
    const rate1 = Math.pow(p2010 / p2001, 1 / years1) - 1;

    // Calculate annual geometric growth rate for the second period (2010-2022)
    const years2 = 2022 - 2010;
    const rate2 = Math.pow(p2022 / p2010, 1 / years2) - 1;

    // Calculate the average annual growth rate
    const averageAnnualRate = (rate1 + rate2) / 2;

    // Project the population to the target year from the last census
    const yearsToProject = targetYear - 2022;
    const projectedPopulation = p2022 * Math.pow(1 + averageAnnualRate, yearsToProject);

    return {
        projectedPopulation: Math.round(projectedPopulation),
        averageAnnualRate,
    };
}


/**
 * Generates perpendicular cross-section lines along a line feature.
 * @param params - The parameters for the cross-section generation.
 * @returns A promise that resolves to an array of cross-section OpenLayers Features.
 */
export async function generateCrossSections({
    lineFeatures,
    distance,
    length,
    units
}: {
    lineFeatures: Feature<Geometry>[];
    distance: number;
    length: number;
    units: 'meters' | 'kilometers';
}): Promise<Feature<OlLineString>[]> {
    if (!lineFeatures || lineFeatures.length === 0) {
        throw new Error("No line feature provided.");
    }
    if (distance <= 0 || length <= 0) {
        throw new Error("Distance and length must be positive.");
    }

    const olFeatures: Feature<OlLineString>[] = [];
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    for (const olFeature of lineFeatures) {
        const featureGeoJSON = format.writeFeatureObject(olFeature) as TurfFeature<TurfGeometry>;
        const geomType = featureGeoJSON.geometry.type;

        // Create an array of individual LineStrings to process
        const linesToProcess: TurfFeature<TurfLineString>[] = [];
        if (geomType === 'LineString') {
            linesToProcess.push(featureGeoJSON as TurfFeature<TurfLineString>);
        } else if (geomType === 'MultiLineString') {
            (featureGeoJSON.geometry as any).coordinates.forEach((coords: any) => {
                linesToProcess.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: featureGeoJSON.properties
                });
            });
        }

        let sectionId = 1;
        for (const turfLine of linesToProcess) {
            const totalLength = turfLength(turfLine, { units });

            for (let d = distance; d < totalLength; d += distance) {
                const point = along(turfLine, d, { units });
                
                // To get the bearing, we need a second point slightly ahead
                const nextPoint = along(turfLine, d + 0.001, { units });
                const tangentBearing = bearing(point, nextPoint);
                
                const perpendicularBearing1 = (tangentBearing + 90) % 360;
                const perpendicularBearing2 = (tangentBearing - 90 + 360) % 360;

                const halfLength = length / 2;
                const p1 = destination(point, halfLength, perpendicularBearing1, { units });
                const p2 = destination(point, halfLength, perpendicularBearing2, { units });

                const crossSectionLineCoords = [p1.geometry.coordinates, p2.geometry.coordinates];
                const crossSectionLineFeature: TurfFeature<TurfLineString> = {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: crossSectionLineCoords
                    },
                    properties: {}
                };

                const olLineString = formatForMap.readFeature(crossSectionLineFeature) as Feature<OlLineString>;
                
                olLineString.setProperties({
                    'id_perfil': sectionId++,
                    'dist_eje_m': Math.round(d * (units === 'kilometers' ? 1000 : 1))
                });

                olFeatures.push(olLineString);
            }
        }
    }

    return olFeatures;
}

/**
 * Dissolves all features in a layer into a single feature.
 * @param params - The features to dissolve.
 * @returns A promise that resolves to an array containing a single dissolved OpenLayers Feature.
 */
export async function dissolveFeatures({
    features
}: {
    features: Feature<Geometry>[];
}): Promise<Feature<Geometry>[]> {
    if (!features || features.length === 0) {
        throw new Error("No features provided to dissolve.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        
        let unionedGeometry: TurfFeature<any> | null = null;
        if (featuresGeoJSON.features.length > 1) {
            // @ts-ignore - Turf's union typing can be tricky
            unionedGeometry = union(...featuresGeoJSON.features);
        } else {
            unionedGeometry = featuresGeoJSON.features[0];
        }

        if (!unionedGeometry) {
            throw new Error("Dissolve operation resulted in null geometry.");
        }

        // We are creating a new geometry, so we just add a simple property.
        unionedGeometry.properties = {
            operation: 'dissolve',
            source_features: features.length,
        };
        
        const olFeatures = formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: [unionedGeometry]
        });

        return olFeatures;

    } catch (error: any) {
        console.error("Error during dissolve analysis:", error);
        throw new Error(`Turf.js dissolve failed: ${error.message}`);
    }
}

    