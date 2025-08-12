
'use server';

import type { Coordinate } from 'ol/coordinate';
import { get as getProjection, transform } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import type Feature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import osmtogeojson from 'osmtogeojson';
import { nanoid } from 'nanoid';
import type { PlainFeatureData } from '@/lib/types';


const extractPlainAttributes = (features: Feature<Geometry>[]): PlainFeatureData[] => {
    if (!features) return [];
    
    return features.map(feature => {
        const properties = feature.getProperties();
        // Remove OpenLayers-specific properties and the geometry
        delete properties.geometry;
        delete properties.memberOf;
        
        return {
            id: feature.getId() as string,
            attributes: properties,
        };
    });
};

/**
 * Queries the Overpass API for OSM features at a specific point.
 * @param coordinate The coordinate of the click event in the map's projection.
 * @param mapProjection The projection code of the map.
 * @returns A promise that resolves to an array of PlainFeatureData objects.
 */
export async function queryOsmFeaturesByPoint(
    coordinate: Coordinate,
    mapProjection: string,
): Promise<PlainFeatureData[]> {

    const mapProj = getProjection(mapProjection);
    if (!mapProj) {
        throw new Error('Map projection not found.');
    }
    
    const coord4326 = transform(coordinate, mapProj, 'EPSG:4326');
    const [lon, lat] = coord4326;

    // Use 'is_in' to find areas the point is inside, and 'around' for nearby points/lines.
    const radius = 10; // 10-meter radius
    const overpassQuery = `
      [out:json][timeout:25];
      (
        // Find nodes, ways, relations around the point
        nwr(around:${radius},${lat},${lon});
        // Find areas the point is inside
        is_in(${lat},${lon});
      );
      out geom;
    `;

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter`, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Overpass API error: ${response.status} ${errorText}`);
        }

        const osmData = await response.json();
        
        // Convert OSM data to GeoJSON
        const geojsonData = osmtogeojson(osmData, {
            // Options to improve GeoJSON conversion if needed
        });
        
        if (!geojsonData.features || geojsonData.features.length === 0) {
            return [];
        }

        const geojsonFormat = new GeoJSON({
            // Since we are not creating OL features to send to the client,
            // we don't need to specify projections here.
        });

        const features = geojsonFormat.readFeatures(geojsonData);
        
        // Ensure all features have a unique ID
        features.forEach(feature => {
            if (!feature.getId()) {
                feature.setId(nanoid());
            }
        });

        // Convert complex OL features to plain data objects BEFORE returning from the server
        return extractPlainAttributes(features);

    } catch (error) {
        console.error("Overpass query failed:", error);
        throw error;
    }
}
