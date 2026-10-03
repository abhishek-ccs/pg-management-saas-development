import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In | StayBook',
  description: 'Sign in to your StayBook property management workspace.',
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

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
