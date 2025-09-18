
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Notebook, Save, Loader2, X } from 'lucide-react';
import { getNotes, saveNotes } from '@/services/notes-service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const Notepad = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    // Load notes when the component first opens
    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            getNotes()
                .then((notes) => {
                    setContent(notes);
                })
                .catch((error) => {
                    console.error("Failed to load notes:", error);
                    toast({
                        title: "Error",
                        description: "No se pudieron cargar las notas.",
                        variant: "destructive",
                    });
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [isOpen, toast]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await saveNotes(content);
            toast({
                description: "Notas guardadas correctamente.",
            });
        } catch (error) {
            console.error("Failed to save notes:", error);
            toast({
                title: "Error",
                description: "No se pudieron guardar las notas.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div className="fixed bottom-2 right-2 z-30">
                <Button
                    onClick={() => setIsOpen(true)}
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full shadow-lg bg-background/80 backdrop-blur-sm hover:bg-accent"
                    title="Abrir hoja de anotaciones"
                >
                    <Notebook className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <Card className="fixed bottom-4 right-4 z-30 w-80 h-[400px] flex flex-col shadow-2xl bg-background/80 backdrop-blur-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between p-2 cursor-grab border-b">
                <div className="flex items-center gap-2">
                    <Notebook className="h-4 w-4" />
                    <CardTitle className="text-sm font-semibold">Anotaciones</CardTitle>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsOpen(false)}
                >
                    <X className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="p-2 flex-grow">
                {isLoading && !content ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Escribe tus notas para futuras mejoras aquí..."
                        className="w-full h-full resize-none bg-transparent border-0 focus-visible:ring-0"
                    />
                )}
            </CardContent>
            <CardFooter className="p-2 border-t">
                <Button onClick={handleSave} disabled={isLoading} className="w-full h-8 text-xs">
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar Notas
                </Button>
            </CardFooter>
        </Card>
    );
};

export default Notepad;
