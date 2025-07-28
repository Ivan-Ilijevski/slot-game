'use client'

import { useEffect, useRef } from 'react'
import { Application, Assets, Sprite, Container } from 'pixi.js'

export default function Home() {
  const pixiContainer = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false

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

      } catch (err) {
        console.error('❌ Asset loading failed:', err)
      }
    }

    init()

    return () => {
      if (!destroyed && appRef.current) {
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
