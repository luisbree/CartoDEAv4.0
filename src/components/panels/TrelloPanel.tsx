
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import DraggablePanel from './DraggablePanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardCheck, Search, ExternalLink, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { searchTrelloCards, checkTrelloCredentials, type TrelloCard } from '@/ai/flows/trello-actions';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';

interface TrelloPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

type AuthStatus = 'unchecked' | 'success' | 'error' | 'not_configured' | 'loading';

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
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unchecked');
  const [authMessage, setAuthMessage] = useState<string>('Verifique la conexión para empezar.');
  const { toast } = useToast();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVerifyConnection = useCallback(async () => {
    setAuthStatus('loading');
    setAuthMessage('Verificando...');
    try {
        const result = await checkTrelloCredentials();
        if (result.success) {
            setAuthStatus('success');
            setAuthMessage(result.message);
            toast({ title: "Trello Conectado", description: result.message });
        } else if (!result.configured) {
            setAuthStatus('not_configured');
            setAuthMessage(result.message);
            toast({ title: "Trello no Configurado", description: result.message, variant: 'destructive' });
        }
    } catch (error: any) {
        setAuthStatus('error');
        setAuthMessage(error.message || 'Ocurrió un error desconocido.');
        toast({ title: "Error de Conexión con Trello", description: error.message, variant: "destructive" });
    }
  }, [toast]);

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

  const getStatusIcon = () => {
    switch (authStatus) {
        case 'loading': return <Loader2 className="h-4 w-4 mr-2 animate-spin text-yellow-400" />;
        case 'success': return <CheckCircle className="h-4 w-4 mr-2 text-green-400" />;
        case 'error': return <AlertTriangle className="h-4 w-4 mr-2 text-red-400" />;
        case 'not_configured': return <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />;
        default: return <HelpCircle className="h-4 w-4 mr-2 text-gray-400" />;
    }
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
      initialSize={{ width: 350, height: "auto" }}
    >
      <div className="flex flex-col h-full bg-white/5 rounded-md p-3 space-y-3">
        
        <div>
            <h3 className="text-sm font-semibold text-white mb-2">Conexión</h3>
            <div className="flex items-center gap-2">
                <Button onClick={handleVerifyConnection} disabled={authStatus === 'loading'} className="flex-grow">
                    {authStatus === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Verificar Conexión
                </Button>
            </div>
            <div className="flex items-center p-2 mt-2 rounded-md bg-black/20 text-xs text-gray-300">
                {getStatusIcon()}
                <span className="flex-1">{authMessage}</span>
            </div>
        </div>

        <Separator className="bg-white/10"/>

        <div>
            <h3 className="text-sm font-semibold text-white mb-2">Buscar Tarjetas</h3>
            <div className="relative">
              <Input
                id="trello-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe para buscar..."
                className="text-xs h-8 border-white/30 bg-black/20 text-white/90 focus:ring-primary pl-8"
                autoComplete="off"
                disabled={authStatus !== 'success'}
              />
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
        </div>
        
        <div className="flex-grow min-h-[150px]">
          <ScrollArea className="h-full border border-white/10 p-2 rounded-md bg-black/10">
            {authStatus !== 'success' ? (
                <p className="text-center text-xs text-gray-400 pt-4">
                    La conexión con Trello debe ser exitosa para buscar tarjetas.
                </p>
            ) : isLoading ? (
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
