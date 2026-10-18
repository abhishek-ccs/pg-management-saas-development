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
  // Redirect old Vercel project subdomain to official canonical domain
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'pg-management-saas-development-rose.vercel.app',
          },
        ],
        destination: 'https://baserabook.in/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig

