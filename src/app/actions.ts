
'use server';

import {
  suggestPoi as suggestPoiFlow,
  type SuggestPoiInput,
} from '@/ai/flows/suggest-poi';

export async function suggestPoi(input: SuggestPoiInput) {
  try {
    const result = await suggestPoiFlow(input);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error in suggestPoi action:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      error: `Failed to get suggestions: ${errorMessage}`,
    };
  }
}
