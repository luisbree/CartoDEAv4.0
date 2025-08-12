'use client';

import { AppSidebar } from '@/components/app-sidebar';
import { MapComponent } from '@/components/map-component';
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { MapProvider } from '@/hooks/use-map';

export default function Home() {
  return (
    <MapProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <AppSidebar />
        </Sidebar>
        <SidebarInset>
          <MapComponent />
        </SidebarInset>
      </SidebarProvider>
    </MapProvider>
  );
}
