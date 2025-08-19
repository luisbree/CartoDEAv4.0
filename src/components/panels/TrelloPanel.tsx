
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import DraggablePanel from './DraggablePanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardCheck, Search, ExternalLink } from 'lucide-react';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { searchTrelloCards, type TrelloCard } from '@/ai/flows/trello-actions';
import { ScrollArea } from '../ui/scroll-area';

interface TrelloPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

const TrelloPanel: React.FC<TrelloPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<TrelloCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const cardResults = await searchTrelloCards({ query });
      setResults(cardResults);
    } catch (error: any) {
      console.error("Trello card search error:", error);
      toast({ description: error.message || 'Error al buscar tarjetas en Trello.', variant: 'destructive' });
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (searchTerm.trim().length >= 3) {
      debounceTimeoutRef.current = setTimeout(() => {
        handleSearch(searchTerm);
      }, 500); // 500ms debounce
    } else {
      setResults([]);
    }
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchTerm, handleSearch]);

  const handleCardClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <DraggablePanel
      title="Integración con Trello"
      icon={ClipboardCheck}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 350, height: 400 }}
    >
      <div className="flex flex-col h-full bg-white/5 rounded-md p-3">
        <h3 className="text-sm font-semibold text-white mb-2">Buscar Tarjetas</h3>
        <div className="relative">
          <Input
            id="trello-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Escribe para buscar..."
            className="text-xs h-8 border-white/30 bg-black/20 text-white/90 focus:ring-primary pl-8"
            autoComplete="off"
          />
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
        
        <div className="flex-grow mt-3 min-h-0">
          <ScrollArea className="h-full border border-white/10 p-2 rounded-md bg-black/10">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-300">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando...
              </div>
            ) : results.length > 0 ? (
              <ul className="space-y-1.5">
                {results.map((card) => (
                  <li key={card.id}>
                    <button
                      onClick={() => handleCardClick(card.url)}
                      className="w-full text-left p-1.5 rounded-md hover:bg-primary/30 flex items-center justify-between gap-2 text-xs text-white"
                    >
                      <span className="flex-1 truncate" title={card.name}>{card.name}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchTerm.length >= 3 ? (
              <p className="text-center text-xs text-gray-400 pt-4">
                No se encontraron tarjetas para "{searchTerm}".
              </p>
            ) : (
               <p className="text-center text-xs text-gray-400 pt-4">
                Escribe al menos 3 caracteres para buscar.
              </p>
            )}
          </ScrollArea>
        </div>
      </div>
    </DraggablePanel>
  );
};

export default TrelloPanel;
