

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

export const POPULATION_DATA = [
  { partido: "Adolfo Alsina", censo_2001: 16245, censo_2010: 17072, censo_2022: 17663 },
  { partido: "Adolfo Gonzales Chaves", censo_2001: 12037, censo_2010: 12047, censo_2022: 13247 },
  { partido: "Alberti", censo_2001: 10322, censo_2010: 10654, censo_2022: 12726 },
  { partido: "Almirante Brown", censo_2001: 515556, censo_2010: 552902, censo_2022: 585852 },
  { partido: "Arrecifes", censo_2001: 27279, censo_2010: 29044, censo_2022: 32414 },
  { partido: "Avellaneda", censo_2001: 328980, censo_2010: 342677, censo_2022: 370939 },
  { partido: "Ayacucho", censo_2001: 19688, censo_2010: 20337, censo_2022: 22238 },
  { partido: "Azul", censo_2001: 62996, censo_2010: 65280, censo_2022: 70005 },
  { partido: "Bahía Blanca", censo_2001: 284776, censo_2010: 301572, censo_2022: 335190 },
  { partido: "Balcarce", censo_2001: 42824, censo_2010: 44064, censo_2022: 51736 },
  { partido: "Baradero", censo_2001: 29562, censo_2010: 32761, censo_2022: 38813 },
  { partido: "Benito Juárez", censo_2001: 19443, censo_2010: 20239, censo_2022: 22557 },
  { partido: "Berazategui", censo_2001: 287913, censo_2010: 324244, censo_2022: 359461 },
  { partido: "Berisso", censo_2001: 80092, censo_2010: 88470, censo_2022: 101263 },
  { partido: "Bolívar", censo_2001: 32442, censo_2010: 34190, censo_2022: 38119 },
  { partido: "Bragado", censo_2001: 40259, censo_2010: 41543, censo_2022: 44972 },
  { partido: "Brandsen", censo_2001: 22515, censo_2010: 26367, censo_2022: 33499 },
  { partido: "Campana", censo_2001: 77838, censo_2010: 94908, censo_2022: 110642 },
  { partido: "Cañuelas", censo_2001: 42575, censo_2010: 51892, censo_2022: 71149 },
  { partido: "Capitán Sarmiento", censo_2001: 12854, censo_2010: 14494, censo_2022: 17306 },
  { partido: "Carlos Casares", censo_2001: 21125, censo_2010: 22237, censo_2022: 23204 },
  { partido: "Carlos Tejedor", censo_2001: 11539, censo_2010: 11570, censo_2022: 13328 },
  { partido: "Carmen de Areco", censo_2001: 13992, censo_2010: 14692, censo_2022: 17369 },
  { partido: "Castelli", censo_2001: 7852, censo_2010: 8205, censo_2022: 10459 },
  { partido: "Chacabuco", censo_2001: 45445, censo_2010: 48971, censo_2022: 53157 },
  { partido: "Chascomús", censo_2001: 38647, censo_2010: 42277, censo_2022: 42721 },
  { partido: "Chivilcoy", censo_2001: 60762, censo_2010: 64185, censo_2022: 70765 },
  { partido: "Colón", censo_2001: 23179, censo_2010: 24890, censo_2022: 27725 },
  { partido: "Coronel de Marina L. Rosales", censo_2001: 59746, censo_2010: 62152, censo_2022: 70503 },
  { partido: "Coronel Dorrego", censo_2001: 16522, censo_2010: 15825, censo_2022: 16298 },
  { partido: "Coronel Pringles", censo_2001: 23794, censo_2010: 22933, censo_2022: 24249 },
  { partido: "Coronel Suárez", censo_2001: 36828, censo_2010: 38320, censo_2022: 42799 },
  { partido: "Daireaux", censo_2001: 15857, censo_2010: 16889, censo_2022: 19149 },
  { partido: "Dolores", censo_2001: 25216, censo_2010: 27042, censo_2022: 31448 },
  { partido: "Ensenada", censo_2001: 51448, censo_2010: 56729, censo_2022: 64406 },
  { partido: "Escobar", censo_2001: 178155, censo_2010: 213619, censo_2022: 256449 },
  { partido: "Esteban Echeverría", censo_2001: 243974, censo_2010: 300959, censo_2022: 339030 },
  { partido: "Exaltación de la Cruz", censo_2001: 24167, censo_2010: 29805, censo_2022: 40381 },
  { partido: "Ezeiza", censo_2001: 118807, censo_2010: 163722, censo_2022: 203283 },
  { partido: "Florencio Varela", censo_2001: 348970, censo_2010: 426005, censo_2022: 497818 },
  { partido: "Florentino Ameghino", censo_2001: 8171, censo_2010: 8869, censo_2022: 9786 },
  { partido: "General Alvarado", censo_2001: 34391, censo_2010: 39594, censo_2022: 46794 },
  { partido: "General Alvear", censo_2001: 10897, censo_2010: 11100, censo_2022: 12569 },
  { partido: "General Arenales", censo_2001: 14876, censo_2010: 14903, censo_2022: 15918 },
  { partido: "General Belgrano", censo_2001: 15381, censo_2010: 17365, censo_2022: 21255 },
  { partido: "General Guido", censo_2001: 2771, censo_2010: 2833, censo_2022: 3226 },
  { partido: "General La Madrid", censo_2001: 10984, censo_2010: 10783, censo_2022: 11560 },
  { partido: "General Las Heras", censo_2001: 12799, censo_2010: 14889, censo_2022: 19894 },
  { partido: "General Lavalle", censo_2001: 3046, censo_2010: 3700, censo_2022: 4949 },
  { partido: "General Madariaga", censo_2001: 18088, censo_2010: 19747, censo_2022: 23019 },
  { partido: "General Paz", censo_2001: 10313, censo_2010: 11213, censo_2022: 12759 },
  { partido: "General Pinto", censo_2001: 11129, censo_2010: 11261, censo_2022: 12224 },
  { partido: "General Pueyrredón", censo_2001: 564056, censo_2010: 618989, censo_2022: 682605 },
  { partido: "General Rodríguez", censo_2001: 67931, censo_2010: 87185, censo_2022: 143211 },
  { partido: "General San Martín", censo_2001: 403107, censo_2010: 414196, censo_2022: 422542 },
  { partido: "General Viamonte", censo_2001: 17641, censo_2010: 18078, censo_2022: 20068 },
  { partido: "General Villegas", censo_2001: 28960, censo_2010: 30864, censo_2022: 33698 },
  { partido: "Guaminí", censo_2001: 11257, censo_2010: 11460, censo_2022: 12005 },
  { partido: "Hipólito Yrigoyen", censo_2001: 8819, censo_2010: 9585, censo_2022: 10563 },
  { partido: "Hurlingham", censo_2001: 172245, censo_2010: 181241, censo_2022: 185641 },
  { partido: "Ituzaingó", censo_2001: 158121, censo_2010: 167824, censo_2022: 179788 },
  { partido: "José C. Paz", censo_2001: 230208, censo_2010: 265981, censo_2022: 328925 },
  { partido: "Junín", censo_2001: 88664, censo_2010: 90305, censo_2022: 101762 },
  { partido: "La Costa", censo_2001: 60472, censo_2010: 69633, censo_2022: 102838 },
  { partido: "La Matanza", censo_2001: 1257638, censo_2010: 1775816, censo_2022: 1837774 },
  { partido: "La Plata", censo_2001: 574369, censo_2010: 654324, censo_2022: 772618 },
  { partido: "Lanús", censo_2001: 453082, censo_2010: 459263, censo_2022: 462051 },
  { partido: "Laprida", censo_2001: 9686, censo_2010: 10210, censo_2022: 11732 },
  { partido: "Las Flores", censo_2001: 23551, censo_2010: 23871, censo_2022: 26651 },
  { partido: "Leandro N. Alem", censo_2001: 16358, censo_2010: 16409, censo_2022: 17409 },
  { partido: "Lezama", censo_2001: null, censo_2010: 4223, censo_2022: 6231 },
  { partido: "Lincoln", censo_2001: 41127, censo_2010: 41808, censo_2022: 44974 },
  { partido: "Lobería", censo_2001: 17006, censo_2010: 17647, censo_2022: 18234 },
  { partido: "Lomas de Zamora", censo_2001: 591345, censo_2010: 616279, censo_2022: 694330 },
  { partido: "Luján", censo_2001: 93992, censo_2010: 106273, censo_2022: 111365 },
  { partido: "Magdalena", censo_2001: 16603, censo_2010: 19301, censo_2022: 26734 },
  { partido: "Maipú", censo_2001: 10188, censo_2010: 10193, censo_2022: 11571 },
  { partido: "Malvinas Argentinas", censo_2001: 290691, censo_2010: 322375, censo_2022: 351788 },
  { partido: "Mar Chiquita", censo_2001: 17908, censo_2010: 21279, censo_2022: 33284 },
  { partido: "Marcos Paz", censo_2001: 43400, censo_2010: 54181, censo_2022: 67154 },
  { partido: "Mercedes", censo_2001: 59870, censo_2010: 63279, censo_2022: 70335 },
  { partido: "Merlo", censo_2001: 469985, censo_2010: 528494, censo_2022: 580806 },
  { partido: "Monte", censo_2001: 17488, censo_2010: 21034, censo_2022: 24481 },
  { partido: "Monte Hermoso", censo_2001: 5602, censo_2010: 6499, censo_2022: 8821 },
  { partido: "Moreno", censo_2001: 380503, censo_2010: 452505, censo_2022: 574374 },
  { partido: "Morón", censo_2001: 309380, censo_2010: 321109, censo_2022: 334178 },
  { partido: "Navarro", censo_2001: 15797, censo_2010: 17054, censo_2022: 20380 },
  { partido: "Necochea", censo_2001: 89096, censo_2010: 92933, censo_2022: 104977 },
  { partido: "Nueve de Julio", censo_2001: 45998, censo_2010: 47796, censo_2022: 52942 },
  { partido: "Olavarría", censo_2001: 103961, censo_2010: 111708, censo_2022: 126328 },
  { partido: "Patagones", censo_2001: 27938, censo_2010: 30207, censo_2022: 37533 },
  { partido: "Pehuajó", censo_2001: 38400, censo_2010: 39776, censo_2022: 42561 },
  { partido: "Pellegrini", censo_2001: 6030, censo_2010: 5887, censo_2022: 6948 },
  { partido: "Pergamino", censo_2001: 99193, censo_2010: 104985, censo_2022: 114052 },
  { partido: "Pila", censo_2001: 3318, censo_2010: 3640, censo_2022: 4596 },
  { partido: "Pilar", censo_2001: 232463, censo_2010: 299077, censo_2022: 395072 },
  { partido: "Pinamar", censo_2001: 20666, censo_2010: 25728, censo_2022: 40259 },
  { partido: "Presidente Perón", censo_2001: 60191, censo_2010: 81129, censo_2022: 102128 },
  { partido: "Puan", censo_2001: 16369, censo_2010: 15743, censo_2022: 16429 },
  { partido: "Punta Indio", censo_2001: 9362, censo_2010: 9851, censo_2022: 12431 },
  { partido: "Quilmes", censo_2001: 518788, censo_2010: 582943, censo_2022: 636029 },
  { partido: "Ramallo", censo_2001: 26868, censo_2010: 29177, censo_2022: 33042 },
  { partido: "Rauch", censo_2001: 14434, censo_2010: 15376, censo_2022: 17234 },
  { partido: "Rivadavia", censo_2001: 15453, censo_2010: 17143, censo_2022: 19853 },
  { partido: "Rojas", censo_2001: 22842, censo_2010: 23413, censo_2022: 25333 },
  { partido: "Roque Pérez", censo_2001: 9639, censo_2010: 10902, censo_2022: 13955 },
  { partido: "Saavedra", censo_2001: 19715, censo_2010: 20749, censo_2022: 22846 },
  { partido: "Saladillo", censo_2001: 29600, censo_2010: 32103, censo_2022: 35147 },
  { partido: "Salliqueló", censo_2001: 8445, censo_2010: 8682, censo_2022: 9940 },
  { partido: "Salto", censo_2001: 29189, censo_2010: 32653, censo_2022: 38249 },
  { partido: "San Andrés de Giles", censo_2001: 20829, censo_2010: 23027, censo_2022: 26474 },
  { partido: "San Antonio de Areco", censo_2001: 21333, censo_2010: 23138, censo_2022: 26895 },
  { partido: "San Cayetano", censo_2001: 8119, censo_2010: 8399, censo_2022: 8686 },
  { partido: "San Fernando", censo_2001: 151186, censo_2010: 163240, censo_2022: 170425 },
  { partido: "San Isidro", censo_2001: 291505, censo_2010: 292878, censo_2022: 292916 },
  { partido: "San Miguel", censo_2001: 253086, censo_2010: 276190, censo_2022: 328014 },
  { partido: "San Nicolás", censo_2001: 137867, censo_2010: 145857, censo_2022: 160100 },
  { partido: "San Pedro", censo_2001: 55234, censo_2010: 59036, censo_2022: 69629 },
  { partido: "San Vicente", censo_2001: 59478, censo_2010: 98977, censo_2022: 98977 },
  { partido: "Suipacha", censo_2001: 8904, censo_2010: 10081, censo_2022: 11843 },
  { partido: "Tandil", censo_2001: 108109, censo_2010: 123871, censo_2022: 150162 },
  { partido: "Tapalqué", censo_2001: 8296, censo_2010: 9161, censo_2022: 10834 },
  { partido: "Tigre", censo_2001: 301223, censo_2010: 376381, censo_2022: 447785 },
  { partido: "Tordillo", censo_2001: 1743, censo_2010: 1764, censo_2022: 2631 },
  { partido: "Tornquist", censo_2001: 11756, censo_2010: 12723, censo_2022: 14810 },
  { partido: "Trenque Lauquen", censo_2001: 40181, censo_2010: 43021, censo_2022: 48432 },
  { partido: "Tres Arroyos", censo_2001: 57244, censo_2010: 57110, censo_2022: 62835 },
  { partido: "Tres de Febrero", censo_2001: 336467, censo_2010: 340071, censo_2022: 366337 },
  { partido: "Tres Lomas", censo_2001: 7439, censo_2010: 8700, censo_2022: 8825 },
  { partido: "Veinticinco de Mayo", censo_2001: 34877, censo_2010: 35842, censo_2022: 36735 },
  { partido: "Vicente López", censo_2001: 274082, censo_2010: 269420, censo_2022: 283396 },
  { partido: "Villa Gesell", censo_2001: 24262, censo_2010: 31730, censo_2022: 38615 },
  { partido: "Villarino", censo_2001: 26522, censo_2010: 31014, censo_2022: 32677 },
  { partido: "Zárate", censo_2001: 101271, censo_2010: 114269, censo_2022: 132483 }
];



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
 * Projects population using the geometric growth rate method based on historical census data.
 * @param params - The population data for a specific 'partido' and the target year.
 * @returns An object with the projected population and the average annual growth rate.
 */
export function projectPopulationGeometric({
    partidoData,
    targetYear
}: {
    partidoData: typeof POPULATION_DATA[0];
    targetYear: number;
}): { projectedPopulation: number; averageAnnualRate: number } {

    const { censo_2001, censo_2010, censo_2022 } = partidoData;

    if (!censo_2010 || !censo_2022) {
        throw new Error("Los datos de los censos 2010 y 2022 son obligatorios.");
    }
     if (targetYear < 2022) {
        throw new Error("El año de proyección debe ser posterior al último censo (2022).");
    }

    let averageAnnualRate;

    // Special case for Lezama (or other partidos without 2001 data)
    if (censo_2001 === null) {
        if (targetYear <= 2022) throw new Error("El año debe ser posterior a 2022 para Lezama.");
        const years = 2022 - 2010;
        averageAnnualRate = Math.pow(censo_2022 / censo_2010, 1 / years) - 1;
    } else {
        const years1 = 2010 - 2001;
        const rate1 = Math.pow(censo_2010 / censo_2001, 1 / years1) - 1;

        const years2 = 2022 - 2010;
        const rate2 = Math.pow(censo_2022 / censo_2010, 1 / years2) - 1;
        
        averageAnnualRate = (rate1 + rate2) / 2;
    }

    if (isNaN(averageAnnualRate)) {
        throw new Error("No se pudo calcular una tasa de crecimiento válida. Verifique los datos de entrada.");
    }

    const yearsToProject = targetYear - 2022;
    const projectedPopulation = censo_2022 * Math.pow(1 + averageAnnualRate, yearsToProject);

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
