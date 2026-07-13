'use client'

import { Application, extend, useApplication } from '@pixi/react'
import { Application as PixiApplication, Container, Sprite, Graphics, Text, TextStyle, Texture, Assets } from 'pixi.js'
import { memo, useEffect, useRef, useState } from 'react'
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  SYMBOL_WIDTH,
  SYMBOL_HEIGHT,
  REEL_COUNT,
  SYMBOLS_PER_REEL,
  REEL_GAP,
  REEL_OFFSET_X,
  REEL_OFFSET_Y
} from '../../config/pixiConstants'
import { formatCurrency, formatNumberWithSpaces, currencyToCredits } from '@/utils/currency'

// Register Pixi components for use with @pixi/react
extend({ Container, Sprite, Graphics, Text })

const totalReelWidth = REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP
const totalReelHeight = SYMBOLS_PER_REEL * SYMBOL_HEIGHT

// UI positioning (matches the live scene)
const UI_Y_BASE = 980
const OVERLAY_POSITIONS = {
  CREDIT: { x: 600, y: UI_Y_BASE - 20 },
  BET: { x: 950, y: UI_Y_BASE - 20 },
  WIN: { x: 1340, y: UI_Y_BASE - 20 },
  DENOM: { x: 275, y: UI_Y_BASE + 4 }
}

// Text styles (created once at module scope; the scene renders exactly once)
const dollarTextStyle = () => new TextStyle({
  fontFamily: 'Arial Black',
  fontSize: 40,
  fill: 0xFFFF00,
  fontWeight: '900',
  stroke: { color: 0x000000, width: 3 }
})
const amountTextStyle = () => new TextStyle({
  fontFamily: 'Arial Black',
  fontSize: 50,
  fill: 0xFFFFFF,
  fontWeight: '900'
})
const denomNumberStyle = () => new TextStyle({
  fontFamily: 'Arial',
  fontSize: 32,
  fill: 0xFFFFFF,
  fontWeight: 'bold',
  align: 'center'
})
const denomLabelStyle = () => new TextStyle({
  fontFamily: 'Arial',
  fontSize: 18,
  fill: 0xFFFFFF,
  fontWeight: 'normal',
  align: 'center'
})
const arrowStyle = () => new TextStyle({
  fontFamily: 'Arial',
  fontSize: 24,
  fill: 0xFFFFFF,
  fontWeight: 'bold'
})
const autoStartStyle = () => new TextStyle({
  fontFamily: 'Arial Black',
  fontSize: 24,
  fill: 0x666666,
  fontWeight: 'bold',
  stroke: { color: 0x000000, width: 2 }
})

export interface PixiGameTextRefs {
  denomText: Text | null
  denomLabelText: Text | null
  creditDollarText: Text | null
  creditAmountText: Text | null
  betDollarText: Text | null
  betAmountText: Text | null
  winDollarText: Text | null
  winAmountText: Text | null
  autoStartText: Text | null
}

export interface PixiGameHandle {
  getApp: () => PixiApplication
  getReelsContainer: () => Container | null
  getReels: () => (Container | null)[]
  getTextRefs: () => PixiGameTextRefs
  getUiCabinetOverlay: () => Sprite | null
}

interface PixiGameProps {
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number
  currentLanguage: 'en' | 'mk'
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void
  onGameReady?: (handle: PixiGameHandle) => void
}

export default function PixiGame(props: PixiGameProps) {
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [scale, setScale] = useState(1)

  // Load assets on mount (Assets.load dedupes by URL, safe under StrictMode)
  useEffect(() => {
    const loadAssets = async () => {
      try {
        // Register the @pixi/sound asset parser before loading the mp3 sprites
        await import('@pixi/sound')
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
      const scaleX = window.innerWidth / DESIGN_WIDTH
      const scaleY = window.innerHeight / DESIGN_HEIGHT
      setScale(Math.min(scaleX, scaleY))
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
        width={DESIGN_WIDTH * scale}
        height={DESIGN_HEIGHT * scale}
        backgroundColor={0x1a1a2e}
        resolution={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
        autoDensity={true}
      >
        <GameContent {...props} scale={scale} />
      </Application>
    </div>
  )
}

interface GameContentProps extends PixiGameProps {
  scale: number
}

function GameContent(props: GameContentProps) {
  const { app, isInitialised } = useApplication()
  const reelsContainerRef = useRef<Container | null>(null)
  const reelsRef = useRef<(Container | null)[]>([null, null, null, null, null])
  const textRefs = useRef<PixiGameTextRefs>({
    denomText: null,
    denomLabelText: null,
    creditDollarText: null,
    creditAmountText: null,
    betDollarText: null,
    betAmountText: null,
    winDollarText: null,
    winAmountText: null,
    autoStartText: null
  })
  const overlayRef = useRef<Sprite | null>(null)

  // Latest bet callbacks; the render-once scene reads them through this ref
  const callbacksRef = useRef<{ onIncreaseBet?: () => void, onDecreaseBet?: () => void }>({})
  callbacksRef.current = { onIncreaseBet: props.onIncreaseBet, onDecreaseBet: props.onDecreaseBet }

  const onGameReadyRef = useRef(props.onGameReady)
  onGameReadyRef.current = props.onGameReady

  // Display values are frozen at first render; after mount every dynamic
  // element is driven imperatively through the exposed refs (same contract
  // as the vanilla scene), so React never reconciles the scene again.
  const initialRef = useRef({
    denomination: props.denomination,
    totalBalance: props.totalBalance,
    currentBet: props.currentBet,
    lastWin: props.lastWin,
    currentLanguage: props.currentLanguage
  })

  // The stage itself carries the responsive scale (matching the vanilla
  // setup): scene elements are direct stage children, so the animation
  // hooks can insert highlight containers at stage level in the same
  // coordinate space and find the border / winLineDisplay by lookup.
  // Resize is handled imperatively like the vanilla setup - the renderer
  // and the stage scale must change together.
  useEffect(() => {
    if (isInitialised && app?.renderer && app.stage) {
      app.renderer.resize(DESIGN_WIDTH * props.scale, DESIGN_HEIGHT * props.scale)
      app.stage.scale.set(props.scale)
    }
  }, [isInitialised, app, props.scale])

  const readyFiredRef = useRef(false)
  useEffect(() => {
    if (!isInitialised || readyFiredRef.current) return
    if (!app || reelsRef.current.some(reel => reel === null)) return

    // Assign each reel's mask graphic (child 0) as its actual mask
    reelsRef.current.forEach(reel => {
      if (reel && reel.children[0]) {
        reel.mask = reel.children[0] as Graphics
      }
    })

    readyFiredRef.current = true
    onGameReadyRef.current?.({
      getApp: () => app,
      getReelsContainer: () => reelsContainerRef.current,
      getReels: () => reelsRef.current,
      getTextRefs: () => textRefs.current,
      getUiCabinetOverlay: () => overlayRef.current
    })
  }, [isInitialised, app])

  return (
    <SceneOnce
      initial={initialRef.current}
      reelsContainerRef={reelsContainerRef}
      reelsRef={reelsRef}
      textRefs={textRefs}
      overlayRef={overlayRef}
      callbacksRef={callbacksRef}
    />
  )
}

interface SceneProps {
  initial: {
    denomination: number
    totalBalance: number
    currentBet: number
    lastWin: number
    currentLanguage: 'en' | 'mk'
  }
  reelsContainerRef: React.MutableRefObject<Container | null>
  reelsRef: React.MutableRefObject<(Container | null)[]>
  textRefs: React.MutableRefObject<PixiGameTextRefs>
  overlayRef: React.MutableRefObject<Sprite | null>
  callbacksRef: React.MutableRefObject<{ onIncreaseBet?: () => void, onDecreaseBet?: () => void }>
}

// Renders exactly once (memo comparator always returns true): spin logic,
// win animations, and the page's text-update effects mutate this scene
// imperatively, and React must never overwrite those mutations.
const SceneOnce = memo(function Scene({ initial, reelsContainerRef, reelsRef, textRefs, overlayRef, callbacksRef }: SceneProps) {
  const backgroundAtlas = Assets.cache.get('/assets/background.json')
  const mainAtlas = Assets.cache.get('/assets/mainResources.json')
  const reelAtlas = Assets.cache.get('/assets/reelImages.json')

  if (!backgroundAtlas || !mainAtlas || !reelAtlas) {
    return null
  }

  const reelBackgroundTexture = mainAtlas.textures['reelBackground.png']
  const linesIndicatorTexture = mainAtlas.textures['linesIndicator.png']
  const overlayPath = initial.currentLanguage === 'en'
    ? '/assets/ui-cabinet-overlay.png'
    : '/assets/ui-cabinet-overlay-mk.png'
  const uiCabinetTexture = Assets.cache.get(overlayPath)

  // Initial symbol layout (matches the vanilla scene)
  const symbolSequence = [
    ['00.png', '00.png', '00.png'], // Cherries column
    ['01.png', '01.png', '01.png'], // Lemons column
    ['02.png', '02.png', '02.png'], // Oranges column
    ['03.png', '03.png', '03.png'], // Plums column
    ['04.png', '04.png', '04.png']  // Bells column
  ]

  const drawReelMask = (g: Graphics) => {
    g.clear()
    g.rect(0, 0, SYMBOL_WIDTH, SYMBOLS_PER_REEL * SYMBOL_HEIGHT)
    g.fill(0xFFFFFF)
  }

  return (
    <>
      {/* Main background - full screen */}
      <pixiSprite
        texture={backgroundAtlas.textures['background.png']}
        width={DESIGN_WIDTH}
        height={DESIGN_HEIGHT}
        x={0}
        y={0}
      />

      {/* Reel background - centered at natural size */}
      <pixiSprite
        texture={reelBackgroundTexture}
        x={(DESIGN_WIDTH - reelBackgroundTexture.width) / 2}
        y={(DESIGN_HEIGHT - reelBackgroundTexture.height) / 2}
      />

      {/* Reels: children per reel are [mask @0, overshoot @1, symbols @2-4] —
          the exact contract useSpinLogic and useWinAnimations operate on */}
      <pixiContainer
        ref={(el: Container | null) => { reelsContainerRef.current = el }}
        x={REEL_OFFSET_X}
        y={REEL_OFFSET_Y}
      >
        {Array.from({ length: REEL_COUNT }).map((_, reelIndex) => (
          <pixiContainer
            key={`reel-${reelIndex}`}
            ref={(el: Container | null) => { reelsRef.current[reelIndex] = el }}
            x={reelIndex * (SYMBOL_WIDTH + REEL_GAP)}
          >
            {/* Mask graphic (assigned as reel.mask once the app is ready) */}
            <pixiGraphics draw={drawReelMask} />

            {/* Overshoot symbol - above the visible area, textured during spins */}
            <pixiSprite
              texture={Texture.EMPTY}
              width={SYMBOL_WIDTH}
              height={SYMBOL_HEIGHT}
              x={0}
              y={-SYMBOL_HEIGHT}
              visible={false}
            />

            {/* Visible symbols */}
            {symbolSequence[reelIndex].map((symbolName, symbolIndex) => (
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

      {/* Win line display - found by label by useWinAnimations */}
      <pixiContainer
        ref={(el: Container | null) => { if (el) el.label = 'winLineDisplay' }}
        x={DESIGN_WIDTH / 2}
        y={REEL_OFFSET_Y + totalReelHeight + 20}
        visible={false}
      />

      {/* Lines indicators on both sides of the reels */}
      <pixiSprite
        texture={linesIndicatorTexture}
        x={REEL_OFFSET_X - linesIndicatorTexture.width - 35}
        y={REEL_OFFSET_Y + (totalReelHeight - linesIndicatorTexture.height) / 2}
      />
      <pixiSprite
        texture={linesIndicatorTexture}
        x={REEL_OFFSET_X + totalReelWidth + 35}
        y={REEL_OFFSET_Y + (totalReelHeight - linesIndicatorTexture.height) / 2}
      />

      {/* UI cabinet overlay (texture swapped imperatively on language change) */}
      {uiCabinetTexture && (
        <pixiSprite
          ref={(el: Sprite | null) => { overlayRef.current = el }}
          texture={uiCabinetTexture}
          width={DESIGN_WIDTH}
          height={DESIGN_HEIGHT}
          x={0}
          y={0}
        />
      )}

      {/* Reel border - above the overlay, below the UI texts */}
      <pixiSprite
        texture={mainAtlas.textures['reelBorder.png']}
        anchor={0.5}
        scale={1.3}
        x={DESIGN_WIDTH / 2}
        y={DESIGN_HEIGHT / 2 - 70}
      />

      {/* Denomination */}
      <pixiText
        ref={(el: Text | null) => { textRefs.current.denomText = el }}
        text={formatCurrency(initial.denomination)}
        anchor={0.5}
        x={OVERLAY_POSITIONS.DENOM.x}
        y={OVERLAY_POSITIONS.DENOM.y - 12}
        style={denomNumberStyle()}
      />
      <pixiText
        ref={(el: Text | null) => { textRefs.current.denomLabelText = el }}
        text={initial.currentLanguage === 'en' ? 'CHANGE DENOM' : 'СМЕНИ ЈА\nДЕНОМИНАЦИЈАТА'}
        anchor={0.5}
        x={OVERLAY_POSITIONS.DENOM.x}
        y={OVERLAY_POSITIONS.DENOM.y + 20}
        style={denomLabelStyle()}
      />

      {/* Credit */}
      <pixiText
        ref={(el: Text | null) => { textRefs.current.creditDollarText = el }}
        text={formatCurrency(initial.totalBalance)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.CREDIT.x}
        y={OVERLAY_POSITIONS.CREDIT.y - 25}
        style={dollarTextStyle()}
      />
      <pixiText
        ref={(el: Text | null) => { textRefs.current.creditAmountText = el }}
        text={formatNumberWithSpaces(currencyToCredits(initial.totalBalance, initial.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.CREDIT.x - 2}
        y={OVERLAY_POSITIONS.CREDIT.y + 10}
        style={amountTextStyle()}
      />

      {/* Bet */}
      <pixiText
        ref={(el: Text | null) => { textRefs.current.betDollarText = el }}
        text={formatCurrency(initial.currentBet)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.BET.x}
        y={OVERLAY_POSITIONS.BET.y - 25}
        style={dollarTextStyle()}
      />
      <pixiText
        ref={(el: Text | null) => { textRefs.current.betAmountText = el }}
        text={formatNumberWithSpaces(currencyToCredits(initial.currentBet, initial.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.BET.x}
        y={OVERLAY_POSITIONS.BET.y + 10}
        style={amountTextStyle()}
      />

      {/* Bet up/down arrows */}
      <pixiText
        text={'▲'}
        anchor={0.5}
        x={840}
        y={UI_Y_BASE + 25}
        eventMode={'static'}
        cursor={'pointer'}
        onPointerDown={() => callbacksRef.current.onIncreaseBet?.()}
        style={arrowStyle()}
      />
      <pixiText
        text={'▼'}
        anchor={0.5}
        x={1100}
        y={UI_Y_BASE + 25}
        eventMode={'static'}
        cursor={'pointer'}
        onPointerDown={() => callbacksRef.current.onDecreaseBet?.()}
        style={arrowStyle()}
      />

      {/* Win */}
      <pixiText
        ref={(el: Text | null) => { textRefs.current.winDollarText = el }}
        text={formatCurrency(initial.lastWin)}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.WIN.x}
        y={OVERLAY_POSITIONS.WIN.y - 25}
        style={dollarTextStyle()}
      />
      <pixiText
        ref={(el: Text | null) => { textRefs.current.winAmountText = el }}
        text={formatNumberWithSpaces(currencyToCredits(initial.lastWin, initial.denomination))}
        anchor={{ x: 0.5, y: 0 }}
        x={OVERLAY_POSITIONS.WIN.x}
        y={OVERLAY_POSITIONS.WIN.y + 10}
        style={amountTextStyle()}
      />

      {/* Autostart indicator - hidden until autostart is active */}
      <pixiText
        ref={(el: Text | null) => { textRefs.current.autoStartText = el }}
        text={'AUTO'}
        anchor={0.5}
        x={100}
        y={100}
        visible={false}
        style={autoStartStyle()}
      />
    </>
  )
}, () => true)
