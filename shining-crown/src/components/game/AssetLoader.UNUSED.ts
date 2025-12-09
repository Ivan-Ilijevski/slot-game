// Asset loading system for slot games
import { Assets } from 'pixi.js'

// Define ResolverManifest type locally
export interface ResolverManifest {
  bundles?: Array<{
    name: string
    assets: Array<{ alias: string; src: string }>
  }>
}

export interface AssetDefinition {
  alias: string
  src: string
  data?: Record<string, any>
}

export interface AssetBundle {
  name: string
  assets: (AssetDefinition | string)[]
  preload?: boolean
  priority?: number
}

export interface AssetLoadProgress {
  loaded: number
  total: number
  percentage: number
  currentAsset?: string
  phase: 'initializing' | 'loading' | 'completed' | 'error'
}

export interface AssetLoaderConfig {
  maxConcurrent?: number
  retryAttempts?: number
  retryDelay?: number
  enableCache?: boolean
  basePath?: string
  enableProgress?: boolean
}

export interface AssetLoaderCallbacks {
  onProgress?: (progress: AssetLoadProgress) => void
  onAssetLoaded?: (alias: string, asset: any) => void
  onAssetError?: (alias: string, error: Error) => void
  onComplete?: (loadedAssets: Record<string, any>) => void
  onError?: (error: Error) => void
}

// Default configuration
const DEFAULT_CONFIG: Required<AssetLoaderConfig> = {
  maxConcurrent: 5,
  retryAttempts: 3,
  retryDelay: 1000,
  enableCache: true,
  basePath: '',
  enableProgress: true
}

// Predefined asset bundles for Shining Crown
export const SHINING_CROWN_BUNDLES: AssetBundle[] = [
  {
    name: 'textures',
    preload: true,
    priority: 1,
    assets: [
      { alias: 'mainAtlas', src: '/assets/main.json' },
      { alias: 'reelAtlas', src: '/assets/reel.json' },
      '/assets/cabinet_overlay.png'
    ]
  },
  {
    name: 'sounds', 
    preload: false,
    priority: 2,
    assets: [
      { alias: 'shortSound', src: '/assets/sounds/mobile_main_0-1.mp3' },
      { alias: 'reelSound', src: '/assets/sounds/mobile_main_1-1.3.mp3' },
      { alias: 'buttonSound', src: '/assets/sounds/mobile_main_1.3-1.65.mp3' },
      { alias: 'longSound', src: '/assets/sounds/mobile_main_1.65-5.mp3' },
      { alias: 'ambientSound', src: '/assets/sounds/mobile_main_5-8.mp3' },
      { alias: 'startSound', src: '/assets/sounds/mobile_main_8-13.mp3' },
      { alias: 'winSound', src: '/assets/sounds/mobile_win_0-7.mp3' },
      { alias: 'bigWinSound', src: '/assets/sounds/mobile_win_7-9.3.mp3' }
    ]
  },
  {
    name: 'fonts',
    preload: false,
    priority: 3,
    assets: [
      // Add font assets if needed
    ]
  }
]

export class AssetLoader {
  private config: Required<AssetLoaderConfig>
  private callbacks: AssetLoaderCallbacks
  private loadedAssets: Record<string, any> = {}
  private loadingPromises: Map<string, Promise<any>> = new Map()
  private progress: AssetLoadProgress = {
    loaded: 0,
    total: 0,
    percentage: 0,
    phase: 'initializing'
  }

  constructor(config: AssetLoaderConfig = {}, callbacks: AssetLoaderCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.callbacks = callbacks
    
    // Initialize PIXI Assets with configuration
    this.initializeAssetsSystem()
  }

  // Initialize PIXI Assets system
  private initializeAssetsSystem(): void {
    try {
      // Clear any existing cache if disabled
      if (!this.config.enableCache) {
        Assets.cache.reset()
      }

      // Set base path if provided
      if (this.config.basePath) {
        Assets.resolver.basePath = this.config.basePath
      }

      console.log('✅ Asset system initialized')
    } catch (error) {
      console.error('Failed to initialize asset system:', error)
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Init failed'))
    }
  }

  // Load assets from bundles
  async loadBundles(bundles: AssetBundle[]): Promise<Record<string, any>> {
    try {
      this.updateProgress({ phase: 'initializing', loaded: 0, total: 0, percentage: 0 })

      // Calculate total assets
      const totalAssets = bundles.reduce((sum, bundle) => sum + bundle.assets.length, 0)
      this.updateProgress({ total: totalAssets })

      // Sort bundles by priority
      const sortedBundles = [...bundles].sort((a, b) => (a.priority || 0) - (b.priority || 0))

      this.updateProgress({ phase: 'loading' })

      // Load preload bundles first
      const preloadBundles = sortedBundles.filter(bundle => bundle.preload)
      const normalBundles = sortedBundles.filter(bundle => !bundle.preload)

      for (const bundle of preloadBundles) {
        await this.loadBundle(bundle)
      }

      // Load remaining bundles in parallel with concurrency limit
      await this.loadBundlesWithConcurrency(normalBundles)

      this.updateProgress({ phase: 'completed', percentage: 100 })
      this.callbacks.onComplete?.(this.loadedAssets)

      console.log(`✅ Loaded ${Object.keys(this.loadedAssets).length} assets from ${bundles.length} bundles`)
      return this.loadedAssets

    } catch (error) {
      console.error('Bundle loading failed:', error)
      this.updateProgress({ phase: 'error' })
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Bundle load failed'))
      throw error
    }
  }

  // Load single bundle
  private async loadBundle(bundle: AssetBundle): Promise<void> {
    console.log(`📦 Loading bundle: ${bundle.name}`)

    for (const assetDef of bundle.assets) {
      await this.loadSingleAsset(assetDef)
    }

    console.log(`✅ Bundle loaded: ${bundle.name}`)
  }

  // Load bundles with concurrency control
  private async loadBundlesWithConcurrency(bundles: AssetBundle[]): Promise<void> {
    const loadPromises: Promise<void>[] = []

    for (const bundle of bundles) {
      const promise = this.loadBundle(bundle)
      loadPromises.push(promise)

      // Limit concurrent bundle loading
      if (loadPromises.length >= this.config.maxConcurrent) {
        await Promise.race(loadPromises)
        // Remove completed promises
        const completedIndex = loadPromises.findIndex(p => 
          p.then(() => true).catch(() => true)
        )
        if (completedIndex >= 0) {
          loadPromises.splice(completedIndex, 1)
        }
      }
    }

    // Wait for remaining promises
    await Promise.all(loadPromises)
  }

  // Load single asset with retry logic
  private async loadSingleAsset(assetDef: AssetDefinition | string): Promise<any> {
    const { alias, src } = this.normalizeAssetDefinition(assetDef)

    // Check if already loaded
    if (this.loadedAssets[alias]) {
      return this.loadedAssets[alias]
    }

    // Check if currently loading
    if (this.loadingPromises.has(alias)) {
      return this.loadingPromises.get(alias)
    }

    this.updateProgress({ currentAsset: alias })

    const loadPromise = this.loadWithRetry(alias, src)
    this.loadingPromises.set(alias, loadPromise)

    try {
      const asset = await loadPromise
      this.loadedAssets[alias] = asset
      
      this.updateProgress({ 
        loaded: this.progress.loaded + 1,
        percentage: Math.round((this.progress.loaded + 1) / this.progress.total * 100)
      })

      this.callbacks.onAssetLoaded?.(alias, asset)
      return asset

    } catch (error) {
      console.error(`Failed to load asset ${alias}:`, error)
      this.callbacks.onAssetError?.(alias, error instanceof Error ? error : new Error('Load failed'))
      throw error
    } finally {
      this.loadingPromises.delete(alias)
    }
  }

  // Load asset with retry mechanism
  private async loadWithRetry(alias: string, src: string): Promise<any> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(`📥 Loading ${alias} (attempt ${attempt}/${this.config.retryAttempts})`)
        
        const asset = await Assets.load(src)
        console.log(`✅ Loaded ${alias}`)
        return asset

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        console.warn(`❌ Failed to load ${alias} (attempt ${attempt}):`, lastError.message)

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt) // Exponential backoff
        }
      }
    }

    throw lastError || new Error(`Failed to load ${alias} after ${this.config.retryAttempts} attempts`)
  }

  // Normalize asset definition to consistent format
  private normalizeAssetDefinition(assetDef: AssetDefinition | string): AssetDefinition {
    if (typeof assetDef === 'string') {
      // Extract alias from file path
      const pathParts = assetDef.split('/')
      const filename = pathParts[pathParts.length - 1]
      const alias = filename.split('.')[0]
      
      return { alias, src: assetDef }
    }
    
    return assetDef
  }

  // Update progress and notify callbacks
  private updateProgress(updates: Partial<AssetLoadProgress>): void {
    this.progress = { ...this.progress, ...updates }
    
    if (this.config.enableProgress) {
      this.callbacks.onProgress?.(this.progress)
    }
  }

  // Utility delay function
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Load individual assets (public API)
  async loadAssets(assets: (AssetDefinition | string)[]): Promise<Record<string, any>> {
    const bundle: AssetBundle = {
      name: 'custom',
      assets,
      preload: true,
      priority: 1
    }

    return this.loadBundles([bundle])
  }

  // Get loaded asset by alias
  getAsset(alias: string): any {
    return this.loadedAssets[alias] || Assets.cache.get(alias)
  }

  // Check if asset is loaded
  isLoaded(alias: string): boolean {
    return !!this.loadedAssets[alias] || Assets.cache.has(alias)
  }

  // Get all loaded assets
  getAllAssets(): Record<string, any> {
    return { ...this.loadedAssets }
  }

  // Get loading progress
  getProgress(): AssetLoadProgress {
    return { ...this.progress }
  }

  // Preload assets in background
  async preloadAssets(assets: (AssetDefinition | string)[]): Promise<void> {
    const bundle: AssetBundle = {
      name: 'preload',
      assets,
      preload: true,
      priority: 0
    }

    try {
      await this.loadBundles([bundle])
      console.log('✅ Preload completed')
    } catch (error) {
      console.warn('Preload failed (non-critical):', error)
    }
  }

  // Unload assets to free memory
  unloadAssets(aliases: string[]): void {
    for (const alias of aliases) {
      if (this.loadedAssets[alias]) {
        try {
          // Remove from PIXI cache
          Assets.unload(alias)
          delete this.loadedAssets[alias]
          console.log(`🗑️ Unloaded asset: ${alias}`)
        } catch (error) {
          console.warn(`Failed to unload asset ${alias}:`, error)
        }
      }
    }
  }

  // Clear all loaded assets
  clear(): void {
    try {
      Assets.cache.reset()
      this.loadedAssets = {}
      this.loadingPromises.clear()
      this.progress = {
        loaded: 0,
        total: 0,
        percentage: 0,
        phase: 'initializing'
      }
      console.log('🧹 Asset loader cleared')
    } catch (error) {
      console.error('Failed to clear asset loader:', error)
    }
  }

  // Get memory usage statistics
  getMemoryStats(): { loadedCount: number, cacheSize: number, aliases: string[] } {
    const aliases = Object.keys(this.loadedAssets)
    return {
      loadedCount: aliases.length,
      cacheSize: 0, // Cache size not available in current PIXI version
      aliases
    }
  }
}

// Utility functions
export const AssetLoaderUtils = {
  // Create asset manifest for PIXI resolver
  createManifest: (bundles: AssetBundle[]): ResolverManifest => {
    const manifest: ResolverManifest = { bundles: [] }
    
    for (const bundle of bundles) {
      const manifestBundle = {
        name: bundle.name,
        assets: bundle.assets.map(asset => {
          if (typeof asset === 'string') {
            const pathParts = asset.split('/')
            const filename = pathParts[pathParts.length - 1]
            const alias = filename.split('.')[0]
            return { alias, src: asset }
          }
          return asset
        })
      }
      
      manifest.bundles!.push(manifestBundle)
    }
    
    return manifest
  },

  // Validate asset paths
  validateAssetPaths: async (assets: (AssetDefinition | string)[]): Promise<{
    valid: string[]
    invalid: string[]
  }> => {
    const valid: string[] = []
    const invalid: string[] = []

    for (const assetDef of assets) {
      const src = typeof assetDef === 'string' ? assetDef : assetDef.src
      
      try {
        // Simple existence check (could be enhanced with actual HEAD requests)
        if (src.startsWith('/') || src.startsWith('http')) {
          valid.push(src)
        } else {
          invalid.push(src)
        }
      } catch (error) {
        invalid.push(src)
      }
    }

    return { valid, invalid }
  },

  // Estimate asset sizes (for progress calculation)
  estimateAssetSizes: (assets: (AssetDefinition | string)[]): Record<string, number> => {
    const sizes: Record<string, number> = {}
    
    for (const assetDef of assets) {
      const { alias, src } = typeof assetDef === 'string' 
        ? { alias: assetDef.split('/').pop()?.split('.')[0] || '', src: assetDef }
        : assetDef

      // Rough size estimates based on file type
      const ext = src.split('.').pop()?.toLowerCase()
      switch (ext) {
        case 'json':
          sizes[alias] = 10000 // 10KB
          break
        case 'png':
        case 'jpg':
        case 'jpeg':
          sizes[alias] = 100000 // 100KB
          break
        case 'mp3':
        case 'ogg':
        case 'wav':
          sizes[alias] = 500000 // 500KB
          break
        default:
          sizes[alias] = 50000 // 50KB default
      }
    }

    return sizes
  },

  // Create loading screen data
  createLoadingScreenData: (progress: AssetLoadProgress) => ({
    percentage: progress.percentage,
    message: `Loading ${progress.currentAsset || 'assets'}...`,
    phase: progress.phase,
    completed: progress.loaded,
    total: progress.total
  })
}