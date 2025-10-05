
'use client';

import React from 'react';
import SharedMapClient from '@/components/shared-map-client';
import FirebaseClientProvider from '@/firebase/client-provider';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

export default function SharedMapPage({ params }: SharedMapPageProps) {
    // This page now acts as a container, passing the mapId to the client component
    // which will handle all the logic of fetching and displaying the map.
    return (
        <FirebaseClientProvider>
            <SharedMapClient mapId={params.mapId} />
        </FirebaseClientProvider>
    );
}
