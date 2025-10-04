"use client";

import React from 'react';
import SharedMapClient from '@/components/shared-map-client';
import type { MapState } from '@/lib/types';

// Define a hardcoded map state for demonstration purposes
const exampleMapState: MapState = {
    view: {
        center: [-60.0, -36.5], // Center of Buenos Aires Province
        zoom: 7,
    },
    baseLayerId: 'carto-light', // Use a light base map
    layers: [
        {
            type: 'wms',
            name: 'Límites de Partidos (DEAS)',
            layerName: 'deas:rpm001_partidos',
            url: 'https://www.minfra.gba.gob.ar/ambientales/geoserver/',
            visible: true,
            opacity: 0.8,
            wmsStyleEnabled: true,
            styleName: 'deas:rpm001_partidos_style',
            geeParams: null,
        },
        {
            type: 'wms',
            name: 'Cursos de Agua (DEAS)',
            layerName: 'deas:sudestada_cursos_de_agua',
            url: 'https://www.minfra.gba.gob.ar/ambientales/geoserver/',
            visible: true,
            opacity: 0.9,
            wmsStyleEnabled: true,
            styleName: 'deas:sudestada_cursos_de_agua_style',
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
    return <SharedMapClient mapState={exampleMapState} />;
}
