'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Application, Assets, Graphics, Text } from 'pixi.js'

// Import all game components
import { SHINING_CROWN_CONFIG, type GameConfig } from './GameConfig'
import { formatNumberWithSpaces } from './CurrencyUtils'
import { SoundManager } from './SoundManager'
import { APIClient } from './APIClient'
import { useBettingControls } from './BettingControls'
import { useBalanceDisplay } from './BalanceDisplay'
import { useKeyboardHandler } from './KeyboardHandler'
import { WinAnimationManager } from './WinAnimations'
import { useGambleFeature } from './GambleFeature'
import { useAutoplayFeature } from './AutoplayFeature'
import { ReelsManager } from './ReelsManager'
import { PaylineCalculator } from './PaylineCalculator'
import PIXIGameCanvas, { usePIXICanvas } from './PIXIGameCanvas'

export interface GameRendererProps {
  gameConfig?: Partial<GameConfig>
  initialBalance?: number
  apiBaseURL?: string
  className?: string
  style?: React.CSSProperties
}

// Asset configuration for Shining Crown
const GAME_ASSETS = [
  // Atlas files
  { alias: 'mainAtlas', src: '/assets/mainResources.json' },
  { alias: 'reelAtlas', src: '/assets/reelImages.json' },
  { alias: 'backgroundAtlas', src: '/assets/background.json' },
  
  // UI Textures (both language variants)
  { alias: 'uiOverlayEN', src: '/assets/ui-cabinet-overlay.png' },
  { alias: 'uiOverlayMK', src: '/assets/ui-cabinet-overlay-mk.png' }
  
  // Note: Sound files are handled separately by SoundManager
]

// Dynamic background configuration function
const getBackgroundConfig = (language: 'en' | 'mk') => ({
  main: 'backgroundAtlas',
  reel: 'mainAtlas', 
  overlay: language === 'en' ? 'uiOverlayEN' : 'uiOverlayMK',
  border: 'mainAtlas',
  borderScale: 1.30,
  borderOffset: { x: 0, y: 0 }
})

export function useGameRenderer({
  gameConfig = {},
  initialBalance = 1000,
  apiBaseURL = '/api'
}: Omit<GameRendererProps, 'className' | 'style'>) {
  const config = { ...SHINING_CROWN_CONFIG, ...gameConfig }
  
  // Refs for PIXI and game managers
  const pixiContainerRef = useRef<HTMLDivElement>(null!)
  const soundManagerRef = useRef<SoundManager | null>(null)
  const apiClientRef = useRef<APIClient | null>(null)
  const winAnimationManagerRef = useRef<WinAnimationManager | null>(null)
  const reelsManagerRef = useRef<ReelsManager | null>(null)
  const paylineCalculatorRef = useRef<PaylineCalculator | null>(null)
  
  // Game state
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'mk'>('en')
  const [gameState, setGameState] = useState({
    balance: initialBalance,
    lastWin: 0,
    pendingWin: 0,
    currentSymbols: [] as string[][],
    winLines: [] as unknown[]
  })

  // Sound play helper (defined early)
  const playSound = useCallback((alias: string, options: any = {}) => {
    soundManagerRef.current?.playCustomSound(alias, options)
  }, [])

  // Initialize PIXI canvas with dynamic background config
  const canvas = usePIXICanvas({
    gameConfig: config,
    backgroundConfig: getBackgroundConfig(currentLanguage),
    assetList: GAME_ASSETS,
    onAppReady: handleAppReady,
    onAssetsLoaded: handleAssetsLoaded,
    onError: handleError,
    containerRef: pixiContainerRef
  })

  // Initialize betting controls
  const betting = useBettingControls({
    initialBet: config.betOptions[0],
    betOptions: config.betOptions,
    isSpinning,
    hasPendingWin: gameState.pendingWin > 0,
    onBetChange: handleBetChange
  })

  // Initialize balance display
  const balance = useBalanceDisplay({
    balance: gameState.balance,
    currentBet: betting.currentBet,
    denomination: 0.01, // Default denomination
    onWinCollected: handleWinCollected
  })

  // Initialize gamble feature
  const gamble = useGambleFeature({
    enabled: gameState.pendingWin > 0,
    pendingWin: gameState.pendingWin,
    isSpinning,
    pixiApp: canvas.app,
    onEnterGamble: handleGambleStart,
    onExitGamble: handleGambleCancel,
    onCollectWin: handleGambleComplete,
    onSoundPlay: playSound
  })

  // Initialize autoplay feature
  const autoplay = useAutoplayFeature({
    isSpinning,
    hasWins: gameState.pendingWin > 0,
    balance: gameState.balance,
    currentBet: betting.currentBet,
    onSpin: handleSpin,
    onStop: (reason: string) => console.log('Autoplay stopped:', reason)
  })

  // Initialize keyboard handler
  const keyboard = useKeyboardHandler({
    gameState: {
      isSpinning,
      isGambleMode: gamble.isActive,
      gambleStage: 'choice' as const,
      hasPendingWin: gameState.pendingWin > 0,
      isWinAnimating: false,
      stopRequested: false,
      hasRunningAnimations: false
    },
    actions: {
      spinReels: handleSpin,
      stopReels: handleStop,
      takeWin: handleTakeWin,
      cycleBet: betting.increaseBet,
      setMaxBet: betting.setMaxBet,
      cycleDenomination: () => {}, // Not implemented
      enterGambleMode: handleGambleStart,
      chooseGambleColor: () => {}, // Not implemented
      collectGambleWin: handleGambleCancel,
      toggleAutoStart: () => {
        if (autoplay.isActive) {
          autoplay.stopAutoplay()
        } else {
          autoplay.startAutoplay()
        }
      },
      toggleLanguage: () => {
        setCurrentLanguage(prev => prev === 'en' ? 'mk' : 'en')
        console.log('🌐 Language toggled to:', currentLanguage === 'en' ? 'mk' : 'en')
      }
    }
  })

  // App ready handler
  function handleAppReady(app: Application) {
    console.log('🎮 PIXI app ready, initializing game managers')
    
    // Initialize sound manager
    soundManagerRef.current = new SoundManager(config.soundConfig)
    
    // Initialize API client
    apiClientRef.current = new APIClient(apiBaseURL)
    
    // Load initial balance
    loadWalletBalance()
  }

  // Assets loaded handler
  function handleAssetsLoaded(app: Application) {
    console.log('🎮 Assets loaded, setting up game components')
    
    if (!app.stage) {
      console.error('PIXI app stage not available')
      return
    }

    try {
      // Get atlas textures from Assets cache
      const mainAtlas = Assets.cache.get('mainAtlas')
      const reelAtlas = Assets.cache.get('reelAtlas')

      if (!reelAtlas?.textures) {
        console.error('Reel atlas not found or invalid')
        return
      }

      // Initialize payline calculator
      paylineCalculatorRef.current = new PaylineCalculator()

      // Setup the original PIXI-based UI elements here
      setupOriginalUIElements(app, mainAtlas, reelAtlas)

      setIsInitialized(true)
      console.log('✅ Game renderer fully initialized')

    } catch (error) {
      console.error('Error setting up game components:', error)
      handleError(error instanceof Error ? error : new Error('Setup failed'))
    }
  }

  // Setup original PIXI UI elements to match the original design
  function setupOriginalUIElements(app: Application, mainAtlas: any, reelAtlas: any) {
    console.log('Setting up original PIXI UI elements...')
    
    // Setup reel containers and symbols
    setupReelSystem(app, reelAtlas)
    
    // Create UI text elements like the original game
    setupUITextElements(app)
    
    // Setup interactive areas for betting and spinning
    setupBettingInteractions(app)
    
    // Setup other original UI elements
    setupGameUI(app, mainAtlas)
  }

  function setupReelSystem(app: Application, reelAtlas: any) {
    if (!reelAtlas || !reelAtlas.textures) {
      console.error('Reel atlas not available for reel setup')
      return
    }

    try {
      // Initialize ReelsManager with proper constructor parameters
      reelsManagerRef.current = new ReelsManager({
        pixiApp: app,
        reelAtlas: reelAtlas,
        config: {
          symbolWidth: 198,
          symbolHeight: 198,
          reelCount: config.reelCount,
          symbolsPerReel: config.symbolsPerReel,
          reelGap: 10,
          spinSpeed: 20,
          bounceDuration: 200,
          overshootAmount: 50
        },
        timing: {
          bounceStartTimes: [1000, 1200, 1400, 1600, 1800],
          bounceEndTimes: [1200, 1400, 1600, 1800, 2000],
          minSpinDuration: 1000,
          stopStagger: 200,
          quickStopStagger: 20
        },
        onSpinComplete: handleSpinComplete,
        onReelStop: handleReelStop,
        onSoundPlay: playSound
      })

      // Setup the reel containers and initial symbols
      const reelManager = reelsManagerRef.current
      if (reelManager) {
        reelManager.setupReels()
      }

    } catch (error) {
      console.error('Error setting up reel system:', error)
    }

    console.log('Reel system setup completed')
  }

  function setupUITextElements(app: Application) {
    // Create text elements for balance, bet, win display using PIXI.Text
    const textStyle = { 
      fontFamily: 'Arial', 
      fontSize: 24, 
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 2
    }

    // Balance display
    const balanceText = new Text(`Balance: $${gameState.balance.toFixed(2)}`, textStyle)
    balanceText.x = 50
    balanceText.y = 50
    app.stage.addChild(balanceText)

    // Bet display  
    const betText = new Text(`Bet: $${betting.currentBet.toFixed(2)}`, textStyle)
    betText.x = 50
    betText.y = 100
    app.stage.addChild(betText)

    // Win display
    if (gameState.pendingWin > 0) {
      const winText = new Text(`Win: $${gameState.pendingWin.toFixed(2)}`, textStyle)
      winText.x = 50
      winText.y = 150
      app.stage.addChild(winText)
    }

    console.log('UI text elements created')
  }

  function setupBettingInteractions(app: Application) {
    // Create invisible clickable areas for bet up/down
    const betUpArea = new Graphics()
    betUpArea.rect(0, 0, 100, 50)
    betUpArea.fill(0x000000)
    betUpArea.alpha = 0 // Invisible
    betUpArea.interactive = true
    betUpArea.cursor = 'pointer'
    betUpArea.x = 1200 // Position for bet up
    betUpArea.y = 500
    betUpArea.on('pointerdown', () => {
      betting.setMaxBet()
    })
    
    const betDownArea = new Graphics()
    betDownArea.rect(0, 0, 100, 50)
    betDownArea.fill(0x000000)
    betDownArea.alpha = 0 // Invisible
    betDownArea.interactive = true
    betDownArea.cursor = 'pointer'
    betDownArea.x = 1100 // Position for bet down
    betDownArea.y = 500
    betDownArea.on('pointerdown', () => {
      betting.cycleBet()
    })

    // Spin button area
    const spinArea = new Graphics()
    spinArea.rect(0, 0, 150, 80)
    spinArea.fill(0x000000)
    spinArea.alpha = 0 // Invisible
    spinArea.interactive = true
    spinArea.cursor = 'pointer'
    spinArea.x = 1400 // Position for spin button
    spinArea.y = 450
    spinArea.on('pointerdown', () => {
      if (!isSpinning) {
        handleSpin()
      }
    })
    
    app.stage.addChild(betUpArea)
    app.stage.addChild(betDownArea)
    app.stage.addChild(spinArea)
    
    console.log('Betting and spin interaction areas created')
  }

  function setupGameUI(app: Application, mainAtlas: any) {
    // Setup payline visualization
    if (paylineCalculatorRef.current) {
      // paylineCalculatorRef.current.setupPaylineDisplay(app) // Method doesn't exist
    }

    // Setup win animation manager
    if (!winAnimationManagerRef.current) {
      // winAnimationManagerRef.current = new WinAnimationManager() // Requires parameters
      // winAnimationManagerRef.current.initialize(app)
    }

    console.log('Game UI elements created')
  }

  // Error handler
  function handleError(error: Error) {
    console.error('🚨 Game error:', error.message)
    // Could show error UI here
  }

  // Load wallet balance
  async function loadWalletBalance() {
    try {
      const client = apiClientRef.current
      if (client) {
        const wallet = await client.getWalletBalance()
        setGameState(prev => ({ ...prev, balance: wallet.balance }))
      }
    } catch (error) {
      console.error('Failed to load wallet balance:', error)
    }
  }

  // Bet change handler
  function handleBetChange(newBet: number) {
    console.log(`Bet changed to ${formatNumberWithSpaces(newBet)}`)
  }

  // Spin handler
  async function handleSpin() {
    if (!isInitialized || isSpinning || !reelsManagerRef.current) {
      return
    }

    try {
      setIsSpinning(true)
      
      // Play spin sound
      playSound('longSound', { start: 1.65, end: 5, volume: 0.8 })

      // Start reel spin with server results
      await reelsManagerRef.current.spinReels({
        betAmount: betting.currentBet,
        useServerResults: true
      })

    } catch (error) {
      console.error('Spin failed:', error)
      setIsSpinning(false)
    }
  }

  // Stop handler
  function handleStop() {
    if (reelsManagerRef.current) {
      reelsManagerRef.current.requestStop()
    }
  }

  // Spin complete handler
  async function handleSpinComplete(results: any[]) {
    console.log('🏁 Spin completed with results:', results)
    setIsSpinning(false)

    try {
      // Convert results to symbol array format
      const symbolResults = results.map(result => result.symbols)
      setGameState(prev => ({ ...prev, currentSymbols: symbolResults }))

      // Calculate wins
      const calculator = paylineCalculatorRef.current
      if (calculator) {
        const winCalculation = calculator.calculateWins(symbolResults, betting.currentBet)
        
        if (winCalculation.hasWins) {
          console.log(`💰 Win detected: ${formatNumberWithSpaces(winCalculation.totalWin)}`)
          
          // Update game state with win
          setGameState(prev => ({
            ...prev,
            lastWin: winCalculation.totalWin,
            pendingWin: winCalculation.totalWin,
            winLines: winCalculation.winLines
          }))

          // Show win animations
          const winAnimationManager = winAnimationManagerRef.current
          if (winAnimationManager) {
            await winAnimationManager.showWinHighlights(
              winCalculation.winLines,
              winCalculation.totalWin,
              balance.animateWinAmount
            )
          }

          // Play win sound
          playSound('winSound', { start: 0, end: 7, volume: 0.9 })
        }
      }

      // Check for autoplay continuation
      if (autoplay.isActive) {
        setTimeout(() => {
          if (autoplay.isActive && !gameState.pendingWin) {
            handleSpin()
          }
        }, 1000)
      }

    } catch (error) {
      console.error('Error processing spin results:', error)
    }
  }

  // Reel stop handler
  function handleReelStop(reelIndex: number, hasWild: boolean) {
    console.log(`Reel ${reelIndex + 1} stopped, hasWild: ${hasWild}`)
  }

  // Win collected handler
  function handleWinCollected() {
    setGameState(prev => ({
      ...prev,
      balance: prev.balance + prev.pendingWin,
      pendingWin: 0,
      lastWin: 0,
      winLines: []
    }))

    // Clear win highlights
    const winAnimationManager = winAnimationManagerRef.current
    if (winAnimationManager) {
      winAnimationManager.clearWinHighlights()
    }
  }

  // Take win handler
  function handleTakeWin() {
    if (gameState.pendingWin > 0) {
      handleWinCollected()
    }
  }

  // Win animation complete handler
  function handleWinAnimationComplete() {
    console.log('Win animation completed')
  }

  // handleBalanceUpdate is no longer needed

  // Gamble handlers
  function handleGambleStart() {
    console.log('Gamble mode started')
  }

  function handleGambleComplete(amount: number) {
    setGameState(prev => ({ ...prev, pendingWin: amount, balance: prev.balance + amount }))
  }

  function handleGambleCancel() {
    console.log('Gamble mode cancelled')
  }

  // playSound is defined above

  // Cleanup
  useEffect(() => {
    return () => {
      // Cleanup managers
      winAnimationManagerRef.current?.destroy?.()
      reelsManagerRef.current?.destroy?.()
      // SoundManager doesn't need explicit cleanup
    }
  }, [])

  return {
    // State
    isInitialized,
    isSpinning,
    gameState,
    canvas,
    
    // Components
    betting,
    balance,
    keyboard,
    gamble,
    autoplay,
    
    // Actions
    spin: handleSpin,
    stop: handleStop,
    takeWin: handleTakeWin,
    playSound,
    
    // Handlers
    handleAppReady,
    handleAssetsLoaded,
    handleError,
    
    // Managers (for advanced usage)
    managers: {
      sound: soundManagerRef.current,
      api: apiClientRef.current,
      winAnimation: winAnimationManagerRef.current,
      reels: reelsManagerRef.current,
      paylines: paylineCalculatorRef.current
    }
  }
}

// Main GameRenderer component
export default function GameRenderer({
  gameConfig,
  initialBalance,
  apiBaseURL,
  className = '',
  style = {}
}: GameRendererProps) {
  const config = { ...SHINING_CROWN_CONFIG, ...gameConfig }
  
  const game = useGameRenderer({
    gameConfig,
    initialBalance,
    apiBaseURL
  })

  return (
    <PIXIGameCanvas
      gameConfig={config}
      backgroundConfig={getBackgroundConfig(currentLanguage)}
      assetList={GAME_ASSETS}
      onAppReady={game.handleAppReady}
      onAssetsLoaded={game.handleAssetsLoaded}
      onError={game.handleError}
      className={className}
      style={style}
    />
  )
}

// useGameRenderer hook is exported above in the function declaration

// Utility functions
export const GameRendererUtils = {
  // Create test game configuration
  createTestConfig: (): Partial<GameConfig> => ({
    ...SHINING_CROWN_CONFIG,
    betOptions: [1, 5, 10, 25, 50]
  }),

  // Validate game configuration
  validateConfig: (config: Partial<GameConfig>): { isValid: boolean, errors: string[] } => {
    const errors: string[] = []
    
    if (config.betOptions && config.betOptions.length === 0) {
      errors.push('Bet options cannot be empty')
    }
    
    if (config.designWidth && config.designWidth <= 0) {
      errors.push('Design width must be positive')
    }
    
    if (config.designHeight && config.designHeight <= 0) {
      errors.push('Design height must be positive')
    }
    
    return { isValid: errors.length === 0, errors }
  },

  // Calculate expected assets
  getRequiredAssets: (): string[] => {
    return GAME_ASSETS.map(asset => 
      typeof asset === 'string' ? asset : asset.src
    )
  }
}