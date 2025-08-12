
"use client";

import React from 'react';
import AttributesPanelComponent from '../feature-attributes-panel';
import type { PlainFeatureData } from '@/lib/types';


interface AttributesPanelProps {
  plainFeatureData: PlainFeatureData[] | null;
  layerName?: string | null;
  
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void; 
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;

  // Selection props
  selectedFeatureIds: string[];
  onFeatureSelect: (featureId: string, isCtrlOrMeta: boolean) => void;
}

const AttributesPanel: React.FC<AttributesPanelProps> = (props) => {
  return <AttributesPanelComponent {...props} />;
};

export default AttributesPanel;
