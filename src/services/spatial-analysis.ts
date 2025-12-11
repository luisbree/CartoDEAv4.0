

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

export const POPULATION_DATA: { partido: string; censo_2001: number | null; censo_2010: number; censo_2022: number }[] = [
  { partido: "25 de Mayo", censo_2001: 34877, censo_2010: 35842, censo_2022: 35411 },
  { partido: "9 de Julio", censo_2001: 45998, censo_2010: 47722, censo_2022: 52366 },
  { partido: "Adolfo Alsina", censo_2001: 16245, censo_2010: 17072, censo_2022: 17344 },
  { partido: "Adolfo Gonzales Chaves", censo_2001: 12037, censo_2010: 12047, censo_2022: 12847 },
  { partido: "Alberti", censo_2001: 10322, censo_2010: 10654, censo_2022: 12906 },
  { partido: "Almirante Brown", censo_2001: 515556, censo_2010: 552902, censo_2022: 583209 },
  { partido: "Arrecifes", censo_2001: 27279, censo_2010: 29044, censo_2022: 32077 },
  { partido: "Avellaneda", censo_2001: 328980, censo_2010: 342677, censo_2022: 366117 },
  { partido: "Ayacucho", censo_2001: 19634, censo_2010: 20337, censo_2022: 21757 },
  { partido: "Azul", censo_2001: 63034, censo_2010: 65280, censo_2022: 75152 },
  { partido: "Bahía Blanca", censo_2001: 284776, censo_2010: 301572, censo_2022: 334505 },
  { partido: "Balcarce", censo_2001: 42040, censo_2010: 43823, censo_2022: 48516 },
  { partido: "Baradero", censo_2001: 29562, censo_2010: 32761, censo_2022: 39223 },
  { partido: "Benito Juárez", censo_2001: 19443, censo_2010: 20239, censo_2022: 21185 },
  { partido: "Berazategui", censo_2001: 287913, censo_2010: 324244, censo_2022: 358328 },
  { partido: "Berisso", censo_2001: 80092, censo_2010: 88470, censo_2022: 100685 },
  { partido: "Bolívar", censo_2001: 32442, censo_2010: 34190, censo_2022: 37194 },
  { partido: "Bragado", censo_2001: 40259, censo_2010: 41336, censo_2022: 46227 },
  { partido: "Brandsen", censo_2001: 22515, censo_2010: 26367, censo_2022: 32350 },
  { partido: "Campana", censo_2001: 83698, censo_2010: 94461, censo_2022: 107976 },
  { partido: "Cañuelas", censo_2001: 42575, censo_2010: 51892, censo_2022: 70542 },
  { partido: "Capitán Sarmiento", censo_2001: 12854, censo_2010: 14494, censo_2022: 15882 },
  { partido: "Carlos Casares", censo_2001: 21125, censo_2010: 22237, censo_2022: 22905 },
  { partido: "Carlos Tejedor", censo_2001: 11539, censo_2010: 11570, censo_2022: 14007 },
  { partido: "Carmen de Areco", censo_2001: 13992, censo_2010: 14692, censo_2022: 17345 },
  { partido: "Castelli", censo_2001: 7852, censo_2010: 8205, censo_2022: 9551 },
  { partido: "Chacabuco", censo_2001: 43070, censo_2010: 48703, censo_2022: 52409 },
  { partido: "Chascomús", censo_2001: 38647, censo_2010: 42277, censo_2022: 42191 },
  { partido: "Chivilcoy", censo_2001: 60762, censo_2010: 64185, censo_2022: 70554 },
  { partido: "Colón", censo_2001: 23179, censo_2010: 24890, censo_2022: 27406 },
  { partido: "Coronel de Marina Leonardo Rosales", censo_2001: 60892, censo_2010: 62152, censo_2022: 65823 },
  { partido: "Coronel Dorrego", censo_2001: 16522, censo_2010: 15825, censo_2022: 15795 },
  { partido: "Coronel Pringles", censo_2001: 23794, censo_2010: 22933, censo_2022: 24110 },
  { partido: "Coronel Suárez", censo_2001: 36828, censo_2010: 38320, censo_2022: 41713 },
  { partido: "Daireaux", censo_2001: 15857, censo_2010: 16889, censo_2022: 18328 },
  { partido: "Dolores", censo_2001: 25182, censo_2010: 27042, censo_2022: 31405 },
  { partido: "Ensenada", censo_2001: 51448, censo_2010: 56729, censo_2022: 63978 },
  { partido: "Escobar", censo_2001: 178155, censo_2010: 213619, censo_2022: 256071 },
  { partido: "Esteban Echeverría", censo_2001: 243974, censo_2010: 300959, censo_2022: 337880 },
  { partido: "Exaltación de la Cruz", censo_2001: 24167, censo_2010: 29805, censo_2022: 40036 },
  { partido: "Ezeiza", censo_2001: 118807, censo_2010: 163722, censo_2022: 198620 },
  { partido: "Florencio Varela", censo_2001: 348970, censo_2010: 426005, censo_2022: 488103 },
  { partido: "Florentino Ameghino", censo_2001: 8171, censo_2010: 8869, censo_2022: 10759 },
  { partido: "General Alvarado", censo_2001: 34391, censo_2010: 39594, censo_2022: 45307 },
  { partido: "General Alvear", censo_2001: 10897, censo_2010: 11130, censo_2022: 10150 },
  { partido: "General Arenales", censo_2001: 14876, censo_2010: 14903, censo_2022: 16231 },
  { partido: "General Belgrano", censo_2001: 15381, censo_2010: 17365, censo_2022: 20674 },
  { partido: "General Guido", censo_2001: 2771, censo_2010: 2816, censo_2022: 3157 },
  { partido: "General Juan Madariaga", censo_2001: 18286, censo_2010: 19747, censo_2022: 22566 },
  { partido: "General La Madrid", censo_2001: 10984, censo_2010: 10783, censo_2022: 11535 },
  { partido: "General Las Heras", censo_2001: 12799, censo_2010: 14889, censo_2022: 17980 },
  { partido: "General Lavalle", censo_2001: 3063, censo_2010: 3700, censo_2022: 4846 },
  { partido: "General Paz", censo_2001: 10319, censo_2010: 11202, censo_2022: 14141 },
  { partido: "General Pinto", censo_2001: 11129, censo_2010: 11261, censo_2022: 12842 },
  { partido: "General Pueyrredón", censo_2001: 564056, censo_2010: 618989, censo_2022: 660569 },
  { partido: "General Rodríguez", censo_2001: 67931, censo_2010: 87185, censo_2022: 142315 },
  { partido: "General San Martín", censo_2001: 403107, censo_2010: 414196, censo_2022: 444503 },
  { partido: "General Viamonte", censo_2001: 17641, censo_2010: 18078, censo_2022: 22530 },
  { partido: "General Villegas", censo_2001: 28960, censo_2010: 30864, censo_2022: 35055 },
  { partido: "Guaminí", censo_2001: 11257, censo_2010: 11826, censo_2022: 11662 },
  { partido: "Hipólito Yrigoyen", censo_2001: 8819, censo_2010: 9585, censo_2022: 10581 },
  { partido: "Hurlingham", censo_2001: 172245, censo_2010: 181241, censo_2022: 185361 },
  { partido: "Ituzaingó", censo_2001: 158121, censo_2010: 167824, censo_2022: 177983 },
  { partido: "José C. Paz", censo_2001: 230208, censo_2010: 265981, censo_2022: 326527 },
  { partido: "Junín", censo_2001: 84295, censo_2010: 90305, censo_2022: 100964 },
  { partido: "La Costa", censo_2001: 60483, censo_2010: 69933, censo_2022: 100400 },
  { partido: "La Matanza", censo_2001: 1255288, censo_2010: 1775816, censo_2022: 1837168 },
  { partido: "La Plata", censo_2001: 563943, censo_2010: 654324, censo_2022: 756074 },
  { partido: "Lanús", censo_2001: 453082, censo_2010: 459263, censo_2022: 460081 },
  { partido: "Laprida", censo_2001: 9683, censo_2010: 10210, censo_2022: 11496 },
  { partido: "Las Flores", censo_2001: 23551, censo_2010: 23871, censo_2022: 27136 },
  { partido: "Leandro N. Alem", censo_2001: 16358, censo_2010: 16799, censo_2022: 17153 },
  { partido: "Lezama", censo_2001: null, censo_2010: 4111, censo_2022: 6170 },
  { partido: "Lincoln", censo_2001: 41127, censo_2010: 41808, censo_2022: 45191 },
  { partido: "Lobería", censo_2001: 17649, censo_2010: 17523, censo_2022: 18106 },
  { partido: "Lobos", censo_2001: 33141, censo_2010: 36172, censo_2022: 41418 },
  { partido: "Lomas de Zamora", censo_2001: 591345, censo_2010: 616279, censo_2022: 685644 },
  { partido: "Luján", censo_2001: 93992, censo_2010: 106273, censo_2022: 110111 },
  { partido: "Magdalena", censo_2001: 26655, censo_2010: 26732, censo_2022: 22653 },
  { partido: "Maipú", censo_2001: 10193, censo_2010: 10188, censo_2022: 11253 },
  { partido: "Malvinas Argentinas", censo_2001: 290691, censo_2010: 322375, censo_2022: 349401 },
  { partido: "Mar Chiquita", censo_2001: 17908, censo_2010: 21273, censo_2022: 32973 },
  { partido: "Marcos Paz", censo_2001: 43400, censo_2010: 54181, censo_2022: 64761 },
  { partido: "Mercedes", censo_2001: 59870, censo_2010: 63284, censo_2022: 71002 },
  { partido: "Merlo", censo_2001: 469985, censo_2010: 528494, censo_2022: 581484 },
  { partido: "Monte", censo_2001: 17496, censo_2010: 21034, censo_2022: 24616 },
  { partido: "Monte Hermoso", censo_2001: 5602, censo_2010: 6499, censo_2022: 8444 },
  { partido: "Moreno", censo_2001: 380503, censo_2010: 452505, censo_2022: 575758 },
  { partido: "Morón", censo_2001: 309380, censo_2010: 321109, censo_2022: 329517 },
  { partido: "Navarro", censo_2001: 15797, censo_2010: 17054, censo_2022: 19888 },
  { partido: "Necochea", censo_2001: 89096, censo_2010: 92933, censo_2022: 101483 },
  { partido: "Nueve de Julio", censo_2001: 45998, censo_2010: 47796, censo_2022: 52942 },
  { partido: "Olavarría", censo_2001: 103961, censo_2010: 111708, censo_2022: 122011 },
  { partido: "Patagones", censo_2001: 27938, censo_2010: 30207, censo_2022: 37499 },
  { partido: "Pehuajó", censo_2001: 38400, censo_2010: 39776, censo_2022: 44594 },
  { partido: "Pellegrini", censo_2001: 6030, censo_2010: 5887, censo_2022: 7112 },
  { partido: "Pergamino", censo_2001: 99193, censo_2010: 104590, censo_2022: 114988 },
  { partido: "Pila", censo_2001: 3318, censo_2010: 3640, censo_2022: 4615 },
  { partido: "Pilar", censo_2001: 232463, censo_2010: 299077, censo_2022: 393614 },
  { partido: "Pinamar", censo_2001: 20666, censo_2010: 25728, censo_2022: 39224 },
  { partido: "Presidente Perón", censo_2001: 60224, censo_2010: 81141, censo_2022: 101994 },
  { partido: "Puan", censo_2001: 16381, censo_2010: 15743, censo_2022: 16391 },
  { partido: "Punta Indio", censo_2001: 9362, censo_2010: 9888, censo_2022: 12161 },
  { partido: "Quilmes", censo_2001: 518788, censo_2010: 582943, censo_2022: 631774 },
  { partido: "Ramallo", censo_2001: 29179, censo_2010: 33042, censo_2022: 39648 },
  { partido: "Rauch", censo_2001: 14434, censo_2010: 15176, censo_2022: 16491 },
  { partido: "Rivadavia", censo_2001: 15452, censo_2010: 17143, censo_2022: 19735 },
  { partido: "Rojas", censo_2001: 22842, censo_2010: 23432, censo_2022: 25619 },
  { partido: "Roque Pérez", censo_2001: 10902, censo_2010: 12513, censo_2022: 13901 },
  { partido: "Saavedra", censo_2001: 19715, censo_2010: 20850, censo_2022: 21407 },
  { partido: "Saladillo", censo_2001: 29600, censo_2010: 32103, censo_2022: 35423 },
  { partido: "Salliqueló", censo_2001: 8682, censo_2010: 8644, censo_2022: 9344 },
  { partido: "Salto", censo_2001: 29189, censo_2010: 32653, censo_2022: 39257 },
  { partido: "San Andrés de Giles", censo_2001: 20829, censo_2010: 23027, censo_2022: 26399 },
  { partido: "San Antonio de Areco", censo_2001: 21333, censo_2010: 23138, censo_2022: 26695 },
  { partido: "San Cayetano", censo_2001: 8119, censo_2010: 8399, censo_2022: 8918 },
  { partido: "San Fernando", censo_2001: 151131, censo_2010: 163240, censo_2022: 171099 },
  { partido: "San Isidro", censo_2001: 291505, censo_2010: 292878, censo_2022: 295978 },
  { partido: "San Miguel", censo_2001: 253086, censo_2010: 276190, censo_2022: 327650 },
  { partido: "San Nicolás", censo_2001: 137867, censo_2010: 145857, censo_2022: 166657 },
  { partido: "San Pedro", censo_2001: 55234, censo_2010: 59036, censo_2022: 68353 },
  { partido: "San Vicente", censo_2001: 44529, censo_2010: 59478, censo_2022: 97929 },
  { partido: "Suipacha", censo_2001: 8904, censo_2010: 10081, censo_2022: 11736 },
  { partido: "Tandil", censo_2001: 108109, censo_2010: 123025, censo_2022: 144678 },
  { partido: "Tapalqué", censo_2001: 8296, censo_2010: 9178, censo_2022: 10695 },
  { partido: "Tigre", censo_2001: 301223, censo_2010: 376381, censo_2022: 446291 },
  { partido: "Tordillo", censo_2001: 1742, censo_2010: 1764, censo_2022: 2528 },
  { partido: "Tornquist", censo_2001: 11759, censo_2010: 12723, censo_2022: 14591 },
  { partido: "Trenque Lauquen", censo_2001: 40181, censo_2010: 43021, censo_2022: 49128 },
  { partido: "Tres Arroyos", censo_2001: 57244, censo_2010: 57110, censo_2022: 61889 },
  { partido: "Tres de Febrero", censo_2001: 336467, censo_2010: 340071, censo_2022: 362319 },
  { partido: "Tres Lomas", censo_2001: 7439, censo_2010: 8700, censo_2022: 9090 },
  { partido: "Vicente López", censo_2001: 274082, censo_2010: 269420, censo_2022: 280541 },
  { partido: "Villa Gesell", censo_2001: 24282, censo_2010: 31730, censo_2022: 37325 },
  { partido: "Villarino", censo_2001: 26517, censo_2010: 31014, censo_2022: 32552 },
  { partido: "Zárate", censo_2001: 101271, censo_2010: 114269, censo_2022: 131415 }
];


// ** Analysis functions **

export async function performBufferAnalysis({ features, distance, units }: { features: Feature<Geometry>[], distance: number, units: 'meters' | 'kilometers' | 'miles' }): Promise<Feature<OlPolygon>[]> {
  const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
  const featureCollection = format.writeFeaturesObject(features);
  
  const buffered = turfBuffer(featureCollection, distance, { units });

  // Use a different GeoJSON instance for reading back, as featureProjection is global to the instance
  const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
  return formatForMap.readFeatures(buffered) as Feature<OlPolygon>[];
}

export async function performConvexHull({ features }: { features: Feature<Geometry>[] }): Promise<Feature<OlPolygon>[]> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const featureCollection = format.writeFeaturesObject(features);
    
    const hull = convex(featureCollection as TurfFeatureCollection<TurfPoint>); // Turf expects points for convex hull
    if (!hull) return [];

    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    return formatForMap.readFeatures({ type: 'FeatureCollection', features: [hull] }) as Feature<OlPolygon>[];
}

export async function performConcaveHull({ features, concavity }: { features: Feature<Geometry>[], concavity: number }): Promise<Feature<OlPolygon | TurfMultiPolygon>[]> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const featureCollection = format.writeFeaturesObject(features);

    const hull = concave(featureCollection as TurfFeatureCollection<TurfPoint>, { maxEdge: concavity, units: 'kilometers' });
    if (!hull) return [];

    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    // Concave can return a MultiPolygon, so we handle that case.
    return formatForMap.readFeatures({ type: 'FeatureCollection', features: [hull] }) as Feature<OlPolygon | TurfMultiPolygon>[];
}

export async function calculateOptimalConcavity({ features }: { features: Feature<Geometry>[] }): Promise<{ suggestedConcavity: number, meanDistance: number, stdDev: number }> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const featureCollection = format.writeFeaturesObject(features) as TurfFeatureCollection<TurfPoint>;
    
    if (featureCollection.features.length < 3) {
        throw new Error("Se necesitan al menos 3 puntos para calcular la concavidad.");
    }
    
    const distances: number[] = [];
    for (let i = 0; i < featureCollection.features.length; i++) {
        const others = featureCollection.features.slice(0, i).concat(featureCollection.features.slice(i + 1));
        if (others.length > 0) {
            const nearest = turfNearestPoint(featureCollection.features[i], featureCollection(others));
            distances.push(nearest.properties.distanceToPoint);
        }
    }
    
    const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    
    // A heuristic: suggested concavity is the mean distance plus one standard deviation
    const suggestedConcavity = meanDistance + stdDev;

    return { suggestedConcavity, meanDistance, stdDev };
}


export async function calculateSpatialStats({
    analysisFeaturesGeoJSON,
    drawingPolygonGeoJSON,
    field
}: {
    analysisFeaturesGeoJSON: TurfFeatureCollection,
    drawingPolygonGeoJSON: TurfPolygon | TurfMultiPolygon,
    field: string
}) {

    let totalValue = 0;
    let totalWeightedSum = 0;
    let totalIntersectedArea = 0;
    let featureCount = 0;

    const maskFeature = turfPolygon(drawingPolygonGeoJSON.coordinates);
    const maskArea = turfArea(maskFeature);

    analysisFeaturesGeoJSON.features.forEach(feature => {
        try {
            const intersection = intersect(maskFeature, feature as TurfFeature<TurfPolygon>);
            if (intersection) {
                featureCount++;
                const value = feature.properties?.[field] || 0;
                const intersectedArea = turfArea(intersection);
                totalIntersectedArea += intersectedArea;
                totalValue += value;
                totalWeightedSum += value * intersectedArea;
            }
        } catch(e) {
            // Ignore topology errors and continue
        }
    });

    const weightedAverage = totalIntersectedArea > 0 ? totalWeightedSum / totalIntersectedArea : 0;
    const proportionalSum = totalWeightedSum; // Renamed for clarity

    return {
        weightedAverage,
        proportionalSum,
        count: featureCount,
        totalArea: maskArea,
    };
}


export function projectPopulationGeometric({ partidoData, initialPopulation, targetYear }: { partidoData: typeof POPULATION_DATA[0], initialPopulation: number, targetYear: number }): { projectedPopulation: number, averageAnnualRate: number } {
    
    let P1, P2, T1, T2;

    if (partidoData.partido === "Lezama") {
        // Special case for Lezama
        if (!partidoData.censo_2010 || !partidoData.censo_2022) {
            throw new Error("Datos insuficientes para Lezama (se requieren 2010 y 2022).");
        }
        P1 = partidoData.censo_2010;
        P2 = partidoData.censo_2022;
        T1 = 2010;
        T2 = 2022;
    } else {
        // Standard case
        if (!partidoData.censo_2001 || !partidoData.censo_2022) {
             throw new Error("Datos insuficientes para la proyección (se requieren 2001 y 2022).");
        }
        P1 = partidoData.censo_2001;
        P2 = partidoData.censo_2022;
        T1 = 2001;
        T2 = 2022;
    }
    
    const timeDiff = T2 - T1;
    if (timeDiff <= 0) {
        throw new Error("El período de tiempo para calcular la tasa de crecimiento debe ser positivo.");
    }
    
    const r = Math.pow(P2 / P1, 1 / timeDiff) - 1;
    
    // Project from the latest census data (2022) using the partial population
    const n = targetYear - 2022;
    const projectedPopulation = initialPopulation * Math.pow(1 + r, n);
    
    return { projectedPopulation, averageAnnualRate: r };
}


export async function generateCrossSections({
    lineFeatures,
    distance,
    length,
    units
}: {
    lineFeatures: Feature<OlLineString>[],
    distance: number,
    length: number,
    units: 'meters' | 'kilometers'
}): Promise<Feature<OlLineString>[]> {
    
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    
    const crossSections: Feature<OlLineString>[] = [];

    for (const olFeature of lineFeatures) {
        const lineGeoJSON = format.writeFeatureObject(olFeature) as TurfFeature<TurfLineString>;
        const lineLength = turfLength(lineGeoJSON, { units: 'kilometers' });

        // Convert distance and length to kilometers for Turf
        const distanceKm = units === 'meters' ? distance / 1000 : distance;
        const lengthKm = units === 'meters' ? length / 1000 : length;

        for (let d = distanceKm; d < lineLength; d += distanceKm) {
            const pointOnLine = along(lineGeoJSON, d, { units: 'kilometers' });
            
            // Get bearing at that point
            const nextPoint = along(lineGeoJSON, d + 0.001, { units: 'kilometers' });
            const lineBearing = bearing(pointOnLine, nextPoint);
            
            // Calculate perpendicular bearings
            const bearing1 = lineBearing + 90;
            const bearing2 = lineBearing - 90;

            const halfLength = lengthKm / 2;
            
            const endpoint1 = destination(pointOnLine, halfLength, bearing1, { units: 'kilometers' });
            const endpoint2 = destination(pointOnLine, halfLength, bearing2, { units: 'kilometers' });

            const crossSectionLine = turfLineString([endpoint1.geometry.coordinates, endpoint2.geometry.coordinates], {
                distancia_en_eje_km: d.toFixed(2)
            });

            const olCrossSectionFeature = formatForMap.readFeature(crossSectionLine) as Feature<OlLineString>;
            crossSections.push(olCrossSectionFeature);
        }
    }
    
    return crossSections;
}

export async function dissolveFeatures({ features }: { features: Feature<Geometry>[] }): Promise<Feature<OlPolygon>[]> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const geojson = format.writeFeaturesObject(features);

    let dissolved: TurfFeature<TurfPolygon | TurfMultiPolygon> | null = null;
    
    for (const feature of geojson.features) {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            if (!dissolved) {
                dissolved = feature as TurfFeature<TurfPolygon | TurfMultiPolygon>;
            } else {
                dissolved = union(dissolved, feature as TurfFeature<TurfPolygon | TurfMultiPolygon>);
            }
        }
    }

    if (!dissolved) return [];

    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    return formatForMap.readFeatures({ type: 'FeatureCollection', features: [dissolved] }) as Feature<OlPolygon>[];
}

export async function performBezierSmoothing({ features, resolution }: { features: Feature<Geometry>[], resolution: number }): Promise<Feature<OlLineString | OlPolygon>[]> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    const geojson = format.writeFeaturesObject(features);
    
    const smoothedFeatures: TurfFeature<TurfLineString | TurfPolygon>[] = [];
    
    for (const feature of geojson.features) {
        if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
            const line = feature as TurfFeature<TurfLineString | TurfMultiPolygon>;
            const smoothed = bezierSpline(line, { resolution });
            smoothed.properties = feature.properties;
            smoothedFeatures.push(smoothed as TurfFeature<TurfLineString>);
        } else if (feature.geometry.type === 'Polygon') {
            const poly = feature as TurfFeature<TurfPolygon>;
            const exterior = turfLineString(poly.geometry.coordinates[0]);
            const smoothedExterior = bezierSpline(exterior, { resolution });
            const newPoly = turfPolygon([smoothedExterior.geometry.coordinates]);
            newPoly.properties = feature.properties;
            smoothedFeatures.push(newPoly);
        } else if (feature.geometry.type === 'MultiPolygon') {
            // Handle MultiPolygon by smoothing each polygon's exterior ring
            const multiPoly = feature as TurfFeature<TurfMultiPolygon>;
            const smoothedPolygons = multiPoly.geometry.coordinates.map(polyCoords => {
                const exterior = turfLineString(polyCoords[0]);
                const smoothedExterior = bezierSpline(exterior, { resolution });
                return [smoothedExterior.geometry.coordinates]; // Return coordinates in polygon format
            });
            const newMultiPoly = multiPolygon(smoothedPolygons);
            newMultiPoly.properties = feature.properties;
            smoothedFeatures.push(newMultiPoly);
        } else {
             // Keep points and other geoms as they are
            smoothedFeatures.push(feature);
        }
    }

    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    return formatForMap.readFeatures({ type: 'FeatureCollection', features: smoothedFeatures }) as Feature<OlLineString | OlPolygon>[];
}

export async function performFeatureTracking({
    sourceFeatures,
    targetFeatures,
    attributeField,
    maxDistanceKm,
    time1,
    time2
}: {
    sourceFeatures: Feature<Geometry>[],
    targetFeatures: Feature<Geometry>[],
    attributeField: string,
    maxDistanceKm: number,
    time1: any,
    time2: any
}): Promise<Feature<OlLineString>[]> {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const formatForMap = new GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });

    const sourceGeoJSON = format.writeFeaturesObject(sourceFeatures) as TurfFeatureCollection<TurfPoint>;
    const targetGeoJSON = format.writeFeaturesObject(targetFeatures) as TurfFeatureCollection<TurfPoint>;

    const timeDiffMs = Math.abs(new Date(time2).getTime() - new Date(time1).getTime());
    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
    
    if (timeDiffHours <= 0) {
        throw new Error("El intervalo de tiempo entre las capas es cero o inválido.");
    }

    const trajectoryFeatures: Feature<OlLineString>[] = [];

    for (const sourceFeature of sourceGeoJSON.features) {
        let bestMatch: TurfFeature<TurfPoint> | null = null;
        let minCost = Infinity;

        const sourceValue = sourceFeature.properties?.[attributeField] ?? 0;

        for (const targetFeature of targetGeoJSON.features) {
            const distance = turfDistance(sourceFeature, targetFeature, { units: 'kilometers' });

            if (distance <= maxDistanceKm) {
                const targetValue = targetFeature.properties?.[attributeField] ?? 0;
                
                // Cost function: a simple weighted sum of distance and attribute difference
                const distanceCost = distance / maxDistanceKm; // Normalized distance
                const attributeDifference = Math.abs(sourceValue - targetValue);
                const attributeCost = sourceValue > 0 ? attributeDifference / sourceValue : (attributeDifference > 0 ? 1 : 0);
                
                const cost = (0.6 * distanceCost) + (0.4 * attributeCost); // Weighted average

                if (cost < minCost) {
                    minCost = cost;
                    bestMatch = targetFeature;
                }
            }
        }
        
        if (bestMatch) {
            const line = turfLineString([sourceFeature.geometry.coordinates, bestMatch.geometry.coordinates]);
            
            const olFeature = formatForMap.readFeature(line) as Feature<OlLineString>;
            olFeature.setId(nanoid());
            
            const attributeDifference = Math.abs(sourceValue - (bestMatch.properties?.[attributeField] ?? 0));
            
            olFeature.setProperties({
                costo_similitud: parseFloat(minCost.toFixed(4)),
                variacion_attr: parseFloat(attributeDifference.toFixed(2)),
            });

            trajectoryFeatures.push(olFeature);
        }
    }

    return trajectoryFeatures;
}
