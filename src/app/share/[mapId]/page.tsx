
'use client';

import React, { useState, useEffect } from 'react';
import GeoMapperClientWrapper from '@/app/geo-mapper-client';
import { getMapState } from '@/services/sharing-service';
import type { MapState } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

export default function SharedMapPage({ params }: SharedMapPageProps) {
    const { mapId } = params;
    const firestore = useFirestore();
    const [mapState, setMapState] = useState<MapState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!mapId || !firestore) {
            // If firestore is not ready yet, just wait.
            if (!firestore) return;
            setError("No se proporcionó un ID de mapa.");
            setIsLoading(false);
            return;
        }

        const fetchMapState = async () => {
            setIsLoading(true);
            setError(null);
            console.log("Fetching map state from DB for mapId:", mapId);
            try {
                const stateFromDb = await getMapState(firestore, mapId);
                if (stateFromDb) {
                    setMapState(stateFromDb);
                } else {
                    setError('No se pudo encontrar el mapa compartido para este ID.');
                }
            } catch (err) {
                console.error(err);
                setError('Ocurrió un error al cargar el mapa compartido.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchMapState();
    }, [mapId, firestore]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-800 text-white">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-lg">Cargando mapa compartido...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                    <h1 className="text-2xl font-bold text-gray-800">Error</h1>
                    <p className="mt-2 text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    if (mapState) {
        return <GeoMapperClientWrapper initialMapState={mapState} />;
    }

    // This state should ideally not be reached if error handling is correct
    return null; 
}
