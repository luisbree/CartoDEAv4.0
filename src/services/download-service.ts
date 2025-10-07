
"use client";

interface SaveFileOptions {
    fileContent: string | Blob;
    suggestedName: string;
    fileType: 'geojson' | 'kml' | 'shp';
}

interface FileSystemHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    close(): Promise<void>;
}

declare global {
    interface Window {
        showSaveFilePicker(options?: {
            suggestedName?: string;
            types?: {
                description?: string;
                accept?: { [mimeType: string]: string[] };
            }[];
        }): Promise<FileSystemHandle>;
    }
}

/**
 * Saves a file using the File System Access API with a fallback for older browsers.
 * @param {SaveFileOptions} options - The file content, suggested name, and type.
 */
export async function saveFileWithPicker({ fileContent, suggestedName, fileType }: SaveFileOptions): Promise<void> {
    const fileTypesConfig = {
        geojson: {
            description: 'GeoJSON File',
            accept: { 'application/geo+json': ['.geojson'] },
        },
        kml: {
            description: 'KML File',
            accept: { 'application/vnd.google-earth.kml+xml': ['.kml'] },
        },
        shp: {
            description: 'Shapefile ZIP',
            accept: { 'application/zip': ['.zip'] },
        }
    };
    
    // Modern method: showSaveFilePicker
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [fileTypesConfig[fileType]],
            });
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
        } catch (error: any) {
            // AbortError is expected if the user cancels the dialog.
            if (error.name !== 'AbortError') {
                console.error('Error saving file with picker:', error);
                throw error;
            }
        }
    } else {
        // Fallback method for older browsers
        try {
            const blob = fileContent instanceof Blob
                ? fileContent
                : new Blob([fileContent], { type: fileTypesConfig[fileType].accept[Object.keys(fileTypesConfig[fileType].accept)[0]][0] });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = suggestedName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (error) {
            console.error('Error saving file with fallback method:', error);
            throw error;
        }
    }
}
