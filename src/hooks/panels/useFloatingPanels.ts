
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

type PanelId = 'tools' | 'legend' | 'attributes' | 'ai' | 'trello' | 'wfsLibrary' | 'help' | 'printComposer' | 'gee' | 'statistics' | 'analysis' | 'clima';

interface PanelState {
  isMinimized: boolean;
  isCollapsed: boolean;
  position: { x: number; y: number };
  zIndex: number;
}

interface UseFloatingPanelsProps {
  toolsPanelRef: React.RefObject<HTMLDivElement>;
  legendPanelRef: React.RefObject<HTMLDivElement>;
  attributesPanelRef: React.RefObject<HTMLDivElement>;
  aiPanelRef: React.RefObject<HTMLDivElement>;
  trelloPanelRef: React.RefObject<HTMLDivElement>;
  wfsLibraryPanelRef: React.RefObject<HTMLDivElement>;
  helpPanelRef: React.RefObject<HTMLDivElement>;
  printComposerPanelRef: React.RefObject<HTMLDivElement>;
  geePanelRef: React.RefObject<HTMLDivElement>;
  statisticsPanelRef: React.RefObject<HTMLDivElement>;
  analysisPanelRef: React.RefObject<HTMLDivElement>;
  climaPanelRef: React.RefObject<HTMLDivElement>;
  mapAreaRef: React.RefObject<HTMLDivElement>;
  panelWidth: number;
  panelPadding: number;
}

const initialZIndex = 30;
const CASCADE_OFFSET = 40; // The 40px offset for cascading panels

// This defines the order in which panels will cascade. 'legend' is excluded as it's fixed.
const panelCascadeOrder: PanelId[] = [
    'wfsLibrary', 
    'tools', 
    'analysis',
    'clima',
    'trello', 
    'attributes', 
    'printComposer', 
    'gee',
    'statistics',
    // 'ai' and 'help' are handled separately on the right side
];


export const useFloatingPanels = ({
  toolsPanelRef,
  legendPanelRef,
  attributesPanelRef,
  aiPanelRef,
  trelloPanelRef,
  wfsLibraryPanelRef,
  helpPanelRef,
  printComposerPanelRef,
  geePanelRef,
  statisticsPanelRef,
  analysisPanelRef,
  climaPanelRef,
  mapAreaRef,
  panelWidth,
  panelPadding
}: UseFloatingPanelsProps) => {

  const panelRefs = useMemo(() => ({
    tools: toolsPanelRef,
    legend: legendPanelRef,
    attributes: attributesPanelRef,
    ai: aiPanelRef,
    trello: trelloPanelRef,
    wfsLibrary: wfsLibraryPanelRef,
    help: helpPanelRef,
    printComposer: printComposerPanelRef,
    gee: geePanelRef,
    statistics: statisticsPanelRef,
    analysis: analysisPanelRef,
    clima: climaPanelRef,
  }), [attributesPanelRef, aiPanelRef, legendPanelRef, toolsPanelRef, trelloPanelRef, wfsLibraryPanelRef, helpPanelRef, printComposerPanelRef, geePanelRef, statisticsPanelRef, analysisPanelRef, climaPanelRef]);
  
  const [panels, setPanels] = useState<Record<PanelId, PanelState>>({
      // Start with minimized panels off-screen or at a default position to avoid hydration errors.
      // Positions will be set correctly on mount.
      legend: { isMinimized: false, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex + 2 },
      wfsLibrary: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      tools: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      trello: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      attributes: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      printComposer: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      gee: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      statistics: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      analysis: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      clima: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
      ai: { isMinimized: false, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex + 3 },
      help: { isMinimized: true, isCollapsed: false, position: { x: -9999, y: -9999 }, zIndex: initialZIndex },
  });


  const activeDragRef = useRef<{ panelId: PanelId | null, offsetX: number, offsetY: number }>({ panelId: null, offsetX: 0, offsetY: 0 });
  const zIndexCounterRef = useRef(initialZIndex + 3); // Start above AI panel
  
  useEffect(() => {
    // This effect runs once after the component mounts on the client.
    // It sets the initial positions, preventing hydration mismatch.
    if (mapAreaRef.current) {
        const mapWidth = mapAreaRef.current.clientWidth;
        const aiPanelX = mapWidth - panelWidth - panelPadding;
        
        setPanels(prev => ({
            ...prev,
            legend: { ...prev.legend, position: { x: panelPadding, y: panelPadding } },
            wfsLibrary: { ...prev.wfsLibrary, position: { x: panelPadding, y: panelPadding } },
            tools: { ...prev.tools, position: { x: panelPadding, y: panelPadding } },
            trello: { ...prev.trello, position: { x: panelPadding, y: panelPadding } },
            attributes: { ...prev.attributes, position: { x: panelPadding, y: panelPadding } },
            printComposer: { ...prev.printComposer, position: { x: panelPadding, y: panelPadding } },
            gee: { ...prev.gee, position: { x: panelPadding, y: panelPadding } },
            statistics: { ...prev.statistics, position: { x: panelPadding, y: panelPadding } },
            analysis: { ...prev.analysis, position: { x: panelPadding, y: panelPadding } },
            clima: { ...prev.clima, position: { x: panelPadding, y: panelPadding } },
            ai: { ...prev.ai, position: { x: aiPanelX, y: panelPadding } },
            help: { ...prev.help, position: { x: aiPanelX, y: panelPadding } },
        }));
    }
  }, [mapAreaRef, panelWidth, panelPadding]);


  const bringToFront = useCallback((panelId: PanelId) => {
    zIndexCounterRef.current += 1;
    setPanels(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], zIndex: zIndexCounterRef.current }
    }));
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const { panelId, offsetX, offsetY } = activeDragRef.current;
    if (!panelId) return;

    const mapArea = mapAreaRef.current;
    const panelRef = panelRefs[panelId].current;
    if (!mapArea || !panelRef) return;

    const mapRect = mapArea.getBoundingClientRect();
    let newX = event.clientX - mapRect.left - offsetX;
    let newY = event.clientY - mapRect.top - offsetY;

    setPanels(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], position: { x: newX, y: newY } }
    }));
  }, [mapAreaRef, panelRefs]);

  const handleMouseUp = useCallback(() => {
    activeDragRef.current = { panelId: null, offsetX: 0, offsetY: 0 };
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);
  
  const handlePanelMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>, panelId: PanelId) => {
    const panelRef = panelRefs[panelId].current;
    if (!panelRef) return;
    
    bringToFront(panelId);

    const rect = panelRef.getBoundingClientRect();
    activeDragRef.current = {
      panelId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    event.preventDefault();
  }, [panelRefs, bringToFront, handleMouseMove, handleMouseUp]);

  const togglePanelCollapse = useCallback((panelId: PanelId) => {
    setPanels(prev => ({
      ...prev,
      [panelId]: { ...prev[panelId], isCollapsed: !prev[panelId].isCollapsed }
    }));
  }, []);
  
  const togglePanelMinimize = useCallback((panelId: PanelId) => {
    setPanels(prev => {
        const currentPanelState = prev[panelId];
        const newIsMinimized = !currentPanelState.isMinimized;
        
        let newPosition = currentPanelState.position;
        let newZIndex = currentPanelState.zIndex;

        // If restoring a panel, calculate its new cascaded position
        if (newIsMinimized === false && panelId !== 'legend' && panelId !== 'ai' && panelId !== 'help') {
            const openCascadePanelsCount = panelCascadeOrder
                .filter(id => id !== panelId && !prev[id].isMinimized)
                .length;
            
            // The cascade starts from 1 * offset, so it doesn't overlap the legend panel
            const cascadeStep = openCascadePanelsCount + 1;

            newPosition = {
                x: panelPadding + (cascadeStep * CASCADE_OFFSET),
                y: panelPadding + (cascadeStep * CASCADE_OFFSET),
            };
        }
        
        // Bring to front when restoring
        if (!newIsMinimized) {
            zIndexCounterRef.current += 1;
            newZIndex = zIndexCounterRef.current;
        }

        return {
            ...prev,
            [panelId]: { 
                ...currentPanelState, 
                isMinimized: newIsMinimized,
                position: newPosition,
                zIndex: newZIndex 
            }
        };
    });
  }, [panelPadding]);

  useEffect(() => {
    const mm = (e: MouseEvent) => handleMouseMove(e);
    const mu = (e: MouseEvent) => handleMouseUp();
    
    // Add event listeners with proper types
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
    
    return () => {
      // Clean up event listeners
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
    };
  }, [handleMouseMove, handleMouseUp]);
  
  return {
    panels,
    handlePanelMouseDown,
    togglePanelCollapse,
    togglePanelMinimize,
  };
};
