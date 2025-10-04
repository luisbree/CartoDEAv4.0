
'use server';
/**
 * @fileOverview Trello integration server actions.
 *
 * - searchTrelloCard - Searches for a card and returns its details. Used by the AI assistant.
 * - searchTrelloCards - Searches for multiple cards and returns a list. Used by the UI.
 * - checkTrelloCredentials - Verifies that the Trello API credentials are valid.
 * - SearchCardInput - The input type for the search functions.
 * - SearchCardOutput - The return type for the single card search function.
 * - TrelloCard - Represents a single card result for the list search.
 */
import { z } from 'zod';

const SearchCardInputSchema = z.object({
  query: z.string(),
});
export type SearchCardInput = z.infer<typeof SearchCardInputSchema>;

const SearchCardOutputSchema = z.object({
  cardUrl: z.string().url(),
  message: z.string(),
});
export type SearchCardOutput = z.infer<typeof SearchCardOutputSchema>;


// New type for individual card results
const TrelloCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
});
export type TrelloCard = z.infer<typeof TrelloCardSchema>;

// Function to get credentials and common parameters
function getTrelloAuth() {
    const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
    const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN;
    
    // Dynamically find all board ID environment variables
    const boardIdKeys = Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_TRELLO_BOARD_ID_'));
    const boardIdsList = boardIdKeys.map(key => process.env[key]).filter(Boolean) as string[];
    const boardIds = boardIdsList.map(id => id.trim().replace(/['"]/g, '')).join(',');

    if (!TRELLO_API_KEY || !TRELLO_API_TOKEN || boardIds.length === 0) {
        return null;
    }

    const authParams = `key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`;

    return { authParams, boardIds };
}


/**
 * Verifies that the Trello API credentials are valid by fetching board details.
 */
export async function checkTrelloCredentials(): Promise<{ success: boolean; message: string; configured: boolean; }> {
    const auth = getTrelloAuth();
    if (!auth) {
        // Indicate that Trello is not configured, and this is not an error state.
        return { success: false, message: 'Credenciales de Trello no configuradas.', configured: false };
    }
    
    const { authParams, boardIds } = auth;
    // We check the first board ID to see if it's valid.
    const firstBoardId = boardIds.split(',')[0];

    try {
        const response = await fetch(`https://api.trello.com/1/boards/${firstBoardId}?${authParams}`);

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('La API Key o el Token de Trello no son válidos.');
            }
            if (response.status === 404) {
                 throw new Error(`El tablero de Trello con ID '${firstBoardId}' no fue encontrado.`);
            }
            const errorText = await response.text();
            throw new Error(`Error de Trello (${response.status}): ${errorText}`);
        }
        
        await response.json(); // Verify the response is valid JSON
        return { success: true, message: 'La conexión con Trello se ha establecido correctamente.', configured: true };

    } catch (error: any) {
        console.error("Trello credential check failed:", error);
        throw new Error(`Fallo en la verificación de Trello: ${error.message}`);
    }
}


// Shared search logic
async function performTrelloSearch(query: string) {
    const auth = getTrelloAuth();
    if (!auth) {
        throw new Error('La integración con Trello no está configurada. Por favor, configure las variables de entorno TRELLO_API_KEY, TRELLO_API_TOKEN y los IDs de los tableros.');
    }

    const { authParams, boardIds } = auth;
    
    const searchParams = new URLSearchParams({
        query,
        idBoards: boardIds,
        modelTypes: 'cards',
        card_fields: 'id,name,shortUrl',
        cards_limit: '20',
        partial: 'true',
    });
    
    const searchUrl = `https://api.trello.com/1/search?${searchParams.toString()}&${authParams}`;
    
    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        console.error(`Trello search error (${searchResponse.status}): ${errorText}`);
        if (searchResponse.status === 401 || searchResponse.status === 400) { // 400 can mean invalid key
            throw new Error('Error de autenticación con Trello. Revisa que tu API Key y Token sean correctos.');
        }
        throw new Error(`Error al buscar en Trello. El servidor respondió: "${errorText || searchResponse.statusText}". Por favor, revisa que tus credenciales (API Key, Token) y el ID del tablero sean correctos.`);
    }
    
    return await searchResponse.json();
}


/**
 * Searches for multiple Trello cards and returns a list.
 * Used by the interactive UI.
 */
export async function searchTrelloCards(input: SearchCardInput): Promise<TrelloCard[]> {
    const searchData = await performTrelloSearch(input.query);

    if (!searchData.cards || searchData.cards.length === 0) {
        return [];
    }
    
    return searchData.cards.map((card: { id: string; name: string; shortUrl: string; }) => ({
        id: card.id,
        name: card.name,
        url: card.shortUrl,
    }));
}


/**
 * Searches for a single Trello card and returns its URL for the AI assistant to open.
 */
export async function searchTrelloCard(input: SearchCardInput): Promise<SearchCardOutput> {
    const { query } = input;
    
    const auth = getTrelloAuth();
    if (!auth) {
        return {
            cardUrl: '',
            message: 'Lo siento, la integración con Trello no está configurada. No puedo realizar esta acción.'
        };
    }

    const searchData = await performTrelloSearch(query);

    if (!searchData.cards || searchData.cards.length === 0) {
        return {
            cardUrl: '', // Return an empty URL
            message: `No se encontró ninguna tarjeta que coincida con "${query}".`
        };
    }

    // AI assistant needs the best match
    const bestMatch = searchData.cards.find((card: { name: string }) => 
        card.name.toLowerCase().includes(query.toLowerCase())
    );

    const cardToOpen = bestMatch || searchData.cards[0];
    
    return {
        cardUrl: cardToOpen.shortUrl,
        message: `He encontrado y abierto la tarjeta '${cardToOpen.name}'.`,
    };
}
