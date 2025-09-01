
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
        "fixed top-20 right-4 z-50 px-3 py-2 text-xs rounded-md shadow-lg",
        "bg-gray-800/80 backdrop-blur-sm text-white border border-gray-600/80",
        "flex items-center gap-3 animate-in fade-in-0 slide-in-from-top-4 duration-300"
      )}
      role="status"
    >
      <ClipboardCheck className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="flex-grow min-w-0">
        <span className="text-gray-300 block text-xs">Tarjeta de Trello Activa:</span>
        <p className="font-medium truncate" title={cardName}>{cardName}</p>
      </div>
      <button
        onClick={handleOpenPopup}
        className="p-1 rounded-full hover:bg-white/10 text-gray-300 hover:text-white flex-shrink-0"
        title="Abrir tarjeta de Trello"
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TrelloCardNotification;
