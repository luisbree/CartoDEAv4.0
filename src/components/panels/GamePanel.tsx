"use client";

import React, { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Swords, User, Loader2, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';
import DraggablePanel from './DraggablePanel';
import { Button } from '@/components/ui/button';
import { useAuth, useFirestore, useUser } from '@/firebase';
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

const GamePanel: React.FC<GamePanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  const auth = useAuth();
  const firestore = useFirestore();
  const user = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [agentProfile, setAgentProfile] = useState<any>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  
  useEffect(() => {
    if (user) {
      const agentDocRef = doc(firestore, 'agents', user.uid);
      getDoc(agentDocRef).then(docSnap => {
        if (docSnap.exists()) {
          setAgentProfile(docSnap.data());
        } else {
          // User is authenticated but has no agent profile yet
          setAgentProfile(null);
        }
      });
    } else {
      setAgentProfile(null);
    }
  }, [user, firestore]);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast({ description: "¡Bienvenido, Agente! Sesión iniciada." });
    } catch (error: any) {
      console.error("Error signing in:", error);
      toast({
        title: "Error de Autenticación",
        description: error.message || "No se pudo iniciar sesión.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!user || !user.displayName) {
        toast({ description: "No se puede crear el agente sin un perfil de usuario.", variant: "destructive" });
        return;
    }
    setIsCreatingAgent(true);
    try {
        const agentData = await onboardNewAgent({ preferredNickname: user.displayName });
        
        const newAgentProfile = {
            nickname: agentData.nickname,
            current_cd: 100, // Starting capacity
            deployment_center: agentData.center, // GeoPoint
            is_deploying: false,
            upgrades: {},
        };

        const agentDocRef = doc(firestore, 'agents', user.uid);
        await setDoc(agentDocRef, newAgentProfile);

        setAgentProfile(newAgentProfile);
        toast({ description: `¡Agente ${agentData.nickname} creado con éxito! Base asignada.` });
    } catch (error: any) {
        console.error("Error creating agent:", error);
        toast({
            title: "Error de Creación",
            description: error.message || "No se pudo crear el perfil del agente.",
            variant: "destructive",
        });
    } finally {
        setIsCreatingAgent(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setAgentProfile(null);
    toast({ description: "Sesión cerrada. ¡Hasta la próxima, Agente!" });
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 text-center p-4">
          <h3 className="font-semibold">¡Bienvenido a la Operación: Despliegue!</h3>
          <p className="text-xs text-gray-300">Para participar, debes identificarte como agente de la Dirección Provincial de Hidráulica.</p>
          <Button onClick={handleSignIn} className="w-full">
            <User className="mr-2 h-4 w-4" /> Iniciar Sesión con Google
          </Button>
        </div>
      );
    }
    
    if (user && !agentProfile) {
      return (
          <div className="flex flex-col items-center justify-center gap-4 text-center p-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-5 w-5" />
                <p className="text-sm font-semibold">Autenticación Correcta</p>
              </div>
              <p className="text-xs text-gray-300">Bienvenido, {user.displayName}. Tu siguiente paso es enrolarte oficialmente como agente.</p>
              <Button onClick={handleCreateAgent} disabled={isCreatingAgent} className="w-full">
                  {isCreatingAgent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2 h-4 w-4" />}
                  Crear Perfil de Agente
              </Button>
          </div>
      );
    }
    
    if (user && agentProfile) {
        return (
             <div className="flex flex-col gap-4 text-sm p-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src={user.photoURL || ''} alt="Avatar" className="h-10 w-10 rounded-full border-2 border-primary" />
                        <div>
                            <p className="font-bold text-base">{agentProfile.nickname}</p>
                            <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                    </div>
                    <Button onClick={handleSignOut} size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 hover:text-red-300">
                        <LogOut className="mr-2 h-4 w-4" /> Salir
                    </Button>
                </div>
                <div className="bg-black/20 p-3 rounded-md space-y-2">
                    <p><strong>Base de Operaciones:</strong> {agentProfile.deployment_center ? `${agentProfile.deployment_center.lat.toFixed(4)}, ${agentProfile.deployment_center.lon.toFixed(4)}` : 'N/A'}</p>
                    <p><strong>Capacidad de Despliegue (CD):</strong> {agentProfile.current_cd}</p>
                    <p><strong>Estado:</strong> {agentProfile.is_deploying ? <span className="text-yellow-400">En Despliegue</span> : <span className="text-green-400">En Base</span>}</p>
                </div>
             </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center gap-4 text-center p-4 text-red-400">
            <AlertTriangle className="h-8 w-8" />
            <p>Ha ocurrido un estado inesperado. Por favor, intente recargar la página.</p>
        </div>
    );
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
      initialSize={{ width: 350, height: "auto" }}
    >
      {renderContent()}
    </DraggablePanel>
  );
};

export default GamePanel;
