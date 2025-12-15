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
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-black/30 backdrop-blur-sm">
            <Compass className="h-10 w-10 animate-spin text-primary-foreground/90" />
            <span className="font-semibold text-primary-foreground/90">Cargando datos...</span>
        </div>
    </div>
  );
};

export default WfsLoadingIndicator;
