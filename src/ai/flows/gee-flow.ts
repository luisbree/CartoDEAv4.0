

'use server';
/**
 * @fileOverview A flow for generating Google Earth Engine tile layers, vector data, and histograms.
 *
 * - getGeeTileLayer - Generates a tile layer URL for a given Area of Interest.
 * - getGeeVectorDownloadUrl - Generates a download URL for vectorized GEE data.
 * - getGeeHistogram - Calculates a histogram for a given dataset and AOI.
 * - getValuesForPoints - Generates an elevation profile from a list of points.
 */

import { ai } from '@/ai/genkit';
import ee from '@google/earthengine';
import { promisify } from 'util';
import type { Feature as TurfFeature, LineString as TurfLineString } from 'geojson';
import { length as turfLength, along as turfAlong } from '@turf/turf';
import type { GeeTileLayerInput, GeeTileLayerOutput, GeeVectorizationInput, GeeValueQueryInput, GeeGeoTiffDownloadInput, GeeHistogramInput, GeeHistogramOutput, GeeProfileInput, GeeProfileOutput, ProfilePoint, TasseledCapOutput, TasseledCapComponent, ElevationPoint, GoesStormCoresInput } from './gee-types';
import { GeeTileLayerInputSchema, GeeTileLayerOutputSchema, GeeVectorizationInputSchema, GeeValueQueryInputSchema, GeeGeoTiffDownloadInputSchema, GeeHistogramInputSchema, GeeHistogramOutputSchema, GeeProfileInputSchema, GeeProfileOutputSchema, TasseledCapInputSchema, ElevationPointSchema, GoesStormCoresInputSchema } from './gee-types';
import { z } from 'zod';
import type { Feature, FeatureCollection } from 'ol';
import type { Point } from 'ol/geom';


// Main exported function for the frontend to call
export async function getGeeTileLayer(input: GeeTileLayerInput): Promise<GeeTileLayerOutput> {
  return geeTileLayerFlow(input);
}

// New exported function for vectorization
export async function getGeeVectorDownloadUrl(input: GeeVectorizationInput): Promise<{ downloadUrl: string }> {
    return geeVectorizationFlow(input);
}

// New function to get value at a point
export async function getGeeValueAtPoint(input: GeeValueQueryInput): Promise<{ value: number | string | null }> {
    return geeGetValueAtPointFlow(input);
}

// New exported function for GeoTIFF download
export async function getGeeGeoTiffDownloadUrl(input: GeeGeoTiffDownloadInput): Promise<{ downloadUrl: string }> {
    return geeGeoTiffDownloadFlow(input);
}

// New exported function for histogram
export async function getGeeHistogram(input: GeeHistogramInput): Promise<GeeHistogramOutput> {
    return geeHistogramFlow(input);
}

// New exported function for Tasseled Cap
export async function getTasseledCapLayers(input: GeeTileLayerInput): Promise<TasseledCapOutput> {
    return tasseledCapFlow(input);
}


// New exported function for authentication
export async function authenticateWithGee(): Promise<{ success: boolean; message: string; }> {
    try {
        await initializeEe();
        return { success: true, message: 'Autenticación con Google Earth Engine exitosa.' };
    } catch (error: any) {
        console.error("Fallo en la autenticación con GEE:", error.message);
        return { success: false, message: `Fallo en la autenticación con GEE: ${error.message}` };
    }
}

// --- REFACTORED PROFILE FUNCTION ---
export async function getValuesForPoints({
    points,
    datasetId,
    bandName
}: {
    points: ElevationPoint[];
    datasetId: string;
    bandName: string;
}): Promise<(number | null)[]> {
    await initializeEe();
    
    let image;
    // Special handling for mosaic collections vs single images
    if (datasetId === 'JAXA/ALOS/AW3D30/V3_2' || datasetId === 'COPERNICUS/S2_SR_HARMONIZED') {
        image = ee.ImageCollection(datasetId).select(bandName).mosaic();
    } else {
        image = ee.Image(datasetId).select(bandName);
    }

    // Convert the array of points into an ee.FeatureCollection
    const features = points.map((point, index) => {
        const eePoint = ee.Geometry.Point([point.lon, point.lat]);
        // Store the original index to sort the results later
        return ee.Feature(eePoint, { original_index: index });
    });
    const featureCollection = ee.FeatureCollection(features);

    // Use reduceRegions to get the elevation for all points in a single request
    const values = image.reduceRegions({
        collection: featureCollection,
        reducer: ee.Reducer.first(),
        scale: 30, // Native resolution is appropriate here
    });

    // Promisify the evaluate call to use async/await
    const resultCollection = await new Promise<any>((resolve, reject) => {
        values.evaluate((result: any, error?: string) => {
            if (error) {
                console.error("GEE reduceRegions Error:", error);
                reject(new Error(`Error al consultar los valores en GEE: ${error}`));
            } else {
                resolve(result);
            }
        });
    });

    // Process the results from the single request
    const valueArray: (number | null)[] = new Array(points.length).fill(null);

    if (resultCollection && resultCollection.features) {
        for (const feature of resultCollection.features) {
            const index = feature.properties.original_index;
            // The reducer 'first' outputs its result to a property named 'first'
            const value = feature.properties['first']; 
            if (index !== undefined && value !== undefined) {
                valueArray[index] = value;
            }
        }
    }
    
    // Replace any remaining nulls with -9999 for the client
    return valueArray.map(r => r === null ? -9999 : r);
}


export async function getGoesLayer(): Promise<GeeTileLayerOutput> {
    await initializeEe();

    const collection = ee.ImageCollection('NOAA/GOES/19/MCMIPF')
        .filterDate(ee.Date(Date.now()).advance(-2, 'hour'), ee.Date(Date.now()));
        
    const latestImage = ee.Image(collection.first());
    
    // Check if an image was found
    const imageExists = await new Promise((resolve, reject) => {
        latestImage.get('system:id').evaluate((id, error) => {
            if (error) {
                console.error("Error checking for GOES image:", error);
                reject(new Error("Error al verificar la existencia de la imagen GOES."));
            } else {
                resolve(!!id);
            }
        });
    });

    if (!imageExists) {
        throw new Error('No se encontraron imágenes de GOES en el catálogo en este momento.');
    }
    
    const applyScaleAndOffset = (image: ee.Image) => {
        const bandName = 'CMI_C13';
        const offset = ee.Number(image.get(bandName + '_offset'));
        const scale = ee.Number(image.get(bandName + '_scale'));
        return image.select(bandName).multiply(scale).add(offset);
    };

    const scaledImage = applyScaleAndOffset(latestImage);
    const metadata = { 
        timestamp: latestImage.get('system:time_start'),
        satellite: latestImage.get('satellite'),
        platform_id: latestImage.get('platform_id'),
        scene_id: latestImage.get('scene_id'),
    };
    
    const SMN_CLOUDTOP_PALETTE = [
        '#000000', // Negro < -75C
        '#E00000', // Rojo
        '#C80000', // Rojo oscuro
        '#A00000', // Rojo más oscuro
        '#800000', // Rojo muy oscuro
        '#600000', // Rojo casi negro
        '#FFFF00', // Amarillo
        '#00C800', // Verde
        '#0096FF', // Azul
        '#A0A0A0', // Gris
        '#C0C0C0', // Gris claro
        '#E0E0E0', // Gris muy claro
        '#FFFFFF'  // Blanco > 0C
    ];
    
    // Temperatures from -90°C to 50°C in Kelvin
    const visParams = { min: 183, max: 323, palette: SMN_CLOUDTOP_PALETTE };

    return new Promise((resolve, reject) => {
        scaledImage.getMap(visParams, (mapDetails: any, error: string) => {
            if (error || !mapDetails?.urlFormat) {
                console.error("Earth Engine getMap Error for GOES:", error);
                reject(new Error(`Ocurrió un error al generar la capa de GOES: ${error || 'Respuesta inválida'}`));
            } else {
                const tileUrl = mapDetails.urlFormat.replace('{x}', '{x}').replace('{y}', '{y}').replace('{z}', '{z}');
                ee.Dictionary(metadata).evaluate((evaluatedMetadata, evalError) => {
                    if (evalError) {
                        console.error("Error evaluating GOES metadata:", evalError);
                        resolve({ tileUrl }); // Resolve with URL even if metadata fails
                    } else {
                        resolve({ tileUrl, metadata: evaluatedMetadata });
                    }
                });
            }
        });
    });
}


const getImageForProcessing = (input: GeeTileLayerInput | GeeGeoTiffDownloadInput | GeeHistogramInput | GeeProfileInput) => {
    const { bandCombination } = input;
    const aoi = 'aoi' in input ? input.aoi : undefined;
    
    const geometry = aoi 
        ? ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]) 
        : undefined;

    const minElevation = 'minElevation' in input ? input.minElevation : undefined;
    const maxElevation = 'maxElevation' in input ? input.maxElevation : undefined;
    const tasseledCapComponent = 'tasseledCapComponent' in input ? input.tasseledCapComponent : undefined;

      
    let finalImage;
    let metadata: Record<string, any> = {};
    let visParams: { bands?: string[]; min: number | number[]; max: number | number[]; gamma?: number, palette?: string[] } | null = null;
      
    const DYNAMIC_WORLD_PALETTE = [
        '#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', 
        '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1',
    ];
    
    const ELEVATION_PALETTE = ['006633', 'E5FFCC', '662A00', 'D8D8D8', 'FFFFFF'];

    const SMN_CLOUDTOP_PALETTE = [
        '#000000', // Negro < -75C
        '#E00000', // Rojo
        '#C80000', // Rojo oscuro
        '#A00000', // Rojo más oscuro
        '#800000', // Rojo muy oscuro
        '#600000', // Rojo casi negro
        '#FFFF00', // Amarillo
        '#00C800', // Verde
        '#0096FF', // Azul
        '#A0A0A0', // Gris
        '#C0C0C0', // Gris claro
        '#E0E0E0', // Gris muy claro
        '#FFFFFF'  // Blanco > 0C
    ];

    if (bandCombination === 'GOES_CLOUDTOP') {
        const goesCollection = ee.ImageCollection('NOAA/GOES/19/MCMIPF')
            .filterDate(ee.Date(Date.now()).advance(-2, 'hour'), ee.Date(Date.now()));
        
        const latestImage = ee.Image(goesCollection.first());
        
        const applyScaleAndOffset = (image: ee.Image) => {
            const bandName = 'CMI_C13';
            const offset = ee.Number(image.get(bandName + '_offset'));
            const scale = ee.Number(image.get(bandName + '_scale'));
            return image.select(bandName).multiply(scale).add(offset);
        };
        
        const scaledImage = applyScaleAndOffset(latestImage);

        metadata.timestamp = latestImage.get('system:time_start');
        metadata.satellite = latestImage.get('satellite');
        metadata.platform_id = latestImage.get('platform_id');
        metadata.scene_id = latestImage.get('scene_id');
        finalImage = scaledImage;
        visParams = { min: 183, max: 323, palette: SMN_CLOUDTOP_PALETTE };
    
    } else if (['URBAN_FALSE_COLOR', 'SWIR_FALSE_COLOR', 'BSI', 'NDVI', 'TASSELED_CAP'].includes(bandCombination)) {
        let s2ImageCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
        
        if (geometry) {
            s2ImageCollection = s2ImageCollection.filterBounds(geometry);
        }

        const startDate = 'startDate' in input ? input.startDate : undefined;
        const endDate = 'endDate' in input ? input.endDate : undefined;
        if (startDate && endDate) {
            s2ImageCollection = s2ImageCollection.filterDate(startDate, endDate);
        } else {
            s2ImageCollection = s2ImageCollection.filterDate(ee.Date(Date.now()).advance(-1, 'year'), ee.Date(Date.now()));
        }

        const s2Image = s2ImageCollection.median();
        
        switch (bandCombination) {
          case 'SWIR_FALSE_COLOR':
            finalImage = s2Image;
            visParams = { bands: ['B12', 'B8A', 'B4'], min: 0, max: 3000 };
            break;
          case 'BSI':
            finalImage = s2Image.expression('((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2))', {
              'B11': s2Image.select('B11'), 'B4': s2Image.select('B4'),
              'B8': s2Image.select('B8'), 'B2': s2Image.select('B2')
            }).rename('BSI');
            visParams = { min: -1, max: 1, palette: ['#2ca25f', '#ffffbf', '#fdae61', '#d7191c'] };
            break;
          case 'NDVI':
            finalImage = s2Image.normalizedDifference(['B8', 'B4']).rename('NDVI');
            visParams = { min: -0.2, max: 1.0, palette: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'] };
            break;
          case 'TASSELED_CAP': {
            const bands = s2Image.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);
            const brightness = bands.expression(
              '(B2 * 0.3037) + (B3 * 0.2793) + (B4 * 0.4743) + (B8 * 0.5585) + (B11 * 0.5082) + (B12 * 0.1863)',
              { B2: bands.select('B2'), B3: bands.select('B3'), B4: bands.select('B4'), B8: bands.select('B8'), B11: bands.select('B11'), B12: bands.select('B12') }
            ).rename('brightness');
            const greenness = bands.expression(
              '(B2 * -0.2848) + (B3 * -0.2435) + (B4 * -0.5436) + (B8 * 0.7243) + (B11 * 0.0840) + (B12 * -0.1800)',
              { B2: bands.select('B2'), B3: bands.select('B3'), B4: bands.select('B4'), B8: bands.select('B8'), B11: bands.select('B11'), B12: bands.select('B12') }
            ).rename('greenness');
            const wetness = bands.expression(
              '(B2 * 0.1509) + (B3 * 0.1973) + (B4 * 0.3279) + (B8 * 0.3406) + (B11 * -0.7112) + (B12 * -0.4572)',
              { B2: bands.select('B2'), B3: bands.select('B3'), B4: bands.select('B4'), B8: bands.select('B8'), B11: bands.select('B11'), B12: bands.select('B12') }
            ).rename('wetness');
            
            if (tasseledCapComponent === 'BRIGHTNESS') {
                finalImage = brightness;
            } else if (tasseledCapComponent === 'GREENNESS') {
                finalImage = greenness;
            } else if (tasseledCapComponent === 'WETNESS') {
                finalImage = wetness;
            } else {
                finalImage = ee.Image.cat([brightness, greenness, wetness]);
                visParams = { bands: ['greenness', 'brightness', 'wetness'], min: [-0.1, 0, -0.1], max: [0.4, 0.5, 0.1] };
            }
            break;
          }
          case 'URBAN_FALSE_COLOR':
          default:
            finalImage = s2Image;
            visParams = { bands: ['B8', 'B4', 'B3'], min: 0, max: 3000 };
            break;
        }
    } else if (bandCombination === 'DYNAMIC_WORLD') {
        const startDate = 'startDate' in input ? input.startDate : undefined;
        const endDate = 'endDate' in input ? input.endDate : undefined;
        const dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterDate(startDate!, endDate!);
        if (geometry) {
            dwCollection.filterBounds(geometry);
        }
        finalImage = ee.Image(dwCollection.mode()).select('label');
        visParams = { min: 0, max: 8, palette: DYNAMIC_WORLD_PALETTE };
    } else if (bandCombination === 'NASADEM_ELEVATION') {
        finalImage = ee.Image('NASA/NASADEM_HGT/001').select('elevation');
        visParams = { min: minElevation ?? 0, max: maxElevation ?? 4000, palette: ELEVATION_PALETTE };
    } else if (bandCombination === 'ALOS_DSM') {
        finalImage = ee.ImageCollection('JAXA/ALOS/AW3D30/V3_2').select('DSM').mosaic();
        visParams = { min: minElevation ?? 0, max: maxElevation ?? 4000, palette: ELEVATION_PALETTE };
    } else { // JRC_WATER_OCCURRENCE or OPENLANDMAP_SOC
        finalImage = bandCombination === 'JRC_WATER_OCCURRENCE'
            ? ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence')
            : ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0');
        visParams = bandCombination === 'JRC_WATER_OCCURRENCE'
            ? { min: 0, max: 100, palette: ['#FFFFFF', 'lightblue', 'blue'] }
            : { min: 0, max: 100, palette: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FE9929', '#EC7014', '#CC4C02', '#8C2D04'] };
    }

    if (geometry && bandCombination !== 'GOES_CLOUDTOP') {
        finalImage = finalImage.clip(geometry);
    }

    return { finalImage, visParams, geometry, metadata };
};


// Define the Genkit flow for raster tiles
const geeTileLayerFlow = ai.defineFlow(
  {
    name: 'geeTileLayerFlow',
    inputSchema: GeeTileLayerInputSchema,
    outputSchema: GeeTileLayerOutputSchema,
  },
  async (input) => {
    await initializeEe();
    
    // GOES logic is now handled by the dedicated getGoesLayer function
    // and is only called from ClimaPanel, not here.
    
    const { finalImage, visParams, metadata } = getImageForProcessing(input);

    return new Promise((resolve, reject) => {
        finalImage.getMap(visParams, (mapDetails: any, error: string) => {
            if (error) {
                console.error("Earth Engine getMap Error:", error);
                 if (error.includes && error.includes('computation timed out')) {
                    return reject(new Error('El procesamiento en Earth Engine tardó demasiado. Intente con un área más pequeña.'));
                }
                if (error.includes && (error.includes('does not have a band') || error.includes('No bands in image') || error.includes("Parameter 'input' is required") || error.includes("Image.get: Parameter 'object' is required"))) {
                    return reject(new Error('No se encontraron imágenes válidas para la consulta actual. Intente con otra área o rango de fechas.'));
                }
                return reject(new Error(`Ocurrió un error al generar la capa de Earth Engine: ${error || 'Error desconocido'}`));
            }

            if (!mapDetails || !mapDetails.urlFormat) {
                return reject(new Error('Respuesta inválida de getMap.'));
            }

            const tileUrl = mapDetails.urlFormat.replace('{x}', '{x}').replace('{y}', '{y}').replace('{z}', '{z}');
            
            if (metadata && Object.keys(metadata).length > 0 && metadata.timestamp) {
                 ee.Dictionary(metadata).evaluate((evaluatedMetadata, error) => {
                    if (error) {
                        console.error("Error evaluating metadata:", error);
                        resolve({ tileUrl });
                    } else {
                        resolve({ tileUrl, metadata: evaluatedMetadata });
                    }
                });
            } else {
                 resolve({ tileUrl });
            }
        });
    });
  }
);

// Class names corresponding to the Dynamic World 'label' band values.
const DW_CLASS_NAMES = [
    'Agua', 'Árboles', 'Césped', 'Vegetación Inundada', 'Cultivos',
    'Arbustos', 'Área Construida', 'Suelo Desnudo', 'Nieve y Hielo'
];
// Define properties to add to the vectorized features.
const DW_PROPS = {
    'landcover_class': DW_CLASS_NAMES,
};


// Define the Genkit flow for vectorization
const geeVectorizationFlow = ai.defineFlow(
    {
        name: 'geeVectorizationFlow',
        inputSchema: GeeVectorizationInputSchema,
        outputSchema: z.object({ downloadUrl: z.string() }),
    },
    async (input) => {
        await initializeEe();
        
        const { aoi, startDate, endDate } = input;
        const geometry = ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]);

        const dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
            .filterBounds(geometry)
            .filterDate(startDate, endDate);

        const dwImage = ee.Image(dwCollection.mode()).select('label');
        const dwImageClipped = dwImage.clip(geometry);

        const vectors = dwImageClipped.reduceToVectors({
            geometry: geometry,
            scale: 10, // Dynamic World native resolution
            geometryType: 'polygon',
            eightConnected: false,
            // Use 'label' to get the numeric class value from the raster.
            labelProperty: 'label', 
            maxPixels: 1e10,
            bestEffort: true,
        });
        
        // Add the human-readable class name as a new property.
        const vectorsWithClassName = vectors.map((feature) => {
            const num = feature.get('label');
            const className = ee.String(ee.List(DW_PROPS.landcover_class).get(num));
            return feature.set('landcover_name', className);
        });
        
        return new Promise((resolve, reject) => {
            vectorsWithClassName.getDownloadURL({
                format: 'geojson',
                filename: 'cobertura_suelo_dynamic_world',
                callback: (url, error) => {
                    if (error) {
                        console.error("Earth Engine getDownloadURL Error:", error);
                        if (error.includes && error.includes('computation timed out')) {
                            return reject(new Error('La vectorización tardó demasiado. Intente con un área más pequeña.'));
                        }
                        return reject(new Error(`Ocurrió un error durante la vectorización en GEE: ${error}`));
                    }
                    if (!url) {
                        return reject(new Error('GEE no devolvió una URL de descarga.'));
                    }
                    resolve({ downloadUrl: url });
                }
            });
        });
    }
);

const DYNAMIC_WORLD_LABELS: Record<number, string> = {
    0: 'Agua', 1: 'Árboles', 2: 'Césped', 3: 'Vegetación Inundada',
    4: 'Cultivos', 5: 'Arbustos', 6: 'Área Construida',
    7: 'Suelo Desnudo', 8: 'Nieve y Hielo'
};


// Define the Genkit flow for getting a value at a point
const geeGetValueAtPointFlow = ai.defineFlow(
    {
        name: 'geeGetValueAtPointFlow',
        inputSchema: GeeValueQueryInputSchema,
        outputSchema: z.object({ value: z.union([z.number(), z.string(), z.null()]) }),
    },
    async (input) => {
        await initializeEe();
        
        const point = ee.Geometry.Point([input.lon, input.lat]);
        
        // We reuse getImageForProcessing, but we don't need AOI for a point query.
        // We pass a dummy AOI because the function expects it.
        const { finalImage } = getImageForProcessing({
            aoi: { minLon: 0, minLat: 0, maxLon: 0, maxLat: 0 }, // Dummy AOI
            bandCombination: input.bandCombination,
            startDate: input.startDate,
            endDate: input.endDate,
            minElevation: input.minElevation,
            maxElevation: input.maxElevation,
        });

        return new Promise((resolve, reject) => {
            const dictionary = finalImage.reduceRegion({
                reducer: ee.Reducer.first(),
                geometry: point,
                scale: 10, // Use a reasonable scale
            });

            dictionary.evaluate((result: any, error: string) => {
                if (error) {
                    console.error("GEE reduceRegion Error:", error);
                    return reject(new Error(`Error al consultar el valor en GEE: ${error}`));
                }
                
                const bandName = finalImage.bandNames().get(0).getInfo();
                let value = result ? result[bandName] : null;

                if (value !== null && input.bandCombination === 'DYNAMIC_WORLD') {
                    value = DYNAMIC_WORLD_LABELS[value as number] || `Clase Desconocida (${value})`;
                }
                
                resolve({ value });
            });
        });
    }
);

// Define the Genkit flow for GeoTIFF download
const geeGeoTiffDownloadFlow = ai.defineFlow(
    {
        name: 'geeGeoTiffDownloadFlow',
        inputSchema: GeeGeoTiffDownloadInputSchema,
        outputSchema: z.object({ downloadUrl: z.string() }),
    },
    async (input) => {
        await initializeEe();

        const { finalImage, geometry } = getImageForProcessing(input);
        
        // For GOES, do not clip, as it's a full-disk image.
        // The clipping logic is now handled inside getImageForProcessing.
        const imageToExport = finalImage;

        return new Promise((resolve, reject) => {
            const componentName = input.tasseledCapComponent ? `_${input.tasseledCapComponent.toLowerCase()}` : '';
            const filename = `gee_export_${input.bandCombination.toLowerCase()}${componentName}`;
            
            const params: ee.data.GetDownloadURLParams = {
                name: filename,
                format: 'GEO_TIFF',
                region: geometry,
                crs: 'EPSG:3857',
                // For multi-band images, specify band order. For single band, it's automatic.
                bands: imageToExport.bandNames().getInfo(),
                scale: input.bandCombination === 'GOES_CLOUDTOP' ? 2000 : 30, // Use a reasonable default of 30 meters.
            };

            imageToExport.getDownloadURL(params, (url, error) => {
                if (error) {
                    console.error("Earth Engine getDownloadURL Error for GeoTIFF:", error);
                    if (error.includes && error.includes('computation timed out')) {
                        return reject(new Error('La exportación a GeoTIFF tardó demasiado. Intente con un área más pequeña.'));
                    }
                     if (error.includes('Total request size')) {
                        return reject(new Error(`El área es demasiado grande para la resolución solicitada. Error de GEE: ${error}`));
                    }
                    if (error.includes('Unable to write GeoTIFFs in projection PROJCS["unnamed"')) {
                       return reject(new Error("GEE no puede exportar directamente en la proyección nativa de GOES. Se requiere reproyección."));
                    }
                    return reject(new Error(`Ocurrió un error durante la exportación en GEE: ${error}`));
                }
                if (!url) {
                    return reject(new Error('GEE no devolvió una URL de descarga para el GeoTIFF.'));
                }
                resolve({ downloadUrl: url });
            });
        });
    }
);

// Define the Genkit flow for Histogram
const geeHistogramFlow = ai.defineFlow(
    {
        name: 'geeHistogramFlow',
        inputSchema: GeeHistogramInputSchema,
        outputSchema: GeeHistogramOutputSchema,
    },
    async (input) => {
        await initializeEe();
        
        const { finalImage, geometry } = getImageForProcessing(input);
        
        const options = {
            reducer: ee.Reducer.histogram({
              maxBuckets: 256,
              // minBucketWidth: 10 // Adjust as needed for elevation data
            }),
            geometry: geometry,
            scale: 90, // Use a coarser scale for performance
            maxPixels: 1e8,
            bestEffort: true,
        };

        return new Promise((resolve, reject) => {
             const bandName = finalImage.bandNames().get(0).getInfo();
             const dictionary = finalImage.reduceRegion(options);

             dictionary.evaluate((result: any, error: string) => {
                if (error) {
                    console.error("GEE Histogram Error:", error);
                    return reject(new Error(`Error al calcular el histograma en GEE: ${error}`));
                }
                if (!result || !result[bandName]) {
                    return reject(new Error('No se pudo generar el histograma. El área podría no contener datos.'));
                }
                
                const histogramData = result[bandName].bucketMeans
                    ? result[bandName].bucketMeans.map((mean: number, index: number) => [mean, result[bandName].histogram[index]])
                    : [];

                resolve({ histogram: histogramData });
             });
        });
    }
);


// Tasseled Cap Flow
const tasseledCapFlow = ai.defineFlow(
    {
        name: 'tasseledCapFlow',
        inputSchema: TasseledCapInputSchema,
        outputSchema: z.object({
            brightness: z.object({ tileUrl: z.string() }),
            greenness: z.object({ tileUrl: z.string() }),
            wetness: z.object({ tileUrl: z.string() }),
        }),
    },
    async (input) => {
        await initializeEe();

        const { aoi, startDate, endDate } = input;
        const geometry = ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]);
        
        let s2ImageCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
          .filterBounds(geometry);
          
        if (startDate && endDate) {
            s2ImageCollection = s2ImageCollection.filterDate(startDate, endDate);
        } else {
            s2ImageCollection = s2ImageCollection.filterDate(ee.Date(Date.now()).advance(-1, 'year'), ee.Date(Date.now()));
        }
        const s2Image = s2ImageCollection.median();
        const bands = s2Image.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);

        const brightness = bands.expression(
          '(B2*0.3037)+(B3*0.2793)+(B4*0.4743)+(B8*0.5585)+(B11*0.5082)+(B12*0.1863)',
          { B2:bands.select('B2'),B3:bands.select('B3'),B4:bands.select('B4'),B8:bands.select('B8'),B11:bands.select('B11'),B12:bands.select('B12') }
        ).rename('brightness');
        
        const greenness = bands.expression(
          '(B2*-0.2848)+(B3*-0.2435)+(B4*-0.5436)+(B8*0.7243)+(B11*0.0840)+(B12*-0.1800)',
          { B2:bands.select('B2'),B3:bands.select('B3'),B4:bands.select('B4'),B8:bands.select('B8'),B11:bands.select('B11'),B12:bands.select('B12') }
        ).rename('greenness');

        const wetness = bands.expression(
          '(B2*0.1509)+(B3*0.1973)+(B4*0.3279)+(B8*0.3406)+(B11*-0.7112)+(B12*-0.4572)',
          { B2:bands.select('B2'),B3:bands.select('B3'),B4:bands.select('B4'),B8:bands.select('B8'),B11:bands.select('B11'),B12:bands.select('B12') }
        ).rename('wetness');

        const visParams = {
            brightness: { min: 0.1, max: 0.5, palette: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'].reverse() },
            greenness: { min: -0.1, max: 0.4, palette: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'] },
            wetness: { min: -0.1, max: 0.1, palette: ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'] }
        };

        const getMapUrl = (image: ee.Image, params: any): Promise<string> => {
            return new Promise((resolve, reject) => {
                image.getMap(params, (mapDetails: any, error: string) => {
                    if (error || !mapDetails?.urlFormat) {
                        return reject(new Error(`Error de GEE para ${image.bandNames().get(0).getInfo()}: ${error || 'URL no encontrada'}`));
                    }
                    resolve(mapDetails.urlFormat.replace('{x}', '{x}').replace('{y}', '{y}').replace('{z}', '{z}'));
                });
            });
        };

        const [brightnessUrl, greennessUrl, wetnessUrl] = await Promise.all([
            getMapUrl(brightness, visParams.brightness),
            getMapUrl(greenness, visParams.greenness),
            getMapUrl(wetness, visParams.wetness),
        ]);

        return {
            brightness: { tileUrl: brightnessUrl },
            greenness: { tileUrl: greennessUrl },
            wetness: { tileUrl: wetnessUrl },
        };
    }
);

export async function getGoesStormCores(input: GoesStormCoresInput): Promise<{ downloadUrl: string }> {
    return goesStormCoreVectorizationFlow(input);
}

const goesStormCoreVectorizationFlow = ai.defineFlow(
    {
        name: 'goesStormCoreVectorizationFlow',
        inputSchema: GoesStormCoresInputSchema,
        outputSchema: z.object({ downloadUrl: z.string() }),
    },
    async (input) => {
        await initializeEe();

        const { aoi, temperatureThreshold } = input;
        const geometry = ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]);

        // 1. Get the latest GOES image
        const collection = ee.ImageCollection('NOAA/GOES/19/MCMIPF')
            .filterDate(ee.Date(Date.now()).advance(-2, 'hour'), ee.Date(Date.now()));
        const latestImage = ee.Image(collection.first());

        // 2. Apply scale and offset to get temperature in Kelvin
        const applyScaleAndOffset = (image: ee.Image) => {
            const bandName = 'CMI_C13';
            const offset = ee.Number(image.get(bandName + '_offset'));
            const scale = ee.Number(image.get(bandName + '_scale'));
            return image.select(bandName).multiply(scale).add(offset);
        };
        const tempImageKelvin = applyScaleAndOffset(latestImage);
        
        // 3. Convert input Celsius threshold to Kelvin
        const tempThresholdKelvin = temperatureThreshold + 273.15;

        // 4. Create a binary mask: 1 where temp <= threshold, 0 otherwise
        const stormMask = tempImageKelvin.lte(tempThresholdKelvin);

        // 5. Vectorize the binary mask
        const vectors = stormMask.selfMask().reduceToVectors({
            geometry: geometry, // Use the provided AOI
            scale: 2000, // Use a coarser scale (e.g., 2km) for performance
            geometryType: 'polygon',
            eightConnected: true,
            labelProperty: 'zone',
            maxPixels: 1e12,
        });
        
        return new Promise((resolve, reject) => {
            vectors.getDownloadURL({
                format: 'geojson',
                filename: `nucleos_tormenta_${temperatureThreshold}C`,
                callback: (url, error) => {
                    if (error) {
                        console.error("Earth Engine getDownloadURL Error for Storm Cores:", error);
                        if (error.includes && error.includes('computation timed out')) {
                            return reject(new Error('La vectorización de núcleos de tormenta tardó demasiado.'));
                        }
                        return reject(new Error(`Ocurrió un error durante la vectorización: ${error}`));
                    }
                    if (!url) {
                        return reject(new Error('GEE no devolvió una URL de descarga para los núcleos de tormenta.'));
                    }
                    resolve({ downloadUrl: url });
                }
            });
        });
    }
);


// --- Earth Engine Initialization ---
let eeInitialized: Promise<void> | null = null;

async function authenticateAndInitialize() {
  const authType = process.env.EE_AUTH_TYPE;

  const runInitialization = (authCb: (err?: Error | null) => void) => {
    ee.initialize(null, null, authCb, null);
  };

  try {
    if (authType === 'SERVICE_ACCOUNT') {
      const serviceAccountKey = process.env.EE_SERVICE_ACCOUNT_KEY;
      if (!serviceAccountKey) {
        throw new Error('La variable de entorno EE_SERVICE_ACCOUNT_KEY no está configurada para la autenticación GEE.');
      }
      const keyObject = JSON.parse(serviceAccountKey);
      await promisify(ee.data.authenticateViaPrivateKey)(keyObject);
    } else {
       await promisify(ee.data.authenticateViaOauth)(process.env.EE_CLIENT_ID);
    }

    await promisify(runInitialization)();
    console.log('Earth Engine initialized successfully.');

  } catch (e: any) {
    if (e instanceof SyntaxError) {
        throw new Error('No se pudo parsear el JSON de la clave de la cuenta de servicio (EE_SERVICE_ACCOUNT_KEY). Verifique que sea una cadena JSON válida de una sola línea.');
    }
    // Add more specific error handling if needed
    throw new Error(`Fallo en la autenticación/inicialización con Earth Engine: ${e.message}`);
  }
}

function initializeEe(): Promise<void> {
  if (eeInitialized === null) {
    eeInitialized = authenticateAndInitialize().catch(err => {
      eeInitialized = null; // Reset on failure to allow retry
      throw err;
    });
  }
  return eeInitialized;
}

    
