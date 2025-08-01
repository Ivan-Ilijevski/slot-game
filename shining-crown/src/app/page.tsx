'use client'

import { useEffect, useRef } from 'react'
import { Application, Assets, Sprite, Container, Graphics } from 'pixi.js'

export default function Home() {
  const pixiContainer = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const reelsRef = useRef<Container[]>([])
  const isSpinningRef = useRef(false)
  const reelStopSoundRef = useRef<HTMLAudioElement | null>(null)
  const soundTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stopRequestedRef = useRef(false)
  const reelsStoppedRef = useRef<boolean[]>([false, false, false, false, false])
  const reelsStoppedCountRef = useRef(0)
  const simultaneousStopRef = useRef(false)
  const animationsRunningRef = useRef<Set<number>>(new Set())
  const lastWinRef = useRef(0)
  const winHighlightsRef = useRef<Container[]>([])
  const winInfoDisplayRef = useRef<HTMLDivElement | null>(null)
  const wildExpandSoundRef = useRef<HTMLAudioElement | null>(null)
  const wildReelSoundRef = useRef<HTMLAudioElement | null>(null)
  const winCycleIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    let keydownHandler: ((event: KeyboardEvent) => void) | null = null

    const init = async () => {
      app = new Application()
      await app.init({
        width: 1920,
        height: 1080,
        backgroundColor: 0x1a1a2e,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      appRef.current = app

      if (pixiContainer.current && app.canvas) {
        pixiContainer.current.innerHTML = ''
        pixiContainer.current.appendChild(app.canvas)
      }

      try {
        await Assets.load([
          '/assets/mainResources.json', 
          '/assets/reelImages.json', 
          '/assets/background.json', 
          '/assets/expand-0.json', 
          '/assets/08-0.json', // Wild expanding animation
          // Load all symbol win animations
          '/assets/00-0.json', // Cherry win animation
          '/assets/01-0.json', // Lemon win animation  
          '/assets/02-0.json', // Orange win animation
          '/assets/03-0.json', // Plum win animation
          '/assets/04-0.json', // Bell win animation
          '/assets/05-0.json', // Grapes win animation
          '/assets/06-0.json', // Watermelon win animation
          '/assets/07-0.json', // Seven win animation
          '/assets/09-0.json', // Star win animation
          '/assets/10-0.json'  // Crown win animation
        ])

        // Load reel stop sound
        reelStopSoundRef.current = new Audio('/assets/mobileMainSounds.mp3')
        reelStopSoundRef.current.preload = 'auto'
        
        // Load wild expansion sound
        wildExpandSoundRef.current = new Audio('/assets/winSounds.mp3')
        wildExpandSoundRef.current.preload = 'auto'
        
        // Load wild reel sound
        wildReelSoundRef.current = new Audio('/assets/shortSounds.mp3')
        wildReelSoundRef.current.preload = 'auto'
        
        // Set up sound to play only a small portion (e.g., 0.2 seconds from start)
        const playReelStopSound = () => {
          if (reelStopSoundRef.current) {
            // Clear any existing timeout to prevent conflicts
            if (soundTimeoutRef.current) {
              clearTimeout(soundTimeoutRef.current)
            }
            
            reelStopSoundRef.current.currentTime = 1 // Start from 1 second
            reelStopSoundRef.current.play().catch(console.error)
            
            // Stop playback after 0.3 seconds
            soundTimeoutRef.current = setTimeout(() => {
              if (reelStopSoundRef.current) {
                reelStopSoundRef.current.pause()
              }
              soundTimeoutRef.current = null
            }, 300)
          }
        }
        
        // Function to play wild reel sound (1 second from shortSounds.mp3)
        const playWildReelSound = () => {
          if (wildReelSoundRef.current) {
            wildReelSoundRef.current.currentTime = 0 // Start from beginning
            wildReelSoundRef.current.play().catch(console.error)
            
            // Stop after 1 second
            setTimeout(() => {
              if (wildReelSoundRef.current) {
                wildReelSoundRef.current.pause()
              }
            }, 1000)
          }
        }
        
        // Function to check if a reel contains wild symbols
        const reelHasWild = (reelIndex: number): boolean => {
          const reel = reelsRef.current[reelIndex]
          if (!reel) return false
          
          // Check all symbol positions in this reel (skip mask at 0 and overshoot at 1)
          for (let i = 2; i < reel.children.length; i++) {
            const symbolSprite = reel.children[i] as Sprite
            if (symbolSprite && symbolSprite.texture === reelAtlas.textures['08.png']) {
              return true
            }
          }
          return false
        }
        
        // Function to play wild expansion sound
        const playWildExpandSound = () => {
          if (wildExpandSoundRef.current) {
            wildExpandSoundRef.current.currentTime = 4.7 // Start from 6 seconds
            wildExpandSoundRef.current.play().catch(console.error)
            
            // Stop playback after 4.6 seconds (from 6s to 10.6s = 4.6s duration)
            setTimeout(() => {
              if (wildExpandSoundRef.current) {
                wildExpandSoundRef.current.pause()
              }
            }, 4600)
          }
        }

        const mainAtlas = Assets.cache.get('/assets/mainResources.json')
        const reelAtlas = Assets.cache.get('/assets/reelImages.json')
        const backgroundAtlas = Assets.cache.get('/assets/background.json')
        const expandAtlas = Assets.cache.get('/assets/expand-0.json')
        const wildAtlas = Assets.cache.get('/assets/08-0.json')
        
        // Win animation atlases (all symbols)
        const winAtlases: { [key: string]: { textures: { [key: string]: import('pixi.js').Texture } } } = {
          '00': Assets.cache.get('/assets/00-0.json'),
          '01': Assets.cache.get('/assets/01-0.json'),
          '02': Assets.cache.get('/assets/02-0.json'),
          '03': Assets.cache.get('/assets/03-0.json'),
          '04': Assets.cache.get('/assets/04-0.json'),
          '05': Assets.cache.get('/assets/05-0.json'),
          '06': Assets.cache.get('/assets/06-0.json'),
          '07': Assets.cache.get('/assets/07-0.json'),
          '08': Assets.cache.get('/assets/08-0.json'), // Wild win animation (not expand)
          '09': Assets.cache.get('/assets/09-0.json'),
          '10': Assets.cache.get('/assets/10-0.json')
        }
        
        if (!mainAtlas?.textures || !reelAtlas?.textures || !backgroundAtlas?.textures || !expandAtlas?.textures || !wildAtlas?.textures) {
          console.error('❌ Missing textures')
          return
        }
        
        console.log('✅ Win animation atlases loaded:', Object.keys(winAtlases).map(key => `${key}: ${winAtlases[key]?.textures ? 'OK' : 'MISSING'}`).join(', '))
        
        // Symbol name to number mapping
        const symbolNameToNumber: { [key: string]: string } = {
          'Cherry': '00',
          'Lemon': '01', 
          'Orange': '02',
          'Plum': '03',
          'Bell': '04',
          'Grapes': '05',
          'Watermelon': '06',
          'Seven': '07',
          'Wild': '08',
          'Star': '09',
          'Crown': '10'
        }
        
        console.log('📋 Symbol name mapping:', symbolNameToNumber)

        // Main background
        const mainBackground = new Sprite(backgroundAtlas.textures['background.png'])
        mainBackground.x = (1920 - mainBackground.width) / 2
        mainBackground.y = (1080 - mainBackground.height) / 2
        app.stage.addChild(mainBackground)

        // Reel background - centered
        const reelBackground = new Sprite(mainAtlas.textures['reelBackground.png'])
        reelBackground.x = (1920 - reelBackground.width) / 2
        reelBackground.y = (1080 - reelBackground.height) / 2
        app.stage.addChild(reelBackground)

        // === Reels Setup ===
        const SYMBOL_WIDTH = 198
        const SYMBOL_HEIGHT = 198
        const REEL_COUNT = 5
        const SYMBOLS_PER_REEL = 3
        const REEL_GAP = 24

        const REEL_OFFSET_X = (1920 - (REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP)) / 2
        const REEL_OFFSET_Y = (1080 - (SYMBOLS_PER_REEL * SYMBOL_HEIGHT)) / 2 -1
        
        // Payline colors for highlighting wins
        const PAYLINE_COLORS = [
          0xFFD700, // Payline 1 - Gold
          0xFFFF00, // Payline 2 - Yellow  
          0x00FF00, // Payline 3 - Green
          0xFF0000, // Payline 4 - Red
          0xFF0000, // Payline 5 - Red
          0x00FFFF, // Payline 6 - Cyan
          0x00FFFF, // Payline 7 - Cyan
          0xFF8C00, // Payline 8 - Orange
          0x00FF00, // Payline 9 - Green
          0x0000FF  // Payline 10 - Blue
        ]
        
        // Paylines definition for highlighting (reel, row)
        const PAYLINES_VISUAL = [
          [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], // Payline 1
          [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // Payline 2
          [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], // Payline 3
          [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], // Payline 4
          [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]], // Payline 5
          [[0, 0], [1, 0], [2, 1], [3, 2], [4, 2]], // Payline 6
          [[0, 2], [1, 2], [2, 1], [3, 0], [4, 0]], // Payline 7
          [[0, 1], [1, 2], [2, 2], [3, 2], [4, 1]], // Payline 8
          [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1]], // Payline 9
          [[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]  // Payline 10
        ]

        const reelContainer = new Container()
        reelContainer.x = REEL_OFFSET_X
        reelContainer.y = REEL_OFFSET_Y
        app.stage.addChild(reelContainer)

        // Define specific symbol sequence to match screenshot
        const symbolSequence = [
          ['00.png', '00.png', '00.png'], // Cherries column
          ['01.png', '01.png', '01.png'], // Lemons column  
          ['02.png', '02.png', '02.png'], // Oranges column
          ['03.png', '03.png', '03.png'], // Plums column
          ['04.png', '04.png', '04.png']  // Bells column
        ]

        for (let i = 0; i < REEL_COUNT; i++) {
          const reel = new Container()
          reel.x = i * (SYMBOL_WIDTH + REEL_GAP)

          // Create mask for this reel to hide overflow
          const mask = new Graphics()
          mask.rect(0, 0, SYMBOL_WIDTH, SYMBOLS_PER_REEL * SYMBOL_HEIGHT)
          mask.fill(0xFFFFFF)
          reel.mask = mask
          reel.addChild(mask)

          // Create overshoot symbol container (positioned above visible area)
          const overshootSymbol = new Sprite()
          overshootSymbol.width = SYMBOL_WIDTH
          overshootSymbol.height = SYMBOL_HEIGHT
          overshootSymbol.x = 0
          overshootSymbol.y = -SYMBOL_HEIGHT // Above the visible area
          overshootSymbol.visible = false // Initially hidden
          reel.addChild(overshootSymbol)

          for (let j = 0; j < SYMBOLS_PER_REEL; j++) {
            const textureName = symbolSequence[i][j]
            const texture = reelAtlas.textures[textureName]
            if (texture) {
              const symbol = new Sprite(texture)
              symbol.width = SYMBOL_WIDTH 
              symbol.height = SYMBOL_HEIGHT 
              symbol.x = 0//(SYMBOL_WIDTH - symbol.width) / 2
              symbol.y = j * (SYMBOL_HEIGHT)
              reel.addChild(symbol)
            }
          }

          reelsRef.current[i] = reel
          reelContainer.addChild(reel)
        }

        // Game logo at the top
        const gameLogo = new Sprite(mainAtlas.textures['gameName.png'])
        gameLogo.x = (1920 - gameLogo.width) / 2
        gameLogo.y = 170
        app.stage.addChild(gameLogo)
        
        // Create last win display
        const lastWinDisplay = document.createElement('div')
        lastWinDisplay.id = 'lastWinDisplay'
        lastWinDisplay.style.cssText = `
          position: absolute;
          top: 50px;
          right: 50px;
          background: rgba(0, 0, 0, 0.8);
          color: #FFD700;
          padding: 15px 25px;
          border-radius: 10px;
          font-family: Arial, sans-serif;
          font-size: 24px;
          font-weight: bold;
          text-align: center;
          border: 2px solid #FFD700;
          z-index: 1000;
        `
        lastWinDisplay.innerHTML = `
          <div style="font-size: 16px; color: #FFFFFF; margin-bottom: 5px;">LAST WIN</div>
          <div style="font-size: 28px;">${lastWinRef.current}</div>
        `
        
        // Add to the main container
        if (pixiContainer.current) {
          pixiContainer.current.appendChild(lastWinDisplay)
        }
        
        // Create win info display at bottom
        const winInfoDisplay = document.createElement('div')
        winInfoDisplay.id = 'winInfoDisplay'
        winInfoDisplay.style.cssText = `
          position: absolute;
          bottom: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: #FFD700;
          padding: 10px 20px;
          border-radius: 8px;
          font-family: Arial, sans-serif;
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          border: 2px solid #FFD700;
          z-index: 1000;
          display: none;
        `
        winInfoDisplayRef.current = winInfoDisplay
        
        if (pixiContainer.current) {
          pixiContainer.current.appendChild(winInfoDisplay)
        }

        // Lines indicator on the left of reels
        const linesIndicator = new Sprite(mainAtlas.textures['linesIndicator.png'])
        linesIndicator.x = REEL_OFFSET_X - linesIndicator.width - 35
        linesIndicator.y = REEL_OFFSET_Y + (SYMBOLS_PER_REEL * SYMBOL_HEIGHT - linesIndicator.height) / 2
        app.stage.addChild(linesIndicator)

        // Reel border overlay - centered
        const border = new Sprite(mainAtlas.textures['reelBorder.png'])
        border.x = (1920 - border.width) / 2
        border.y = (1080 - border.height) / 2
        app.stage.addChild(border)

        // Add keyboard event listener for space key
        keydownHandler = (event: KeyboardEvent) => {
          if (event.code === 'Space') {
            event.preventDefault()
            if (!isSpinningRef.current) {
              spinReels()
            } else if (!stopRequestedRef.current) {
              // Request stop during spinning (only if not already requested)
              stopRequestedRef.current = true
              
              // Play single sound immediately if all reels will stop together
              if (reelsStoppedCountRef.current === 0) {
                playReelStopSound()
              }
            }
          }
        }

        const spinReels = async () => {
          if (isSpinningRef.current) return
          
          isSpinningRef.current = true
          stopRequestedRef.current = false
          reelsStoppedRef.current = [false, false, false, false, false]
          reelsStoppedCountRef.current = 0
          simultaneousStopRef.current = false
          
          // Clear any running animations and restore symbol visibility
          animationsRunningRef.current.clear()
          
          // Clear win highlights when starting new spin
          clearWinHighlights()
          
          // Stop all running win animations
          Object.keys(runningWinAnimations).forEach(key => {
            delete runningWinAnimations[key]
          })
          console.log('⏹️ Stopped all running win animations')
          
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
          let serverResults: { results: { reel: number, position: number, symbols: string[] }[], totalWin: number, winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[], expandedReels: number[] } | null = null
          try {
            const response = await fetch('/api/spin', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            })
            const data = await response.json()
            if (data.success) {
              serverResults = data
              // Update last win amount
              lastWinRef.current = data.totalWin || 0
              console.log('Win amount:', data.totalWin, 'Win lines:', data.winLines)
            }
          } catch (error) {
            console.error('Failed to get server results:', error)
          }
          
          // Available symbols for random spinning animation
          const availableSymbols = ['00.png', '01.png', '02.png', '03.png', '04.png', '05.png', '06.png', '07.png', '08.png', '09.png', '10.png']
          
          reelsRef.current.forEach((reel, index) => {
            if (reel) {
              // Frame-perfect timing based on 60fps reference
              const bounceStartTimes = [533, 883, 1233, 1583, 1933] // Frame 32, 53, 74, 95, 116
              const bounceEndTimes = [867, 1217, 1567, 1917, 2267] // Frame 52, 73, 94, 115, 136
              
              const originalSpinDuration = bounceStartTimes[index]
              const originalBounceEndTime = bounceEndTimes[index]
              let spinDuration = originalSpinDuration
              let bounceEndTime = originalBounceEndTime
              const spinSpeed = 40
              let soundPlayed = false
              let acceleratedMode = false
              
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
              
              const animate = () => {
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
                    // Spin the reel at full speed until bounce starts
                    // Skip mask (index 0) and overshoot symbol (index 1)
                    for (let i = 2; i < reel.children.length; i++) {
                      const symbol = reel.children[i]
                      symbol.y += spinSpeed
                      // When symbol goes below visible area, wrap it to the top seamlessly
                      if (symbol.y >= (SYMBOLS_PER_REEL + 2) * SYMBOL_HEIGHT) {
                        symbol.y -= (SYMBOLS_PER_REEL + 4) * SYMBOL_HEIGHT
                      }
                    }
                    requestAnimationFrame(animate)
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
                          console.log(`🌟 Wild detected on reel ${index + 1}, playing wild sound instead of reel sound`)
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
                    
                    requestAnimationFrame(animate)
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
                  
                  // Check if all reels have finished bouncing
                  if (reelsStoppedCountRef.current === REEL_COUNT) {
                    isSpinningRef.current = false
                    
                    // Update last win display
                    const lastWinDisplay = document.getElementById('lastWinDisplay')
                    if (lastWinDisplay) {
                      lastWinDisplay.innerHTML = `
                        <div style="font-size: 16px; color: #FFFFFF; margin-bottom: 5px;">LAST WIN</div>
                        <div style="font-size: 28px;">${lastWinRef.current}</div>
                      `
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
                        console.log('🌟 Wild expansions detected, delaying win animations by 2500ms')
                        setTimeout(() => {
                          showWinHighlights(serverResults.winLines)
                        }, 2500)
                      } else {
                        // No wild expansions, start win animations immediately
                        console.log('✨ No wild expansions, starting win animations immediately')
                        showWinHighlights(serverResults.winLines)
                      }
                    }
                  }
                }
              }
              
              animate()
            }
          })
        }

        // Function to check for wild symbols and animate them based on server results
        const checkAndAnimateWilds = (winResults: { results: { reel: number, position: number, symbols: string[] }[], totalWin: number, winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[], expandedReels: number[] }) => {
          if (!winResults || !winResults.expandedReels || winResults.expandedReels.length === 0) {
            return
          }

          console.log('Reels to expand (from server):', winResults.expandedReels)
          
          // Play wild expansion sound once for all expanding reels
          if (winResults.expandedReels.length > 0) {
            playWildExpandSound()
          }
          
          // Animate expanding wilds for all reels that the server determined should expand
          winResults.expandedReels.forEach(reelIndex => {
            const reel = reelsRef.current[reelIndex]
            if (reel && reel.children[2]) { // Get first symbol (skip mask and overshoot)
              console.log(`Animating wild expansion for reel ${reelIndex}`)
              animateExpandingWild(reel.children[2] as Sprite, reelIndex)
            }
          })
        }

        // Function to animate expanding wild
        const animateExpandingWild = (wildSymbol: Sprite, reelIndex: number) => {
          // Check if animation is already running for this reel
          if (animationsRunningRef.current.has(reelIndex)) {
            return
          }
          
          // Mark animation as running for this reel
          animationsRunningRef.current.add(reelIndex)
          
          // Create expand animation frames array
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
          if (expandSprites.length === 0) {
            console.log(`No symbols to expand on reel ${reelIndex} - all are already wild`)
            return
          }

          // Animate through frames at half speed
          let currentFrame = 0
          const frameRate = 30 // 30 FPS (half of 60 FPS)
          const animationSpeed = 1000 / frameRate // ~33.33ms per frame

          const animateFrames = () => {
            // Check if animation should continue (not interrupted by new spin)
            if (!animationsRunningRef.current.has(reelIndex)) {
              // Animation was cancelled, clean up and restore original symbols
              expandSprites.forEach(sprite => {
                if (sprite && !sprite.destroyed) {
                  sprite.destroy()
                }
              })
              
              // Restore visibility of original symbols that were hidden
              symbolsToHide.forEach(symbol => {
                if (symbol && !symbol.destroyed) {
                  symbol.visible = true
                }
              })
              
              console.log(`Expanding wild animation cancelled for reel ${reelIndex} - restored ${symbolsToHide.length} symbols`)
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
              
              console.log(`Expanding wild animation complete for reel ${reelIndex} - ${symbolsToHide.length} symbols converted to wild`)
            }
          }

          animateFrames()
        }
        
        // Track running win animations to stop them on new spins
        const runningWinAnimations: { [key: string]: boolean } = {}
        
        // Function to animate winning symbols (with pre-loaded assets)
        const animateWinningSymbols = async (winningPositions: { reelIndex: number, rowIndex: number, symbolName: string }[]) => {
          if (winningPositions.length === 0) {
            console.log('❌ No winning positions to animate')
            return
          }
          
          console.log('🎯 Animating', winningPositions.length, 'winning symbols with pre-loaded assets')
          
          winningPositions.forEach(({ reelIndex, rowIndex, symbolName }) => {
            const animationKey = `${reelIndex}-${rowIndex}`
            runningWinAnimations[animationKey] = true // Mark animation as running
            
            const reel = reelsRef.current[reelIndex]
            if (!reel) {
              console.log(`❌ No reel found at index ${reelIndex}`)
              delete runningWinAnimations[animationKey]
              return
            }
            
            // Get the symbol at this position (skip mask at 0 and overshoot at 1)
            const symbolSprite = reel.children[rowIndex + 2] as Sprite
            if (!symbolSprite) {
              console.log(`❌ No symbol found at reel ${reelIndex}, row ${rowIndex}`)
              return
            }
            
            // Convert symbol name to number (handle both "Wild" and "Wild.png")
            const cleanSymbolName = symbolName.replace('.png', '') // Remove .png if present
            
            // Handle case where server sends clean name (like "Wild") vs filename (like "Wild.png")
            const symbolNumber = symbolNameToNumber[cleanSymbolName] || cleanSymbolName
            console.log(`🎨 Creating animation for symbol ${symbolName} -> ${cleanSymbolName} -> ${symbolNumber} at reel ${reelIndex}, row ${rowIndex}`)
            
            // Special logging for wild symbols - check both the clean name and number
            if (cleanSymbolName === 'Wild' || symbolNumber === '08' || symbolName === 'Wild') {
              console.log(`🌟 WILD SYMBOL DETECTED: original="${symbolName}", clean="${cleanSymbolName}", number="${symbolNumber}" - should use 08-0.json atlas`)
            }
            
            const winAtlas = winAtlases[symbolNumber]
            
            if (!winAtlas?.textures) {
              console.warn(`❌ No pre-loaded animation atlas for symbol ${symbolNumber}, falling back to flash`)
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
            
            console.log(`✅ Found pre-loaded atlas for symbol ${symbolNumber}`)
            
            // Additional debugging for wild symbols
            if (symbolNumber === '08') {
              console.log(`🌟 Using WILD WIN animation atlas (08-0.json) with ${Object.keys(winAtlas.textures).length} textures`)
              console.log(`🌟 Sample wild frames:`, Object.keys(winAtlas.textures).slice(0, 5))
            }
            
            // Create animation frames array (use all frames for smoothest animation)
            const winFrames: import('pixi.js').Texture[] = []
            console.log(`🔍 Available textures in ${symbolNumber} atlas:`, Object.keys(winAtlas.textures).slice(0, 10)) // Show first 10
            
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
            
            // Log missing frames for debugging
            if (winFrames.length < 57) {
              const missingFrames: number[] = []
              for (let i = 0; i < 57; i++) {
                const frameNumber = i.toString().padStart(3, '0')
                const frameName = `${symbolNumber}_${frameNumber}.png`
                if (!winAtlas.textures[frameName]) {
                  missingFrames.push(i)
                }
              }
              console.warn(`🚨 Missing frames for ${symbolNumber}:`, missingFrames.slice(0, 10), missingFrames.length > 10 ? `... and ${missingFrames.length - 10} more` : '')
            }
            
            if (winFrames.length === 0) {
              console.warn(`❌ No animation frames found for symbol ${symbolNumber}`)
              return
            }
            
            console.log(`🎞️ Created ${winFrames.length} animation frames for symbol ${symbolNumber}`)
            
            // Hide the original symbol
            symbolSprite.visible = false
            
            // Create win animation sprite with first valid frame
            const firstFrame = winFrames[0]
            if (!firstFrame || !firstFrame.source) {
              console.error(`❌ Invalid first frame for ${symbolNumber} animation`)
              return
            }
            
            const winAnimSprite = new Sprite(firstFrame)
            winAnimSprite.width = SYMBOL_WIDTH
            winAnimSprite.height = SYMBOL_HEIGHT
            winAnimSprite.x = 0
            winAnimSprite.y = rowIndex * SYMBOL_HEIGHT
            
            reel.addChild(winAnimSprite)
            console.log(`🎭 Created win animation sprite for ${symbolNumber} with ${winFrames.length} valid frames`)
            
            // Animate through frames at smooth speed
            let currentFrame = 0
            const animationSpeed = 80 // 80ms per frame (~12.5 FPS) - smooth but visible
            let isLooping = false
            const loopStartFrame = Math.max(0, winFrames.length - 20) // Last 20 frames for loop
            
            const animateFrames = () => {
              // Check if animation should continue (not stopped by new spin)
              if (!runningWinAnimations[animationKey]) {
                // Animation was stopped - clean up
                if (winAnimSprite && !winAnimSprite.destroyed) {
                  winAnimSprite.destroy()
                }
                if (symbolSprite && !symbolSprite.destroyed) {
                  symbolSprite.visible = true
                }
                console.log(`⏹️ Win animation stopped for ${symbolNumber}`)
                return
              }
              
              if (currentFrame < winFrames.length) {
                const frameTexture = winFrames[currentFrame]
                if (frameTexture && frameTexture.source && !winAnimSprite.destroyed) {
                  winAnimSprite.texture = frameTexture
                } else {
                  console.warn(`⚠️ Invalid texture at frame ${currentFrame} for ${symbolNumber}`)
                }
                // Log only every 10th frame to reduce console spam
                if (currentFrame % 10 === 0) {
                  console.log(`🎬 Frame ${currentFrame + 1}/${winFrames.length} for ${symbolNumber}`)
                }
                currentFrame++
                setTimeout(animateFrames, animationSpeed)
              } else if (!isLooping) {
                // Animation complete - start looping the last 20 frames
                isLooping = true
                currentFrame = loopStartFrame
                console.log(`🔄 Starting loop animation for ${symbolNumber} (frames ${loopStartFrame + 1}-${winFrames.length})`)
                setTimeout(animateFrames, animationSpeed)
              } else {
                // Loop through last 20 frames
                const frameTexture = winFrames[currentFrame]
                if (frameTexture && frameTexture.source && !winAnimSprite.destroyed) {
                  winAnimSprite.texture = frameTexture
                } else {
                  console.warn(`⚠️ Invalid loop texture at frame ${currentFrame} for ${symbolNumber}`)
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
        }
        
        // Function to clear all win highlights
        const clearWinHighlights = () => {
          // Clear cycling interval if it exists
          if (winCycleIntervalRef.current) {
            clearInterval(winCycleIntervalRef.current)
            winCycleIntervalRef.current = null
          }
          
          winHighlightsRef.current.forEach(highlight => {
            if (highlight && !highlight.destroyed && app) {
              // Remove from main stage
              if (app.stage.children.includes(highlight)) {
                app.stage.removeChild(highlight)
              }
              highlight.destroy()
            }
          })
          winHighlightsRef.current = []
          
          // Hide win info display
          if (winInfoDisplayRef.current) {
            winInfoDisplayRef.current.style.display = 'none'
          }
        }
        
        // Function to show win highlights with cycling
        const showWinHighlights = (winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[]) => {
          console.log('🏆 showWinHighlights called with', winLines.length, 'win lines:', winLines)
          clearWinHighlights()
          
          if (winLines.length === 0) {
            console.log('❌ No win lines, skipping animations')
            return
          }
          
          // First, collect all winning symbol positions from all winning lines
          const winningPositions: { reelIndex: number, rowIndex: number, symbolName: string }[] = []
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
                  console.log(`🌟 Position [${reelIndex},${rowIndex}] shows Wild instead of ${winLine.symbol}`)
                }
                
                winningPositions.push({ reelIndex, rowIndex, symbolName: `${actualSymbolName}.png` })
              }
            }
          })
          
          // Enable win animations
          const ENABLE_WIN_ANIMATIONS = true
          
          if (ENABLE_WIN_ANIMATIONS && winningPositions.length > 0) {
            // Start win animations
            console.log('🎊 Starting win animations for positions:', winningPositions)
            
            // Start animations and wait for them to load assets
            animateWinningSymbols(winningPositions).then(() => {
              console.log('✅ Win animations started successfully')
            }).catch(error => {
              console.error('❌ Win animation error:', error)
            })
            
            // Calculate animation duration: 57 frames at 80ms = ~4.56 seconds (then loops)
            const animationDuration = 57 * 80 // ~4560ms
            
            // Show highlights after win animations complete
            setTimeout(() => {
              showWinHighlightsAfterAnimation(winLines)
            }, animationDuration)
          } else {
            console.log('🚫 Win animations disabled or no positions:', { enabled: ENABLE_WIN_ANIMATIONS, positions: winningPositions.length })
            // Show highlights immediately without animations
            showWinHighlightsAfterAnimation(winLines)
          }
        }
        
        // Function to show win highlights after animations complete
        const showWinHighlightsAfterAnimation = (winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[]) => {
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
            
            const lineWidth = 8 // Match highlight border width
            const borderRadius = lineWidth // Match border radius to line width
            
            // Draw complete payline path (below highlight boxes)
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
                  
                  // Calculate the distance from center to edge of rectangle in this direction
                  // This finds the intersection of the direction ray with the rectangle boundary
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
                    const tX = halfWidth / Math.abs(dirX)   // Distance to reach vertical edge
                    const tY = halfHeight / Math.abs(dirY)  // Distance to reach horizontal edge
                    edgeDistance = Math.min(tX, tY)         // Use whichever edge is reached first
                  }
                  
                  // Determine start and end points based on winning status
                  const startIsWinning = i < winLine.count
                  const endIsWinning = i + 1 < winLine.count
                  
                  let startPoint, endPoint
                  
                  if (startIsWinning && endIsWinning) {
                    // Both positions are winning - hide line inside both squares (edge to edge)
                    startPoint = {
                      x: startCenter.x + dirX * edgeDistance,
                      y: startCenter.y + dirY * edgeDistance
                    }
                    endPoint = {
                      x: endCenter.x - dirX * edgeDistance,
                      y: endCenter.y - dirY * edgeDistance
                    }
                  } else if (startIsWinning && !endIsWinning) {
                    // Start is winning, end is not - start from edge of winning symbol, end at center
                    startPoint = {
                      x: startCenter.x + dirX * edgeDistance,
                      y: startCenter.y + dirY * edgeDistance
                    }
                    endPoint = { x: endCenter.x, y: endCenter.y }
                  } else if (!startIsWinning && endIsWinning) {
                    // Start is not winning, end is winning - start from center, end at edge
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
              
              paylinePath.stroke({ width: lineWidth, color: color, alpha: 1.0 })
            }
            
            // Add payline path first (will be below highlight boxes)
            highlightContainer.addChild(paylinePath)
            
            // Create highlight boxes (drawn on top)
            for (let i = 0; i < Math.min(winLine.count, positions.length); i++) {
              const [reelIndex, rowIndex] = positions[i]
              
              // Create highlight box with enhanced styling
              const highlight = new Graphics()
              highlight.roundRect(0, 0, SYMBOL_WIDTH, SYMBOL_HEIGHT, borderRadius) // Match border radius to line width
              highlight.stroke({ width: 8, color: color }) // Thicker border
              
              // Position relative to reel container
              highlight.x = reelIndex * (SYMBOL_WIDTH + REEL_GAP)
              highlight.y = rowIndex * SYMBOL_HEIGHT
              
              highlightContainer.addChild(highlight)
            }
            
            // Add to main stage (on top of everything) instead of reel container
            if (app) {
              app.stage.addChild(highlightContainer)
              
              // Position relative to the game screen (accounting for reel container offset)
              highlightContainer.x = REEL_OFFSET_X
              highlightContainer.y = REEL_OFFSET_Y
            }
            
            winHighlightsRef.current.push(highlightContainer)
            
            // Update win info display
            if (winInfoDisplayRef.current) {
              winInfoDisplayRef.current.innerHTML = `Line ${winLine.payline} ${winLine.count}x - ${winLine.payout} credits`
              winInfoDisplayRef.current.style.display = 'block'
            }
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
        }

        window.addEventListener('keydown', keydownHandler)

      } catch (err) {
        console.error('❌ Asset loading failed:', err)
      }
    }

    init()

    return () => {
      if (!destroyed && appRef.current) {
        // Clean up keyboard event listener
        if (keydownHandler) {
          window.removeEventListener('keydown', keydownHandler)
        }
        appRef.current.destroy(true, { children: true })
        destroyed = true
        appRef.current = null
      }
    }
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'black',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        position: 'relative',
      }}
    >
      <div
        ref={pixiContainer}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '1920px',
          height: '1080px',
          transform: 'translate(-50%, -50%) scale(0.46875)',
          transformOrigin: 'center center',
        }}
      />
    </div>
  )
}
