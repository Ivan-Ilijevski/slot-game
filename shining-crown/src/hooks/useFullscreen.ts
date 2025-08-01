'use client'

import { useCallback, useEffect, useState } from 'react'

interface FullscreenAPI {
  requestFullscreen?: () => Promise<void>
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

interface DocumentFullscreen {
  fullscreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
  webkitExitFullscreen?: () => Promise<void>
  mozCancelFullScreen?: () => Promise<void>
  msExitFullscreen?: () => Promise<void>
}

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  // Check if fullscreen is supported
  useEffect(() => {
    const element = document.documentElement as Element & FullscreenAPI
    const supported = !!(
      element.requestFullscreen ||
      element.webkitRequestFullscreen ||
      element.mozRequestFullScreen ||
      element.msRequestFullscreen
    )
    setIsSupported(supported)
  }, [])

  // Update fullscreen state when it changes
  useEffect(() => {
    const updateFullscreenState = () => {
      const doc = document as Document & DocumentFullscreen
      const fullscreenElement = 
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement

      setIsFullscreen(!!fullscreenElement)
    }

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', updateFullscreenState)
    document.addEventListener('webkitfullscreenchange', updateFullscreenState)
    document.addEventListener('mozfullscreenchange', updateFullscreenState)
    document.addEventListener('MSFullscreenChange', updateFullscreenState)

    // Initial check
    updateFullscreenState()

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
      document.removeEventListener('webkitfullscreenchange', updateFullscreenState)
      document.removeEventListener('mozfullscreenchange', updateFullscreenState)
      document.removeEventListener('MSFullscreenChange', updateFullscreenState)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    if (!isSupported) return false

    try {
      const element = document.documentElement as Element & FullscreenAPI
      
      if (element.requestFullscreen) {
        await element.requestFullscreen()
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen()
      } else if (element.mozRequestFullScreen) {
        await element.mozRequestFullScreen()
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen()
      }
      
      return true
    } catch (error) {
      console.error('Failed to enter fullscreen:', error)
      return false
    }
  }, [isSupported])

  const exitFullscreen = useCallback(async () => {
    if (!isSupported) return false

    try {
      const doc = document as Document & DocumentFullscreen
      
      if (doc.exitFullscreen) {
        await doc.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen()
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen()
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen()
      }
      
      return true
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
      return false
    }
  }, [isSupported])

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      return await exitFullscreen()
    } else {
      return await enterFullscreen()
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen])

  return {
    isFullscreen,
    isSupported,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen
  }
}