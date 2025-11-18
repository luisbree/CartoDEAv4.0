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
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center justify-center pointer-events-auto p-4 rounded-lg">
        <Compass className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-black text-lg font-semibold">Cargando capa WFS...</p>
      </div>
    </div>
  );
};

export default WfsLoadingIndicator;
