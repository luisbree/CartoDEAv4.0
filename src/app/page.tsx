
import Link from 'next/link';
import GeoMapperClient from './geo-mapper-client';

export default function HomePage() {
  return (
    <>
      <GeoMapperClient />
      <div className="absolute bottom-4 left-4 z-50">
        <Link href="/share/example" className="text-xs bg-gray-800 text-white px-2 py-1 rounded hover:bg-primary">
            Ver ejemplo de mapa compartido
        </Link>
      </div>
    </>
  );
}
