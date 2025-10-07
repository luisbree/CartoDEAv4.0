
"use client";

import { GeoMapperClient } from '@/components/geo-mapper-client';
import type { MapState } from '@/lib/types';

interface GeoMapperClientWrapperProps {
  initialMapState?: MapState;
}

export default function GeoMapperClientWrapper({ initialMapState }: GeoMapperClientWrapperProps) {
  // The wrapper now decides whether to pass the initialMapState to the actual client component.
  // This keeps the main client component clean while allowing shared map data to be injected.
  return (
      <GeoMapperClient initialMapState={initialMapState} />
  );
}
