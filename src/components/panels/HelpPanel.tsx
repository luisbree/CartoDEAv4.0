
"use client";

import React from 'react';
import DraggablePanel from './DraggablePanel';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LifeBuoy, Map, Layers, Wrench, Sparkles, ClipboardCheck, Library, MousePointerClick, Square, CloudDownload, Plus, Trash2, Server, BrainCircuit, Printer, Ruler } from 'lucide-react';

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
              <p>Manejá la vista del mapa y los datos de fondo desde la <strong>barra de herramientas de arriba</strong>:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Buscador de lugares:</strong> Escribí el nombre de una ciudad o un punto de interés para centrar el mapa ahí.</li>
                <li><strong>Selector de mapa de fondo:</strong> Cambiá el mapa base entre vistas como OpenStreetMap, Satelital (color posta, falso color) y otras.</li>
                <li><strong>Ajustes del mapa de fondo:</strong> Regulá la opacidad, el brillo y el contraste del mapa que tenés de base.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="layers">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Layers} title="Manejo de Capas" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>El <strong>Panel de Capas</strong> es tu centro de comando para todos los datos:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><Plus className="inline-block h-4 w-4 mr-1" /><strong>Importar Capa:</strong> Cargá archivos desde tu compu (KML, GeoJSON, Shapefiles en .zip, GeoTIFF).</li>
                <li><Trash2 className="inline-block h-4 w-4 mr-1" /><strong>Borrar Selección:</strong> Eliminá una o varias capas que hayas seleccionado de la lista.</li>
                <li><MousePointerClick className="inline-block h-4 w-4 mr-1" /><strong>Inspección/Selección:</strong> Activá el modo interactivo para hacer clic en las cosas del mapa, chusmear sus datos o elegirlas para otras acciones.</li>
                <li><strong>Arrastrar y soltar:</strong> Reordená las capas a tu gusto, simplemente arrastrándolas en la lista.</li>
                <li><strong>Menú de Capa (la ruedita):</strong> Accedé a opciones más pro como hacer zoom, ver la tabla de datos, cambiar el estilo, la opacidad o extraer info.</li>
                <li><strong>Extracción de Datos:</strong> Creá capas nuevas a partir de los datos que caen adentro de un polígono que dibujaste o desde una selección que hiciste a mano.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tools">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Wrench} title="Herramientas de Dibujo y Análisis" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>El <strong>Panel de Herramientas</strong> te da un par de funciones para crear y analizar:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><Square className="inline-block h-4 w-4 mr-1" /><strong>Dibujo Vectorial:</strong> Dibujá polígonos, rectángulos, líneas o puntos en el mapa. Podés guardar lo que hiciste como un archivo KML.</li>
                 <li><Ruler className="inline-block h-4 w-4 mr-1" /><strong>Medición:</strong> Medí distancias (con líneas) o áreas (con polígonos) al toque sobre el mapa. Los resultados se actualizan en vivo mientras dibujás.</li>
                <li><CloudDownload className="inline-block h-4 w-4 mr-1" /><strong>Datos de OpenStreetMap (OSM):</strong> Dibujá un polígono y después usá esta herramienta para bajarte datos de OSM (como ríos, calles, etc.) de esa zona específica. También podés hacer consultas puntuales.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="integrations">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Server} title="Datos Externos e Integraciones" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Conectá la aplicación con servicios y servidores de afuera:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><Server className="inline-block h-4 w-4 mr-1" /><strong>Capas Predefinidas (DEAS):</strong> Chusmeá el catálogo de capas del servidor de DEAS y sumalas como datos vectoriales (WFS) con su estilo original.</li>
                <li><Library className="inline-block h-4 w-4 mr-1" /><strong>Biblioteca de Servidores:</strong> Conectate a otros servidores WMS/WFS para traer capas desde cualquier fuente externa.</li>
                 <li><BrainCircuit className="inline-block h-4 w-4 mr-1" /><strong>Procesamiento GEE:</strong> Generá capas al vuelo usando Google Earth Engine. Elegí un índice (como BSI o NDVI) o una combinación de bandas, definí un rango de fechas y obtené una capa nueva para la vista actual.</li>
                <li><ClipboardCheck className="inline-block h-4 w-4 mr-1" /><strong>Trello:</strong> Buscá tarjetas que ya existan en tus tableros de Trello.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Sparkles} title="Asistente Drax (IA)" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
              <p>Chateá con <strong>Drax</strong> para manejar el mapa hablando normal. Es ideal para acelerar algunas tareas. Probá con pedidos como:</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li>"Cargame la capa de cuencas como WFS"</li>
                <li>"Pintá el borde de las rutas de color rojo y más grueso"</li>
                <li>"Sacá todas las capas de hidrografía"</li>
                <li>"Buscá la tarjeta de Trello sobre el análisis de suelo"</li>
                <li>"Llevame a la Torre Eiffel y buscá los hospitales de OSM"</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
           <AccordionItem value="print">
            <AccordionTrigger>
              <HelpSectionTrigger icon={Printer} title="Impresión y Exportación" />
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pl-4">
               <p>El <strong>Panel de Impresión</strong> te deja armar un diseño de mapa profesional para exportar.</p>
              <ul className="list-disc list-inside space-y-2 pl-2 text-xs text-gray-300">
                <li><strong>Composición Dinámica:</strong> El mapa en el compositor se actualiza solo a medida que te movés en el mapa principal.</li>
                <li><strong>Personalización:</strong> Editá el título y el subtítulo del mapa.</li>
                <li><strong>Exportación:</strong> Imprimí tu diseño directamente, guardalo como PDF desde el diálogo de impresión, o bajalo como una imagen JPEG de alta calidad (96, 150 o 300 DPI).</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          
        </Accordion>
      </div>
    </DraggablePanel>
  );
};

export default HelpPanel;
