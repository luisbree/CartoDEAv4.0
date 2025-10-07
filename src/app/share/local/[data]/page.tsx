
'use client';

import React, { useMemo } from 'react';
import { GeoMapperClient } from '@/components/geo-mapper-client';
import type { MapState } from '@/lib/types';

interface SharedMapLocalPageProps {
    params: {
        data: string;
    };
}

export default function SharedMapLocalPage({ params }: SharedMapLocalPageProps) {
    const mapState = useMemo((): MapState | null => {
        if (!params.data) {
            return null;
        }
        try {
            // Decode the Base64 string from the URL
            const jsonString = atob(decodeURIComponent(params.data));
            // Parse the JSON string into a MapState object
            const parsedState = JSON.parse(jsonString);
            return parsedState as MapState;
        } catch (error) {
            console.error("Failed to decode or parse map state from URL:", error);
            return null;
        }
    }, [params.data]);

    if (!mapState) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Datos de Mapa Inválidos</h1>
                    <p className="mt-2 text-gray-600">No se pudo cargar el estado del mapa desde el enlace.</p>
                </div>
            </div>
        );
    }

    return <GeoMapperClient initialMapState={mapState} />;
}
