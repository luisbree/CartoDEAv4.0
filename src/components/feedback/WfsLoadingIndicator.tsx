"use client";

import React from 'react';
import { Compass } from 'lucide-react';

interface WfsLoadingIndicatorProps {
  isVisible: boolean;
}

const WfsLoadingIndicator: React.FC<WfsLoadingIndicatorProps> = ({ isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/30 backdrop-blur-sm pointer-events-auto">
      <div className="flex flex-col items-center justify-center bg-background/90 p-6 rounded-lg shadow-2xl">
        <Compass className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-foreground text-lg font-semibold">Cargando datos...</p>
      </div>
    </div>
  );
};

export default WfsLoadingIndicator;
