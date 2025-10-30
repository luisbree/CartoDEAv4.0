"use client";

import React, { useState, useEffect } from 'react';
import { Swords, User, Loader2 } from 'lucide-react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useToast } from '@/hooks/use-toast';
import { onboardNewAgent } from '@/ai/flows/game-flow';

interface GamePanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

interface AgentProfile {
    nickname: string;
    center: { lat: number; lon: number };
}


const GamePanel: React.FC<GamePanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  const user = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);

  const handleCreateAgent = async () => {
      if (!user || !firestore) {
          toast({ description: "Debes iniciar sesión para crear un perfil.", variant: "destructive" });
          return;
      }
      setIsLoading(true);
      try {
          const newAgentData = await onboardNewAgent({ preferredNickname: user.displayName || 'Agente' });
          const agentDocRef = doc(firestore, 'agents', user.uid);
          
          await setDoc(agentDocRef, newAgentData);
          
          setAgentProfile(newAgentData);
          toast({ description: `Perfil de agente "${newAgentData.nickname}" creado con éxito.` });
          
      } catch (error: any) {
          console.error("Error creating agent profile:", error);
          toast({
              title: "Error al Crear Perfil",
              description: error.message || "No se pudo crear el perfil del agente.",
              variant: "destructive",
          });
      } finally {
          setIsLoading(false);
      }
  };

  const handleFetchProfile = async () => {
      if (!user || !firestore) {
          toast({ description: "Debes iniciar sesión para cargar un perfil.", variant: "destructive" });
          return;
      }
      setIsLoading(true);
      try {
          const agentDocRef = doc(firestore, 'agents', user.uid);
          const docSnap = await getDoc(agentDocRef);

          if (docSnap.exists()) {
              const profile = docSnap.data() as AgentProfile;
              setAgentProfile(profile);
              toast({ description: "Perfil de agente cargado." });
          } else {
              setAgentProfile(null);
          }
      } catch (error: any) {
          console.error("Error fetching agent profile:", error);
          toast({
              title: "Error al Cargar Perfil",
              description: error.message || "No se pudo cargar el perfil del agente.",
              variant: "destructive",
          });
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    if (user && firestore && !isCollapsed) {
        handleFetchProfile();
    } else {
        setAgentProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, firestore, isCollapsed]);


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
      initialSize={{ width: 350, height: "auto" }}
    >
        <div className="p-4 space-y-4">
            {!user ? (
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <h3 className="font-semibold">¡Bienvenido a la Operación: Despliegue!</h3>
                    <p className="text-xs text-gray-300">Para participar, debes identificarte como agente iniciando sesión con el botón superior.</p>
                </div>
            ) : agentProfile ? (
                 <div>
                    <h3 className="font-semibold">Bienvenido, Agente {agentProfile.nickname}</h3>
                    <p className="text-xs text-gray-300">Base de operaciones: Lat {agentProfile.center.lat.toFixed(4)}, Lon {agentProfile.center.lon.toFixed(4)}</p>
                </div>
            ) : (
                <div className="space-y-3">
                     <p className="text-xs text-gray-300 text-center">¡Autenticación exitosa! Ahora crea tu perfil de agente para comenzar.</p>
                    <Button onClick={handleCreateAgent} className="w-full" disabled={isLoading}>
                         {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2 h-4 w-4" />}
                        Crear Perfil de Agente
                    </Button>
                </div>
            )}
        </div>
    </DraggablePanel>
  );
};

export default GamePanel;
