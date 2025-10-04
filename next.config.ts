
import type {NextConfig} from 'next';


const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // This is required for Genkit to work correctly in Next.js.
  serverExternalPackages: ['@grpc/grpc-js'],
  experimental: {
    // This is required to allow requests from the Firebase Studio development environment.
    allowedDevOrigins: ['https://*.cloudworkstations.dev'],
  },
};

export default nextConfig;
