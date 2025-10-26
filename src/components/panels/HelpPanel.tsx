
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LifeBuoy, Map, Layers, Wrench, Sparkles, Server, BrainCircuit, Printer, Ruler, MousePointerClick, CloudRain, DraftingCompass, LineChart, Group, Palette } from 'lucide-react';

interface HelpPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClosePanel: () => void;
  onMouseDownHeader: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

const HelpSectionTrigger: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
    <div className="flex items-center w-full">
        <Icon className="h-5 w-5 mr-3 text-primary/90" />
        <span className="text-sm font-semibold">{title}</span>
    </div>
);

const HelpPanel: React.FC<HelpPanelProps> = ({
  panelRef,
  isCollapsed,
  onToggleCollapse,
  onClosePanel,
  onMouseDownHeader,
  style,
}) => {
  return (
    <DraggablePanel
      title="Guía Rápida"
      icon={LifeBuoy}
      panelRef={panelRef}
      initialPosition={{ x: 0, y: 0 }}
      onMouseDownHeader={onMouseDownHeader}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onClose={onClosePanel}
      showCloseButton={true}
      style={style}
      zIndex={style?.zIndex as number | undefined}
      initialSize={{ width: 400, height: 600 }}
      minSize={{ width: 350, height: 300 }}
    >
      <div className="text-sm leading-relaxed text-gray-200">
        <Accordion type="multiple" defaultValue={['navigation']} className="w-full">
          
          <AccordionItem value="navigation">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Map} title="Navegación y Vista" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Manejá la vista del mapa y los datos de fondo desde la <strong>barra de herramientas superior</strong>:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Buscador de lugares:</strong> Escribí el nombre de una ciudad o punto de interés para centrar el mapa ahí.</li>
                <li><strong>Selector de mapa de fondo:</strong> Cambiá el mapa base entre vistas como OpenStreetMap, Satelital (ESRI) y otras.</li>
                <li><strong>Menú de Herramientas del Mapa (<span className="inline-flex items-center"><Map className="h-3 w-3 mx-1"/></span>):</strong> Ajustá la opacidad/brillo del mapa base, abrí la ubicación en Google Street View, descargá una imagen del mapa o compartí tu sesión.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="layers">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Layers} title="Panel de Capas" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Es tu centro de comando para todos los datos. Desde aquí podés:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Importar Capas:</strong> Cargá archivos desde tu computadora (KML, GeoJSON, Shapefiles en .zip, GeoTIFF).</li>
                <li><strong>Agrupar (<Group className="inline-block h-3 w-3"/>):</strong> Seleccioná varias capas (con Ctrl/Cmd o Shift) y agrupalas para mantener el orden.</li>
                <li><strong>Inspeccionar/Seleccionar (<MousePointerClick className="inline-block h-3 w-3"/>):</strong> Activá estas herramientas para hacer clic en el mapa, ver atributos de una entidad o seleccionar múltiples para otras acciones.</li>
                <li><strong>Arrastrar y Soltar:</strong> Reordená las capas y grupos arrastrándolos en la lista.</li>
                <li><strong>Menú de Acciones (la ruedita <span className="inline-flex items-center"><Palette className="h-3 w-3 mx-1"/></span>):</strong> Accedé a un mundo de opciones por capa: zoom, tabla de atributos, estadísticas, exportación, renombrar, y lo más importante, la **simbología** (simple, por categorías o graduada) y el **etiquetado**.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
           <AccordionItem value="analysis">
            <AccordionTrigger>
              <HelpSectionTrigger icon={DraftingCompass} title="Panel de Análisis Espacial" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Aquí se encuentran las herramientas de geoprocesamiento más potentes:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Perfil Topográfico:</strong> Dibujá o seleccioná una línea para generar un perfil de elevación, ocurrencia de agua y más, usando datos de GEE.</li>
                <li><strong>Herramientas de Superposición:</strong> Realizá operaciones clásicas como **Recorte (Clip)** y **Diferencia (Erase)** entre capas.</li>
                <li><strong>Herramientas de Proximidad:</strong> Creá **Áreas de Influencia (Buffers)** y generá **Perfiles Transversales** a lo largo de una línea.</li>
                <li><strong>Herramientas de Geometría:</strong> Generá una **Envolvente Convexa o Cóncava** para un grupo de entidades o suavizá las líneas y polígonos con **Suavizado Bezier**.</li>
                <li><strong>Herramientas de Agregación:</strong> **Uní** varias capas en una sola o **Disolvé** las geometrías internas de una capa para crear una sola entidad.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="clima-gee">
            <AccordionTrigger>
              <HelpSectionTrigger icon={BrainCircuit} title="Paneles de Clima y GEE" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Conectate con el poder de Google Earth Engine y datos climáticos:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                  <li><strong>Panel de Clima (<CloudRain className="inline-block h-3 w-3"/>):</strong> Cargá la última imagen de topes nubosos del satélite **GOES-19** o detectá y vectorizá **núcleos de tormenta** basados en un umbral de temperatura.</li>
                  <li><strong>Panel de GEE (<BrainCircuit className="inline-block h-3 w-3"/>):</strong> Generá capas al vuelo usando Google Earth Engine. Elegí índices (NDVI, BSI), combinaciones de bandas, modelos de elevación, o la capa de cobertura del suelo **Dynamic World**. También podés exportar estas capas como GeoTIFF o vectorizar la cobertura del suelo.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="tools">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Wrench} title="Panel de Herramientas" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Aquí encontrarás utilidades de dibujo, medición y consulta de datos abiertos:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Dibujo y Medición (<Ruler className="inline-block h-3 w-3"/>):</strong> Dibujá geometrías simples o medí distancias y áreas directamente sobre el mapa.</li>
                <li><strong>OpenStreetMap (OSM):</strong> Usá un polígono dibujado o la vista actual para descargar datos de OSM por categorías (ríos, calles, etc.). También podés hacer consultas personalizadas por clave/valor.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="integrations">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Server} title="Datos Externos e Integraciones" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Capas Predefinidas (DEAS):</strong> El catálogo en el Panel de Capas te permite añadir datos vectoriales del servidor de DEAS directamente al mapa.</li>
                <li><strong>Biblioteca de Servidores:</strong> Conectate a cualquier servidor WMS/WFS externo para traer capas a tu proyecto.</li>
                <li><strong>Trello:</strong> Buscá tarjetas existentes en tus tableros y abrilos para gestionar tus proyectos.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai-print">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Sparkles} title="Asistente, Impresión y Otros" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Asistente Drax:</strong> Chateá con la IA para realizar acciones rápidamente, desde cargar capas y cambiar estilos hasta buscar lugares y ejecutar análisis.</li>
                <li><strong>Compositor de Impresión (<Printer className="inline-block h-3 w-3"/>):</strong> Prepará un layout de mapa con título, subtítulo y leyenda para exportar como PDF o JPEG en alta calidad.</li>
                <li><strong>Bloc de Notas (<span className="inline-flex items-center"><Layers className="h-3 w-3 mx-1"/></span>):</strong> Usa el anotador en la esquina inferior derecha para guardar ideas o recordatorios persistentes para tu proyecto.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
        </Accordion>
      </div>
    </DraggablePanel>
  );
};

export default HelpPanel;
