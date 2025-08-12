'use server';

/**
 * @fileOverview Provides intelligent suggestions for points of interest (POIs) in the current map view.
 *
 * @file suggestPoi - A function that handles the POI suggestion process.
 * @file SuggestPoiInput - The input type for the suggestPoi function.
 * @file SuggestPoiOutput - The return type for the suggestPoi function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestPoiInputSchema = z.object({
  mapRegion: z
    .string()
    .describe(
      'Description of the current map region, including center coordinates and zoom level.'
    ),
  userPreferences: z
    .string()
    .optional()
    .describe('Optional user preferences for POI types (e.g., restaurants, parks, museums).'),
});
export type SuggestPoiInput = z.infer<typeof SuggestPoiInputSchema>;

const SuggestPoiOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe('The name of the point of interest.'),
      description: z.string().describe('A brief description of the POI.'),
      latitude: z.number().describe('The latitude of the POI.'),
      longitude: z.number().describe('The longitude of the POI.'),
      category: z.string().describe('The category of the POI (e.g., restaurant, park).'),
    })
  ).describe('An array of suggested points of interest.'),
});
export type SuggestPoiOutput = z.infer<typeof SuggestPoiOutputSchema>;

export async function suggestPoi(input: SuggestPoiInput): Promise<SuggestPoiOutput> {
  return suggestPoiFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPoiPrompt',
  input: {schema: SuggestPoiInputSchema},
  output: {schema: SuggestPoiOutputSchema},
  prompt: `You are a helpful map exploration assistant. Given the current map region and optional user preferences, suggest interesting points of interest (POIs) to explore.

Map Region: {{{mapRegion}}}
User Preferences: {{#if userPreferences}}{{{userPreferences}}}{{else}}No specific preferences.{{/if}}

Suggest a diverse set of POIs, including their name, a brief description, latitude, longitude, and category. Consider the user preferences if provided.

Format your response as a JSON array of POI objects.`,
});

const suggestPoiFlow = ai.defineFlow(
  {
    name: 'suggestPoiFlow',
    inputSchema: SuggestPoiInputSchema,
    outputSchema: SuggestPoiOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
