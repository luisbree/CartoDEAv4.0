
"use client";

import type { VectorMapLayer } from '@/lib/types';
import type { Polygon } from 'ol/geom';
import * as jsts from 'jsts';

// The 'jsts' library is not compatible with modern bundlers like Next.js's.
// We declare it as 'any' here and use its classes dynamically inside the function
// to prevent 'Module not found' errors during the build process.
declare const jsts: any;

interface WeightedSumParams {
    analysisLayer: VectorMapLayer;
    drawingPolygon: Polygon;
    field: string;
}

/**
 * Calculates a surface-weighted sum of a numeric field based on the intersection
 * with a drawing polygon.
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

    // The JSTS library doesn't export types in a standard way, so we cast to any here
    // after ensuring the library is loaded. The functionality remains the same.
    const jstsAny: any = jsts;

    const geometryFactory = new jstsAny.geom.GeometryFactory();
    const olParser = new jstsAny.io.OL3Parser();
    olParser.inject(
        jstsAny.geom.Point,
        jstsAny.geom.LineString,
        jstsAny.geom.Polygon,
        jstsAny.geom.LinearRing,
        jstsAny.geom.Coordinate,
        jstsAny.geom.PrecisionModel,
        geometryFactory
    );


    // Convert the OpenLayers drawing polygon to a JSTS geometry
    const jstsDrawingPolygon = olParser.read(drawingPolygon);
    if (!jstsDrawingPolygon || jstsDrawingPolygon.isEmpty()) {
        throw new Error("El polígono de dibujo no es válido.");
    }

    let totalWeightedSum = 0;

    for (const feature of features) {
        const featureGeom = feature.getGeometry();
        const featureValue = feature.get(field);

        // Ensure the feature has a valid polygon geometry and numeric value
        if (
            featureGeom &&
            (featureGeom.getType() === 'Polygon' || featureGeom.getType() === 'MultiPolygon') &&
            typeof featureValue === 'number' &&
            isFinite(featureValue)
        ) {
            const jstsFeatureGeom = olParser.read(featureGeom);

            // Check for intersection before doing the expensive calculation
            if (jstsDrawingPolygon.intersects(jstsFeatureGeom)) {
                const intersectionGeom = jstsDrawingPolygon.intersection(jstsFeatureGeom);

                if (!intersectionGeom.isEmpty()) {
                    const intersectionArea = intersectionGeom.getArea();
                    const totalArea = jstsFeatureGeom.getArea();
                    
                    if (totalArea > 0) {
                        const proportion = intersectionArea / totalArea;
                        totalWeightedSum += featureValue * proportion;
                    }
                }
            }
        }
    }

    return totalWeightedSum;
}
