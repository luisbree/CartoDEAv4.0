'use client';

import React, { useState, useEffect, use } from 'react';
import { getMapState } from '@/services/sharing-service';
import type { MapState } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { DphLogoIcon } from '@/components/icons/DphLogoIcon';
import SharedMapClient from '@/components/sharing/SharedMapClient';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

export default function SharedMapPage({ params }: SharedMapPageProps) {
    const { mapId } = use(params);
    const firestore = useFirestore();
    const [mapState, setMapState] = useState<MapState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageTitle, setPageTitle] = useState('Cargando Mapa...');

    useEffect(() => {
        if (!mapId || !firestore) {
            if (!firestore) return;
            setError("No se proporcionó un ID de mapa.");
            setIsLoading(false);
            setPageTitle("Error");
            return;
        }

        const fetchMapState = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const stateFromDb = await getMapState(firestore, mapId);
                if (stateFromDb) {
                    setMapState(stateFromDb);
                    setPageTitle(stateFromDb.subject || "Mapa Compartido");
                } else {
                    setError('No se pudo encontrar el mapa compartido para este ID.');
                    setPageTitle("Mapa no encontrado");
                }
            } catch (err) {
                console.error(err);
                setError('Ocurrió un error al cargar el mapa compartido.');
                setPageTitle("Error de Carga");
            } finally {
                setIsLoading(false);
            }
        };

        fetchMapState();
    }, [mapId, firestore]);

    // Update document title
    useEffect(() => {
        document.title = pageTitle;
    }, [pageTitle]);


    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-lg">Cargando mapa compartido...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
                <div className="text-center p-8 bg-card rounded-lg shadow-lg">
                    <h1 className="text-2xl font-bold text-destructive">Error</h1>
                    <p className="mt-2 text-destructive-foreground/80">{error}</p>
                </div>
            </div>
        );
    }

    if (mapState) {
        return (
             <div className="relative h-screen w-screen">
                <div className="absolute top-0 left-0 w-full bg-gray-800/80 text-white shadow-md p-2 z-20 flex items-center gap-3">
                    <DphLogoIcon className="h-8 w-8 flex-shrink-0" />
                    <div>
                        <h1 className="text-base font-bold leading-tight">{mapState.subject}</h1>
                        <p className="text-xs text-gray-300">Mapa compartido (solo vista)</p>
                    </div>
                </div>
                <SharedMapClient mapState={mapState} />
            </div>
        );
    }

    return null; 
}
