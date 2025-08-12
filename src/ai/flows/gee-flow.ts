
'use server';
/**
 * @fileOverview A flow for generating Google Earth Engine tile layers.
 *
 * - getGeeTileLayer - Generates a tile layer URL for a given Area of Interest.
 */

import { ai } from '@/ai/genkit';
import ee from '@google/earthengine';
import { promisify } from 'util';
import type { GeeTileLayerInput, GeeTileLayerOutput } from './gee-types';
import { GeeTileLayerInputSchema, GeeTileLayerOutputSchema } from './gee-types';
import { z } from 'zod';

// Main exported function for the frontend to call
export async function getGeeTileLayer(input: GeeTileLayerInput): Promise<GeeTileLayerOutput> {
  return geeTileLayerFlow(input);
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


const getImageForProcessing = (input: GeeTileLayerInput) => {
    const { aoi, bandCombination, startDate, endDate, minElevation, maxElevation } = input;
    const geometry = ee.Geometry.Rectangle([aoi.minLon, aoi.minLat, aoi.maxLon, aoi.maxLat]);
      
    let finalImage;
    let visParams: { bands?: string[]; min: number; max: number; gamma?: number, palette?: string[] };
      
    const DYNAMIC_WORLD_PALETTE = [
        '#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', 
        '#DFC35A', '#C4281B', '#A59B8F', '#B39FE1',
    ];

    if (bandCombination !== 'JRC_WATER_OCCURRENCE' && bandCombination !== 'OPENLANDMAP_SOC' && bandCombination !== 'DYNAMIC_WORLD' && bandCombination !== 'NASADEM_ELEVATION') {
        let s2ImageCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(geometry)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
        
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
        const dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(geometry).filterDate(startDate, endDate);
        finalImage = ee.Image(dwCollection.mode()).select('label');
        visParams = { min: 0, max: 8, palette: DYNAMIC_WORLD_PALETTE };
    } else if (bandCombination === 'NASADEM_ELEVATION') {
        finalImage = ee.Image('NASA/NASADEM_HGT/001').select('elevation');
        visParams = { min: minElevation ?? 0, max: maxElevation ?? 4000, palette: ['006633', 'E5FFCC', '662A00', 'D8D8D8', 'FFFFFF'] };
    } else if (bandCombination === 'OPENLANDMAP_SOC') {
        finalImage = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0');
        visParams = { min: 0, max: 100, palette: ['#FFFFE5', '#FFF7BC', '#FEE391', '#FEC44F', '#FE9929', '#EC7014', '#CC4C02', '#8C2D04'] };
    } else { // JRC_WATER_OCCURRENCE
        finalImage = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
        visParams = { min: 0, max: 100, palette: ['#FFFFFF', 'lightblue', 'blue'] };
    }

    return { finalImage, visParams, geometry };
};


// Define the Genkit flow
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
