

"use client";

import type { Feature as TurfFeature, Polygon as TurfPolygon, MultiPolygon as TurfMultiPolygon, FeatureCollection as TurfFeatureCollection, Geometry as TurfGeometry, Point as TurfPoint, LineString as TurfLineString } from 'geojson';
import { area as turfArea, intersect, featureCollection, buffer as turfBuffer, union, convex, concave, nearestPoint as turfNearestPoint, along, length as turfLength, bearing, destination, bezierSpline, centroid, distance as turfDistance } from '@turf/turf';
import { multiPolygon, lineString as turfLineString, polygon as turfPolygon } from '@turf/helpers';
import type Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type { Geometry, LineString as OlLineString } from 'ol/geom';
import { nanoid } from 'nanoid';


// --- Jenks Natural Breaks Algorithm (Moved Here) ---
export function jenks(data: number[], n_classes: number): number[] {
  if (n_classes > data.length) return [];

  data = data.slice().sort((a, b) => a - b);

  const matrices = (() => {
    const mat1 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    const mat2 = Array(data.length + 1).fill(0).map(() => Array(n_classes + 1).fill(0));
    
    for (let i = 1; i <= n_classes; i++) {
        mat1[1][i] = 1;
        mat2[1][i] = 0;
        for (let j = 2; j <= data.length; j++) {
            mat2[j][i] = Infinity;
        }
    }

    let v = 0.0;
    for (let l = 2; l <= data.length; l++) {
        let s1 = 0.0, s2 = 0.0, w = 0.0;
        for (let m = 1; m <= l; m++) {
            const i4 = l - m + 1;
            const val = data[i4 - 1];
            w++;
            s1 += val;
            s2 += val * val;
            v = s2 - (s1 * s1) / w;
            const i3 = i4 - 1;
            if (i3 !== 0) {
                for (let j = 2; j <= n_classes; j++) {
                    if (mat2[l][j] >= (v + mat2[i3][j - 1])) {
                        mat1[l][j] = i4;
                        mat2[l][j] = v + mat2[i3][j - 1];
                    }
                }
            }
        }
        mat1[l][1] = 1;
        mat2[l][1] = v;
    }
    return { backlinkMatrix: mat1 };
  })();

  const { backlinkMatrix } = matrices;
  const breaks = [];
  let k = data.length;
  for (let i = n_classes; i > 1; i--) {
    breaks.push(data[backlinkMatrix[k][i] - 2]);
    k = backlinkMatrix[k][i] - 1;
  }
  
  return breaks.reverse();
}

// --- Dataset Definitions (Moved Here) ---
export const DATASET_DEFINITIONS = {
    'NASADEM_ELEVATION': {
        id: 'NASA/NASADEM_HGT/001',
        name: 'Elevación (NASADEM)',
        band: 'elevation',
        color: '#4ade80',
        unit: 'm'
    },
    'ALOS_DSM': {
        id: 'JAXA/ALOS/AW3D30/V3_2',
        name: 'DSM (ALOS)',
        band: 'DSM',
        color: '#facc15',
        unit: 'm'
    },
    'JRC_WATER_OCCURRENCE': {
        id: 'JRC/GSW1_4/GlobalSurfaceWater',
        name: 'Ocurrencia de Agua (JRC)',
        band: 'occurrence',
        color: '#38bdf8',
        unit: '%'
    }
};


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
                const nearest = turfNearestPoint(currentPoint, otherPoints);
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


/**
 * Smooths the geometry of features using a Bezier spline.
 * @param params - The features to smooth and the resolution.
 * @returns A promise resolving to an array of smoothed OpenLayers Features.
 */
export async function performBezierSmoothing({
    features,
    resolution,
}: {
    features: Feature<Geometry>[];
    resolution: number;
}): Promise<Feature<Geometry>[]> {
    if (!features || features.length === 0) {
        throw new Error("No features provided to smooth.");
    }

    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    try {
        const featuresGeoJSON = format.writeFeaturesObject(features);
        const smoothedTurfFeatures: TurfFeature<any>[] = [];

        for (const feature of featuresGeoJSON.features) {
            const geomType = feature.geometry.type;
            let smoothedFeature: TurfFeature<any> | null = null;
            
            try {
                if (geomType === 'LineString') {
                    smoothedFeature = bezierSpline(feature as TurfFeature<TurfLineString>, { resolution });
                } else if (geomType === 'Polygon') {
                    const smoothedRings = (feature.geometry.coordinates as any[]).map(ring => {
                        const line = turfLineString(ring);
                        const smoothedLine = bezierSpline(line, { resolution });
                        return smoothedLine.geometry.coordinates;
                    });
                    smoothedFeature = turfPolygon(smoothedRings, feature.properties);
                } else if (geomType === 'MultiLineString') {
                     const smoothedLines = (feature.geometry.coordinates as any[]).map(lineCoords => {
                        const line = turfLineString(lineCoords);
                        return bezierSpline(line, { resolution }).geometry.coordinates;
                    });
                     smoothedFeature = {
                        ...feature,
                        geometry: { type: 'MultiLineString', coordinates: smoothedLines }
                    };
                } else if (geomType === 'MultiPolygon') {
                    const smoothedPolygons = (feature.geometry.coordinates as any[]).map(polyCoords => {
                        return polyCoords.map(ring => {
                            const line = turfLineString(ring);
                            return bezierSpline(line, { resolution }).geometry.coordinates;
                        });
                    });
                     smoothedFeature = {
                        ...feature,
                        geometry: { type: 'MultiPolygon', coordinates: smoothedPolygons }
                    };
                } else {
                    // For points or other types, just keep the original
                    smoothedFeature = feature;
                }

                if (smoothedFeature) {
                    smoothedFeature.properties = { ...feature.properties };
                    smoothedTurfFeatures.push(smoothedFeature);
                }
            } catch (individualError) {
                 console.warn(`Skipping a feature that could not be smoothed (ID: ${feature.id}):`, individualError);
                 // Keep the original feature if smoothing fails
                 smoothedTurfFeatures.push(feature);
            }
        }
        
        return formatForMap.readFeatures({
            type: 'FeatureCollection',
            features: smoothedTurfFeatures,
        });

    } catch (error: any) {
        console.error("Error during Bezier smoothing analysis:", error);
        throw new Error(`Turf.js bezierSpline failed: ${error.message}`);
    }
}

/**
 * Tracks features from a source layer to a target layer based on spatial proximity
 * and attribute similarity.
 * @returns A promise resolving to an array of line features representing the tracks.
 */
export async function performFeatureTracking({
  sourceFeatures,
  targetFeatures,
  attributeField,
  maxDistanceKm,
  time1,
  time2,
}: {
  sourceFeatures: Feature<Geometry>[];
  targetFeatures: Feature<Geometry>[];
  attributeField: string;
  maxDistanceKm: number;
  time1: string; // ISO string
  time2: string; // ISO string
}): Promise<Feature<OlLineString>[]> {
    if (sourceFeatures.length === 0 || targetFeatures.length === 0) {
        throw new Error("Las capas de origen y destino deben contener entidades.");
    }
  
    const timeDiffMs = Math.abs(new Date(time2).getTime() - new Date(time1).getTime());
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

    if (timeDiffHours <= 0) {
        throw new Error("El intervalo de tiempo entre las capas es cero o inválido.");
    }
  
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    const sourceGeoJSON = format.writeFeaturesObject(sourceFeatures) as TurfFeatureCollection<TurfPoint>;
    const targetGeoJSON = format.writeFeaturesObject(targetFeatures) as TurfFeatureCollection<TurfPoint>;
  
    const attributeValues = [...sourceGeoJSON.features, ...targetGeoJSON.features]
        .map(f => f.properties?.[attributeField])
        .filter(v => typeof v === 'number' && isFinite(v)) as number[];

    if (attributeValues.length === 0) {
        throw new Error(`El campo '${attributeField}' no contiene valores numéricos válidos en ninguna de las capas.`);
    }

    const maxAttr = Math.max(...attributeValues);
    const minAttr = Math.min(...attributeValues);
    const attrRange = maxAttr - minAttr;
  
    const allPotentialMatches: { sourceIndex: number; targetIndex: number; cost: number; distance: number; attrDiff: number }[] = [];

    // 1. Calculate cost for all potential pairs within the search radius
    sourceGeoJSON.features.forEach((p1, index1) => {
        const p1Attr = p1.properties?.[attributeField];
        if (typeof p1Attr !== 'number') return;
    
        targetGeoJSON.features.forEach((p2, index2) => {
            const distance = turfDistance(p1, p2, { units: 'kilometers' });
      
            if (distance <= maxDistanceKm) {
                const p2Attr = p2.properties?.[attributeField];
                if (typeof p2Attr !== 'number') return;
        
                const distNorm = distance / maxDistanceKm;
                const attrDiff = Math.abs(p1Attr - p2Attr);
                const attrDiffNorm = attrRange > 0 ? attrDiff / attrRange : 0;
        
                // Simple cost function (can be weighted later)
                const cost = (0.5 * distNorm) + (0.5 * attrDiffNorm);

                allPotentialMatches.push({ sourceIndex: index1, targetIndex: index2, cost, distance, attrDiff });
            }
        });
    });

    // 2. Greedy assignment: find the best match iteratively
    allPotentialMatches.sort((a, b) => a.cost - b.cost);
  
    const assignedSource = new Set<number>();
    const assignedTarget = new Set<number>();
    const finalMatches: { p1: TurfFeature<TurfPoint>, p2: TurfFeature<TurfPoint>, cost: number, distance: number, attrDiff: number }[] = [];
  
    for (const match of allPotentialMatches) {
        if (!assignedSource.has(match.sourceIndex) && !assignedTarget.has(match.targetIndex)) {
            finalMatches.push({
                p1: sourceGeoJSON.features[match.sourceIndex],
                p2: targetGeoJSON.features[match.targetIndex],
                cost: match.cost,
                distance: match.distance,
                attrDiff: match.attrDiff
            });
            assignedSource.add(match.sourceIndex);
            assignedTarget.add(match.targetIndex);
        }
    }

    // 3. Create result features
    const trajectoryFeatures: Feature<OlLineString>[] = [];
    for (const match of finalMatches) {
        const line = turfLineString([match.p1.geometry.coordinates, match.p2.geometry.coordinates]);
        const olFeature = formatForMap.readFeature(line) as Feature<OlLineString>;
    
        const bearingVal = bearing(match.p1, match.p2);
        const speed = match.distance / timeDiffHours;

        olFeature.setProperties({
            costo_similitud: parseFloat(match.cost.toFixed(4)),
            distancia_km: parseFloat(match.distance.toFixed(2)),
            variacion_attr: parseFloat(match.attrDiff.toFixed(2)),
            velocidad_kmh: parseFloat(speed.toFixed(2)),
            sentido_grados: parseFloat(bearingVal.toFixed(2)),
        });
        olFeature.setId(nanoid());
        trajectoryFeatures.push(olFeature);
    }

  return trajectoryFeatures;
}
