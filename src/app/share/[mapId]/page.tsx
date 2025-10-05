
'use client';

import React from 'react';
import SharedMapClient from '@/components/shared-map-client';

interface SharedMapPageProps {
    params: {
        mapId: string;
    };
}

// Convert the component to an async function to correctly handle params
export default function SharedMapPage({ params }: SharedMapPageProps) {
    // The page now correctly receives the mapId as a prop,
    // as Next.js handles the async nature of params for us.
    // We pass this ID directly to the client component.
    return (
        <SharedMapClient mapId={params.mapId} />
    );
}
