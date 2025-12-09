/**
 * usePixiSetup Hook
 *
 * Handles PIXI.js application initialization, asset loading, and scene setup.
 * Extracted from page.tsx to improve modularity and testability.
 *
 * @module usePixiSetup
 */

import { useEffect, useRef, RefObject } from 'react'
import { Application, Assets, Container, Sprite, Graphics, Text } from 'pixi.js'
import { sound } from '@pixi/sound'
import { formatCurrency, formatNumberWithSpaces, currencyToCredits } from '@/utils/currency'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PixiSetupRefs {
  app: RefObject<Application | null>
  reelsContainer: RefObject<Container | null>
  reels: RefObject<(Container | null)[]>
  uiCabinetOverlay: RefObject<Sprite | null>

  // UI Text references
  creditDollarText: RefObject<Text | null>
  creditAmountText: RefObject<Text | null>
  betDollarText: RefObject<Text | null>
  betAmountText: RefObject<Text | null>
  winDollarText: RefObject<Text | null>
  winAmountText: RefObject<Text | null>
  denomText: RefObject<Text | null>
  denomLabelText: RefObject<Text | null>
  autoStartText: RefObject<Text | null>

  // Sound functions
  playReelStopSound: RefObject<(() => void) | null>

  // Assets (available after initialization)
  assets: RefObject<PixiAssets | null>
}

export interface UsePixiSetupProps {
  pixiContainer: RefObject<HTMLDivElement | null>
  currentLanguage: 'en' | 'mk'
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number

  // Callbacks
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void
  onSpinReels?: () => void
  onKeyPress?: (event: KeyboardEvent) => void
}

export interface PixiAssets {
  mainAtlas: any
  reelAtlas: any
  backgroundAtlas: any
  expandAtlas: any
  wildAtlas: any
  winAtlases: { [key: string]: any }
}

// ============================================================================
// Constants
// ============================================================================

export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080

export const SYMBOL_WIDTH = 260
export const SYMBOL_HEIGHT = 260
export const REEL_COUNT = 5
export const SYMBOLS_PER_REEL = 3
export const REEL_GAP = 28

// Calculate total reel area dimensions
const totalReelWidth = REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP
const totalReelHeight = SYMBOLS_PER_REEL * SYMBOL_HEIGHT

export const REEL_OFFSET_X = (DESIGN_WIDTH / 2) - (totalReelWidth / 2)
export const REEL_OFFSET_Y = (DESIGN_HEIGHT / 2 - 70) - (totalReelHeight / 2)

export const PAYLINE_COLORS = [
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

export const PAYLINES_VISUAL = [
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], // Payline 1
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], // Payline 2
  [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], // Payline 3
  [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], // Payline 4
  [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]], // Payline 5
  [[0, 0], [1, 0], [2, 1], [3, 2], [4, 2]], // Payline 6
  [[0, 2], [1, 2], [2, 1], [3, 0], [4, 0]], // Payline 7
  [[0, 1], [1, 2], [2, 2], [2, 2], [4, 1]], // Payline 8
  [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1]], // Payline 9
  [[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]  // Payline 10
]

export const SYMBOL_NAME_TO_NUMBER: { [key: string]: string } = {
  'Cherry': '00',
  'Lemon': '01',
  'Orange': '02',
  'Plum': '03',
  'Bell': '04',
  'Grape': '05',
  'Watermelon': '06',
  'Seven': '07',
  'Wild': '08',
  'Star': '09',
  'Crown': '10'
}

const UI_Y_BASE = 980

const OVERLAY_POSITIONS = {
  CREDIT: { x: 600, y: UI_Y_BASE - 20 },
  BET: { x: 950, y: UI_Y_BASE - 20 },
  WIN: { x: 1340, y: UI_Y_BASE - 20 },
  MORE_GAMES: { x: 100, y: UI_Y_BASE },
  DENOM: { x: 275, y: UI_Y_BASE + 4 }
}

// Initial symbol sequence for reels
const INITIAL_SYMBOL_SEQUENCE = [
  ['00.png', '00.png', '00.png'], // Cherries column
  ['01.png', '01.png', '01.png'], // Lemons column
  ['02.png', '02.png', '02.png'], // Oranges column
  ['03.png', '03.png', '03.png'], // Plums column
  ['04.png', '04.png', '04.png']  // Bells column
]

// ============================================================================
// Asset Loading
// ============================================================================

async function loadAssets(): Promise<PixiAssets> {
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
    '/assets/10-0.json', // Crown win animation
    '/assets/ui-cabinet-overlay.png', // UI cabinet overlay (English)
    '/assets/ui-cabinet-overlay-mk.png', // UI cabinet overlay (Macedonian)
    '/assets/gambleResources.json', // Gamble assets
    // Sound assets
    { alias: 'reelSound', src: '/assets/mobileMainSounds.mp3' },
    { alias: 'winSound', src: '/assets/winSounds.mp3' },
    { alias: 'shortSound', src: '/assets/shortSounds.mp3' }
  ])

  const mainAtlas = Assets.cache.get('/assets/mainResources.json')
  const reelAtlas = Assets.cache.get('/assets/reelImages.json')
  const backgroundAtlas = Assets.cache.get('/assets/background.json')
  const expandAtlas = Assets.cache.get('/assets/expand-0.json')
  const wildAtlas = Assets.cache.get('/assets/08-0.json')

  // Win animation atlases (all symbols)
  const winAtlases: { [key: string]: any } = {
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

  if (!mainAtlas?.textures || !reelAtlas?.textures || !backgroundAtlas?.textures ||
      !expandAtlas?.textures || !wildAtlas?.textures) {
    throw new Error('❌ Missing textures')
  }

  return {
    mainAtlas,
    reelAtlas,
    backgroundAtlas,
    expandAtlas,
    wildAtlas,
    winAtlases
  }
}

// ============================================================================
// Sound Setup
// ============================================================================

function setupSounds() {
  // Play reel stop sound from 1 second for 0.3 seconds duration
  const playReelStopSound = () => {
    if (sound) {
      sound.play('reelSound', {
        start: 1,
        end: 1.3, // 0.3 seconds duration
        volume: 0.7
      })
    }
  }

  // Play wild reel sound (1 second from shortSounds.mp3)
  const playWildReelSound = () => {
    if (sound) {
      sound.play('shortSound', {
        start: 0,
        end: 1, // 1 second duration
        volume: 0.8
      })
    }
  }

  // Play wild expansion sound
  const playWildExpandSound = () => {
    if (sound) {
      sound.play('winSound', {
        start: 6.0,
        end: 10.3, // 4.6 seconds duration
        volume: 0.9
      })
    }
  }

  return {
    playReelStopSound,
    playWildReelSound,
    playWildExpandSound
  }
}

// ============================================================================
// Scene Setup Functions
// ============================================================================

function createBackground(app: Application, assets: PixiAssets) {
  // Main background - use full screen
  const mainBackground = new Sprite(assets.backgroundAtlas.textures['background.png'])
  mainBackground.width = DESIGN_WIDTH
  mainBackground.height = DESIGN_HEIGHT
  mainBackground.x = 0
  mainBackground.y = 0
  app.stage.addChild(mainBackground)

  // Reel background - centered
  const reelBackground = new Sprite(assets.mainAtlas.textures['reelBackground.png'])
  reelBackground.x = (DESIGN_WIDTH - reelBackground.width) / 2
  reelBackground.y = (DESIGN_HEIGHT - reelBackground.height) / 2
  app.stage.addChild(reelBackground)
}

function createReels(app: Application, assets: PixiAssets): [Container, (Container | null)[]] {
  const reelContainer = new Container()
  reelContainer.x = REEL_OFFSET_X
  reelContainer.y = REEL_OFFSET_Y
  app.stage.addChild(reelContainer)

  const reels: (Container | null)[] = Array(REEL_COUNT).fill(null)

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

    // Add initial symbols
    for (let j = 0; j < SYMBOLS_PER_REEL; j++) {
      const textureName = INITIAL_SYMBOL_SEQUENCE[i][j]
      const texture = assets.reelAtlas.textures[textureName]
      if (texture) {
        const symbol = new Sprite(texture)
        symbol.width = SYMBOL_WIDTH
        symbol.height = SYMBOL_HEIGHT
        symbol.x = 0
        symbol.y = j * SYMBOL_HEIGHT
        reel.addChild(symbol)
      }
    }

    reels[i] = reel
    reelContainer.addChild(reel)
  }

  return [reelContainer, reels]
}

function createUI(
  app: Application,
  assets: PixiAssets,
  props: UsePixiSetupProps
): {
  uiContainer: Container
  textRefs: {
    creditDollarText: Text
    creditAmountText: Text
    betDollarText: Text
    betAmountText: Text
    winDollarText: Text
    winAmountText: Text
    denomText: Text
    denomLabelText: Text
    autoStartText: Text
  }
} {
  const uiContainer = new Container()

  // Denomination display
  const denomNumberText = new Text(formatCurrency(props.denomination), {
    fontFamily: 'Arial',
    fontSize: 32,
    fill: 0xFFFFFF,
    fontWeight: 'bold',
    align: 'center'
  })
  denomNumberText.anchor.set(0.5)
  denomNumberText.x = OVERLAY_POSITIONS.DENOM.x
  denomNumberText.y = OVERLAY_POSITIONS.DENOM.y - 12
  uiContainer.addChild(denomNumberText)

  const denomLabelText = new Text(
    props.currentLanguage === 'en' ? 'CHANGE DENOM' : 'СМЕНИ ЈА ДЕНОМИНАЦИЈАТА',
    {
      fontFamily: 'Arial',
      fontSize: 18,
      fill: 0xFFFFFF,
      fontWeight: 'normal',
      align: 'center'
    }
  )
  denomLabelText.anchor.set(0.5)
  denomLabelText.x = OVERLAY_POSITIONS.DENOM.x
  denomLabelText.y = OVERLAY_POSITIONS.DENOM.y + 20
  uiContainer.addChild(denomLabelText)

  // CREDIT display
  const creditDollarText = new Text(`${formatCurrency(props.totalBalance)}`, {
    fontFamily: 'Arial Black',
    fontSize: 40,
    fill: 0xFFFF00, // Yellow
    fontWeight: '900',
    stroke: { color: 0x000000, width: 3 }
  })
  creditDollarText.anchor.set(0.5, 0)
  creditDollarText.x = OVERLAY_POSITIONS.CREDIT.x
  creditDollarText.y = OVERLAY_POSITIONS.CREDIT.y - 25
  uiContainer.addChild(creditDollarText)

  const creditAmountText = new Text(
    formatNumberWithSpaces(currencyToCredits(props.totalBalance, props.denomination)),
    {
      fontFamily: 'Arial Black',
      fontSize: 50,
      fill: 0xFFFFFF,
      fontWeight: '900'
    }
  )
  creditAmountText.anchor.set(0.5, 0)
  creditAmountText.x = OVERLAY_POSITIONS.CREDIT.x - 2
  creditAmountText.y = OVERLAY_POSITIONS.CREDIT.y + 10
  uiContainer.addChild(creditAmountText)

  // BET display
  const betDollarText = new Text(`${formatCurrency(props.currentBet)}`, {
    fontFamily: 'Arial Black',
    fontSize: 40,
    fill: 0xFFFF00,
    fontWeight: '900',
    stroke: { color: 0x000000, width: 3 }
  })
  betDollarText.anchor.set(0.5, 0)
  betDollarText.x = OVERLAY_POSITIONS.BET.x
  betDollarText.y = OVERLAY_POSITIONS.BET.y - 25
  uiContainer.addChild(betDollarText)

  const betAmountText = new Text(
    formatNumberWithSpaces(currencyToCredits(props.currentBet, props.denomination)),
    {
      fontFamily: 'Arial Black',
      fontSize: 50,
      fill: 0xFFFFFF,
      fontWeight: '900'
    }
  )
  betAmountText.anchor.set(0.5, 0)
  betAmountText.x = OVERLAY_POSITIONS.BET.x
  betAmountText.y = OVERLAY_POSITIONS.BET.y + 10
  uiContainer.addChild(betAmountText)

  // Bet up/down arrows
  const betUpArrow = new Text('▲', {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: 0xFFFFFF,
    fontWeight: 'bold'
  })
  betUpArrow.anchor.set(0.5)
  betUpArrow.x = 840
  betUpArrow.y = UI_Y_BASE + 25
  betUpArrow.interactive = true
  betUpArrow.cursor = 'pointer'
  if (props.onIncreaseBet) {
    betUpArrow.on('pointerdown', props.onIncreaseBet)
  }
  uiContainer.addChild(betUpArrow)

  const betDownArrow = new Text('▼', {
    fontFamily: 'Arial',
    fontSize: 24,
    fill: 0xFFFFFF,
    fontWeight: 'bold'
  })
  betDownArrow.anchor.set(0.5)
  betDownArrow.x = 1100
  betDownArrow.y = UI_Y_BASE + 25
  betDownArrow.interactive = true
  betDownArrow.cursor = 'pointer'
  if (props.onDecreaseBet) {
    betDownArrow.on('pointerdown', props.onDecreaseBet)
  }
  uiContainer.addChild(betDownArrow)

  // WIN display
  const winDollarText = new Text(`${formatCurrency(props.lastWin)}`, {
    fontFamily: 'Arial Black',
    fontSize: 40,
    fill: 0xFFFF00,
    fontWeight: '900',
    stroke: { color: 0x000000, width: 3 }
  })
  winDollarText.anchor.set(0.5, 0)
  winDollarText.x = OVERLAY_POSITIONS.WIN.x
  winDollarText.y = OVERLAY_POSITIONS.WIN.y - 25
  uiContainer.addChild(winDollarText)

  const winAmountText = new Text(
    formatNumberWithSpaces(currencyToCredits(props.lastWin, props.denomination)),
    {
      fontFamily: 'Arial Black',
      fontSize: 50,
      fill: 0xFFFFFF,
      fontWeight: '900'
    }
  )
  winAmountText.anchor.set(0.5, 0)
  winAmountText.x = OVERLAY_POSITIONS.WIN.x
  winAmountText.y = OVERLAY_POSITIONS.WIN.y + 10
  uiContainer.addChild(winAmountText)

  // Autostart indicator
  const autoStartText = new Text('AUTO', {
    fontFamily: 'Arial Black',
    fontSize: 24,
    fill: 0x666666,
    fontWeight: 'bold',
    stroke: { color: 0x000000, width: 2 }
  })
  autoStartText.anchor.set(0.5)
  autoStartText.x = 100
  autoStartText.y = 100
  autoStartText.visible = false
  uiContainer.addChild(autoStartText)

  return {
    uiContainer,
    textRefs: {
      creditDollarText,
      creditAmountText,
      betDollarText,
      betAmountText,
      winDollarText,
      winAmountText,
      denomText: denomNumberText,
      denomLabelText,
      autoStartText
    }
  }
}

function createOverlaysAndDecorations(
  app: Application,
  assets: PixiAssets,
  currentLanguage: 'en' | 'mk'
): Sprite {
  // Lines indicators on both sides of reels
  const leftLinesIndicator = new Sprite(assets.mainAtlas.textures['linesIndicator.png'])
  leftLinesIndicator.x = REEL_OFFSET_X - leftLinesIndicator.width - 35
  leftLinesIndicator.y = REEL_OFFSET_Y + (SYMBOLS_PER_REEL * SYMBOL_HEIGHT - leftLinesIndicator.height) / 2
  app.stage.addChild(leftLinesIndicator)

  const rightLinesIndicator = new Sprite(assets.mainAtlas.textures['linesIndicator.png'])
  rightLinesIndicator.x = REEL_OFFSET_X + (REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP) + 35
  rightLinesIndicator.y = REEL_OFFSET_Y + (SYMBOLS_PER_REEL * SYMBOL_HEIGHT - rightLinesIndicator.height) / 2
  app.stage.addChild(rightLinesIndicator)

  // UI Cabinet overlay
  const overlayPath = currentLanguage === 'en'
    ? '/assets/ui-cabinet-overlay.png'
    : '/assets/ui-cabinet-overlay-mk.png'
  const uiCabinetTexture = Assets.cache.get(overlayPath)
  const uiCabinetOverlay = new Sprite(uiCabinetTexture)
  uiCabinetOverlay.width = DESIGN_WIDTH
  uiCabinetOverlay.height = DESIGN_HEIGHT
  uiCabinetOverlay.x = 0
  uiCabinetOverlay.y = 0
  app.stage.addChild(uiCabinetOverlay)

  // Reel border overlay
  const border = new Sprite(assets.mainAtlas.textures['reelBorder.png'])
  border.anchor.set(0.5)
  border.scale.set(1.30)
  border.x = DESIGN_WIDTH / 2
  border.y = DESIGN_HEIGHT / 2 - 70
  app.stage.addChild(border)

  return uiCabinetOverlay
}

// ============================================================================
// Main Hook
// ============================================================================

export function usePixiSetup(props: UsePixiSetupProps): PixiSetupRefs {
  const appRef = useRef<Application | null>(null)
  const reelsContainerRef = useRef<Container | null>(null)
  const reelsRef = useRef<(Container | null)[]>(Array(REEL_COUNT).fill(null))
  const uiCabinetOverlayRef = useRef<Sprite | null>(null)
  const assetsRef = useRef<PixiAssets | null>(null)

  // UI Text refs
  const creditDollarTextRef = useRef<Text | null>(null)
  const creditAmountTextRef = useRef<Text | null>(null)
  const betDollarTextRef = useRef<Text | null>(null)
  const betAmountTextRef = useRef<Text | null>(null)
  const winDollarTextRef = useRef<Text | null>(null)
  const winAmountTextRef = useRef<Text | null>(null)
  const denomTextRef = useRef<Text | null>(null)
  const denomLabelTextRef = useRef<Text | null>(null)
  const autoStartTextRef = useRef<Text | null>(null)

  // Sound refs
  const playReelStopSoundRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    let handleResize: (() => void) | null = null

    const init = async () => {
      app = new Application()

      // Get viewport dimensions
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Calculate scale to fit design into viewport
      const scaleX = viewportWidth / DESIGN_WIDTH
      const scaleY = viewportHeight / DESIGN_HEIGHT
      const scale = Math.min(scaleX, scaleY)

      const canvasWidth = DESIGN_WIDTH * scale
      const canvasHeight = DESIGN_HEIGHT * scale

      await app.init({
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: 0x1a1a2e,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      appRef.current = app

      if (props.pixiContainer.current && app.canvas) {
        props.pixiContainer.current.innerHTML = ''
        props.pixiContainer.current.appendChild(app.canvas)

        // Center the canvas
        app.canvas.style.display = 'block'
        app.canvas.style.margin = 'auto'
      }

      // Scale the entire stage to match the canvas scaling
      app.stage.scale.set(scale)

      // Add resize handler
      handleResize = () => {
        if (!app || destroyed) return

        const newViewportWidth = window.innerWidth
        const newViewportHeight = window.innerHeight
        const newScaleX = newViewportWidth / DESIGN_WIDTH
        const newScaleY = newViewportHeight / DESIGN_HEIGHT
        const newScale = Math.min(newScaleX, newScaleY)

        const newCanvasWidth = DESIGN_WIDTH * newScale
        const newCanvasHeight = DESIGN_HEIGHT * newScale

        app.renderer.resize(newCanvasWidth, newCanvasHeight)
        app.stage.scale.set(newScale)
      }

      window.addEventListener('resize', handleResize)

      try {
        // Load all assets
        const assets = await loadAssets()
        assetsRef.current = assets

        // Setup sounds
        const sounds = setupSounds()
        playReelStopSoundRef.current = sounds.playReelStopSound

        // Create scene
        createBackground(app, assets)

        const [reelContainer, reels] = createReels(app, assets)
        reelsContainerRef.current = reelContainer
        reelsRef.current = reels

        const { uiContainer, textRefs } = createUI(app, assets, props)

        const uiCabinetOverlay = createOverlaysAndDecorations(app, assets, props.currentLanguage)
        uiCabinetOverlayRef.current = uiCabinetOverlay

        // Add UI container AFTER overlay so text appears on top
        app.stage.addChild(uiContainer)

        // Store text refs
        creditDollarTextRef.current = textRefs.creditDollarText
        creditAmountTextRef.current = textRefs.creditAmountText
        betDollarTextRef.current = textRefs.betDollarText
        betAmountTextRef.current = textRefs.betAmountText
        winDollarTextRef.current = textRefs.winDollarText
        winAmountTextRef.current = textRefs.winAmountText
        denomTextRef.current = textRefs.denomText
        denomLabelTextRef.current = textRefs.denomLabelText
        autoStartTextRef.current = textRefs.autoStartText

      } catch (error) {
        console.error('❌ PIXI setup error:', error)
      }
    }

    init()

    // Cleanup
    return () => {
      destroyed = true
      if (handleResize) {
        window.removeEventListener('resize', handleResize)
      }
      if (app) {
        app.destroy(true, { children: true, texture: false })
      }
    }
  }, []) // Empty deps - only initialize once

  return {
    app: appRef,
    reelsContainer: reelsContainerRef,
    reels: reelsRef,
    uiCabinetOverlay: uiCabinetOverlayRef,
    creditDollarText: creditDollarTextRef,
    creditAmountText: creditAmountTextRef,
    betDollarText: betDollarTextRef,
    betAmountText: betAmountTextRef,
    winDollarText: winDollarTextRef,
    winAmountText: winAmountTextRef,
    denomText: denomTextRef,
    denomLabelText: denomLabelTextRef,
    autoStartText: autoStartTextRef,
    playReelStopSound: playReelStopSoundRef,
    assets: assetsRef
  }
}
