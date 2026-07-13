import { useCallback, useRef } from 'react'
import { Application, Container, Sprite, Graphics, Text, Assets } from 'pixi.js'
import { SYMBOL_WIDTH, SYMBOL_HEIGHT, PAYLINE_COLORS, PAYLINES_VISUAL, SYMBOL_NAME_TO_NUMBER, REEL_GAP, REEL_OFFSET_X, REEL_OFFSET_Y } from '../../config/pixiConstants'
import { formatCurrency } from '../../utils/currency'
import { getWinConfig, getAnimationSpeed, formatWinType, getWinColor, startWinSoundSequence } from '../../utils/winSystem'
import { getSound, playWildExpandSound } from '../../utils/gameSounds'

// Define the interface for props this hook needs
export interface UseWinAnimationsProps {
  // PIXI refs
  appRef: React.RefObject<Application | null>
  reelsRef: React.RefObject<(Container | null)[]>

  // State refs
  animationsRunningRef: React.RefObject<Set<number>>
  pendingWinRef: React.RefObject<number>
  pendingWinLinesRef: React.RefObject<WinLine[] | null>
  currentBetRef: React.RefObject<number>
  isGambleModeRef: React.RefObject<boolean>
  isWinAnimatingRef: React.RefObject<boolean>
  takeWinActiveRef: React.RefObject<boolean>
  winHighlightsRef: React.RefObject<Container[]>
  winCycleIntervalRef: React.RefObject<NodeJS.Timeout | null>

  // Function refs
  animateWinRef: React.RefObject<((amount: number) => void) | null>

  // Current state values
  isGambleMode: boolean
}

export interface WinAnimationsReturn {
  showWinHighlights: (winLines: WinLine[]) => void
  clearWinHighlights: () => void
  animateExpandingWild: (wildSymbol: Sprite, reelIndex: number) => void
  completeWildExpansions: () => void
  checkAndAnimateWilds: (winResults: WinResults) => void
}

// Type definitions
export interface WinLine {
  payline: number
  symbols: string[]
  count: number
  symbol: string
  payout: number
}

export interface WinResults {
  results: { reel: number, position: number, symbols: string[] }[]
  totalWin: number
  winLines: WinLine[]
  expandedReels: number[]
  balance: number
}

interface WinningPosition {
  reelIndex: number
  rowIndex: number
  symbolName: string
}

/**
 * Hook that handles win animations, payline highlighting, and wild expansions
 * Manages all visual feedback for winning spins
 */
export function useWinAnimations(props: UseWinAnimationsProps): WinAnimationsReturn {
  const {
    appRef,
    reelsRef,
    animationsRunningRef,
    pendingWinRef,
    pendingWinLinesRef,
    currentBetRef,
    isGambleModeRef,
    isWinAnimatingRef,
    takeWinActiveRef,
    winHighlightsRef,
    winCycleIntervalRef,
    animateWinRef,
    isGambleMode
  } = props

  // Track running win animations to stop them on new spins
  const runningWinAnimations = useRef<{ [key: string]: boolean }>({})

  /**
   * Find the scene-owned win line display container (labeled 'winLineDisplay'),
   * creating it at the live position below the reels if the scene lacks one.
   */
  const getWinLineDisplayContainer = useCallback((app: Application): Container => {
    let container = app.stage.children.find(
      child => (child as Container).label === 'winLineDisplay'
    ) as Container | undefined

    if (!container) {
      container = new Container()
      container.label = 'winLineDisplay'
      container.x = 1920 / 2
      container.y = REEL_OFFSET_Y + (3 * SYMBOL_HEIGHT) + 20
      container.visible = false
      app.stage.addChild(container)
    }
    return container
  }, [])

  /**
   * Clear all win highlights and animations
   */
  const clearWinHighlights = useCallback(() => {
    // Clear cycling interval if it exists
    if (winCycleIntervalRef.current) {
      clearInterval(winCycleIntervalRef.current)
      winCycleIntervalRef.current = null
    }

    // Clear all highlight containers
    winHighlightsRef.current.forEach(highlight => {
      if (highlight && !highlight.destroyed && appRef.current) {
        if (appRef.current.stage.children.includes(highlight)) {
          appRef.current.stage.removeChild(highlight)
        }
        highlight.destroy()
      }
    })
    winHighlightsRef.current = []

    // Hide win line display
    if (appRef.current) {
      const winLineDisplayContainer = appRef.current.stage.children.find(
        child => (child as Container).label === 'winLineDisplay'
      ) as Container | undefined
      if (winLineDisplayContainer) {
        winLineDisplayContainer.visible = false
      }
    }

    // Stop all running win animations
    Object.keys(runningWinAnimations.current).forEach(key => {
      delete runningWinAnimations.current[key]
    })
  }, [appRef, winHighlightsRef, winCycleIntervalRef])

  /**
   * Animate winning symbols with frame-by-frame animation
   * Shows 57-frame animation sequence, then loops last 20 frames
   */
  const animateWinningSymbols = useCallback(async (
    winningPositions: WinningPosition[],
    customSpeed?: number
  ) => {
    if (winningPositions.length === 0) {
      return
    }

    const reelAtlas = Assets.cache.get('/assets/reelImages.json')
    if (!reelAtlas) {
      console.error('Reel atlas not found')
      return
    }

    // Get win animation atlases
    const winAtlases: { [key: string]: { textures: { [key: string]: import('pixi.js').Texture } } } = {
      '00': Assets.cache.get('/assets/00-0.json'),
      '01': Assets.cache.get('/assets/01-0.json'),
      '02': Assets.cache.get('/assets/02-0.json'),
      '03': Assets.cache.get('/assets/03-0.json'),
      '04': Assets.cache.get('/assets/04-0.json'),
      '05': Assets.cache.get('/assets/05-0.json'),
      '06': Assets.cache.get('/assets/06-0.json'),
      '07': Assets.cache.get('/assets/07-0.json'),
      '08': Assets.cache.get('/assets/08-0.json'),
      '09': Assets.cache.get('/assets/09-0.json'),
      '10': Assets.cache.get('/assets/10-0.json')
    }

    winningPositions.forEach(({ reelIndex, rowIndex, symbolName }) => {
      const animationKey = `${reelIndex}-${rowIndex}`
      runningWinAnimations.current[animationKey] = true

      const reel = reelsRef.current[reelIndex]
      if (!reel) {
        delete runningWinAnimations.current[animationKey]
        return
      }

      // Get the symbol at this position (skip mask at 0 and overshoot at 1)
      const symbolSprite = reel.children[rowIndex + 2] as Sprite
      if (!symbolSprite) {
        return
      }

      // Convert symbol name to number
      const cleanSymbolName = symbolName.replace('.png', '')
      const symbolNumber = SYMBOL_NAME_TO_NUMBER[cleanSymbolName] || cleanSymbolName

      const winAtlas = winAtlases[symbolNumber]

      if (!winAtlas?.textures) {
        console.warn(`No animation atlas for symbol ${symbolNumber}, using fallback flash`)
        // Fallback to flashing
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
        return
      }

      // Create animation frames array (57 frames for complete animation)
      const winFrames: import('pixi.js').Texture[] = []
      for (let i = 0; i < 57; i++) {
        const frameNumber = i.toString().padStart(3, '0')
        const frameName = `${symbolNumber}_${frameNumber}.png`
        const texture = winAtlas.textures[frameName]
        if (texture && texture.source) {
          winFrames.push(texture)
        }
      }

      if (winFrames.length === 0) {
        console.warn(`No animation frames found for symbol ${symbolNumber}`)
        return
      }

      // Hide the original symbol
      symbolSprite.visible = false

      // Create win animation sprite
      const firstFrame = winFrames[0]
      if (!firstFrame || !firstFrame.source) {
        console.error(`Invalid first frame for ${symbolNumber} animation`)
        return
      }

      const winAnimSprite = new Sprite(firstFrame)
      winAnimSprite.width = SYMBOL_WIDTH
      winAnimSprite.height = SYMBOL_HEIGHT
      winAnimSprite.x = 0
      winAnimSprite.y = rowIndex * SYMBOL_HEIGHT

      reel.addChild(winAnimSprite)

      // Animate through frames
      let currentFrame = 0
      const animationSpeed = customSpeed || 80 // 80ms per frame (~12.5 FPS)
      let isLooping = false
      const loopStartFrame = Math.max(0, winFrames.length - 20) // Last 20 frames for loop

      const animateFrames = () => {
        // Check if animation should continue
        if (!runningWinAnimations.current[animationKey]) {
          // Animation was stopped - clean up
          if (winAnimSprite && !winAnimSprite.destroyed) {
            winAnimSprite.destroy()
          }
          if (symbolSprite && !symbolSprite.destroyed) {
            symbolSprite.visible = true
          }
          return
        }

        if (currentFrame < winFrames.length) {
          const frameTexture = winFrames[currentFrame]
          if (frameTexture && frameTexture.source && !winAnimSprite.destroyed) {
            winAnimSprite.texture = frameTexture
          }
          currentFrame++
          setTimeout(animateFrames, animationSpeed)
        } else if (!isLooping) {
          // Animation complete - start looping the last 20 frames
          isLooping = true
          currentFrame = loopStartFrame
          setTimeout(animateFrames, animationSpeed)
        } else {
          // Loop through last 20 frames
          if (currentFrame >= 0 && currentFrame < winFrames.length) {
            const frameTexture = winFrames[currentFrame]
            if (frameTexture && frameTexture.source && !winAnimSprite.destroyed) {
              winAnimSprite.texture = frameTexture
            }
          }
          currentFrame++
          if (currentFrame >= winFrames.length) {
            currentFrame = loopStartFrame // Reset to start of loop
          }
          setTimeout(animateFrames, animationSpeed)
        }
      }

      // Start the animation
      animateFrames()
    })
  }, [reelsRef])

  /**
   * Animate expanding wild - 69-frame expansion animation
   * Converts non-wild symbols to wilds with dramatic animation
   */
  const animateExpandingWild = useCallback((wildSymbol: Sprite, reelIndex: number) => {
    // Check if animation is already running for this reel
    if (animationsRunningRef.current.has(reelIndex)) {
      return
    }

    // Mark animation as running for this reel
    animationsRunningRef.current.add(reelIndex)

    const expandAtlas = Assets.cache.get('/assets/expand-0.json')
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')

    if (!expandAtlas || !reelAtlas) {
      console.error('Required atlases not found for wild expansion')
      animationsRunningRef.current.delete(reelIndex)
      return
    }

    // Create expand animation frames array (69 frames)
    const expandFrames: import('pixi.js').Texture[] = []
    for (let i = 0; i < 69; i++) {
      const frameNumber = i.toString().padStart(3, '0')
      const frameName = `expand_${frameNumber}.png`
      if (expandAtlas.textures[frameName]) {
        expandFrames.push(expandAtlas.textures[frameName])
      }
    }

    if (expandFrames.length === 0) {
      console.error('No expand frames found')
      animationsRunningRef.current.delete(reelIndex)
      return
    }

    const reel = wildSymbol.parent

    // Check if reel still exists
    if (!reel) {
      animationsRunningRef.current.delete(reelIndex)
      return
    }

    // Get all symbols in this reel (skip mask at 0 and overshoot at 1)
    const reelSymbols: Sprite[] = []
    for (let i = 2; i < reel.children.length; i++) {
      reelSymbols.push(reel.children[i] as Sprite)
    }

    // Create expanding wild sprites only for non-wild symbols
    const expandSprites: Sprite[] = []
    const symbolsToHide: Sprite[] = []

    reelSymbols.forEach((symbol, pos) => {
      // Only animate expansion on symbols that aren't already wild
      if (symbol.texture !== reelAtlas.textures['08.png']) {
        // Hide the original symbol
        symbol.visible = false
        symbolsToHide.push(symbol)

        // Create expand animation sprite for this position
        const expandSprite = new Sprite(expandFrames[0])
        expandSprite.width = SYMBOL_WIDTH
        expandSprite.height = SYMBOL_HEIGHT
        expandSprite.x = 0 // Relative to reel container
        expandSprite.y = pos * SYMBOL_HEIGHT // Position for each row

        reel.addChild(expandSprite)
        expandSprites.push(expandSprite)
      }
    })

    // If no symbols need expansion, exit early
    // (matches live behavior: the reel index stays in animationsRunningRef)
    if (expandSprites.length === 0) {
      return
    }

    // Animate through frames at half speed
    let currentFrame = 0
    const frameRate = 30 // 30 FPS (half of 60 FPS)
    const animationSpeed = 1000 / frameRate // ~33.33ms per frame

    const animateFrames = () => {
      // Check if animation should continue (not interrupted by new spin or take win)
      if (!animationsRunningRef.current.has(reelIndex)) {
        // Animation was cancelled - clean up expansion sprites
        expandSprites.forEach(sprite => {
          if (sprite && !sprite.destroyed) {
            sprite.destroy()
          }
        })

        // Only restore original symbols if this is NOT a take win cancellation
        // (take win should have already converted symbols to wilds)
        if (!takeWinActiveRef.current) {
          // Restore visibility of original symbols that were hidden (for new spin cancellation)
          symbolsToHide.forEach(symbol => {
            if (symbol && !symbol.destroyed) {
              symbol.visible = true
            }
          })
        }
        return
      }

      if (currentFrame < expandFrames.length) {
        // Update all expand sprites with current frame (with null checks)
        expandSprites.forEach(sprite => {
          if (sprite && !sprite.destroyed && sprite.texture) {
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

        // Show symbols again but replace expanded ones with wilds (with null checks)
        symbolsToHide.forEach(symbol => {
          if (symbol && !symbol.destroyed && reelAtlas.textures['08.png']) {
            symbol.texture = reelAtlas.textures['08.png'] // Convert to wild
            symbol.visible = true
          }
        })

        // Mark animation as complete
        animationsRunningRef.current.delete(reelIndex)

        // Check if all expanding wild animations are complete
        if (animationsRunningRef.current.size === 0) {
          // Note: Don't reset isWinAnimatingRef here as win counting might still be running

          // Trigger win sound sequence now that wild expansions are complete
          // But only if not in gamble mode
          const sound = getSound()
          if (pendingWinRef.current > 0 && sound && !isGambleModeRef.current) {
            const totalWinAmount = pendingWinRef.current
            const winLines = pendingWinLinesRef.current || []
            startWinSoundSequence(
              totalWinAmount,
              currentBetRef.current,
              winLines,
              sound,
              true, // hasWildExpansion = true
              isGambleMode
            )
          }
        }
      }
    }

    // Start the animation
    animateFrames()
  }, [animationsRunningRef, takeWinActiveRef, pendingWinRef, pendingWinLinesRef, currentBetRef, isGambleModeRef, isGambleMode])

  /**
   * Instantly complete wild expansions (for take win feature)
   * Skips animation and immediately converts symbols to wilds
   */
  const completeWildExpansions = useCallback(() => {
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')
    if (!reelAtlas) return

    // Get all reels that have running wild animations
    const expandingReels = Array.from(animationsRunningRef.current)

    expandingReels.forEach(reelIndex => {
      const reel = reelsRef.current[reelIndex]
      if (!reel) return

      // Get all symbols in this reel (skip mask at 0 and overshoot at 1)
      const reelSymbols: Sprite[] = []
      for (let i = 2; i < reel.children.length; i++) {
        reelSymbols.push(reel.children[i] as Sprite)
      }

      // Find and clean up any existing expand animation sprites
      const spritesToRemove: Sprite[] = []
      for (let i = reel.children.length - 1; i >= 5; i--) { // Beyond base 5 (mask + overshoot + 3 symbols)
        const child = reel.children[i] as Sprite
        if (child) {
          spritesToRemove.push(child)
        }
      }

      // Remove animation sprites
      spritesToRemove.forEach(sprite => {
        if (sprite && !sprite.destroyed) {
          reel.removeChild(sprite)
          sprite.destroy()
        }
      })

      // Convert non-wild symbols to wilds and make them visible
      reelSymbols.forEach(symbol => {
        if (symbol && !symbol.destroyed) {
          if (symbol.texture !== reelAtlas.textures['08.png']) {
            // Convert to wild
            symbol.texture = reelAtlas.textures['08.png']
          }
          symbol.visible = true // Ensure symbol is visible
        }
      })
    })

    // Clear all expanding animations after completion
    animationsRunningRef.current.clear()
  }, [animationsRunningRef, reelsRef])

  /**
   * Check for wild symbols and animate their expansion
   * Called by spin logic when server indicates wilds should expand
   */
  const checkAndAnimateWilds = useCallback((winResults: WinResults) => {
    if (!winResults || !winResults.expandedReels || winResults.expandedReels.length === 0) {
      return
    }

    // Mark that win animations are active (expanding wilds are slow animations)
    isWinAnimatingRef.current = true

    // Play wild expansion sound once for all expanding reels
    if (winResults.expandedReels.length > 0) {
      playWildExpandSound()
    }

    // Animate expanding wilds for all reels that the server determined should expand
    winResults.expandedReels.forEach(reelIndex => {
      const reel = reelsRef.current[reelIndex]
      if (reel && reel.children[2]) { // Get first symbol (skip mask and overshoot)
        animateExpandingWild(reel.children[2] as Sprite, reelIndex)
      }
    })
  }, [reelsRef, animateExpandingWild, isWinAnimatingRef])

  /**
   * Show win line display (e.g., "Line 3 3x [cherry icon] = 1.00 MKD")
   * Creates a text display showing the current winning payline
   */
  const showWinLineDisplay = useCallback((
    winLine: WinLine,
    winLineDisplayContainer: Container
  ) => {
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')
    if (!reelAtlas) return

    // Clear existing content
    winLineDisplayContainer.removeChildren()

    // Create container for the single line display
    const lineContainer = new Container()

    // Get win type information for this specific line
    const lineWinConfig = getWinConfig(winLine.payout, currentBetRef.current, [winLine])
    const winTypeColor = getWinColor(lineWinConfig.type)
    const winTypeText = formatWinType(lineWinConfig.type)

    let currentX = 0

    // Win type and line information
    const lineText = new Text({
      text: `${winTypeText} - Line ${winLine.payline} ${winLine.count}x`,
      style: {
        fontFamily: 'Arial',
        fontSize: 18,
        fill: winTypeColor,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 1 }
      }
    })
    lineText.x = currentX
    lineText.y = 0
    lineContainer.addChild(lineText)
    currentX += lineText.width + 10 // 10px spacing

    // Symbol icon - convert to reelImages.json format (sXX.png)
    let symbolTexture = null

    // Convert symbol name to number format used in reelImages.json
    const cleanSymbolName = winLine.symbol.replace('.png', '')
    const symbolNumber = SYMBOL_NAME_TO_NUMBER[cleanSymbolName] || cleanSymbolName
    const reelImageSymbolName = `s${symbolNumber}.png`

    // Try to find the symbol in reelImages.json format
    if (reelAtlas.textures[reelImageSymbolName]) {
      symbolTexture = reelAtlas.textures[reelImageSymbolName]
    }

    if (symbolTexture) {
      const symbolIcon = new Sprite(symbolTexture)
      symbolIcon.width = 24 // Small icon size
      symbolIcon.height = 24
      symbolIcon.x = currentX
      symbolIcon.y = -2 // Slight vertical adjustment to align with text
      lineContainer.addChild(symbolIcon)
      currentX += 30 // Icon width + spacing
    } else {
      // Add spacing even if no icon to maintain layout
      currentX += 10
    }

    // Payout text with win type color
    const payoutText = new Text({
      text: `= ${formatCurrency(winLine.payout)}`,
      style: {
        fontFamily: 'Arial',
        fontSize: 18,
        fill: winTypeColor,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 1 }
      }
    })
    payoutText.x = currentX
    payoutText.y = 0
    lineContainer.addChild(payoutText)

    // Center the entire line container
    lineContainer.x = -(lineContainer.width / 2)
    lineContainer.y = 0

    winLineDisplayContainer.addChild(lineContainer)
    winLineDisplayContainer.visible = true
  }, [currentBetRef])

  /**
   * Show win highlights with cycling through paylines
   * Main entry point for displaying win animations
   */
  const showWinHighlights = useCallback((winLines: WinLine[]) => {
    clearWinHighlights()

    if (winLines.length === 0) {
      return
    }

    const app = appRef.current
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')

    if (!app || !reelAtlas) {
      console.error('Required refs not available for win highlights')
      return
    }

    const winLineDisplayContainer = getWinLineDisplayContainer(app)

    // Classify the win and get appropriate configuration
    const totalWinAmount = pendingWinRef.current
    const winConfig = getWinConfig(totalWinAmount, currentBetRef.current, winLines)

    // Trigger win sound sequence immediately if no wild expansions are happening
    const sound = getSound()
    const hasWildExpansions = animationsRunningRef.current.size > 0
    if (!hasWildExpansions && sound) {
      startWinSoundSequence(
        totalWinAmount,
        currentBetRef.current,
        winLines,
        sound,
        false, // hasWildExpansion = false
        isGambleMode
      )
    }

    // Start win count-up animation synchronized with payline animations
    // But only if gamble mode is not active
    if (pendingWinRef.current > 0 && animateWinRef.current && !isGambleMode) {
      animateWinRef.current(pendingWinRef.current)
    }

    // First, collect all winning symbol positions from all winning lines
    const winningPositions: WinningPosition[] = []
    winLines.forEach(winLine => {
      const paylineIndex = winLine.payline - 1 // Convert to 0-based
      const positions = PAYLINES_VISUAL[paylineIndex]

      if (positions) {
        // Only animate the winning symbols (based on count)
        for (let i = 0; i < Math.min(winLine.count, positions.length); i++) {
          const [reelIndex, rowIndex] = positions[i]

          // Check what symbol is actually displayed on the reel (might be Wild after expansion)
          const reel = reelsRef.current[reelIndex]
          const symbolSprite = reel?.children[rowIndex + 2] as Sprite // Skip mask and overshoot
          let actualSymbolName = winLine.symbol // Default to base symbol

          // Check if this position shows a wild symbol
          if (symbolSprite && symbolSprite.texture === reelAtlas.textures['08.png']) {
            actualSymbolName = 'Wild'
          }

          winningPositions.push({ reelIndex, rowIndex, symbolName: `${actualSymbolName}.png` })
        }
      }
    })

    // Enable win animations
    const ENABLE_WIN_ANIMATIONS = true

    if (ENABLE_WIN_ANIMATIONS && winningPositions.length > 0) {
      // Start animations with win-type-specific speed
      const animationSpeed = getAnimationSpeed(winConfig.type)

      animateWinningSymbols(winningPositions, animationSpeed).then(() => {
        // Animation started successfully
      }).catch(error => {
        console.error('Win animation error:', error)
      })
    }

    // Show payline highlights (cycling through each winning line)
    let currentWinIndex = 0

    const showCurrentWin = () => {
      // Clear previous highlights
      winHighlightsRef.current.forEach(highlight => {
        if (highlight && !highlight.destroyed && app) {
          if (app.stage.children.includes(highlight)) {
            app.stage.removeChild(highlight)
          }
          highlight.destroy()
        }
      })
      winHighlightsRef.current = []

      const winLine = winLines[currentWinIndex]
      const paylineIndex = winLine.payline - 1 // Convert to 0-based
      const color = PAYLINE_COLORS[paylineIndex] || 0xFFFFFF
      const positions = PAYLINES_VISUAL[paylineIndex]

      if (!positions) return

      // Show win line display
      showWinLineDisplay(winLine, winLineDisplayContainer)

      // Create highlight container
      const highlightContainer = new Container()

      // Calculate center points for complete payline (all 5 positions)
      const pathPoints: { x: number, y: number }[] = []
      for (let i = 0; i < positions.length; i++) {
        const [reelIndex, rowIndex] = positions[i]
        const centerX = reelIndex * (SYMBOL_WIDTH + REEL_GAP) + SYMBOL_WIDTH / 2
        const centerY = rowIndex * SYMBOL_HEIGHT + SYMBOL_HEIGHT / 2
        pathPoints.push({ x: centerX, y: centerY })
      }

      const lineWidth = 8
      const borderRadius = lineWidth

      // Draw complete payline path
      const paylinePath = new Graphics()
      if (pathPoints.length > 1) {
        for (let i = 0; i < pathPoints.length - 1; i++) {
          const startCenter = pathPoints[i]
          const endCenter = pathPoints[i + 1]

          // Calculate the vector from start to end
          const dx = endCenter.x - startCenter.x
          const dy = endCenter.y - startCenter.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > 0) {
            // Normalize the direction vector
            const dirX = dx / distance
            const dirY = dy / distance

            // Calculate the distance from center to edge of rectangle
            const halfWidth = SYMBOL_WIDTH / 2
            const halfHeight = SYMBOL_HEIGHT / 2

            // Calculate how far to move from center to reach rectangle edge
            let edgeDistance
            if (Math.abs(dirX) === 0) {
              // Vertical line
              edgeDistance = halfHeight
            } else if (Math.abs(dirY) === 0) {
              // Horizontal line
              edgeDistance = halfWidth
            } else {
              // Diagonal line - find intersection with rectangle boundary
              const tX = halfWidth / Math.abs(dirX)
              const tY = halfHeight / Math.abs(dirY)
              edgeDistance = Math.min(tX, tY)
            }

            // Determine start and end points based on winning status
            const startIsWinning = i < winLine.count
            const endIsWinning = i + 1 < winLine.count

            let startPoint, endPoint

            if (startIsWinning && endIsWinning) {
              // Both positions are winning - hide line inside both squares
              startPoint = {
                x: startCenter.x + dirX * edgeDistance,
                y: startCenter.y + dirY * edgeDistance
              }
              endPoint = {
                x: endCenter.x - dirX * edgeDistance,
                y: endCenter.y - dirY * edgeDistance
              }
            } else if (startIsWinning && !endIsWinning) {
              // Start is winning, end is not - start from edge of winning symbol
              startPoint = {
                x: startCenter.x + dirX * edgeDistance,
                y: startCenter.y + dirY * edgeDistance
              }
              endPoint = { x: endCenter.x, y: endCenter.y }
            } else if (!startIsWinning && endIsWinning) {
              // Start is not winning, end is winning - end at edge
              startPoint = { x: startCenter.x, y: startCenter.y }
              endPoint = {
                x: endCenter.x - dirX * edgeDistance,
                y: endCenter.y - dirY * edgeDistance
              }
            } else {
              // Neither position is winning - draw center to center
              startPoint = { x: startCenter.x, y: startCenter.y }
              endPoint = { x: endCenter.x, y: endCenter.y }
            }

            paylinePath.moveTo(startPoint.x, startPoint.y)
            paylinePath.lineTo(endPoint.x, endPoint.y)
          }
        }

        // Add final segment from last symbol center to its right edge
        // Only if the last symbol doesn't have a highlight box (isn't a winning symbol)
        if (pathPoints.length > 0) {
          const lastPoint = pathPoints[pathPoints.length - 1]
          const lastSymbolIsWinning = pathPoints.length <= winLine.count

          // Only draw the final segment if the last symbol is NOT winning (no highlight box)
          if (!lastSymbolIsWinning) {
            // Calculate right edge of the last symbol
            const rightEdgeX = lastPoint.x + SYMBOL_WIDTH / 2

            // Draw from center to right edge of last symbol
            paylinePath.moveTo(lastPoint.x, lastPoint.y)
            paylinePath.lineTo(rightEdgeX, lastPoint.y)
          }
        }
      }

      // Apply styling to payline path
      paylinePath.stroke({ width: lineWidth, color: color, alpha: 1.0 })
      highlightContainer.addChild(paylinePath)

      // Create highlight boxes for winning symbols only (drawn on top)
      for (let i = 0; i < Math.min(winLine.count, positions.length); i++) {
        const [reelIndex, rowIndex] = positions[i]

        const highlight = new Graphics()
        highlight.roundRect(0, 0, SYMBOL_WIDTH, SYMBOL_HEIGHT, borderRadius)
        highlight.stroke({ width: lineWidth, color: color })

        // Position relative to reel container
        highlight.x = reelIndex * (SYMBOL_WIDTH + REEL_GAP)
        highlight.y = rowIndex * SYMBOL_HEIGHT

        highlightContainer.addChild(highlight)
      }

      // Add to stage at correct z-index position (above border, below overlays)
      const borderChild = app.stage.children.find(child =>
        child instanceof Sprite && child.texture?.label?.includes('reelBorder')
      )
      const borderIndex = borderChild ? app.stage.children.indexOf(borderChild) : -1
      const insertIndex = borderIndex !== -1 ? borderIndex + 1 : app.stage.children.length - 1

      app.stage.addChildAt(highlightContainer, insertIndex)

      // Position the highlight container over the reels
      highlightContainer.x = REEL_OFFSET_X
      highlightContainer.y = REEL_OFFSET_Y

      winHighlightsRef.current.push(highlightContainer)
    }

    // Show first win immediately
    showCurrentWin()

    // If multiple wins, cycle through them continuously
    if (winLines.length > 1) {
      winCycleIntervalRef.current = setInterval(() => {
        currentWinIndex = (currentWinIndex + 1) % winLines.length
        showCurrentWin()
      }, 1500) // Change every 1.5 seconds, cycle forever
    }
    // Single win stays visible (no timeout)
  }, [
    appRef,
    reelsRef,
    pendingWinRef,
    currentBetRef,
    winHighlightsRef,
    winCycleIntervalRef,
    animateWinRef,
    animationsRunningRef,
    isGambleMode,
    clearWinHighlights,
    animateWinningSymbols,
    showWinLineDisplay,
    getWinLineDisplayContainer
  ])

  return {
    showWinHighlights,
    clearWinHighlights,
    animateExpandingWild,
    completeWildExpansions,
    checkAndAnimateWilds
  }
}
