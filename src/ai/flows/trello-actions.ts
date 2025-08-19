
'use server';
/**
 * @fileOverview Trello integration server actions.
 *
 * - searchTrelloCard - Searches for a card and returns its details. Used by the AI assistant.
 * - searchTrelloCards - Searches for multiple cards and returns a list. Used by the UI.
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

// Shared search logic
async function performTrelloSearch(query: string) {
    const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
    const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN;
    const TRELLO_BOARD_IDS = process.env.TRELLO_BOARD_IDS;

    if (!TRELLO_API_KEY || !TRELLO_API_TOKEN || !TRELLO_BOARD_IDS) {
        throw new Error('La integración con Trello no está configurada. Por favor, configure las variables de entorno TRELLO_API_KEY, TRELLO_API_TOKEN y TRELLO_BOARD_IDS.');
    }

    const authParams = `key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`;
    const searchParams = new URLSearchParams({
        query,
        idBoards: TRELLO_BOARD_IDS.split(',').map(id => id.trim().replace(/['"]/g, '')).join(','),
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
    const searchData = await performTrelloSearch(query);

    if (!searchData.cards || searchData.cards.length === 0) {
        throw new Error(`No se encontró ninguna tarjeta que coincida con "${query}".`);
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
