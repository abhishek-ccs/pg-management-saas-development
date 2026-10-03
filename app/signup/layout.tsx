import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Start 7-Day Free Trial | StayBook',
  description: 'Create your StayBook property management account with a 7-day full access free trial.',
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

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
