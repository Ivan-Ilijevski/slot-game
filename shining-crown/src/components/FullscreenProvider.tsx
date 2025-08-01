'use client'

import { useEffect } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'

interface FullscreenProviderProps {
  children: React.ReactNode
}

export const FullscreenProvider = ({ children }: FullscreenProviderProps) => {
  const { toggleFullscreen, isSupported } = useFullscreen()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for 'F' key (both f and F)
      if (event.code === 'KeyF' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // Only prevent default if fullscreen is supported to avoid interfering with browser shortcuts
        if (isSupported) {
          event.preventDefault()
          toggleFullscreen()
        }
      }
    }

    // Add global keyboard listener
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleFullscreen, isSupported])

  return <>{children}</>
}