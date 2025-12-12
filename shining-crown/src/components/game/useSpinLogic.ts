import { useCallback, useRef } from 'react'
import { Application, Container, Sprite, Assets } from 'pixi.js'
import { SYMBOL_WIDTH, SYMBOL_HEIGHT, REEL_COUNT, SYMBOLS_PER_REEL } from './usePixiSetup'

// Define the interface for props this hook needs
export interface UseSpinLogicProps {
  // PIXI refs
  appRef: React.RefObject<Application | null>
  reelsRef: React.RefObject<(Container | null)[]>

  // State refs
  isSpinningRef: React.RefObject<boolean>
  stopRequestedRef: React.RefObject<boolean>
  reelsStoppedRef: React.RefObject<boolean[]>
  reelsStoppedCountRef: React.RefObject<number>
  simultaneousStopRef: React.RefObject<boolean>
  pendingWinRef: React.RefObject<number>
  pendingWinLinesRef: React.RefObject<any[] | null>
  currentBetRef: React.RefObject<number>
  lastWinRef: React.RefObject<number>
  autoStartTimeoutRef: React.RefObject<NodeJS.Timeout | null>
  animationsRunningRef: React.RefObject<Set<number>>
  isAutoStartRef: React.RefObject<boolean>
  isGambleModeRef: React.RefObject<boolean>
  isWinAnimatingRef: React.RefObject<boolean>
  wildExpansionTimeoutRef: React.RefObject<NodeJS.Timeout | null>

  // State setters
  setLastWin: (amount: number) => void
  setPendingWin: (amount: number) => void
  setAnimatedWinAmount: (amount: number) => void

  // Callback functions
  refreshBalance: () => void
  flashInsufficientFunds: () => void
  clearWinHighlights: () => void

  // Function refs
  collectWinRef: React.RefObject<(() => void) | null>
  uiUpdateRef: React.RefObject<((balance: number, bet: number, win: number) => void) | null>
  playReelStopSoundRef: React.RefObject<(() => void) | null>
  playWildReelSoundRef: React.RefObject<(() => void) | null>
  playWildExpandSoundRef: React.RefObject<(() => void) | null>
  showWinHighlightsRef: React.RefObject<((winLines: any[]) => void) | null>
  checkAndAnimateWildsRef: React.RefObject<((winResults: any) => void) | null>
  reelHasWildRef: React.RefObject<((reelIndex: number) => boolean) | null>
}

export interface SpinLogicReturn {
  spinReels: () => Promise<void>
}

/**
 * Hook that handles the main spin logic for the slot game
 * Manages reel spinning animations, server communication, and result handling
 */
export function useSpinLogic(props: UseSpinLogicProps): SpinLogicReturn {
  const {
    appRef,
    reelsRef,
    isSpinningRef,
    stopRequestedRef,
    reelsStoppedRef,
    reelsStoppedCountRef,
    simultaneousStopRef,
    pendingWinRef,
    pendingWinLinesRef,
    currentBetRef,
    lastWinRef,
    autoStartTimeoutRef,
    animationsRunningRef,
    isAutoStartRef,
    isGambleModeRef,
    isWinAnimatingRef,
    wildExpansionTimeoutRef,
    setLastWin,
    setPendingWin,
    setAnimatedWinAmount,
    refreshBalance,
    flashInsufficientFunds,
    clearWinHighlights,
    collectWinRef,
    uiUpdateRef,
    playReelStopSoundRef,
    playWildReelSoundRef,
    playWildExpandSoundRef,
    showWinHighlightsRef,
    checkAndAnimateWildsRef,
    reelHasWildRef
  } = props

  // Store ticker functions for cleanup
  const tickerFunctionsRef = useRef<Map<number, (ticker: any) => void>>(new Map())

  /**
   * Main spin function - handles the entire spin cycle
   * 1. Validates state and collects pending wins
   * 2. Calls server API for spin results
   * 3. Animates reel spinning with frame-perfect timing
   * 4. Stops reels with bounce animation
   * 5. Triggers win animations and wild expansions
   */
  const spinReels = useCallback(async () => {
    if (isSpinningRef.current) return

    // Clear any pending autostart timeout
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current)
      autoStartTimeoutRef.current = null
    }

    // Check for pending wins and collect them before starting new spin
    if (pendingWinRef.current > 0 && collectWinRef.current) {
      collectWinRef.current()
    }

    // Balance validation will be handled by the server

    isSpinningRef.current = true
    stopRequestedRef.current = false
    reelsStoppedRef.current = [false, false, false, false, false]
    reelsStoppedCountRef.current = 0
    simultaneousStopRef.current = false

    // Clear previous win states for new spin
    pendingWinLinesRef.current = null

    // Clear any running animations and restore symbol visibility
    animationsRunningRef.current.clear()

    // Clear win highlights when starting new spin
    clearWinHighlights()

    // Stop all running win animations
    // Note: runningWinAnimations is managed elsewhere, this is a placeholder

    // Clear any pending win animation timeouts
    reelsRef.current.forEach((reel) => {
      if (reel) {
        // Clean up any leftover win animation sprites
        for (let i = reel.children.length - 1; i >= 0; i--) {
          const child = reel.children[i]
          if (child && child !== reel.children[0] && child !== reel.children[1] && // Don't remove mask and overshoot
              i >= 5) { // Only remove extra children beyond base 5 (mask + overshoot + 3 symbols)
            reel.removeChild(child)
            if (child.destroy) {
              child.destroy()
            }
          }
        }
      }
    })

    // Ensure all reel symbols are visible when starting a new spin
    reelsRef.current.forEach((reel) => {
      if (reel) {
        // Make sure all symbols are visible (skip mask at 0 and overshoot at 1)
        for (let i = 2; i < reel.children.length; i++) {
          const symbol = reel.children[i] as Sprite
          if (symbol && !symbol.destroyed) {
            symbol.visible = true
          }
        }
      }
    })

    // Get server results for this spin
    let serverResults: { results: { reel: number, position: number, symbols: string[] }[], totalWin: number, winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[], expandedReels: number[], balance: number } | null = null
    try {
      const requestBody = { bet: currentBetRef.current }
      const response = await fetch('/api/spin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      const data = await response.json()

      if (!response.ok) {
        // Handle server errors (like insufficient funds)
        if (data.error === 'Insufficient funds') {
          console.error('Insufficient funds for spin')
          flashInsufficientFunds()
          isSpinningRef.current = false
          return
        } else {
          console.error('Spin API error:', data.error)
          isSpinningRef.current = false
          return
        }
      }

      if (data.success) {
        serverResults = data

        // Refresh balance from server after spin (bet has been deducted)
        refreshBalance()

        // Update win amounts and start collection system
        const winAmount = data.totalWin || 0 // Server already returns MKD
        lastWinRef.current = winAmount
        setLastWin(winAmount)

        // Use the new win collection system instead of immediately adding to balance
        if (winAmount > 0) {
          setPendingWin(winAmount)
          // Win animation will start with payline animations in showWinHighlights
        } else {
          // Reset win states for non-winning spins
          setPendingWin(0)
          setAnimatedWinAmount(0)
        }
      }
    } catch (error) {
      console.error('Failed to get server results:', error)
      isSpinningRef.current = false
      return
    }

    // Get reel atlas from cache
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')
    if (!reelAtlas) {
      console.error('Reel atlas not found in cache')
      isSpinningRef.current = false
      return
    }

    // Available symbols for random spinning animation
    const availableSymbols = ['00.png', '01.png', '02.png', '03.png', '04.png', '05.png', '06.png', '07.png', '08.png', '09.png', '10.png']

    // Helper functions
    const playReelStopSound = playReelStopSoundRef.current || (() => {})
    const playWildReelSound = playWildReelSoundRef.current || (() => {})
    const playWildExpandSound = playWildExpandSoundRef.current || (() => {})
    const showWinHighlights = showWinHighlightsRef.current || (() => {})
    const checkAndAnimateWilds = checkAndAnimateWildsRef.current || (() => {})
    const reelHasWild = reelHasWildRef.current || (() => false)

    reelsRef.current.forEach((reel, index) => {
      if (reel) {
        // Frame-perfect timing based on 60fps reference
        const bounceStartTimes = [533, 883, 1233, 1583, 1933] // Frame 32, 53, 74, 95, 116
        const bounceEndTimes = [867, 1217, 1567, 1917, 2267] // Frame 52, 73, 94, 115, 136

        const originalSpinDuration = bounceStartTimes[index]
        const originalBounceEndTime = bounceEndTimes[index]
        let spinDuration = originalSpinDuration
        let bounceEndTime = originalBounceEndTime
        const spinSpeed = 4200 // PIXI pixels per second (equivalent to ~70px/frame at 60fps)
        let soundPlayed = false
        let acceleratedMode = false
        let tickerFunction: ((ticker: any) => void) | null = null

        // Add fewer extra symbols for spinning effect (reduced from 5+5 to 2+2)
        const originalSymbolCount = reel.children.length - 2 // -2 for mask and overshoot symbol

        // Add symbols above the visible area (reduced count)
        for (let i = 0; i < 2; i++) {
          const randomSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
          const texture = reelAtlas.textures[randomSymbolName]
          if (texture) {
            const symbol = new Sprite(texture)
            symbol.width = SYMBOL_WIDTH
            symbol.height = SYMBOL_HEIGHT
            symbol.x = 0
            symbol.y = (-2 + i) * SYMBOL_HEIGHT // Position above visible area
            reel.addChild(symbol)
          }
        }

        // Add symbols below the visible area (reduced count)
        for (let i = 0; i < 2; i++) {
          const randomSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
          const texture = reelAtlas.textures[randomSymbolName]
          if (texture) {
            const symbol = new Sprite(texture)
            symbol.width = SYMBOL_WIDTH
            symbol.height = SYMBOL_HEIGHT
            symbol.x = 0
            symbol.y = (originalSymbolCount + i) * SYMBOL_HEIGHT
            reel.addChild(symbol)
          }
        }

        let elapsed = 0
        const startTime = Date.now()

        // PIXI Ticker-based animation function
        const animate = (ticker: any) => {
          elapsed = Date.now() - startTime

          // Check for stop request during spinning (only allow stops during spin phase, not bounce)
          if (stopRequestedRef.current && !acceleratedMode && !reelsStoppedRef.current[index] && elapsed < originalSpinDuration) {
            acceleratedMode = true

            // Handle stop request based on current state
            if (reelsStoppedCountRef.current === 0) {
              // Case 1: No reels stopped - immediate synchronized stop for all reels
              simultaneousStopRef.current = true
              spinDuration = elapsed + 50 // Very short transition to bounce
              bounceEndTime = spinDuration + (originalBounceEndTime - originalSpinDuration) // Keep normal bounce duration
            } else {
              // Case 2: Some reels stopped - quick stop with minimal staggering (keep individual sounds)
              // Calculate which remaining reel this is (0-based among remaining reels)
              let remainingReelIndex = 0
              for (let i = 0; i < index; i++) {
                if (!reelsStoppedRef.current[i]) remainingReelIndex++
              }
              const quickStopDelay = remainingReelIndex * 20 // 20ms stagger between remaining reels (reduced from 50ms)
              spinDuration = elapsed + quickStopDelay + 50 // Short transition
              bounceEndTime = spinDuration + (originalBounceEndTime - originalSpinDuration) // Keep normal bounce duration
            }
          }

          if (elapsed < bounceEndTime) {
            if (elapsed < spinDuration) {
              // Spin the reel using PIXI ticker delta time for smooth animation
              // Skip mask (index 0) and overshoot symbol (index 1)
              const deltaMovement = spinSpeed * ticker.deltaMS / 1000 // Convert to pixels per second

              for (let i = 2; i < reel.children.length; i++) {
                const symbol = reel.children[i]
                symbol.y += deltaMovement
                // When symbol goes below visible area, wrap it to the top seamlessly
                if (symbol.y >= (SYMBOLS_PER_REEL + 2) * SYMBOL_HEIGHT) {
                  symbol.y -= (SYMBOLS_PER_REEL + 4) * SYMBOL_HEIGHT
                }
              }
              // Continue animation (ticker will call this function again)
            } else {
              // Continuous bounce phase - from overshoot back to final position

              // Setup final symbols if not done yet
              if (reel.children.length > 5) { // Keep only mask + overshoot + 3 final symbols (total 5)
                // Remove extra spinning symbols
                while (reel.children.length > 5) {
                  const childToRemove = reel.children[reel.children.length - 1]
                  reel.removeChild(childToRemove)
                  if (childToRemove && childToRemove.destroy) {
                    childToRemove.destroy()
                  }
                }

                // Replace with server-determined final symbols (skip mask at index 0 and overshoot at index 1)
                if (serverResults && serverResults.results[index]) {
                  const reelResult = serverResults.results[index]
                  const finalSymbols = reelResult.symbols

                  for (let i = 2; i < reel.children.length && i - 2 < finalSymbols.length; i++) {
                    const symbol = reel.children[i] as Sprite
                    const symbolName = finalSymbols[i - 2]
                    const newTexture = reelAtlas.textures[symbolName]
                    if (newTexture) {
                      symbol.texture = newTexture
                    }
                  }
                } else {
                  // Fallback to random symbols if server results not available
                  for (let i = 2; i < reel.children.length; i++) {
                    const symbol = reel.children[i] as Sprite
                    const randomSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
                    const newTexture = reelAtlas.textures[randomSymbolName]
                    if (newTexture) {
                      symbol.texture = newTexture
                    }
                  }
                }

                // Set up the overshoot symbol (random symbol from available pool)
                const overshootSymbol = reel.children[1] as Sprite
                const overshootSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
                const overshootTexture = reelAtlas.textures[overshootSymbolName]
                if (overshootTexture) {
                  overshootSymbol.texture = overshootTexture
                }
              }

              // Calculate bounce progress (0 to 1 over 333ms)
              const bounceDuration = bounceEndTime - spinDuration // 333ms
              const bounceProgress = (elapsed - spinDuration) / bounceDuration

              // Smooth bounce curve - starts at overshoot, ends at target
              const overshootAmount = 69 // 100px overshoot
              const targetPositions = [0, SYMBOL_HEIGHT, 2 * SYMBOL_HEIGHT]

              // Use sine wave for natural bounce motion
              const bounceOffset = Math.sin(Math.PI * bounceProgress) * overshootAmount * (1 - bounceProgress)

              // Play sound when bounce reaches its peak (around 50% progress)
              if (!soundPlayed && bounceProgress >= 0.25) {
                // Only play individual sounds if not a simultaneous stop
                if (!simultaneousStopRef.current) {
                  // Check if this reel has wild symbols and play appropriate sound
                  if (reelHasWild(index)) {
                    playWildReelSound()
                  } else {
                    playReelStopSound()
                  }
                }
                soundPlayed = true
              }

              // Get the overshoot symbol (index 1, after mask at index 0)
              const overshootSymbol = reel.children[1] as Sprite

              // Show overshoot symbol when reel moves down (positive bounceOffset)
              // It should be visible when the bounce offset pushes symbols down
              if (bounceOffset > 0) {
                overshootSymbol.visible = true
                overshootSymbol.y = -SYMBOL_HEIGHT + bounceOffset
              } else {
                overshootSymbol.visible = false
              }

              // Apply bounce to main symbols (skip mask at 0 and overshoot at 1)
              for (let i = 2; i < reel.children.length; i++) {
                const targetY = targetPositions[i - 2] // -2 because we skip mask and overshoot
                reel.children[i].y = targetY + bounceOffset
              }

              // Continue animation (ticker will call this function again)
            }
          } else {
            // Bounce complete - ensure final positions are exact
            const targetPositions = [0, SYMBOL_HEIGHT, 2 * SYMBOL_HEIGHT]

            // Hide overshoot symbol
            const overshootSymbol = reel.children[1] as Sprite
            overshootSymbol.visible = false

            // Set final positions for main symbols (skip mask at 0 and overshoot at 1)
            for (let i = 2; i < reel.children.length; i++) {
              reel.children[i].y = targetPositions[i - 2]
            }

            // Mark this reel as stopped
            if (!reelsStoppedRef.current[index]) {
              reelsStoppedRef.current[index] = true
              reelsStoppedCountRef.current++
            }

            // Remove ticker function when animation is complete
            if (tickerFunction && appRef.current) {
              appRef.current.ticker.remove(tickerFunction)
              tickerFunctionsRef.current.delete(index)
              tickerFunction = null
            }

            // Check if all reels have finished bouncing
            if (reelsStoppedCountRef.current === REEL_COUNT) {
              isSpinningRef.current = false

              // Update UI displays with current values
              if (uiUpdateRef.current) {
                // Note: We'll need to get current state values externally
              }

              // Check for autostart - trigger next spin after delay
              if (isAutoStartRef.current) {
                const delay = serverResults?.winLines && serverResults.winLines.length > 0 ? 5000 : 300 // Longer delay for wins

                autoStartTimeoutRef.current = setTimeout(() => {
                  if (isAutoStartRef.current && !isSpinningRef.current) {
                    spinReels()
                  }
                }, delay)
              }

              // Check for wild animations based on server results (only if there are actual wins)
              if (serverResults && serverResults.expandedReels && serverResults.expandedReels.length > 0 &&
                  serverResults.winLines && serverResults.winLines.length > 0) {
                // Animate wild expansions only when there are actual wins
                checkAndAnimateWilds(serverResults)
              }

              // Show win highlights if there are wins
              if (serverResults && serverResults.winLines && serverResults.winLines.length > 0) {
                // Check if there are wild expansions happening
                const hasWildExpansions = serverResults.expandedReels && serverResults.expandedReels.length > 0

                if (hasWildExpansions) {
                  // Delay highlighting to let wild expansion animations complete first
                  // Wild animations take ~2300ms (69 frames at 30fps), so wait 2500ms

                  // Store win lines for potential take win use
                  pendingWinLinesRef.current = serverResults.winLines

                  wildExpansionTimeoutRef.current = setTimeout(() => {
                    // Only show win highlights if not in gamble mode
                    if (!isGambleModeRef.current) {
                      showWinHighlights(serverResults.winLines)
                    }
                    wildExpansionTimeoutRef.current = null
                    pendingWinLinesRef.current = null
                  }, 2500)
                } else {
                  // No wild expansions, start win animations immediately
                  // But only if not in gamble mode
                  if (!isGambleModeRef.current) {
                    showWinHighlights(serverResults.winLines)
                  }
                }
              }
            }
          }
        }

        // Set up PIXI ticker for smooth animation
        tickerFunction = animate
        tickerFunctionsRef.current.set(index, tickerFunction)
        if (appRef.current) {
          appRef.current.ticker.add(tickerFunction)
        }
      }
    })
  }, [
    appRef,
    reelsRef,
    isSpinningRef,
    stopRequestedRef,
    reelsStoppedRef,
    reelsStoppedCountRef,
    simultaneousStopRef,
    pendingWinRef,
    pendingWinLinesRef,
    currentBetRef,
    lastWinRef,
    autoStartTimeoutRef,
    animationsRunningRef,
    isAutoStartRef,
    isGambleModeRef,
    isWinAnimatingRef,
    wildExpansionTimeoutRef,
    setLastWin,
    setPendingWin,
    setAnimatedWinAmount,
    refreshBalance,
    flashInsufficientFunds,
    clearWinHighlights,
    collectWinRef,
    uiUpdateRef,
    playReelStopSoundRef,
    playWildReelSoundRef,
    playWildExpandSoundRef,
    showWinHighlightsRef,
    checkAndAnimateWildsRef,
    reelHasWildRef
  ])

  return {
    spinReels
  }
}
