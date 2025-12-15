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
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border bg-background/80 px-4 py-2 text-sm shadow-lg backdrop-blur-sm">
      <Compass className="h-5 w-5 animate-spin text-primary" />
      <span className="font-medium text-foreground">Cargando datos...</span>
    </div>
  );
};

export default WfsLoadingIndicator;
