'use client'

import { Application, extend, useApplication } from '@pixi/react'
import { Container, Sprite, Graphics, Text, Assets, TextStyle } from 'pixi.js'
import { useCallback, useEffect, useState, useRef } from 'react'
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './usePixiSetup'
import { formatCurrency, formatNumberWithSpaces, currencyToCredits } from '@/utils/currency'

// Register Pixi components for use with @pixi/react
extend({ Container, Sprite, Graphics, Text })

export interface PixiGameHandle {
  getApp: () => any
  getReelsContainer: () => Container | null
  getReels: () => (Container | null)[]
}

interface PixiGameProps {
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number
  currentLanguage: 'en' | 'mk'
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void
  onSpinReels?: () => void
  onGameReady?: (handle: PixiGameHandle) => void
}

export default function PixiGame(props: PixiGameProps) {
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [scale, setScale] = useState(1)
  const appRef = useRef<any>(null)

  // Load assets on mount
  useEffect(() => {
    const loadAssets = async () => {
      try {
        await Assets.load([
          '/assets/mainResources.json',
          '/assets/reelImages.json',
          '/assets/background.json',
          '/assets/expand-0.json',
          '/assets/08-0.json',
          '/assets/00-0.json',
          '/assets/01-0.json',
          '/assets/02-0.json',
          '/assets/03-0.json',
          '/assets/04-0.json',
          '/assets/05-0.json',
          '/assets/06-0.json',
          '/assets/07-0.json',
          '/assets/09-0.json',
          '/assets/10-0.json',
          '/assets/ui-cabinet-overlay.png',
          '/assets/ui-cabinet-overlay-mk.png',
          '/assets/gambleResources.json',
          { alias: 'reelSound', src: '/assets/mobileMainSounds.mp3' },
          { alias: 'winSound', src: '/assets/winSounds.mp3' },
          { alias: 'shortSound', src: '/assets/shortSounds.mp3' }
        ])
        setAssetsLoaded(true)
      } catch (error) {
        console.error('Failed to load assets:', error)
      }
    }

    loadAssets()
  }, [])

  // Handle responsive scaling
  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const scaleX = viewportWidth / DESIGN_WIDTH
      const scaleY = viewportHeight / DESIGN_HEIGHT
      setScale(Math.min(scaleX, scaleY))
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const canvasWidth = DESIGN_WIDTH * scale
  const canvasHeight = DESIGN_HEIGHT * scale

  if (!assetsLoaded) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-900">
        <div className="text-white text-2xl">Loading game assets...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
      <Application
        ref={appRef}
        width={canvasWidth}
        height={canvasHeight}
        backgroundColor={0x1a1a2e}
        resolution={window.devicePixelRatio || 1}
        autoDensity={true}
      >
        <GameContent
          scale={scale}
          denomination={props.denomination}
          totalBalance={props.totalBalance}
          currentBet={props.currentBet}
          lastWin={props.lastWin}
          currentLanguage={props.currentLanguage}
          onIncreaseBet={props.onIncreaseBet}
          onDecreaseBet={props.onDecreaseBet}
          onGameReady={props.onGameReady}
          appRef={appRef}
        />
      </Application>
    </div>
  )
}

interface GameContentProps {
  scale: number
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number
  currentLanguage: 'en' | 'mk'
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void
  onGameReady?: (handle: PixiGameHandle) => void
  appRef: React.RefObject<any>
}

function GameContent(props: GameContentProps) {
  const app = useApplication()
  const reelsContainerRef = useRef<Container | null>(null)
  const reelsRef = useRef<(Container | null)[]>([null, null, null, null, null])

  // Constants that don't depend on assets
  const REEL_COUNT = 5
  const SYMBOLS_PER_REEL = 3
  const SYMBOL_WIDTH = 260
  const SYMBOL_HEIGHT = 260
  const REEL_GAP = 28
  const totalReelWidth = REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP
  const totalReelHeight = SYMBOLS_PER_REEL * SYMBOL_HEIGHT
  const REEL_OFFSET_X = (DESIGN_WIDTH / 2) - (totalReelWidth / 2)
  const REEL_OFFSET_Y = (DESIGN_HEIGHT / 2 - 70) - (totalReelHeight / 2)

  // Draw function for reel masks (must be defined before any conditional returns)
  const drawReelMask = useCallback((g: Graphics) => {
    g.clear()
    g.rect(0, 0, SYMBOL_WIDTH, SYMBOLS_PER_REEL * SYMBOL_HEIGHT)
    g.fill(0xFFFFFF)
  }, [])

  // Notify parent when game is ready
  useEffect(() => {
    if (app && props.onGameReady) {
      props.onGameReady({
        getApp: () => app,
        getReelsContainer: () => reelsContainerRef.current,
        getReels: () => reelsRef.current
      })
    }
  }, [app, props])

  const backgroundAtlas = Assets.cache.get('/assets/background.json')
  const mainAtlas = Assets.cache.get('/assets/mainResources.json')
  const reelAtlas = Assets.cache.get('/assets/reelImages.json')

  if (!backgroundAtlas || !mainAtlas || !reelAtlas) {
    return null
  }

  const overlayPath = props.currentLanguage === 'en'
    ? '/assets/ui-cabinet-overlay.png'
    : '/assets/ui-cabinet-overlay-mk.png'
  const uiCabinetTexture = Assets.cache.get(overlayPath)

  const INITIAL_SYMBOLS = [
    ['00.png', '00.png', '00.png'],
    ['01.png', '01.png', '01.png'],
    ['02.png', '02.png', '02.png'],
    ['03.png', '03.png', '03.png'],
    ['04.png', '04.png', '04.png']
  ]

  const UI_Y_BASE = 980
  const OVERLAY_POSITIONS = {
    CREDIT: { x: 600, y: UI_Y_BASE - 20 },
    BET: { x: 950, y: UI_Y_BASE - 20 },
    WIN: { x: 1340, y: UI_Y_BASE - 20 },
    DENOM: { x: 275, y: UI_Y_BASE + 4 }
  }

  const createTextStyle = (options: any) => new TextStyle(options)

  return (
    <pixiContainer scale={props.scale}>
      {/* Background Layer */}
      <pixiSprite
        texture={backgroundAtlas.textures['background.png']}
        width={DESIGN_WIDTH}
        height={DESIGN_HEIGHT}
        x={0}
        y={0}
      />

      <pixiSprite
        texture={mainAtlas.textures['reelBackground.png']}
        x={(DESIGN_WIDTH - 1370) / 2}
        y={(DESIGN_HEIGHT - 780) / 2}
      />

      {/* Reels Container */}
      <pixiContainer
        ref={reelsContainerRef}
        x={REEL_OFFSET_X}
        y={REEL_OFFSET_Y}
      >
        {Array.from({ length: REEL_COUNT }).map((_, reelIndex) => (
          <pixiContainer
            key={`reel-${reelIndex}`}
            ref={(el: Container | null) => { reelsRef.current[reelIndex] = el }}
            x={reelIndex * (SYMBOL_WIDTH + REEL_GAP)}
          >
            {/* Reel mask */}
            <pixiGraphics draw={drawReelMask} />

            {/* Symbols */}
            {INITIAL_SYMBOLS[reelIndex].map((symbolName, symbolIndex) => (
              <pixiSprite
                key={`symbol-${reelIndex}-${symbolIndex}`}
                texture={reelAtlas.textures[symbolName]}
                width={SYMBOL_WIDTH}
                height={SYMBOL_HEIGHT}
                x={0}
                y={symbolIndex * SYMBOL_HEIGHT}
              />
            ))}
          </pixiContainer>
        ))}
      </pixiContainer>

      {/* Lines Indicators */}
      <pixiSprite
        texture={mainAtlas.textures['linesIndicator.png']}
        x={REEL_OFFSET_X - 90 - 35}
        y={REEL_OFFSET_Y + (totalReelHeight - 724) / 2}
      />
      <pixiSprite
        texture={mainAtlas.textures['linesIndicator.png']}
        x={REEL_OFFSET_X + totalReelWidth + 35}
        y={REEL_OFFSET_Y + (totalReelHeight - 724) / 2}
      />

      {/* UI Cabinet Overlay */}
      {uiCabinetTexture && (
        <pixiSprite
          texture={uiCabinetTexture}
          width={DESIGN_WIDTH}
          height={DESIGN_HEIGHT}
          x={0}
          y={0}
        />
      )}

      {/* Reel Border */}
      <pixiSprite
        texture={mainAtlas.textures['reelBorder.png']}
        anchor={0.5}
        scale={1.30}
        x={DESIGN_WIDTH / 2}
        y={DESIGN_HEIGHT / 2 - 70}
      />

      {/* UI Text - Credit */}
      <pixiText
        text={formatCurrency(props.totalBalance)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.CREDIT.x}
        y={OVERLAY_POSITIONS.CREDIT.y - 25}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00,
          fontWeight: '900',
          stroke: { color: 0x000000, width: 3 }
        })}
      />
      <pixiText
        text={formatNumberWithSpaces(currencyToCredits(props.totalBalance, props.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.CREDIT.x - 2}
        y={OVERLAY_POSITIONS.CREDIT.y + 10}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF,
          fontWeight: '900'
        })}
      />

      {/* UI Text - Bet */}
      <pixiText
        text={formatCurrency(props.currentBet)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.BET.x}
        y={OVERLAY_POSITIONS.BET.y - 25}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00,
          fontWeight: '900',
          stroke: { color: 0x000000, width: 3 }
        })}
      />
      <pixiText
        text={formatNumberWithSpaces(currencyToCredits(props.currentBet, props.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.BET.x}
        y={OVERLAY_POSITIONS.BET.y + 10}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF,
          fontWeight: '900'
        })}
      />

      {/* UI Text - Win */}
      <pixiText
        text={formatCurrency(props.lastWin)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.WIN.x}
        y={OVERLAY_POSITIONS.WIN.y - 25}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00,
          fontWeight: '900',
          stroke: { color: 0x000000, width: 3 }
        })}
      />
      <pixiText
        text={formatNumberWithSpaces(currencyToCredits(props.lastWin, props.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.WIN.x}
        y={OVERLAY_POSITIONS.WIN.y + 10}
        style={createTextStyle({
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF,
          fontWeight: '900'
        })}
      />

      {/* UI Text - Denomination */}
      <pixiText
        text={formatCurrency(props.denomination)}
        anchor={0.5}
        x={OVERLAY_POSITIONS.DENOM.x}
        y={OVERLAY_POSITIONS.DENOM.y - 12}
        style={createTextStyle({
          fontFamily: 'Arial',
          fontSize: 32,
          fill: 0xFFFFFF,
          fontWeight: 'bold',
          align: 'center'
        })}
      />
      <pixiText
        text={props.currentLanguage === 'en' ? 'CHANGE DENOM' : 'СМЕНИ ЈА ДЕНОМИНАЦИЈАТА'}
        anchor={0.5}
        x={OVERLAY_POSITIONS.DENOM.x}
        y={OVERLAY_POSITIONS.DENOM.y + 20}
        style={createTextStyle({
          fontFamily: 'Arial',
          fontSize: 18,
          fill: 0xFFFFFF,
          fontWeight: 'normal',
          align: 'center'
        })}
      />
    </pixiContainer>
  )
}
