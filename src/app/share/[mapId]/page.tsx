
'use client';

import React from 'react';
import SharedMapClient from '@/components/shared-map-client';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

export default function SharedMapPage({ params }: SharedMapPageProps) {
    if (!params.mapId) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">ID de Mapa no encontrado</h1>
                    <p className="mt-2 text-gray-600">No se proporcionó un ID de mapa para cargar.</p>
                </div>
            </div>
        );
    }

    return <SharedMapClient mapId={params.mapId} />;
}
