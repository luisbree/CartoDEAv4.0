
"use client";

import React from 'react';
import type { Extent } from 'ol/extent';
import { cn } from '@/lib/utils';

interface HistoryDebugDisplayProps {
  history: Extent[];
}

const HistoryDebugDisplay: React.FC<HistoryDebugDisplayProps> = ({ history }) => {
  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-[100] px-3 py-1.5 text-xs rounded-md shadow-lg",
        "bg-background/80 backdrop-blur-sm text-foreground border border-border",
        "dark:bg-neutral-800/80 dark:text-neutral-200 dark:border-neutral-700",
        "pointer-events-none" // Allow clicks to pass through
      )}
      role="status"
    >
      Historial de Vistas: {history.length}
    </div>
  );
};

export default HistoryDebugDisplay;
