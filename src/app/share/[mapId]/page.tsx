
'use client';

import React from 'react';
import SharedMapClient from '@/components/shared-map-client';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

export default function SharedMapPage({ params }: SharedMapPageProps) {
    // This page now acts as a container, passing the mapId to the client component
    // which will handle all the logic of fetching and displaying the map.
    return (
        <SharedMapClient mapId={params.mapId} />
    );
}
