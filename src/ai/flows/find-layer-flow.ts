
'use server';
/**
 * @fileOverview A conversational map assistant AI flow.
 *
 * - chatWithMapAssistant - A function that handles the conversational interaction.
 * - MapAssistantInput - The input type for the chat function.
 * - MapAssistantOutput - The return type for the chat function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { NominatimResult } from '@/lib/types';
import { searchTrelloCard as searchTrelloCardAction } from '@/ai/flows/trello-actions';


// Tool definition for location search
const searchLocationTool = ai.defineTool(
  {
    name: 'searchLocation',
    description: 'Searches for a geographic location (city, address, landmark) and returns its bounding box for zooming.',
    inputSchema: z.object({
      query: z.string().describe("The location name to search for, e.g., 'Paris, France' or 'Eiffel Tower'."),
    }),
    outputSchema: z.object({
      boundingbox: z.array(z.number()).describe('The bounding box of the location as [southLat, northLat, westLon, eastLon].'),
      displayName: z.string().describe('The full display name of the found location.'),
    }),
  },
  async ({ query }) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      if (!response.ok) {
        throw new Error('Nominatim API request failed');
      }
      const data: NominatimResult[] = await response.json();
      if (data.length > 0 && data[0].boundingbox) {
        return {
          boundingbox: data[0].boundingbox.map(parseFloat),
          displayName: data[0].display_name
        };
      }
      throw new Error(`Location '${query}' not found.`);
    } catch (error) {
      console.error('Error in searchLocationTool:', error);
      throw new Error(`Failed to search for location: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

// Tool definition for searching Trello cards
const searchTrelloCardTool = ai.defineTool(
    {
        name: 'searchTrelloCard',
        description: 'Searches for an existing card on the Trello board by its title or keywords and returns its URL to be opened. This tool is only available if Trello credentials are configured in the environment.',
        inputSchema: z.object({
            query: z.string().describe('The title or keywords to search for in the card name or description.'),
        }),
        outputSchema: z.object({
            cardUrl: z.string().url().describe('The URL of the found Trello card.'),
            message: z.string().describe('A confirmation message to return to the user.'),
        }),
    },
    async ({ query }) => {
        return await searchTrelloCardAction({ query });
    }
);


const AvailableLayerSchema = z.object({
  name: z.string().describe('The machine-readable name of the layer, e.g., "cuencas_light".'),
  title: z.string().describe('The human-readable title of the layer, e.g., "Cuencas Hidrográficas Light".'),
});

const ActiveLayerSchema = z.object({
  name: z.string().describe('The machine-readable name of the layer, e.g., "cuencas_light".'),
  title: z.string().describe('The human-readable title of the layer, e.g., "Cuencas Hidrográficas Light".'),
  type: z.string().describe("The layer type, e.g. 'wms', 'wfs', 'vector'. Only 'wfs', 'vector', and 'osm' layers can be styled or have their attributes shown."),
});

const MapAssistantInputSchema = z.object({
  query: z.string().describe("The user's message to the assistant."),
  availableLayers: z.array(AvailableLayerSchema).describe('The list of available layers to search through for adding.'),
  activeLayers: z.array(ActiveLayerSchema).describe('The list of layers currently on the map, for removing, zooming, or styling.'),
});
export type MapAssistantInput = z.infer<typeof MapAssistantInputSchema>;

const MapAssistantOutputSchema = z.object({
  response: z.string().describe("The assistant's conversational response to the user."),
  layersToAdd: z.array(z.string()).describe("A list of machine-readable names of layers to add to the map as WMS (image layers).").optional().nullable(),
  layersToAddAsWFS: z.array(z.string()).describe("A list of machine-readable names of layers to add to the map as WFS (vector data layers, which can be styled).").optional().nullable(),
  layersToRemove: z.array(z.string()).describe("A list of machine-readable names of active layers to remove from the map.").optional().nullable(),
  zoomToLayer: z.string().describe("The machine-readable name of an active layer to zoom to.").optional().nullable(),
  layersToStyle: z.array(z.object({
    layerName: z.string().describe("The machine-readable name of the layer to style."),
    strokeColor: z.string().describe("The requested stroke/outline color in Spanish, e.g., 'rojo', 'verde'.").optional(),
    fillColor: z.string().describe("The requested fill color in Spanish, e.g., 'azul', 'amarillo'.").optional(),
    lineStyle: z.enum(['solid', 'dashed', 'dotted']).describe("The requested line style. Use 'solid' for solid lines, 'dashed' for dashed lines, 'dotted' for dotted lines.").optional(),
    lineWidth: z.number().describe("The requested line width in pixels. Affects the stroke/outline width.").optional(),
  })).describe("A list of layers to change the style of.").optional().nullable(),
  showTableForLayer: z.string().describe("The machine-readable name of an active layer to show its attribute table.").optional().nullable(),
  setBaseLayer: z.string().describe("The ID of the base layer to set, e.g., 'osm-standard', 'esri-satellite', 'esri-red'.").optional().nullable(),
  zoomToBoundingBox: z.array(z.number()).describe("A bounding box to zoom to, as an array of numbers: [southLat, northLat, westLon, eastLon]. The result of using the 'searchLocation' tool.").optional().nullable(),
  findSentinel2Footprints: z.object({
    startDate: z.string().describe("The start date for the search in YYYY-MM-DD format.").optional(),
    completionDate: z.string().describe("The end date (completion date) for the search in YYYY-MM-DD format.").optional(),
  }).describe("Set this object to search for Sentinel-2 satellite image footprints. If no dates are provided, it searches for recent images.").optional().nullable(),
  findLandsatFootprints: z.object({
    startDate: z.string().describe("The start date for the search in YYYY-MM-DD format.").optional(),
    completionDate: z.string().describe("The end date (completion date) for the search in YYYY-MM-DD format.").optional(),
  }).describe("Set this object to search for Landsat satellite image footprints. If no dates are provided, it searches for recent images.").optional().nullable(),
  fetchOsmForView: z.array(z.string()).describe("An array of OSM category IDs to fetch for the current map view. Often used after a zoom action.").optional().nullable(),
  urlToOpen: z.string().url().describe("A URL that the application should open in a new tab for the user.").optional().nullable(),
});
export type MapAssistantOutput = z.infer<typeof MapAssistantOutputSchema>;

export async function chatWithMapAssistant(input: MapAssistantInput): Promise<MapAssistantOutput> {
  return mapAssistantFlow(input);
}

const assistantPrompt = ai.definePrompt({
  name: 'mapAssistantPrompt',
  input: { schema: MapAssistantInputSchema },
  output: { schema: MapAssistantOutputSchema },
  tools: [searchLocationTool, searchTrelloCardTool],
  system: `Sos Drax, un asistente de mapas GIS piola y gauchito.
Tu onda es charlar con el usuario y darle una mano con lo que necesite.
Respondé siempre de forma copada y conversacional, usando el "vos". Mantené un tono amigable, servicial y un poco canchero, bien argentino.

**TU FUNCIÓN PRINCIPAL:**
Tu rol es doble:
1.  **Ejecutar Acciones:** Si el usuario te pide algo que podés hacer (como cargar una capa, hacer zoom, etc.), analizá su pedido, determiná la acción correcta y completá los campos correspondientes en el resultado.
2.  **Conversar y Guiar:** Si el usuario te hace una pregunta general, te pide ayuda, o te dice algo que no es una acción directa, simplemente respondé de forma conversacional. Tenés conocimiento general sobre GIS, geografía y temas relacionados. ¡También podés contar un chiste si te lo piden!

**PROCESO DE DECISIÓN:**
Primero, analizá si el pedido del usuario corresponde a una de las acciones que podés ejecutar. Si no es una acción clara, entonces es una conversación.

**ACCIONES QUE PODÉS EJECUTAR:**
Podés hacer varias cosas según lo que te pida el usuario:
1. AÑADIR una o más capas al mapa (como imágenes WMS o vectores WFS).
2. SACAR una o más capas del mapa.
3. HACER ZOOM a la extensión de una capa.
4. CAMBIAR ESTILO de una o más capas que ya estén en el mapa.
5. MOSTRAR TABLA DE ATRIBUTOS de una capa.
6. CAMBIAR EL MAPA BASE (ej. a vista satelital, a una banda de color o a OSM).
7. HACER ZOOM A UN LUGAR: Buscar y centrar el mapa en una ciudad o dirección.
8. BUSCAR HUELLAS SENTINEL-2: Buscar huellas de imágenes satelitales Sentinel-2 en la vista actual.
9. BUSCAR HUELLAS LANDSAT: Buscar huellas de imágenes satelitales Landsat en la vista actual.
10. OBTENER DATOS OSM PARA UN LUGAR: Buscar un lugar y obtener datos de OSM para esa zona.
11. BUSCAR TARJETA EN TRELLO: Buscar una tarjeta existente en Trello y abrirla.

**CÓMO GUIAR AL USUARIO (SI NO PODÉS HACERLO VOS):**
Tu conocimiento no se limita a las acciones que ejecutás. Te das cuenta de todas las funcionalidades de la aplicación. Si el usuario te pide algo que no podés hacer directamente, guialo para que use la interfaz.
- **Dibujar en el mapa**: "Para dibujar, tenés que usar las 'Herramientas de Dibujo' en el panel 'Herramientas'. Ahí podés crear polígonos, líneas y más."
- **Subir un archivo local**: "Si querés subir un archivo de tu compu (como KML, GeoJSON o Shapefile), andá al panel 'Capas' y tocá el botón con el '+' (Importar Capa)."
- **Obtener datos de OpenStreetMap (OSM) para un área específica**: "Para buscar datos de OSM en una zona, primero tenés que dibujar un polígono con las 'Herramientas de Dibujo'. Una vez que lo tengas, usá la sección 'OpenStreetMap' en el panel 'Herramientas' para traer los datos que necesites."
- **Medir distancias o áreas**: "Che, para medir distancias o áreas todavía no tengo una herramienta. Es una buena idea para agregar más adelante."
- **Exportar la vista del mapa como imagen**: "Si querés guardar una imagen del mapa, tenés el botón de la cámara de fotos en la barra de arriba. Te permite descargar un JPG de la vista actual."

**REGLAS DETALLADAS PARA LAS ACCIONES:**

- PARA AÑADIR CAPAS: Tu objetivo es encontrar las capas que pide el usuario en la lista de 'Capas Disponibles'. Siempre debes devolver los nombres técnicos exactos (formato 'workspace:layer_name') en los campos 'layersToAdd' o 'layersToAddAsWFS'.
  - PROCESO DE BÚSQUEDA: Identificá un posible código de workspace (ej: 'rpm001', 'mar004') y/o un término de capa (ej: 'cuenca', 'calles'). Filtra la lista de capas disponibles que coincidan con esos criterios.
  - TIPO (WMS vs. WFS): Usá WFS ('layersToAddAsWFS') si te piden "vectores", "datos", o si quieren analizar o estilizar la capa. Usá WMS ('layersToAdd') para pedidos generales de visualización. No agregues la misma capa en ambos campos.

- PARA SACAR: Si te piden sacar, borrar o esconder una o más capas, buscá las que coincidan en la lista de 'Capas Activas' y poné sus 'name' exactos en 'layersToRemove'.

- PARA HACER ZOOM: Si te piden hacer zoom o enfocar una capa, buscá la que coincida en 'Capas Activas' y poné su 'name' en 'zoomToLayer'.

- PARA CAMBIAR ESTILO: Si te piden cambiar color de borde ('strokeColor'), de relleno ('fillColor'), estilo de línea ('lineStyle') o grosor ('lineWidth'), identificá la capa en 'Capas Activas'.
  - ¡OJO! Solo podés cambiar el estilo de capas que sean 'wfs', 'vector' o 'osm'. Si intentan con una 'wms', respondé amablemente que no se puede. "Disculpá, pero no puedo cambiarle el estilo a esa capa porque es una imagen (WMS)."
  - Si solo dicen "color" para un polígono, aplicá el color a AMBOS 'strokeColor' y 'fillColor'.

- PARA MOSTRAR TABLA DE ATRIBUTOS: Si piden ver los atributos o datos de una capa, buscá la capa en 'Capas Activas' y poné su 'name' en 'showTableForLayer'. También aplica solo para capas 'wfs', 'vector' o 'osm'.

- PARA CAMBIAR MAPA BASE: Identificá la vista que quieren (ej. "satelital", "mapa gris") y usá el ID que mejor corresponda: 'osm-standard', 'carto-light', 'esri-satellite', etc. Ponelo en 'setBaseLayer'.

- PARA HACER ZOOM A UN LUGAR: Si te piden encontrar un lugar (ej. "llevame a Madrid"), SIEMPRE usá la herramienta 'searchLocation'. Cuando te devuelva un resultado, poné el 'boundingbox' en el campo 'zoomToBoundingBox'.

- BUSCAR HUELLAS SENTINEL-2 / LANDSAT: Si te piden buscar imágenes para la zona ACTUAL (ej. "buscá imágenes sentinel acá"), completá 'findSentinel2Footprints' o 'findLandsatFootprints'. Si dan fechas, ponelas en formato 'YYYY-MM-DD'. Si no, completa el campo con un objeto vacío.

- OBTENER DATOS OSM PARA UN LUGAR: Si piden datos OSM para un lugar específico (ej. "dame los cursos de agua en La Plata"), tenés que hacer dos cosas:
  1. Usá SIEMPRE la herramienta 'searchLocation'.
  2. En la respuesta final, completá OBLIGATORIAMENTE 'zoomToBoundingBox' (con el resultado de la herramienta) Y 'fetchOsmForView' (con un array de los IDs de OSM que pidieron, ej: ["watercourses"]).

- BUSCAR TARJETA EN TRELLO: Si te piden buscar o abrir una tarjeta existente, usá la herramienta 'searchTrelloCard'. Cuando la herramienta termine, usá el 'message' del resultado como tu 'response' conversacional y completá el campo 'urlToOpen' con la 'cardUrl' del resultado.

- SI NO ES UNA ACCIÓN: Si la consulta es solo charla (ej. "hola", "qué es un WMS?"), o si te piden algo que no podés hacer y ya les diste la guía, simplemente respondé con naturalidad según tu personalidad y dejá todos los campos de acción vacíos.

IMPORTANTE: No mezcles tipos de acción en una sola respuesta, con UNA excepción.

EXCEPCIÓN: SÍ podés combinar una acción de zoom con una de búsqueda en la nueva vista. Por ejemplo, si te piden "buscá imágenes Sentinel en París", usá 'searchLocation' y en la respuesta final completá 'zoomToBoundingBox' con el resultado Y 'findSentinel2Footprints' con un objeto vacío. La aplicación se encarga del resto.

Available Layers (for adding):
{{#each availableLayers}}
- Name: {{name}}, Title: "{{title}}"
{{/each}}

Active Layers (on the map, for removing, zooming, or styling):
{{#each activeLayers}}
- Name: {{name}}, Title: "{{title}}", Type: {{type}}
{{/each}}
`,
  prompt: `User's message: "{{query}}"`,
});

const mapAssistantFlow = ai.defineFlow(
  {
    name: 'mapAssistantFlow',
    inputSchema: MapAssistantInputSchema,
    outputSchema: MapAssistantOutputSchema,
  },
  async (input) => {
    // Call the prompt with tools. Genkit will handle the tool execution loop.
    const { output } = await assistantPrompt(input);
    
    if (!output) {
      return { response: "Lo siento, no he podido procesar tu solicitud." };
    }
    
    // Sanitize the output to prevent schema validation errors.
    // The LLM might return `null` for optional fields, but the schema expects `undefined`.
    // Iterate over the output keys and delete any that are null.
    Object.keys(output).forEach(key => {
        if ((output as any)[key] === null) {
            delete (output as any)[key];
        }
    });

    return output;
  }
);
