
'use server';
/**
 * @fileOverview A flow for generating Google Earth Engine tile layers and vector data.
 *
 * - getGeeTileLayer - Generates a tile layer URL for a given Area of Interest.
 * - getGeeVectorDownloadUrl - Generates a download URL for vectorized GEE data.
 */

import { ai } from '@/ai/genkit';
import ee from '@google/earthengine';
import { promisify } from 'util';
import type { GeeTileLayerInput, GeeTileLayerOutput, GeeVectorizationInput, GeeValueQueryInput, GeeGeoTiffDownloadInput } from './gee-types';
import { GeeTileLayerInputSchema, GeeTileLayerOutputSchema, GeeVectorizationInputSchema, GeeValueQueryInputSchema, GeeGeoTiffDownloadInputSchema } from './gee-types';
import { z } from 'zod';

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


// New exported function for authentication
export async function authenticateWithGee(): Promise<{ success: boolean; message: string; }> {
    try {
        await initializeEe();
        return { success: true, message: 'Autenticación con Google Earth Engine exitosa.' };
    } catch (error: any) {
        // Re-throw the error so the frontend can catch the specific message and its details.
        // The previous implementation was catching the error and returning an object,
        // which breaks the error propagation chain for Next.js Server Actions.
        throw new Error(`Fallo en la autenticación con GEE: ${error.message}`);
    }
}


const getImageForProcessing = (input: GeeTileLayerInput | GeeGeoTiffDownloadInput) => {
    const { aoi, bandCombination, startDate, endDate, minElevation, maxElevation } = input;
    const geometry = aoi ? ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]) : ee.Geometry.Point([0,0]);
      
    let finalImage;
    let visParams: { bands?: string[]; min: number; max: number; gamma?: number, palette?: string[] };
      
    const DYNAMIC_WORLD_PALETTE = [
        '#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', 
        '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1',
    ];
    
    const ELEVATION_PALETTE = ['006633', 'E5FFCC', '662A00', 'D8D8D8', 'FFFFFF'];


    if (bandCombination !== 'JRC_WATER_OCCURRENCE' && bandCombination !== 'OPENLANDMAP_SOC' && bandCombination !== 'DYNAMIC_WORLD' && bandCombination !== 'NASADEM_ELEVATION' && bandCombination !== 'ALOS_DSM') {
        let s2ImageCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
        
        if (geometry) {
            s2ImageCollection = s2ImageCollection.filterBounds(geometry);
        }

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
          case 'URBAN_FALSE_COLOR':
          default:
            finalImage = s2Image;
            visParams = { bands: ['B8', 'B4', 'B3'], min: 0, max: 3000 };
            break;
        }
    } else if (bandCombination === 'DYNAMIC_WORLD') {
        const dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterDate(startDate, endDate);
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
    } else if (bandCombination === 'OPENLANDMAP_SOC') {
        finalImage = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0');
        visParams = { min: 0, max: 100, palette: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FE9929', '#EC7014', '#CC4C02', '#8C2D04'] };
    } else { // JRC_WATER_OCCURRENCE
        finalImage = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
        visParams = { min: 0, max: 100, palette: ['#FFFFFF', 'lightblue', 'blue'] };
    }

    return { finalImage, visParams, geometry };
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
    const { finalImage, visParams } = getImageForProcessing(input);

    return new Promise((resolve, reject) => {
        finalImage.getMap(visParams, (mapDetails: any, error: string) => {
            if (error) {
                console.error("Earth Engine getMap Error:", error);
                 if (error.includes && error.includes('computation timed out')) {
                    return reject(new Error('El procesamiento en Earth Engine tardó demasiado. Intente con un área más pequeña.'));
                }
                return reject(new Error(`Ocurrió un error al generar la capa de Earth Engine: ${error || 'Error desconocido'}`));
            }

            if (!mapDetails || !mapDetails.urlFormat) {
                return reject(new Error('Respuesta inválida de getMap.'));
            }

            const tileUrl = mapDetails.urlFormat.replace('{x}', '{x}').replace('{y}', '{y}').replace('{z}', '{z}');
            resolve({ tileUrl });
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
            zoom: 15, // Dummy zoom
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

        // Clip the image to the specified Area of Interest (AOI)
        const clippedImage = finalImage.clip(geometry);

        return new Promise((resolve, reject) => {
            const filename = `gee_export_${input.bandCombination.toLowerCase()}`;
            
            const params = {
                name: filename,
                format: 'GEO_TIFF',
                region: geometry,
                // Scale is important for performance and resolution. 
                // Using a reasonable default of 30 meters.
                scale: 30, 
            };

            clippedImage.getDownloadURL(params, (url, error) => {
                if (error) {
                    console.error("Earth Engine getDownloadURL Error for GeoTIFF:", error);
                    if (error.includes && error.includes('computation timed out')) {
                        return reject(new Error('La exportación a GeoTIFF tardó demasiado. Intente con un área más pequeña.'));
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
