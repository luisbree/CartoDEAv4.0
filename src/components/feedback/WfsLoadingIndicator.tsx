
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
        <div className="flex flex-col items-center justify-center gap-4">
            <Compass className="h-16 w-16 animate-spin text-primary" />
            <span className="text-xl font-semibold text-black">Cargando datos...</span>
        </div>
    </div>
  );
};

export default WfsLoadingIndicator;
