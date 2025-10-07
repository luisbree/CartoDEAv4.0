
"use client";

import React from 'react';
import { GeoMapperClient } from '@/components/geo-mapper-client';
import type { MapState } from '@/lib/types';

// Define a hardcoded map state for demonstration purposes
const exampleMapState: MapState = {
    subject: "Mapa de Ejemplo - Humedales y Ejes de Canal",
    view: {
        center: [-60.0, -36.5], // Center of Buenos Aires Province
        zoom: 7,
    },
    baseLayerId: 'carto-light', // Use a light base map
    layers: [
        {
            type: 'wfs',
            name: 'Humedales Propuestos (Ejemplo)',
            layerName: 'deas:rsa024_espacio_humedales_propuesto',
            url: 'https://www.minfra.gba.gob.ar/ambientales/geoserver/',
            visible: true,
            opacity: 0.8,
            wmsStyleEnabled: true,
            styleName: 'deas:humedales',
            geeParams: null,
        },
        {
            type: 'wfs',
            name: 'Eje de Canal (Ejemplo)',
            layerName: 'deas:rsa024_eje',
            url: 'https://www.minfra.gba.gob.ar/ambientales/geoserver/',
            visible: true,
            opacity: 0.9,
            wmsStyleEnabled: true,
            styleName: 'deas:eje_canal',
            geeParams: null,
        }
    ],
    // createdAt is not needed for this static example
};

/**
 * This page displays a static example of a shared map,
 * allowing developers and users to see how the shared map viewer looks and behaves
 * without needing a valid map ID from Firestore.
 */
export default function SharedMapExamplePage() {
    return <GeoMapperClient initialMapState={exampleMapState} />;
}
