
"use client";

import type { VectorMapLayer } from '@/lib/types';
import type { Polygon } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';
import * as turf from '@turf/turf';

interface WeightedSumParams {
    analysisLayer: VectorMapLayer;
    drawingPolygon: Polygon;
    field: string;
}

/**
 * Calculates a surface-weighted sum of a numeric field based on the intersection
 * with a drawing polygon using Turf.js.
 * @param params - The parameters for the calculation.
 * @returns A promise that resolves to the calculated weighted sum.
 */
export async function calculateWeightedSum({
    analysisLayer,
    drawingPolygon,
    field
}: WeightedSumParams): Promise<number> {
    if (!analysisLayer || !drawingPolygon || !field) {
        throw new Error("Parámetros inválidos para el cálculo.");
    }

    const source = analysisLayer.olLayer.getSource();
    if (!source) {
        throw new Error("La capa de análisis no tiene una fuente de datos.");
    }
    const features = source.getFeatures();
    if (features.length === 0) {
        return 0; // No features to analyze
    }

    // Use OpenLayers' GeoJSON format to convert geometries
    const geojsonFormat = new GeoJSON({
        featureProjection: 'EPSG:3857', // The projection of the map features
        dataProjection: 'EPSG:4326' // The projection Turf.js expects (standard GeoJSON)
    });

    // Convert the OpenLayers drawing polygon to a GeoJSON polygon
    const drawingPolygonGeoJSON = geojsonFormat.writeGeometryObject(drawingPolygon);

    let totalWeightedSum = 0;

    for (const feature of features) {
        const featureGeom = feature.getGeometry();
        const featureValue = feature.get(field);

        if (
            featureGeom &&
            (featureGeom.getType() === 'Polygon' || featureGeom.getType() === 'MultiPolygon') &&
            typeof featureValue === 'number' &&
            isFinite(featureValue)
        ) {
            const featureGeoJSON = geojsonFormat.writeFeatureObject(feature);

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
                console.warn(`Error processing intersection for feature ${feature.getId()}:`, error);
                continue;
            }
        }
    }

    return totalWeightedSum;
}
