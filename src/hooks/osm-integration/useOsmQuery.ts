
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Map, MapBrowserEvent } from 'ol';
import { useToast } from "@/hooks/use-toast";
import { queryOsmFeaturesByPoint } from '@/services/osmQuery';
import type { PlainFeatureData } from '@/lib/types';


interface UseOsmQueryProps {
    mapRef: React.RefObject<Map | null>;
    mapElementRef: React.RefObject<HTMLDivElement | null>;
    isMapReady: boolean;
    onResults: (plainData: PlainFeatureData[], layerName: string) => void;
}

export const useOsmQuery = ({
    mapRef,
    mapElementRef,
    isMapReady,
    onResults,
}: UseOsmQueryProps) => {
    const { toast } = useToast();
    const [isActive, setIsActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Using a ref for the callback to avoid re-binding the listener on every render
    const onResultsRef = useRef(onResults);
    useEffect(() => {
        onResultsRef.current = onResults;
    }, [onResults]);

    const handleMapClick = useCallback(async (event: MapBrowserEvent<any>) => {
        if (!isActive || isLoading || !mapRef.current) return;

        setIsLoading(true);
        toast({ description: 'Consultando datos de OSM...' });

        try {
            const plainData = await queryOsmFeaturesByPoint(event.coordinate, mapRef.current.getView().getProjection().getCode());
            
            if (plainData.length > 0) {
                onResultsRef.current(plainData, 'Consulta OSM');
            } else {
                toast({ description: 'No se encontraron elementos de OSM en esa ubicación.' });
            }
        } catch (error: any) {
            console.error("Error querying OSM:", error);
            toast({
                title: "Error de Consulta OSM",
                description: error.message || "No se pudieron obtener los datos de OpenStreetMap.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }, [isActive, isLoading, mapRef, toast]);

    // Effect to add/remove the click listener from the map
    useEffect(() => {
        if (!isMapReady || !mapRef.current) return;

        const map = mapRef.current;
        if (isActive) {
            map.on('singleclick', handleMapClick);
        }

        return () => {
            map.un('singleclick', handleMapClick);
        };
    }, [isActive, isMapReady, mapRef, handleMapClick]);
    
    // Effect to manage cursor style
    useEffect(() => {
        if (mapElementRef.current) {
            if (isActive) {
                mapElementRef.current.style.cursor = 'help';
            } else {
                mapElementRef.current.style.cursor = 'default';
            }
        }
    }, [isActive, mapElementRef]);


    const toggle = useCallback(() => {
        setIsActive(prev => !prev);
    }, []);

    return {
        isActive,
        isLoading,
        toggle,
    };
};
