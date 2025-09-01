
"use client";

import React from 'react';
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrelloCardNotificationProps {
  cardName: string;
  cardUrl: string;
}

const TrelloCardNotification: React.FC<TrelloCardNotificationProps> = ({ cardName, cardUrl }) => {
  
  const handleOpenPopup = () => {
    const windowFeatures = "popup=true,width=800,height=600,scrollbars=yes,resizable=yes";
    window.open(cardUrl, '_blank', windowFeatures);
  };

  return (
    <div
      className={cn(
        "absolute top-2 right-2 z-40 max-w-xs px-3 py-2 text-xs rounded-md shadow-lg",
        "bg-background/80 backdrop-blur-sm text-foreground border border-border",
        "flex items-center gap-3 animate-in fade-in-0 slide-in-from-top-4 duration-300"
      )}
      role="status"
    >
      <ClipboardCheck className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="flex-grow min-w-0">
        <p className="font-medium truncate" title={cardName}>{cardName}</p>
      </div>
      <button
        onClick={handleOpenPopup}
        className="p-1 rounded-full hover:bg-black/10 text-muted-foreground hover:text-foreground flex-shrink-0"
        title="Abrir tarjeta de Trello"
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TrelloCardNotification;
