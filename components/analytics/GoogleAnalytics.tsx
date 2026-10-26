'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    dataLayer: any[]
  }
}

export function GoogleAnalytics() {
  useEffect(() => {
    // Avoid loading analytics during local testing/audits to prevent polluting production data
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      return
    }

    let initialized = false

    function initAnalytics() {
      if (initialized) return
      initialized = true

      window.removeEventListener('scroll', initAnalytics)
      window.removeEventListener('touchstart', initAnalytics)
      window.removeEventListener('mousemove', initAnalytics)
      window.removeEventListener('click', initAnalytics)

      window.dataLayer = window.dataLayer || []
      function gtag(...args: any[]) {
        window.dataLayer.push(args)
      }
      gtag('js', new Date())
      gtag('config', 'G-9CQRHQFVSE')

      const script = document.createElement('script')
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-9CQRHQFVSE'
      script.async = true
      document.head.appendChild(script)
    }

    window.addEventListener('scroll', initAnalytics, { passive: true, once: true })
    window.addEventListener('touchstart', initAnalytics, { passive: true, once: true })
    window.addEventListener('mousemove', initAnalytics, { passive: true, once: true })
    window.addEventListener('click', initAnalytics, { passive: true, once: true })

    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(initAnalytics, { timeout: 4000 })
    } else {
      timeoutId = setTimeout(initAnalytics, 4000)
    }

    return () => {
      window.removeEventListener('scroll', initAnalytics)
      window.removeEventListener('touchstart', initAnalytics)
      window.removeEventListener('mousemove', initAnalytics)
      window.removeEventListener('click', initAnalytics)
      if (idleId && 'cancelIdleCallback' in window) {
        ;(window as any).cancelIdleCallback(idleId)
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  return null
}
