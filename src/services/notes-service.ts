
'use server';

import { promises as fs } from 'fs';
import path from 'path';

// Define the path to the notes file relative to the project root
const notesFilePath = path.join(process.cwd(), 'src', 'lib', 'notes.json');

interface NotesData {
    notes: string;
}

/**
 * Retrieves the current content of the notes.
 * @returns A promise that resolves to the notes content as a string.
 */
export async function getNotes(): Promise<string> {
    try {
        const fileContent = await fs.readFile(notesFilePath, 'utf-8');
        const data: NotesData = JSON.parse(fileContent);
        return data.notes;
    } catch (error: any) {
        // If the file doesn't exist, return a default string.
        if (error.code === 'ENOENT') {
            return "## Mis Notas\n\nEmpieza a escribir aquí...";
        }
        console.error("Error reading notes file:", error);
        throw new Error("No se pudieron cargar las notas.");
    }
}

/**
 * Saves new content to the notes file.
 * @param content The new string content to save.
 * @returns A promise that resolves when the file is saved.
 */
export async function saveNotes(content: string): Promise<void> {
    try {
        const data: NotesData = { notes: content };
        const jsonString = JSON.stringify(data, null, 2); // Pretty-print JSON
        await fs.writeFile(notesFilePath, jsonString, 'utf-8');
    } catch (error) {
        console.error("Error saving notes file:", error);
        throw new Error("No se pudieron guardar las notas.");
    }
}
