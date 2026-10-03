import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Owner Workspace | StayBook',
  description: 'StayBook owner property and tenant management workspace.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
