// Reels Management System for slot games using PIXI.js
import { Container, Sprite, Graphics, Texture } from 'pixi.js'

export interface ReelConfig {
  symbolWidth: number
  symbolHeight: number
  reelCount: number
  symbolsPerReel: number
  reelGap: number
  spinSpeed: number
  bounceDuration: number
  overshootAmount: number
}

export interface SpinTiming {
  bounceStartTimes: number[]
  bounceEndTimes: number[]
  minSpinDuration: number
  stopStagger: number
  quickStopStagger: number
}

export interface ReelSymbol {
  sprite: Sprite
  texture: Texture
  position: number
  visible: boolean
}

export interface ReelState {
  isSpinning: boolean
  spinStartTime: number
  spinDuration: number
  bounceStartTime: number
  bounceEndTime: number
  targetSymbols: string[]
  currentSymbols: string[]
  soundPlayed: boolean
}

export interface SpinRequest {
  betAmount: number
  immediate?: boolean
  useServerResults?: boolean
}

export interface SpinResult {
  reel: number
  position: number
  symbols: string[]
}

export interface ReelsManagerProps {
  pixiApp: unknown
  reelAtlas: { textures: { [key: string]: Texture } }
  config?: Partial<ReelConfig>
  timing?: Partial<SpinTiming>
  onSpinComplete?: (results: SpinResult[]) => void
  onReelStop?: (reelIndex: number, hasWild: boolean) => void
  onSoundPlay?: (alias: string, options: any) => void
}

// Default configurations
export const DEFAULT_REEL_CONFIG: ReelConfig = {
  symbolWidth: 260,
  symbolHeight: 260,
  reelCount: 5,
  symbolsPerReel: 3,
  reelGap: 28,
  spinSpeed: 40,
  bounceDuration: 333,
  overshootAmount: 69
}

export const DEFAULT_SPIN_TIMING: SpinTiming = {
  bounceStartTimes: [533, 883, 1233, 1583, 1933], // Frame 32, 53, 74, 95, 116
  bounceEndTimes: [867, 1217, 1567, 1917, 2267],   // Frame 52, 73, 94, 115, 136
  minSpinDuration: 2000,
  stopStagger: 350, // Normal stop stagger
  quickStopStagger: 20 // Quick stop stagger
}

// Default symbol sequence for initialization
export const DEFAULT_SYMBOL_SEQUENCE = [
  ['00.png', '00.png', '00.png'], // Cherries column
  ['01.png', '01.png', '01.png'], // Lemons column  
  ['02.png', '02.png', '02.png'], // Oranges column
  ['03.png', '03.png', '03.png'], // Plums column
  ['04.png', '04.png', '04.png']  // Bells column
]

export class ReelsManager {
  private config: ReelConfig
  private timing: SpinTiming
  private pixiApp: any
  private reelAtlas: { textures: { [key: string]: Texture } }
  
  // PIXI containers
  private reelContainer: Container | null = null
  private reels: Container[] = []
  
  // State management
  private reelStates: ReelState[] = []
  private isSpinning = false
  private stopRequested = false
  private reelsStopped: boolean[] = []
  private reelsStoppedCount = 0
  private simultaneousStop = false
  private animationFrameId: number | null = null
  
  // Callbacks
  private onSpinComplete?: (results: SpinResult[]) => void
  private onReelStop?: (reelIndex: number, hasWild: boolean) => void
  private onSoundPlay?: (alias: string, options: any) => void

  constructor({
    pixiApp,
    reelAtlas,
    config = {},
    timing = {},
    onSpinComplete,
    onReelStop,
    onSoundPlay
  }: ReelsManagerProps) {
    this.config = { ...DEFAULT_REEL_CONFIG, ...config }
    this.timing = { ...DEFAULT_SPIN_TIMING, ...timing }
    this.pixiApp = pixiApp
    this.reelAtlas = reelAtlas
    this.onSpinComplete = onSpinComplete
    this.onReelStop = onReelStop
    this.onSoundPlay = onSoundPlay
    
    this.initializeReelStates()
  }

  // Initialize reel states
  private initializeReelStates(): void {
    this.reelStates = []
    this.reelsStopped = []
    
    for (let i = 0; i < this.config.reelCount; i++) {
      this.reelStates.push({
        isSpinning: false,
        spinStartTime: 0,
        spinDuration: 0,
        bounceStartTime: 0,
        bounceEndTime: 0,
        targetSymbols: DEFAULT_SYMBOL_SEQUENCE[i] || ['00.png', '00.png', '00.png'],
        currentSymbols: DEFAULT_SYMBOL_SEQUENCE[i] || ['00.png', '00.png', '00.png'],
        soundPlayed: false
      })
      this.reelsStopped.push(false)
    }
  }

  // Setup reels in PIXI
  setupReels(): void {
    if (!this.pixiApp || !('stage' in this.pixiApp)) {
      console.error('Invalid PIXI app provided to ReelsManager')
      return
    }

    // Calculate positioning
    const totalReelWidth = (this.config.reelCount * this.config.symbolWidth) + 
                          ((this.config.reelCount - 1) * this.config.reelGap)
    const totalReelHeight = this.config.symbolsPerReel * this.config.symbolHeight
    
    const reelOffsetX = (1920 / 2) - (totalReelWidth / 2)
    const reelOffsetY = (1080 / 2 - 70) - (totalReelHeight / 2)

    // Create main reel container
    this.reelContainer = new Container()
    this.reelContainer.x = reelOffsetX
    this.reelContainer.y = reelOffsetY
    this.pixiApp.stage.addChild(this.reelContainer)

    // Create individual reels
    this.reels = []
    for (let reelIndex = 0; reelIndex < this.config.reelCount; reelIndex++) {
      const reel = this.createReel(reelIndex)
      this.reels.push(reel)
      this.reelContainer.addChild(reel)
    }

    console.log(`✅ Created ${this.config.reelCount} reels`)
  }

  // Create individual reel
  private createReel(reelIndex: number): Container {
    const reel = new Container()
    reel.x = reelIndex * (this.config.symbolWidth + this.config.reelGap)

    // Create mask for overflow hiding
    const mask = new Graphics()
    mask.rect(0, 0, this.config.symbolWidth, this.config.symbolsPerReel * this.config.symbolHeight)
    mask.fill(0xFFFFFF)
    reel.mask = mask
    reel.addChild(mask) // Index 0

    // Create overshoot symbol (positioned above visible area)
    const overshootSymbol = new Sprite()
    overshootSymbol.width = this.config.symbolWidth
    overshootSymbol.height = this.config.symbolHeight
    overshootSymbol.x = 0
    overshootSymbol.y = -this.config.symbolHeight
    overshootSymbol.visible = false
    reel.addChild(overshootSymbol) // Index 1

    // Create visible symbols
    const initialSymbols = this.reelStates[reelIndex].currentSymbols
    for (let symbolIndex = 0; symbolIndex < this.config.symbolsPerReel; symbolIndex++) {
      const sprite = new Sprite()
      sprite.width = this.config.symbolWidth
      sprite.height = this.config.symbolHeight
      sprite.x = 0
      sprite.y = symbolIndex * this.config.symbolHeight

      // Set initial texture
      const symbolName = initialSymbols[symbolIndex] || '00.png'
      const texture = this.reelAtlas.textures[symbolName]
      if (texture) {
        sprite.texture = texture
      }

      reel.addChild(sprite) // Index 2, 3, 4
    }

    return reel
  }

  // Start spinning reels
  async spinReels(spinRequest: SpinRequest = { betAmount: 0 }): Promise<SpinResult[]> {
    if (this.isSpinning) {
      console.log('Already spinning, ignoring spin request')
      return []
    }

    console.log('🎰 Starting reel spin')
    
    // Reset state
    this.isSpinning = true
    this.stopRequested = false
    this.reelsStoppedCount = 0
    this.simultaneousStop = false
    this.reelsStopped.fill(false)

    // Reset reel states
    const startTime = Date.now()
    this.reelStates.forEach((state, index) => {
      state.isSpinning = true
      state.spinStartTime = startTime
      state.spinDuration = this.timing.bounceStartTimes[index] || this.timing.minSpinDuration
      state.bounceStartTime = 0
      state.bounceEndTime = 0
      state.soundPlayed = false
    })

    // Add spinning symbols to each reel
    this.addSpinningSymbols()

    // Start animation loop
    this.startAnimationLoop()

    // Get server results if requested
    let serverResults: SpinResult[] = []
    if (spinRequest.useServerResults && spinRequest.betAmount > 0) {
      try {
        const response = await fetch('/api/spin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bet: spinRequest.betAmount }),
        })
        const data = await response.json()
        if (data.success && data.results) {
          serverResults = data.results
        }
      } catch (error) {
        console.error('Failed to get server results:', error)
      }
    }

    return new Promise((resolve) => {
      // Store resolve function for when all reels stop
      this.onSpinComplete = (results) => {
        resolve(results)
      }
    })
  }

  // Add symbols for spinning animation
  private addSpinningSymbols(): void {
    const availableSymbols = Object.keys(this.reelAtlas.textures).filter(key => 
      key.match(/^\d{2}\.png$/)
    )

    this.reels.forEach((reel, reelIndex) => {
      // Add 2 symbols above for spinning effect
      for (let i = 0; i < 2; i++) {
        const randomSymbol = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
        const sprite = new Sprite()
        sprite.width = this.config.symbolWidth
        sprite.height = this.config.symbolHeight
        sprite.x = 0
        sprite.y = (-2 + i) * this.config.symbolHeight
        
        const texture = this.reelAtlas.textures[randomSymbol]
        if (texture) {
          sprite.texture = texture
        }
        
        reel.addChild(sprite)
      }

      // Add 2 symbols below for spinning effect
      for (let i = 0; i < 2; i++) {
        const randomSymbol = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
        const sprite = new Sprite()
        sprite.width = this.config.symbolWidth
        sprite.height = this.config.symbolHeight
        sprite.x = 0
        sprite.y = (3 + i) * this.config.symbolHeight
        
        const texture = this.reelAtlas.textures[randomSymbol]
        if (texture) {
          sprite.texture = texture
        }
        
        reel.addChild(sprite)
      }
    })
  }

  // Start animation loop
  private startAnimationLoop(): void {
    const animate = () => {
      if (!this.isSpinning) return

      const currentTime = Date.now()
      let allReelsStopped = true

      this.reels.forEach((reel, reelIndex) => {
        const state = this.reelStates[reelIndex]
        if (!state.isSpinning) return

        allReelsStopped = false
        this.animateReel(reel, reelIndex, currentTime)
      })

      if (allReelsStopped) {
        this.onSpinCompleteHandler()
      } else {
        this.animationFrameId = requestAnimationFrame(animate)
      }
    }

    this.animationFrameId = requestAnimationFrame(animate)
  }

  // Animate individual reel
  private animateReel(reel: Container, reelIndex: number, currentTime: number): void {
    const state = this.reelStates[reelIndex]
    const elapsed = currentTime - state.spinStartTime

    // Check if we should start stopping this reel
    if (elapsed >= state.spinDuration && state.bounceStartTime === 0) {
      state.bounceStartTime = currentTime
      state.bounceEndTime = currentTime + this.config.bounceDuration
      
      // Apply final symbols if available
      this.applyFinalSymbols(reel, reelIndex)
    }

    // Spin phase
    if (state.bounceStartTime === 0) {
      this.animateSpinPhase(reel, reelIndex)
    }
    // Bounce phase
    else if (currentTime <= state.bounceEndTime) {
      this.animateBouncePhase(reel, reelIndex, currentTime)
    }
    // Stop phase
    else {
      this.stopReel(reel, reelIndex)
    }
  }

  // Animate spin phase
  private animateSpinPhase(reel: Container, reelIndex: number): void {
    // Move all symbols down
    for (let i = 1; i < reel.children.length; i++) {
      const symbol = reel.children[i] as Sprite
      symbol.y += this.config.spinSpeed
      
      // Wrap symbols that go below visible area
      if (symbol.y >= (this.config.symbolsPerReel + 2) * this.config.symbolHeight) {
        symbol.y -= (reel.children.length - 1) * this.config.symbolHeight
        
        // Randomize wrapped symbol texture
        const availableSymbols = Object.keys(this.reelAtlas.textures).filter(key => 
          key.match(/^\d{2}\.png$/)
        )
        const randomSymbol = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
        const texture = this.reelAtlas.textures[randomSymbol]
        if (texture) {
          symbol.texture = texture
        }
      }
    }
  }

  // Animate bounce phase
  private animateBouncePhase(reel: Container, reelIndex: number, currentTime: number): void {
    const state = this.reelStates[reelIndex]
    const bounceProgress = (currentTime - state.bounceStartTime) / this.config.bounceDuration
    const bounceOffset = Math.sin(Math.PI * bounceProgress) * this.config.overshootAmount * (1 - bounceProgress)

    // Position visible symbols with bounce
    const targetPositions = [0, this.config.symbolHeight, 2 * this.config.symbolHeight]
    for (let i = 2; i < 5; i++) { // Visible symbols
      if (reel.children[i]) {
        reel.children[i].y = targetPositions[i - 2] + bounceOffset
      }
    }

    // Play sound at peak bounce (around 25% progress)
    if (!state.soundPlayed && bounceProgress >= 0.25) {
      if (!this.simultaneousStop) {
        const hasWild = this.reelHasWild(reel)
        if (hasWild) {
          this.onSoundPlay?.('shortSound', { start: 0, end: 1, volume: 0.8 })
        } else {
          this.onSoundPlay?.('reelSound', { start: 1, end: 1.3, volume: 0.7 })
        }
        this.onReelStop?.(reelIndex, hasWild)
      }
      state.soundPlayed = true
    }
  }

  // Stop individual reel
  private stopReel(reel: Container, reelIndex: number): void {
    const state = this.reelStates[reelIndex]
    state.isSpinning = false
    this.reelsStopped[reelIndex] = true
    this.reelsStoppedCount++

    // Clean up spinning symbols
    this.cleanupSpinningSymbols(reel)

    // Position final symbols exactly
    const targetPositions = [0, this.config.symbolHeight, 2 * this.config.symbolHeight]
    for (let i = 2; i < 5; i++) {
      if (reel.children[i]) {
        reel.children[i].y = targetPositions[i - 2]
      }
    }

    console.log(`Reel ${reelIndex + 1} stopped (${this.reelsStoppedCount}/${this.config.reelCount})`)
  }

  // Apply final symbols from server results
  private applyFinalSymbols(reel: Container, reelIndex: number): void {
    const targetSymbols = this.reelStates[reelIndex].targetSymbols

    for (let i = 2; i < 5; i++) { // Visible symbols only
      const symbolIndex = i - 2
      if (reel.children[i] && targetSymbols[symbolIndex]) {
        const sprite = reel.children[i] as Sprite
        const symbolName = targetSymbols[symbolIndex]
        const texture = this.reelAtlas.textures[symbolName]
        if (texture) {
          sprite.texture = texture
        }
      }
    }
  }

  // Clean up spinning symbols
  private cleanupSpinningSymbols(reel: Container): void {
    // Remove extra symbols added for spinning (keep mask + overshoot + 3 visible symbols)
    for (let i = reel.children.length - 1; i >= 5; i--) {
      const child = reel.children[i]
      reel.removeChild(child)
      if ('destroy' in child && typeof child.destroy === 'function') {
        child.destroy()
      }
    }
  }

  // Check if reel has wild symbols
  private reelHasWild(reel: Container): boolean {
    const wildTexture = this.reelAtlas.textures['08.png']
    if (!wildTexture) return false

    // Check visible symbols (indices 2-4)
    for (let i = 2; i < 5; i++) {
      const sprite = reel.children[i] as Sprite
      if (sprite && sprite.texture === wildTexture) {
        return true
      }
    }
    return false
  }

  // Handle spin completion
  private onSpinCompleteHandler(): void {
    this.isSpinning = false
    this.stopRequested = false

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    // Generate results
    const results: SpinResult[] = this.reels.map((reel, index) => ({
      reel: index + 1,
      position: 0, // Could be calculated based on final positions
      symbols: this.getVisibleSymbols(reel)
    }))

    console.log('🏁 All reels stopped')
    this.onSpinComplete?.(results)
  }

  // Get visible symbols from a reel
  private getVisibleSymbols(reel: Container): string[] {
    const symbols: string[] = []
    for (let i = 2; i < 5; i++) {
      const sprite = reel.children[i] as Sprite
      if (sprite && sprite.texture) {
        // Find symbol name from texture
        const symbolName = Object.keys(this.reelAtlas.textures).find(key => 
          this.reelAtlas.textures[key] === sprite.texture
        ) || '00.png'
        symbols.push(symbolName)
      }
    }
    return symbols
  }

  // Request early stop
  requestStop(): void {
    if (!this.isSpinning || this.stopRequested) return

    console.log('🛑 Stop requested')
    this.stopRequested = true

    const currentTime = Date.now()

    // Determine stopping strategy
    if (this.reelsStoppedCount === 0) {
      // No reels stopped - simultaneous stop
      this.simultaneousStop = true
      const minDuration = Math.max(500, Math.min(...this.reelStates.map(state => 
        currentTime - state.spinStartTime
      )))

      this.reelStates.forEach(state => {
        state.spinDuration = minDuration + 50
      })

      // Play single sound for simultaneous stop
      this.onSoundPlay?.('reelSound', { start: 1, end: 1.3, volume: 0.7 })
    } else {
      // Some reels stopped - quick stop remaining reels
      this.reelStates.forEach((state, index) => {
        if (state.isSpinning) {
          const elapsed = currentTime - state.spinStartTime
          const quickStopDelay = (index - this.reelsStoppedCount) * this.timing.quickStopStagger
          state.spinDuration = elapsed + quickStopDelay + 50
        }
      })
    }
  }

  // Set target symbols for next spin
  setTargetSymbols(reelIndex: number, symbols: string[]): void {
    if (reelIndex >= 0 && reelIndex < this.reelStates.length) {
      this.reelStates[reelIndex].targetSymbols = [...symbols]
    }
  }

  // Set target symbols for all reels
  setAllTargetSymbols(allSymbols: string[][]): void {
    allSymbols.forEach((symbols, index) => {
      this.setTargetSymbols(index, symbols)
    })
  }

  // Get current reel state
  getReelState(reelIndex: number): ReelState | null {
    return this.reelStates[reelIndex] || null
  }

  // Check if currently spinning
  isCurrentlySpinning(): boolean {
    return this.isSpinning
  }

  // Get all reels containers (for external access)
  getReels(): Container[] {
    return [...this.reels]
  }

  // Cleanup
  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
    }

    if (this.reelContainer && this.pixiApp && 'stage' in this.pixiApp) {
      this.pixiApp.stage.removeChild(this.reelContainer)
      this.reelContainer.destroy({ children: true })
    }

    this.reels.length = 0
    this.reelStates.length = 0
  }
}

// Utility functions for reel management
export const ReelsUtils = {
  // Create symbol sequence for testing
  createTestSymbolSequence: (symbolName: string): string[][] => {
    return Array(5).fill([`${symbolName}.png`, `${symbolName}.png`, `${symbolName}.png`])
  },

  // Generate random symbol sequence
  generateRandomSequence: (availableSymbols: string[]): string[][] => {
    return Array(5).fill(null).map(() => 
      Array(3).fill(null).map(() => 
        availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
      )
    )
  },

  // Validate symbol sequence
  isValidSymbolSequence: (sequence: string[][], reelCount: number, symbolsPerReel: number): boolean => {
    return sequence.length === reelCount && 
           sequence.every(reel => reel.length === symbolsPerReel)
  },

  // Calculate total spin time
  calculateTotalSpinTime: (timing: SpinTiming, reelIndex: number): number => {
    return timing.bounceEndTimes[reelIndex] || timing.minSpinDuration
  }
}