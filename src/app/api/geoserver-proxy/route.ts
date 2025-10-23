
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const geoServerUrl = searchParams.get('url');

  if (!geoServerUrl) {
    return NextResponse.json({ error: 'GeoServer URL is required' }, { status: 400 });
  }

  console.log(`[SERVER PROXY] Recibida solicitud para: ${geoServerUrl}`);

  try {
    const response = await fetch(geoServerUrl, {
      method: 'GET',
      cache: 'no-store', // Fundamental para datos en tiempo real como el radar
    });

    const contentType = response.headers.get('content-type') || 'No content-type header';
    console.log(`[SERVER PROXY] Respuesta del servidor remoto: Status=${response.status}, Content-Type='${contentType}'`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SERVER PROXY] Error del servidor remoto (${response.status}):`, errorText);
       // If the error response is XML or HTML, pass it through with the correct content type.
       // This is common for GeoServer's service exceptions.
       if (contentType.includes('xml') || contentType.includes('html')) {
         return new NextResponse(errorText, {
          status: response.status,
          headers: { 'Content-Type': contentType },
        });
      }
      // For other errors (like plain text or json), return a structured JSON error
      return NextResponse.json({ error: `Error del servidor GeoServer: ${response.statusText}`, details: errorText }, { status: response.status });
    }
    
    // For successful image or data responses (like WMS GetMap), stream the data back as a buffer.
    const data = await response.arrayBuffer();
    console.log(`[SERVER PROXY] Éxito. Enviando ${data.byteLength} bytes de datos con Content-Type: ${contentType}`);

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Expires', '0');

    return new NextResponse(data, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[SERVER PROXY] Falló la petición del proxy:', error);
    
    let details = `El servidor de la aplicación no pudo conectar con la URL del GeoServer. Esto puede deberse a un problema de red (firewall, IP incorrecta) o a que el GeoServer esté fuera de línea. URL: ${geoServerUrl}`;
    
    if (error.cause && typeof error.cause === 'object' && 'code' in error.cause) {
      const cause = error.cause as { code: string };
      const hostname = new URL(geoServerUrl).hostname;

      if (cause.code === 'ENOTFOUND' || cause.code === 'EAI_AGAIN') {
        details = `El hostname para el GeoServer ('${hostname}') no pudo ser resuelto. Verifique la URL y la configuración DNS de su red.`;
      } else if (cause.code === 'ECONNREFUSED') {
        details = `La conexión al GeoServer fue rechazada por el servidor en ${geoServerUrl}. Asegúrese de que el servidor esté funcionando y el puerto sea correcto.`;
      }
    }
    
    return NextResponse.json({ error: 'Falló la petición del proxy', details }, { status: 502 });
  }
}
