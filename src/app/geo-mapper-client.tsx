
"use client";

import { GeoMapperClient } from '@/components/geo-mapper-client';
import type { MapState } from '@/lib/types';

interface GeoMapperClientWrapperProps {
  initialMapState?: MapState;
}

export default function GeoMapperClientWrapper({ initialMapState }: GeoMapperClientWrapperProps) {
  return (
      <GeoMapperClient initialMapState={initialMapState} />
  );
}
