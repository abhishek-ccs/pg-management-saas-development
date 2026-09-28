/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict TypeScript verification during build
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enable modern image optimization with remote Supabase storage support
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default nextConfig

