"use client";

import React, { useEffect, useState } from 'react';
import DraggablePanel from './DraggablePanel';
import { Swords, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth, useFirebase } from '@/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDoc, doc, setDoc } from 'firebase/firestore';
import { onboardNewAgent } from '@/ai/flows/game-flow';
import { useToast } from '@/hooks/use-toast';

interface GamePanelProps {
  panelRef: React.ReactNode;
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
  const auth = useAuth();
  const { firestore } = useFirebase();
  const user = auth?.currentUser;
  const { toast } = useToast();
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);

  useEffect(() => {
    const handleUserOnboarding = async () => {
      if (user && firestore) {
        setIsProcessingLogin(true);
        const agentRef = doc(firestore, 'agents', user.uid);
        const agentDoc = await getDoc(agentRef);

        if (!agentDoc.exists()) {
          toast({ description: 'Creando perfil de Agente...' });
          try {
            const { center, nickname } = await onboardNewAgent({
              preferredNickname: user.displayName || 'Agente',
            });

            await setDoc(agentRef, {
              nickname: nickname,
              current_cd: 1000,
              deployment_center: center,
              is_deploying: false,
              upgrades: {},
            });
            toast({
              title: '¡Bienvenido, Agente!',
              description: `Tu base de operaciones ha sido asignada.`,
            });
          } catch (error) {
            console.error('Error al crear el perfil del agente:', error);
            toast({
              title: 'Error de Onboarding',
              description: 'No se pudo crear tu perfil de agente.',
              variant: 'destructive',
            });
          }
        }
        setIsProcessingLogin(false);
      }
    };

    handleUserOnboarding();
  }, [user, firestore, toast]);

  const handleSignIn = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google: ', error);
      toast({
        title: 'Error de Autenticación',
        description:
          'No se pudo iniciar sesión. Verifica la consola para más detalles.',
        variant: 'destructive',
      });
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
      panelRef={panelRef as React.RefObject<HTMLDivElement>}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 380, height: 'auto' }}
    >
      <div className="p-3 space-y-4">
        {isProcessingLogin ? (
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm mt-2 text-muted-foreground">
              Verificando credenciales de Agente...
            </p>
          </div>
        ) : user ? (
          <div>
            <p className="text-sm">
              Bienvenido, Agente{' '}
              <span className="font-bold text-primary">
                {user.displayName || 'Desconocido'}
              </span>
              .
            </p>
            <Button onClick={handleSignOut} className="mt-2" variant="outline" size="sm">
              Cerrar Sesión
            </Button>
            {/* Game content will go here */}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm mb-3">
              Para participar, debes iniciar sesión como Agente.
            </p>
            <Button onClick={handleSignIn}>Iniciar Sesión con Google</Button>
          </div>
        )}
      </div>
    </DraggablePanel>
  );
};

export default GamePanel;
