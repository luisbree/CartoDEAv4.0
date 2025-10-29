
'use server';
/**
 * @fileOverview Game logic flows for "Operación: Despliegue".
 *
 * - onboardNewAgent - Creates a profile for a new agent with a random starting location.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { NominatimResult } from '@/lib/types';
import { get } from 'ol/proj';

// Define tools required for game logic

const getBuenosAiresTownTool = ai.defineTool(
  {
    name: 'getBuenosAiresTown',
    description:
      'Busca una ciudad, pueblo o paraje aleatorio dentro de los límites de la Provincia de Buenos Aires, Argentina, y devuelve sus coordenadas.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      name: z.string().describe('El nombre de la localidad encontrada.'),
      lat: z.number().describe('La latitud de la localidad.'),
      lon: z.number().describe('La longitud de la localidad.'),
    }),
  },
  async () => {
    // Overpass query to find a random node tagged as a town, village, or hamlet within Buenos Aires.
    // The query is structured to be robust.
    const query = `
      [out:json][timeout:25];
      (
        area["name"="Buenos Aires"]["boundary"="administrative"]["admin_level"="4"];
      )->.searchArea;
      (
        node["place"~"^(town|village|hamlet)$"](area.searchArea);
      );
      out 1;
    `;
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) {
        throw new Error(`Overpass API request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (data.elements && data.elements.length > 0) {
        const randomTown =
          data.elements[Math.floor(Math.random() * data.elements.length)];
        return {
          name: randomTown.tags.name || 'Localidad sin nombre',
          lat: randomTown.lat,
          lon: randomTown.lon,
        };
      }
      throw new Error('No towns found in Buenos Aires province via Overpass API.');
    } catch (error) {
      console.error('Error in getBuenosAiresTownTool:', error);
      // Fallback in case Overpass fails
      return {
        name: 'La Plata (Fallback)',
        lat: -34.9214,
        lon: -57.9545,
      };
    }
  }
);


// Schema for the onboarding flow
const OnboardAgentInputSchema = z.object({
  preferredNickname: z.string().describe("The agent's preferred nickname, usually from their auth profile."),
});

const OnboardAgentOutputSchema = z.object({
    nickname: z.string().describe('The final nickname for the agent.'),
    center: z.object({
        lat: z.number(),
        lon: z.number(),
    }).describe("The geographic center of the agent's new deployment base.")
});

export async function onboardNewAgent(input: z.infer<typeof OnboardAgentInputSchema>): Promise<z.infer<typeof OnboardAgentOutputSchema>> {
  return onboardAgentFlow(input);
}


// The main flow for onboarding a new agent
const onboardAgentFlow = ai.defineFlow(
  {
    name: 'onboardAgentFlow',
    inputSchema: OnboardAgentInputSchema,
    outputSchema: OnboardAgentOutputSchema,
  },
  async ({ preferredNickname }) => {
    
    const location = await getBuenosAiresTownTool({});
    
    // Simple logic for now, but could be expanded.
    const nickname = preferredNickname.split(' ')[0];

    return {
      nickname,
      center: {
        lat: location.lat,
        lon: location.lon,
      },
    };
  }
);

