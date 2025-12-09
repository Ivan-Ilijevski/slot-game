'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Assets, Sprite, Container } from 'pixi.js'
import type { GameConfig } from './GameConfig'

export interface PIXICanvasConfig {
  designWidth: number
  designHeight: number
  backgroundColor: number
  resolution?: number
  autoDensity?: boolean
  antialias?: boolean
  powerPreference?: 'default' | 'high-performance' | 'low-power'
}

export interface BackgroundConfig {
  main?: string // Main background texture path
  reel?: string // Reel background texture path
  overlay?: string // UI overlay texture path
  border?: string // Border overlay texture path
  borderScale?: number
  borderOffset?: { x: number; y: number }
}

export interface PIXIGameCanvasProps {
  gameConfig: GameConfig
  canvasConfig?: Partial<PIXICanvasConfig>
  backgroundConfig?: BackgroundConfig
  assetList?: Array<string | { alias: string; src: string }>
  onAppReady?: (app: Application) => void
  onAssetsLoaded?: (app: Application) => void
  onResize?: (scale: number, dimensions: { width: number; height: number }) => void
  onError?: (error: Error) => void
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export interface UsePIXICanvasProps extends PIXIGameCanvasProps {
  containerRef: React.RefObject<HTMLDivElement>
}

// Default PIXI canvas configuration
const DEFAULT_CANVAS_CONFIG: PIXICanvasConfig = {
  designWidth: 1920,
  designHeight: 1080,
  backgroundColor: 0x1a1a2e,
  resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  autoDensity: true,
  antialias: true,
  powerPreference: 'high-performance'
}

export function usePIXICanvas({
  gameConfig,
  canvasConfig = {},
  backgroundConfig = {},
  assetList = [],
  onAppReady,
  onAssetsLoaded,
  onResize,
  onError,
  containerRef
}: UsePIXICanvasProps) {
  const config = { ...DEFAULT_CANVAS_CONFIG, ...canvasConfig }
  
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  
  const appRef = useRef<Application | null>(null)
  const destroyedRef = useRef(false)
  const resizeHandlerRef = useRef<(() => void) | null>(null)

  // Calculate responsive scaling
  const calculateScale = useCallback((
    viewportWidth: number, 
    viewportHeight: number
  ) => {
    const scaleX = viewportWidth / config.designWidth
    const scaleY = viewportHeight / config.designHeight
    const scale = Math.min(scaleX, scaleY)
    
    const canvasWidth = config.designWidth * scale
    const canvasHeight = config.designHeight * scale
    
    return { scale, canvasWidth, canvasHeight }
  }, [config])

  // Setup backgrounds
  const setupBackgrounds = useCallback(async (app: Application) => {
    try {
      if (!app || !app.stage) {
        console.error('PIXI app or stage not available for background setup')
        return
      }
      
      if (destroyedRef.current) {
        console.log('Canvas destroyed, skipping background setup')
        return
      }

      // Main background
      if (backgroundConfig.main) {
        const backgroundAtlas = Assets.cache.get(backgroundConfig.main)
        if (backgroundAtlas?.textures?.['background.png']) {
          const mainBackground = new Sprite(backgroundAtlas.textures['background.png'])
          mainBackground.width = config.designWidth
          mainBackground.height = config.designHeight
          mainBackground.x = 0
          mainBackground.y = 0
          app.stage.addChild(mainBackground)
        }
      }

      // Reel background
      if (backgroundConfig.reel) {
        const reelAtlas = Assets.cache.get(backgroundConfig.reel)
        if (reelAtlas?.textures?.['reelBackground.png']) {
          const reelBackground = new Sprite(reelAtlas.textures['reelBackground.png'])
          reelBackground.x = (config.designWidth - reelBackground.width) / 2
          reelBackground.y = (config.designHeight - reelBackground.height) / 2
          app.stage.addChild(reelBackground)
        }
      }

      // UI Cabinet Overlay
      if (backgroundConfig.overlay) {
        const overlayTexture = Assets.cache.get(backgroundConfig.overlay)
        if (overlayTexture) {
          const uiOverlay = new Sprite(overlayTexture)
          uiOverlay.width = config.designWidth
          uiOverlay.height = config.designHeight
          uiOverlay.x = 0
          uiOverlay.y = 0
          app.stage.addChild(uiOverlay)
        }
      }

      // Border overlay
      if (backgroundConfig.border) {
        const mainAtlas = Assets.cache.get(backgroundConfig.border)
        if (mainAtlas?.textures?.['reelBorder.png']) {
          const border = new Sprite(mainAtlas.textures['reelBorder.png'])
          border.anchor.set(0.5)
          border.scale.set(backgroundConfig.borderScale || 1.30)
          border.x = config.designWidth / 2 + (backgroundConfig.borderOffset?.x || 0)
          border.y = config.designHeight / 2 - 70 + (backgroundConfig.borderOffset?.y || 0)
          app.stage.addChild(border)
        }
      }
    } catch (error) {
      console.error('Error setting up backgrounds:', error)
      if (error instanceof Error) {
        onError?.(error)
      }
    }
  }, [config, backgroundConfig, onError])

  // Resize handler
  const handleResize = useCallback(() => {
    if (!appRef.current || destroyedRef.current) return

    const { scale, canvasWidth, canvasHeight } = calculateScale(
      window.innerWidth,
      window.innerHeight
    )

    appRef.current.renderer.resize(canvasWidth, canvasHeight)
    appRef.current.stage.scale.set(scale)
    
    onResize?.(scale, { width: canvasWidth, height: canvasHeight })
    console.log(`Canvas resized: ${canvasWidth}x${canvasHeight}, scale: ${scale}`)
  }, [calculateScale, onResize])

  // Load assets with progress tracking
  const loadAssets = useCallback(async (assetPaths: Array<string | { alias: string; src: string }>) => {
    if (assetPaths.length === 0) {
      setLoadingProgress(100)
      return
    }

    try {
      let loadedCount = 0
      const totalAssets = assetPaths.length

      // Load assets in batches for better progress tracking
      const batchSize = 5
      const batches = []
      for (let i = 0; i < assetPaths.length; i += batchSize) {
        batches.push(assetPaths.slice(i, i + batchSize))
      }

      for (const batch of batches) {
        await Promise.all(batch.map(async (asset) => {
          try {
            await Assets.load(asset)
            loadedCount++
            setLoadingProgress(Math.round((loadedCount / totalAssets) * 100))
          } catch (error) {
            console.warn('Failed to load asset:', asset, error)
            loadedCount++ // Count as loaded to continue progress
            setLoadingProgress(Math.round((loadedCount / totalAssets) * 100))
          }
        }))
      }

      console.log(`✅ Loaded ${totalAssets} assets`)
    } catch (error) {
      console.error('Asset loading failed:', error)
      if (error instanceof Error) {
        onError?.(error)
        setError(error)
      }
    }
  }, [onError])

  // Initialize PIXI application
  const initializePIXI = useCallback(async () => {
    if (destroyedRef.current) return

    try {
      setIsLoading(true)
      setError(null)

      const app = new Application()
      
      // Calculate initial viewport scaling
      const { scale, canvasWidth, canvasHeight } = calculateScale(
        window.innerWidth,
        window.innerHeight
      )

      await app.init({
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: config.backgroundColor,
        resolution: config.resolution,
        autoDensity: config.autoDensity,
        antialias: config.antialias,
        powerPreference: config.powerPreference as any,
      })

      if (destroyedRef.current) {
        app.destroy(true)
        return
      }

      appRef.current = app
      
      // Ensure the stage is available before proceeding
      if (!app.stage) {
        console.error('PIXI app stage not created after initialization')
        app.destroy(true)
        return
      }
      
      // Scale the stage to match design dimensions
      app.stage.scale.set(scale)
      
      // Mount canvas to DOM
      if (containerRef.current && app.canvas) {
        containerRef.current.innerHTML = ''
        containerRef.current.appendChild(app.canvas)
        
        // Apply canvas styling
        app.canvas.style.display = 'block'
        app.canvas.style.margin = 'auto'
      }

      // Setup resize handler
      resizeHandlerRef.current = handleResize
      window.addEventListener('resize', handleResize)

      console.log('✅ PIXI Application initialized')
      onAppReady?.(app)

      // Load assets
      const allAssets = [...assetList]
      await loadAssets(allAssets)

      // Verify stage is still available after asset loading
      if (!app.stage || destroyedRef.current) {
        console.error('PIXI app stage not available after asset loading')
        return
      }

      // Setup backgrounds after assets are loaded
      await setupBackgrounds(app)

      setIsLoading(false)
      setIsReady(true)
      
      console.log('✅ PIXI Game Canvas fully initialized')
      
      // Small delay to ensure everything is properly initialized
      setTimeout(() => {
        if (app && app.stage && !destroyedRef.current) {
          onAssetsLoaded?.(app)
        }
      }, 50)

    } catch (error) {
      console.error('PIXI initialization failed:', error)
      setIsLoading(false)
      if (error instanceof Error) {
        setError(error)
        onError?.(error)
      }
    }
  }, [
    config,
    gameConfig,
    assetList,
    calculateScale,
    handleResize,
    loadAssets,
    setupBackgrounds,
    containerRef,
    onAppReady,
    onAssetsLoaded,
    onError
  ])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (destroyedRef.current) return
    
    console.log('🧹 Cleaning up PIXI Game Canvas')
    destroyedRef.current = true

    // Remove resize listener
    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current)
      resizeHandlerRef.current = null
    }

    // Destroy PIXI app
    if (appRef.current) {
      try {
        appRef.current.destroy(true, { children: true })
      } catch (error) {
        console.error('Error during PIXI cleanup:', error)
      }
      appRef.current = null
    }

    // Clear container
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }

    setIsReady(false)
    setIsLoading(false)
    setError(null)
  }, [containerRef])

  // Force refresh (reinitialize)
  const refresh = useCallback(() => {
    cleanup()
    setTimeout(initializePIXI, 100) // Small delay to ensure cleanup completes
  }, [cleanup, initializePIXI])

  // Get current app instance
  const getApp = useCallback(() => appRef.current, [])

  // Check if canvas is ready
  const isCanvasReady = useCallback(() => isReady && !error && appRef.current, [isReady, error])

  return {
    // State
    isLoading,
    isReady,
    error,
    loadingProgress,
    
    // App instance
    app: appRef.current,
    getApp,
    
    // Actions
    initialize: initializePIXI,
    cleanup,
    refresh,
    
    // Utilities
    isCanvasReady,
    calculateScale,
    
    // Configuration
    config,
    designDimensions: {
      width: config.designWidth,
      height: config.designHeight
    }
  }
}

// Main PIXIGameCanvas component
export default function PIXIGameCanvas({
  gameConfig,
  canvasConfig,
  backgroundConfig,
  assetList,
  onAppReady,
  onAssetsLoaded,
  onResize,
  onError,
  className = '',
  style = {},
  children
}: PIXIGameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null!)
  
  const canvas = usePIXICanvas({
    gameConfig,
    canvasConfig,
    backgroundConfig,
    assetList,
    onAppReady,
    onAssetsLoaded,
    onResize,
    onError,
    containerRef
  })

  // Initialize on mount
  useEffect(() => {
    canvas.initialize()
    return canvas.cleanup
  }, [])

  // Default container styles
  const defaultContainerStyle: React.CSSProperties = {
    width: '100vw',
    height: '100vh',
    background: 'black',
    overflow: 'hidden',
    margin: 0,
    padding: 0,
    position: 'relative',
    ...style
  }

  const defaultCanvasStyle: React.CSSProperties = {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div className={`pixi-game-canvas ${className}`} style={defaultContainerStyle}>
      {/* Loading overlay */}
      {canvas.isLoading && (
        <div className="loading-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px',
          zIndex: 1000
        }}>
          <div>Loading Game Assets...</div>
          <div style={{ marginTop: '10px', fontSize: '24px', fontWeight: 'bold' }}>
            {canvas.loadingProgress}%
          </div>
          <div style={{
            width: '200px',
            height: '10px',
            background: '#333',
            borderRadius: '5px',
            marginTop: '10px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${canvas.loadingProgress}%`,
              height: '100%',
              background: '#4CAF50',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {canvas.error && (
        <div className="error-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(255, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px',
          zIndex: 1000,
          textAlign: 'center',
          padding: '20px'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>❌ Error Loading Game</div>
          <div style={{ marginBottom: '20px' }}>{canvas.error.message}</div>
          <button
            onClick={canvas.refresh}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* PIXI Canvas Container */}
      <div
        ref={containerRef}
        className="pixi-canvas-container"
        style={defaultCanvasStyle}
      />

      {/* Additional content overlay */}
      {children && (
        <div className="content-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 100
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Hook for accessing PIXI canvas context
export function usePIXICanvasContext() {
  // This would be used with React Context if needed
  // For now, components can pass the app instance directly
  return {
    // Could provide shared canvas utilities here
    isWebGLSupported: () => {
      try {
        const canvas = document.createElement('canvas')
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      } catch {
        return false
      }
    },
    
    getDevicePixelRatio: () => window.devicePixelRatio || 1,
    
    getViewportDimensions: () => ({
      width: window.innerWidth,
      height: window.innerHeight
    })
  }
}

// Utility functions for PIXI canvas management
export const PIXICanvasUtils = {
  // Calculate optimal resolution based on device
  getOptimalResolution: (): number => {
    const dpr = window.devicePixelRatio || 1
    // Cap at 2 for performance on high-DPI displays
    return Math.min(dpr, 2)
  },

  // Check if device supports WebGL
  supportsWebGL: (): boolean => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      return !!gl
    } catch {
      return false
    }
  },

  // Get recommended canvas config based on device capabilities
  getRecommendedConfig: (): Partial<PIXICanvasConfig> => {
    const isHighPerformanceDevice = window.devicePixelRatio <= 2 && 
                                    window.innerWidth * window.innerHeight <= 1920 * 1080 * 4

    return {
      resolution: PIXICanvasUtils.getOptimalResolution(),
      autoDensity: true,
      antialias: isHighPerformanceDevice,
      powerPreference: isHighPerformanceDevice ? 'high-performance' : 'low-power'
    }
  },

  // Format loading progress
  formatLoadingProgress: (progress: number): string => {
    return `${Math.round(progress)}%`
  }
}