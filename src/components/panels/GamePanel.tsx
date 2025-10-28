
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import { Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

interface GamePanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

const GamePanel: React.FC<GamePanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  const auth = useAuth(); // Assuming useAuth() hook provides the auth instance
  const user = auth?.currentUser;

  const handleSignIn = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google: ", error);
    }
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  return (
    <DraggablePanel
      title="Operación: Despliegue"
      icon={Swords}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 380, height: "auto" }}
    >
      <div className="p-3 space-y-4">
        {user ? (
          <div>
            <p className="text-sm">Bienvenido, Agente {user.displayName || 'Desconocido'}.</p>
            <Button onClick={handleSignOut} className="mt-2">Cerrar Sesión</Button>
            {/* Game content will go here */}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm mb-3">Para participar, debes iniciar sesión como Agente.</p>
            <Button onClick={handleSignIn}>Iniciar Sesión con Google</Button>
          </div>
        )}
      </div>
    </DraggablePanel>
  );
};

export default GamePanel;
