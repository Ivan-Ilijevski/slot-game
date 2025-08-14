// Win Animation System for slot games using PIXI.js
import { Container, Sprite, Graphics, Text, Texture } from 'pixi.js'

export interface WinPosition {
  reelIndex: number
  rowIndex: number
  symbolName: string
}

export interface WinLine {
  payline: number
  symbols: string[]
  count: number
  symbol: string
  payout: number
  positions?: Array<[number, number]> // [reel, row] positions
}

export interface WinAnimationConfig {
  symbolAnimationFPS: number
  wildExpansionFPS: number
  winCycleDuration: number
  winCountDuration: number
  winAnimationSteps: number
  enableWinAnimations: boolean
  autoCollectDelay: number
}

export interface PIXIRefs {
  reelsRef: Container[]
  winHighlightsRef: Container[]
  app: unknown // PIXI Application
}

export interface AnimationState {
  isWinAnimating: boolean
  animationsRunning: Set<number>
  runningWinAnimations: { [key: string]: boolean }
  takeWinActive: boolean
}

export interface WinAnimationAssets {
  winAtlases: { [symbolId: string]: { textures: { [key: string]: Texture } } }
  expandAtlas: { textures: { [key: string]: Texture } }
  reelAtlas: { textures: { [key: string]: Texture } }
  paylineColors: number[]
}

export class WinAnimationManager {
  private config: WinAnimationConfig
  private assets: WinAnimationAssets
  private pixiRefs: PIXIRefs
  private state: AnimationState
  
  // Animation refs
  private winAnimationRef: NodeJS.Timeout | null = null
  private winCycleIntervalRef: NodeJS.Timeout | null = null
  private wildExpansionTimeoutRef: NodeJS.Timeout | null = null
  
  constructor(
    config: WinAnimationConfig,
    assets: WinAnimationAssets,
    pixiRefs: PIXIRefs
  ) {
    this.config = config
    this.assets = assets
    this.pixiRefs = pixiRefs
    this.state = {
      isWinAnimating: false,
      animationsRunning: new Set(),
      runningWinAnimations: {},
      takeWinActive: false
    }
  }

  // Main function to show win highlights and animations
  async showWinHighlights(
    winLines: WinLine[],
    pendingWin: number,
    onAnimateWin: (amount: number) => void
  ): Promise<void> {
    console.log('🎯 Starting win highlights for', winLines.length, 'win lines')

    if (!this.config.enableWinAnimations || winLines.length === 0) {
      console.log('Win animations disabled or no win lines, skipping animations')
      return
    }

    // Clear any existing highlights
    this.clearWinHighlights()

    // Collect all winning positions from all win lines
    const allWinningPositions: WinPosition[] = []
    
    for (const winLine of winLines) {
      if (winLine.positions) {
        for (let i = 0; i < winLine.count; i++) {
          const [reelIndex, rowIndex] = winLine.positions[i]
          
          // Determine symbol name for animation
          let symbolName = winLine.symbol
          if (symbolName === 'Wild') {
            symbolName = 'Wild' // Keep as Wild for animation atlas selection
          }
          
          allWinningPositions.push({
            reelIndex,
            rowIndex,
            symbolName
          })
        }
      }
    }

    console.log('📍 Total winning positions:', allWinningPositions.length)

    // Start win count animation
    onAnimateWin(pendingWin)

    // Start symbol animations
    if (allWinningPositions.length > 0) {
      await this.animateWinningSymbols(allWinningPositions)
    }

    // Start payline cycling after symbol animations
    this.showPaylineHighlights(winLines)
  }

  // Animate individual winning symbols
  private async animateWinningSymbols(winningPositions: WinPosition[]): Promise<void> {
    if (winningPositions.length === 0) {
      console.log('❌ No winning positions to animate')
      return
    }
    
    console.log('🎯 Animating', winningPositions.length, 'winning symbols with pre-loaded assets')
    
    winningPositions.forEach(({ reelIndex, rowIndex, symbolName }) => {
      const animationKey = `${reelIndex}-${rowIndex}`
      this.state.runningWinAnimations[animationKey] = true // Mark animation as running
      
      const reel = this.pixiRefs.reelsRef[reelIndex]
      if (!reel) {
        console.log(`❌ No reel found at index ${reelIndex}`)
        delete this.state.runningWinAnimations[animationKey]
        return
      }
      
      // Get the symbol at this position (skip mask at 0 and overshoot at 1)
      const symbolSprite = reel.children[rowIndex + 2] as Sprite
      if (!symbolSprite) {
        console.log(`❌ No symbol found at reel ${reelIndex}, row ${rowIndex}`)
        return
      }
      
      // Convert symbol name to number for atlas lookup
      const symbolNumber = this.getSymbolNumber(symbolName)
      console.log(`🎨 Creating animation for symbol ${symbolName} -> ${symbolNumber} at reel ${reelIndex}, row ${rowIndex}`)
      
      const winAtlas = this.assets.winAtlases[symbolNumber]
      
      if (!winAtlas?.textures) {
        console.warn(`❌ No pre-loaded animation atlas for symbol ${symbolNumber}, falling back to flash`)
        this.fallbackFlashAnimation(symbolSprite)
        return
      }
      
      console.log(`✅ Found pre-loaded atlas for symbol ${symbolNumber}`)
      
      // Create animation frames array (use all 57 frames for smooth animation)
      const winFrames: Texture[] = []
      console.log(`🔍 Available textures in ${symbolNumber} atlas:`, Object.keys(winAtlas.textures).slice(0, 10))
      
      // Use all 57 frames for complete smooth animation
      for (let i = 0; i < 57; i++) {
        const frameNumber = i.toString().padStart(3, '0')
        const frameName = `${symbolNumber}_${frameNumber}.png`
        const texture = winAtlas.textures[frameName]
        if (texture && texture.source) {
          winFrames.push(texture)
        } else {
          console.warn(`⚠️ Missing or invalid frame ${frameName} in ${symbolNumber} atlas`)
        }
      }
      
      console.log(`🎞️ Using ${winFrames.length} frames out of 57 total frames`)
      
      if (winFrames.length === 0) {
        console.error(`❌ No valid frames found for symbol ${symbolNumber}`)
        this.fallbackFlashAnimation(symbolSprite)
        return
      }
      
      // Start the frame-by-frame animation
      this.animateSymbolFrames(symbolSprite, winFrames, animationKey)
    })
  }

  // Animate symbol frames with proper timing
  private animateSymbolFrames(
    symbolSprite: Sprite, 
    frames: Texture[], 
    animationKey: string
  ): void {
    let currentFrame = 0
    const frameInterval = 1000 / this.config.symbolAnimationFPS // Convert FPS to ms
    
    const animate = () => {
      // Check if animation should stop
      if (!this.state.runningWinAnimations[animationKey]) {
        console.log(`Animation ${animationKey} stopped`)
        return
      }
      
      // Update sprite texture
      if (symbolSprite && !symbolSprite.destroyed && frames[currentFrame]) {
        symbolSprite.texture = frames[currentFrame]
      }
      
      currentFrame++
      
      // Handle animation looping
      if (currentFrame >= frames.length) {
        if (frames.length >= 37) {
          // Loop last 20 frames (frames 37-56) for continuous animation
          currentFrame = 37
        } else {
          // If less frames available, restart from beginning
          currentFrame = 0
        }
      }
      
      // Schedule next frame
      setTimeout(animate, frameInterval)
    }
    
    // Start animation
    animate()
  }

  // Fallback flash animation when atlas is not available
  private fallbackFlashAnimation(symbolSprite: Sprite): void {
    let flashCount = 0
    const flash = () => {
      if (flashCount >= 6) {
        symbolSprite.tint = 0xFFFFFF
        return
      }
      symbolSprite.tint = flashCount % 2 === 0 ? 0xFF0000 : 0xFFFFFF
      flashCount++
      setTimeout(flash, 150)
    }
    flash()
  }

  // Show payline highlights with cycling
  private showPaylineHighlights(winLines: WinLine[]): void {
    if (winLines.length === 0) return

    let currentLineIndex = 0
    
    const showNextLine = () => {
      // Clear previous highlights
      this.clearPaylineHighlights()
      
      const winLine = winLines[currentLineIndex]
      this.drawPaylineHighlight(winLine)
      
      // Move to next line
      currentLineIndex = (currentLineIndex + 1) % winLines.length
    }
    
    // Show first line immediately
    showNextLine()
    
    // Cycle through lines
    if (winLines.length > 1) {
      this.winCycleIntervalRef = setInterval(showNextLine, this.config.winCycleDuration)
    }
  }

  // Draw highlight for a specific payline
  private drawPaylineHighlight(winLine: WinLine): void {
    if (!winLine.positions) return

    const container = new Container()
    this.pixiRefs.winHighlightsRef.push(container)
    
    // Type guard for PIXI app
    const app = this.pixiRefs.app
    if (app && typeof app === 'object' && 'stage' in app) {
      ;(app as any).stage.addChild(container)
    }

    // Draw payline path
    this.drawPaylinePath(container, winLine)
    
    // Draw symbol highlights
    this.drawSymbolHighlights(container, winLine)
    
    // Draw win info
    this.drawWinInfo(container, winLine)
  }

  // Draw the payline path
  private drawPaylinePath(container: Container, winLine: WinLine): void {
    if (!winLine.positions) return

    const graphics = new Graphics()
    const color = this.assets.paylineColors[winLine.payline - 1] || 0xFFFF00
    
    graphics.lineStyle(4, color, 1)
    
    // Draw path through winning positions
    for (let i = 0; i < winLine.count; i++) {
      const [reelIndex, rowIndex] = winLine.positions[i]
      const x = this.getReelX(reelIndex)
      const y = this.getRowY(rowIndex)
      
      if (i === 0) {
        graphics.moveTo(x, y)
      } else {
        graphics.lineTo(x, y)
      }
    }
    
    container.addChild(graphics)
  }

  // Draw highlights around winning symbols
  private drawSymbolHighlights(container: Container, winLine: WinLine): void {
    if (!winLine.positions) return

    for (let i = 0; i < winLine.count; i++) {
      const [reelIndex, rowIndex] = winLine.positions[i]
      
      const highlight = new Graphics()
      highlight.lineStyle(3, 0xFFFFFF, 1)
      highlight.drawRoundedRect(
        this.getReelX(reelIndex) - 40,
        this.getRowY(rowIndex) - 40,
        80,
        80,
        10
      )
      
      container.addChild(highlight)
    }
  }

  // Draw win information text
  private drawWinInfo(container: Container, winLine: WinLine): void {
    const text = new Text(`${winLine.count}x ${winLine.symbol}\n$${winLine.payout.toFixed(2)}`, {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xFFFFFF,
      align: 'center'
    })
    
    text.anchor.set(0.5)
    // Type guard for screen access
    const app = this.pixiRefs.app
    if (app && typeof app === 'object' && 'screen' in app) {
      text.x = (app as any).screen.width / 2
    } else {
      text.x = 960 // Default fallback
    }
    text.y = 100
    
    container.addChild(text)
  }

  // Animate expanding wilds
  async animateExpandingWild(
    reelIndex: number,
    playSound: () => void
  ): Promise<void> {
    if (this.state.animationsRunning.has(reelIndex)) {
      console.log(`Wild expansion already running for reel ${reelIndex}`)
      return
    }

    const reel = this.pixiRefs.reelsRef[reelIndex]
    if (!reel) {
      console.error(`No reel found at index ${reelIndex}`)
      return
    }

    this.state.animationsRunning.add(reelIndex)
    this.state.isWinAnimating = true

    console.log(`Starting wild expansion animation for reel ${reelIndex}`)
    
    // Play sound
    playSound()

    // Get expansion frames
    const expandFrames: Texture[] = []
    for (let i = 0; i < 69; i++) {
      const frameNumber = i.toString().padStart(3, '0')
      const frameName = `expand_${frameNumber}.png`
      const texture = this.assets.expandAtlas.textures[frameName]
      if (texture && texture.source) {
        expandFrames.push(texture)
      }
    }

    if (expandFrames.length === 0) {
      console.error('No expansion frames found')
      this.state.animationsRunning.delete(reelIndex)
      return
    }

    // Find symbols to animate and create expansion sprites
    const symbolsToHide: Sprite[] = []
    const expandSprites: Sprite[] = []

    for (let i = 2; i < reel.children.length; i++) {
      const symbolSprite = reel.children[i] as Sprite
      
      if (symbolSprite && !symbolSprite.destroyed) {
        // Only animate non-wild symbols
        if (symbolSprite.texture !== this.assets.reelAtlas.textures['08.png']) {
          symbolsToHide.push(symbolSprite)
          
          // Create expansion sprite
          const expandSprite = new Sprite(expandFrames[0])
          expandSprite.anchor.set(0.5)
          expandSprite.x = symbolSprite.x
          expandSprite.y = symbolSprite.y
          expandSprite.width = symbolSprite.width
          expandSprite.height = symbolSprite.height
          
          reel.addChild(expandSprite)
          expandSprites.push(expandSprite)
          
          // Hide original symbol
          symbolSprite.visible = false
        }
      }
    }

    // Animate frames
    let currentFrame = 0
    const animationSpeed = 1000 / this.config.wildExpansionFPS

    const animateFrames = () => {
      // Check if animation should be cancelled
      if (!this.state.animationsRunning.has(reelIndex)) {
        // Clean up
        expandSprites.forEach(sprite => {
          if (sprite && !sprite.destroyed) {
            sprite.destroy()
          }
        })
        return
      }
      
      if (currentFrame < expandFrames.length) {
        // Update all expand sprites with current frame
        expandSprites.forEach(sprite => {
          if (sprite && !sprite.destroyed) {
            sprite.texture = expandFrames[currentFrame]
          }
        })
        currentFrame++
        setTimeout(animateFrames, animationSpeed)
      } else {
        // Animation complete - clean up
        expandSprites.forEach(sprite => {
          if (sprite && !sprite.destroyed) {
            sprite.destroy()
          }
        })
        
        // Convert symbols to wilds
        symbolsToHide.forEach(symbol => {
          if (symbol && !symbol.destroyed) {
            symbol.texture = this.assets.reelAtlas.textures['08.png'] // Convert to wild
            symbol.visible = true
          }
        })
        
        // Mark animation as complete
        this.state.animationsRunning.delete(reelIndex)
        
        console.log(`Wild expansion complete for reel ${reelIndex}`)
      }
    }

    animateFrames()
  }

  // Complete wild expansions instantly (for take win)
  completeWildExpansions(expandedReels: number[]): void {
    console.log('Completing wild expansions instantly for reels:', expandedReels)
    
    expandedReels.forEach(reelIndex => {
      this.state.animationsRunning.delete(reelIndex)
      
      const reel = this.pixiRefs.reelsRef[reelIndex]
      if (!reel) return
      
      // Convert all symbols to wilds
      for (let i = 2; i < reel.children.length; i++) {
        const symbolSprite = reel.children[i] as Sprite
        if (symbolSprite && !symbolSprite.destroyed) {
          symbolSprite.texture = this.assets.reelAtlas.textures['08.png']
          symbolSprite.visible = true
        }
      }
    })
    
    this.state.takeWinActive = true
  }

  // Stop all win animations
  stopAllAnimations(): void {
    console.log('Stopping all win animations')
    
    // Clear running symbol animations
    this.state.runningWinAnimations = {}
    
    // Clear wild expansions
    this.state.animationsRunning.clear()
    
    // Clear intervals
    if (this.winAnimationRef) {
      clearInterval(this.winAnimationRef)
      this.winAnimationRef = null
    }
    
    if (this.winCycleIntervalRef) {
      clearInterval(this.winCycleIntervalRef)
      this.winCycleIntervalRef = null
    }
    
    if (this.wildExpansionTimeoutRef) {
      clearTimeout(this.wildExpansionTimeoutRef)
      this.wildExpansionTimeoutRef = null
    }
    
    // Clear highlights
    this.clearWinHighlights()
    
    this.state.isWinAnimating = false
    this.state.takeWinActive = false
  }

  // Clear win highlights
  clearWinHighlights(): void {
    this.clearPaylineHighlights()
    
    // Clear cycling interval
    if (this.winCycleIntervalRef) {
      clearInterval(this.winCycleIntervalRef)
      this.winCycleIntervalRef = null
    }
  }

  // Clear payline highlights
  private clearPaylineHighlights(): void {
    this.pixiRefs.winHighlightsRef.forEach(container => {
      if (container && !container.destroyed) {
        const app = this.pixiRefs.app
        if (app && typeof app === 'object' && 'stage' in app) {
          ;(app as any).stage.removeChild(container)
        }
        container.destroy({ children: true })
      }
    })
    this.pixiRefs.winHighlightsRef.length = 0
  }

  // Helper functions
  private getSymbolNumber(symbolName: string): string {
    const symbolMap: { [key: string]: string } = {
      'Cherry': '00',
      'Lemon': '01',
      'Orange': '02',
      'Plum': '03',
      'Bell': '04',
      'Grape': '05',
      'Grapes': '05',
      'Watermelon': '06',
      'Seven': '07',
      'Wild': '08',
      'Star': '09',
      'Crown': '10'
    }
    return symbolMap[symbolName] || '00'
  }

  private getReelX(reelIndex: number): number {
    // This should be customizable based on your game layout
    return 200 + (reelIndex * 150)
  }

  private getRowY(rowIndex: number): number {
    // This should be customizable based on your game layout
    return 300 + (rowIndex * 100)
  }

  // Getters for state
  get isAnimating(): boolean {
    return this.state.isWinAnimating
  }

  get hasRunningAnimations(): boolean {
    return this.state.animationsRunning.size > 0
  }

  get takeWinActive(): boolean {
    return this.state.takeWinActive
  }

  // Cleanup
  destroy(): void {
    this.stopAllAnimations()
  }
}

// Default configuration
export const DEFAULT_WIN_ANIMATION_CONFIG: WinAnimationConfig = {
  symbolAnimationFPS: 12.5, // 80ms per frame
  wildExpansionFPS: 30, // ~33ms per frame
  winCycleDuration: 1500, // 1.5 seconds
  winCountDuration: 2500, // 2.5 seconds
  winAnimationSteps: 50,
  enableWinAnimations: true,
  autoCollectDelay: 10000 // 10 seconds
}

// Payline colors
export const DEFAULT_PAYLINE_COLORS = [
  0xFF0000, // Red
  0x00FF00, // Green
  0x0000FF, // Blue
  0xFFFF00, // Yellow
  0xFF00FF, // Magenta
  0x00FFFF, // Cyan
  0xFFA500, // Orange
  0x800080, // Purple
  0xFFC0CB, // Pink
  0x008000  // Dark Green
]