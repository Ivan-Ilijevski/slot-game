'use client'

import { useEffect, useRef } from 'react'
import { Application, Assets, Sprite, Container, Graphics } from 'pixi.js'

export default function Home() {
  const pixiContainer = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const reelsRef = useRef<Container[]>([])
  const isSpinningRef = useRef(false)

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
        await Assets.load(['/assets/mainResources.json', '/assets/reelImages.json', '/assets/background.json'])

        const mainAtlas = Assets.cache.get('/assets/mainResources.json')
        const reelAtlas = Assets.cache.get('/assets/reelImages.json')
        const backgroundAtlas = Assets.cache.get('/assets/background.json')

        if (!mainAtlas?.textures || !reelAtlas?.textures || !backgroundAtlas?.textures) {
          console.error('❌ Missing textures')
          return
        }

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
        const REEL_GAP = 25

        const REEL_OFFSET_X = (1920 - (REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP)) / 2
        const REEL_OFFSET_Y = (1080 - (SYMBOLS_PER_REEL * SYMBOL_HEIGHT)) / 2 -1

        const reelContainer = new Container()
        reelContainer.x = REEL_OFFSET_X
        reelContainer.y = REEL_OFFSET_Y
        app.stage.addChild(reelContainer)

        // Define specific symbol sequence to match screenshot
        const symbolSequence = [
          ['06.png', '00.png', '05.png'], // Cherries column
          ['01.png', '01.png', '01.png'], // Lemons column  
          ['02.png', '02.png', '10.png'], // Oranges column
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
          if (event.code === 'Space' && !isSpinningRef.current) {
            event.preventDefault()
            spinReels()
          }
        }

        const spinReels = () => {
          if (isSpinningRef.current) return
          
          isSpinningRef.current = true
          
          // Available symbols for random spinning
          const availableSymbols = ['00.png', '01.png', '02.png', '03.png', '04.png', '05.png', '06.png', '07.png', '08.png', '09.png', '10.png']
          
          reelsRef.current.forEach((reel, index) => {
            if (reel) {
              // Frame-perfect timing based on 60fps reference
              const bounceStartTimes = [533, 883, 1233, 1583, 1933] // Frame 32, 53, 74, 95, 116
              const bounceEndTimes = [867, 1217, 1567, 1917, 2267] // Frame 52, 73, 94, 115, 136
              
              const spinDuration = bounceStartTimes[index]
              const bounceEndTime = bounceEndTimes[index]
              const spinSpeed = 20
              
              // Add extra symbols for spinning effect
              const originalSymbolCount = reel.children.length - 1 // -1 for mask
              
              // Add symbols above the visible area
              for (let i = 0; i < 5; i++) {
                const randomSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
                const texture = reelAtlas.textures[randomSymbolName]
                if (texture) {
                  const symbol = new Sprite(texture)
                  symbol.width = SYMBOL_WIDTH
                  symbol.height = SYMBOL_HEIGHT
                  symbol.x = 0
                  symbol.y = (-5 + i) * SYMBOL_HEIGHT // Position above visible area
                  reel.addChild(symbol)
                }
              }
              
              // Add symbols below the visible area
              for (let i = 0; i < 5; i++) {
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
                
                if (elapsed < bounceEndTime) {
                  if (elapsed < spinDuration) {
                    // Spin the reel at full speed until bounce starts
                    for (let i = 1; i < reel.children.length; i++) {
                      const symbol = reel.children[i]
                      symbol.y += spinSpeed
                      // When symbol goes below visible area, wrap it to the top seamlessly
                      if (symbol.y >= (SYMBOLS_PER_REEL + 5) * SYMBOL_HEIGHT) {
                        symbol.y -= (SYMBOLS_PER_REEL + 10) * SYMBOL_HEIGHT
                      }
                    }
                    requestAnimationFrame(animate)
                  } else {
                    // Continuous bounce phase - from overshoot back to final position
                    
                    // Setup final symbols if not done yet
                    if (reel.children.length > originalSymbolCount + 1) {
                      // Remove extra symbols, keep only mask + 3 final symbols  
                      while (reel.children.length > originalSymbolCount + 1) {
                        reel.removeChildAt(reel.children.length - 1)
                      }
                      
                      // Replace with random final symbols
                      for (let i = 1; i < reel.children.length; i++) {
                        const symbol = reel.children[i] as Sprite
                        const randomSymbolName = availableSymbols[Math.floor(Math.random() * availableSymbols.length)]
                        const newTexture = reelAtlas.textures[randomSymbolName]
                        if (newTexture) {
                          symbol.texture = newTexture
                        }
                      }
                    }
                    
                    // Calculate bounce progress (0 to 1 over 333ms)
                    const bounceDuration = bounceEndTime - spinDuration // 333ms
                    const bounceProgress = (elapsed - spinDuration) / bounceDuration
                    
                    // Smooth bounce curve - starts at overshoot, ends at target
                    const overshootAmount = 100 // 100px overshoot
                    const targetPositions = [0, SYMBOL_HEIGHT, 2 * SYMBOL_HEIGHT]
                    
                    // Use sine wave for natural bounce motion
                    const bounceOffset = Math.sin(Math.PI * bounceProgress) * overshootAmount * (1 - bounceProgress)
                    
                    // Apply bounce to all symbols as one unit
                    for (let i = 1; i < reel.children.length; i++) {
                      const targetY = targetPositions[i - 1]
                      reel.children[i].y = targetY + bounceOffset
                    }
                    
                    requestAnimationFrame(animate)
                  }
                } else {
                  // Bounce complete - ensure final positions are exact
                  const targetPositions = [0, SYMBOL_HEIGHT, 2 * SYMBOL_HEIGHT]
                  for (let i = 1; i < reel.children.length; i++) {
                    reel.children[i].y = targetPositions[i - 1]
                  }
                  
                  // Check if all reels have finished bouncing
                  if (index === REEL_COUNT - 1) {
                    isSpinningRef.current = false
                  }
                }
              }
              
              animate()
            }
          })
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
