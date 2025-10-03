
'use client';

import React from 'react';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

// This is a placeholder for the shared map view.
// In the next step, we will implement the logic to fetch and render the map.
export default function SharedMapPage({ params }: SharedMapPageProps) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                <h1 className="text-2xl font-bold text-gray-800">Mapa Compartido</h1>
                <p className="mt-2 text-gray-600">ID del Mapa:</p>
                <p className="mt-1 text-lg font-mono bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    {params.mapId}
                </p>
                <p className="mt-4 text-sm text-gray-500">
                    Esta página renderizará un mapa de solo lectura basado en este ID.
                </p>
            </div>
        </div>
    );
}
