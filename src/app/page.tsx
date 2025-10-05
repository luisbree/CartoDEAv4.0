
import GeoMapperClient from './geo-mapper-client';
import FirebaseClientProvider from '@/firebase/client-provider';

export default function HomePage() {
  return (
    <FirebaseClientProvider>
      <GeoMapperClient />
    </FirebaseClientProvider>
  );
}
