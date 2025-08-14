'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Container, Sprite, Graphics, Text, Assets } from 'pixi.js'
import { formatCurrency } from './CurrencyUtils'

export interface GambleElements {
  faceDownCard: Sprite
  faceUpCard: Sprite
  gambleAmountText: Text
  instructionsText: Text
  redButton: Sprite
  blackButton: Sprite
}

export interface GambleState {
  isActive: boolean
  amount: number
  stage: 'choice' | 'reveal' | 'result'
  selectedColor: 'red' | 'black' | null
  cardColor: 'red' | 'black' | null
}

export interface GambleConfig {
  winMultiplier: number
  autoNextRoundDelay: number
  resultDisplayDelay: number
  cardFlashInterval: number
  soundLoopInterval: number
  sounds: {
    flashing: { start: number; end: number; volume: number }
    win: { start: number; end: number; volume: number }
    loss: { start: number; end: number; volume: number }
  }
}

export interface GambleFeatureProps {
  pendingWin: number
  isSpinning: boolean
  pixiApp: unknown
  config?: Partial<GambleConfig>
  onEnterGamble: () => void
  onExitGamble: () => void
  onCollectWin: (amount: number) => void
  onSoundPlay?: (alias: string, options: unknown) => void
  onSoundStop?: (alias: string) => void
  onSoundStopAll?: () => void
}

export interface UseGambleFeatureProps extends GambleFeatureProps {
  enabled?: boolean
}

// Default gamble configuration
const DEFAULT_GAMBLE_CONFIG: GambleConfig = {
  winMultiplier: 2,
  autoNextRoundDelay: 2000,
  resultDisplayDelay: 100,
  cardFlashInterval: 80,
  soundLoopInterval: 100,
  sounds: {
    flashing: { start: 13, end: 13.1, volume: 0.9 },
    win: { start: 10.0, end: 11.0, volume: 0.9 },
    loss: { start: 9.0, end: 10.0, volume: 0.9 }
  }
}

// Card texture mapping
const CARD_TEXTURES = {
  red: ['cardFront1.png', 'cardFront2.png'], // Red cards 
  black: ['cardFront0.png', 'cardFront3.png'], // Black cards
  backRed: 'cardBackRed.png',
  backBlack: 'cardBackBlack.png'
}

export function useGambleFeature({
  pendingWin,
  isSpinning,
  pixiApp,
  config = {},
  onEnterGamble,
  onExitGamble,
  onCollectWin,
  onSoundPlay,
  onSoundStop,
  onSoundStopAll,
  enabled = true
}: UseGambleFeatureProps) {
  // Merge with default config
  const gambleConfig = { ...DEFAULT_GAMBLE_CONFIG, ...config }

  // State management
  const [gambleState, setGambleState] = useState<GambleState>({
    isActive: false,
    amount: 0,
    stage: 'choice',
    selectedColor: null,
    cardColor: null
  })

  // Refs for PIXI elements and intervals
  const gambleContainerRef = useRef<Container | null>(null)
  const gambleCardRef = useRef<Sprite | null>(null)
  const gambleButtonsRef = useRef<Container | null>(null)
  const cardFlashIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const gambleSoundLoopIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Setup gamble UI in PIXI
  const setupGambleUI = useCallback(() => {
    if (!pixiApp || !enabled) return

    // Type guard for PIXI app
    if (!(typeof pixiApp === 'object' && pixiApp && 'stage' in pixiApp)) return

    const gambleAtlas = Assets.get('/assets/gambleResources.json')
    if (!gambleAtlas) {
      console.error('Gamble resources not loaded')
      return
    }

    // Create gamble container (initially hidden)
    const gambleContainer = new Container()
    gambleContainer.visible = false
    gambleContainerRef.current = gambleContainer
    ;(pixiApp as any).stage.addChild(gambleContainer)

    // Create semi-transparent background overlay
    const overlay = new Graphics()
    overlay.rect(0, 0, 1920, 1080)
    overlay.fill({ color: 0x000000, alpha: 0.7 })
    gambleContainer.addChild(overlay)

    // Card display area - center of screen
    const cardX = 1920 / 2
    const cardY = 1080 / 2 - 50

    // Face-down card (initially visible)
    const faceDownCard = new Sprite(gambleAtlas.textures[CARD_TEXTURES.backRed])
    faceDownCard.anchor.set(0.5)
    faceDownCard.x = cardX
    faceDownCard.y = cardY
    faceDownCard.scale.set(1.5)
    gambleContainer.addChild(faceDownCard)

    // Face-up card (initially hidden)
    const faceUpCard = new Sprite(gambleAtlas.textures[CARD_TEXTURES.red[0]])
    faceUpCard.anchor.set(0.5)
    faceUpCard.x = cardX
    faceUpCard.y = cardY
    faceUpCard.scale.set(1.5)
    faceUpCard.visible = false
    gambleCardRef.current = faceUpCard
    gambleContainer.addChild(faceUpCard)

    // Button container
    const buttonsContainer = new Container()
    gambleButtonsRef.current = buttonsContainer
    gambleContainer.addChild(buttonsContainer)

    // Red button (left side)
    const redButton = new Sprite(gambleAtlas.textures['halfRedButtonUp.png'])
    redButton.anchor.set(0.5)
    redButton.x = cardX - 200
    redButton.y = cardY + 150
    redButton.scale.set(2)
    buttonsContainer.addChild(redButton)

    // Black button (right side)
    const blackButton = new Sprite(gambleAtlas.textures['halfBlackButtonUp.png'])
    blackButton.anchor.set(0.5)
    blackButton.x = cardX + 200
    blackButton.y = cardY + 150
    blackButton.scale.set(2)
    buttonsContainer.addChild(blackButton)

    // Gamble amount text
    const gambleAmountText = new Text({
      text: '0',
      style: {
        fontFamily: 'Arial Black',
        fontSize: 48,
        fill: 0xFFFF00,
        stroke: { color: 0x000000, width: 3 }
      }
    })
    gambleAmountText.anchor.set(0.5)
    gambleAmountText.x = cardX
    gambleAmountText.y = cardY - 200
    gambleContainer.addChild(gambleAmountText)

    // Instructions text
    const instructionsText = new Text({
      text: 'Press R for Red, B for Black, Space to Collect',
      style: {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xFFFFFF,
        align: 'center'
      }
    })
    instructionsText.anchor.set(0.5)
    instructionsText.x = cardX
    instructionsText.y = cardY + 250
    gambleContainer.addChild(instructionsText)

    // Store references for updates
    const containerWithElements = gambleContainer as Container & { gambleElements: GambleElements }
    containerWithElements.gambleElements = {
      faceDownCard,
      faceUpCard,
      gambleAmountText,
      instructionsText,
      redButton,
      blackButton
    }
  }, [pixiApp, enabled])

  // Start card flashing animation
  const startCardFlashing = useCallback(() => {
    if (cardFlashIntervalRef.current) {
      clearInterval(cardFlashIntervalRef.current)
    }

    // Start looping sound effect
    let loopCount = 0
    const playGambleSoundLoop = () => {
      if (gambleSoundLoopIntervalRef.current) {
        loopCount++
        console.log(`Playing gamble sound loop #${loopCount}`)
        
        // Play the sound using provided callback
        if (onSoundPlay) {
          onSoundPlay('reelSound', gambleConfig.sounds.flashing)
        }
      }
    }

    // Play immediately
    playGambleSoundLoop()

    // Set up interval to repeat
    gambleSoundLoopIntervalRef.current = setInterval(
      playGambleSoundLoop, 
      gambleConfig.soundLoopInterval
    )

    if (gambleContainerRef.current) {
      const containerWithElements = gambleContainerRef.current as Container & { gambleElements?: GambleElements }
      const elements = containerWithElements.gambleElements
      if (elements) {
        let isRed = true
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        
        // Flash between red and black card backs
        cardFlashIntervalRef.current = setInterval(() => {
          if (elements.faceDownCard && !elements.faceDownCard.destroyed) {
            elements.faceDownCard.texture = gambleAtlas.textures[
              isRed ? CARD_TEXTURES.backBlack : CARD_TEXTURES.backRed
            ]
            isRed = !isRed
          }
        }, gambleConfig.cardFlashInterval)
      }
    }
  }, [gambleConfig, onSoundPlay])

  // Stop card flashing animation
  const stopCardFlashing = useCallback(() => {
    if (cardFlashIntervalRef.current) {
      clearInterval(cardFlashIntervalRef.current)
      cardFlashIntervalRef.current = null
    }
    
    // Stop sound effect
    if (gambleSoundLoopIntervalRef.current) {
      clearInterval(gambleSoundLoopIntervalRef.current)
      gambleSoundLoopIntervalRef.current = null
    }
    
    // Stop the gamble sound
    if (onSoundStop) {
      onSoundStop('reelSound')
    }
    
    // Reset to default red back
    if (gambleContainerRef.current) {
      const containerWithElements = gambleContainerRef.current as Container & { gambleElements?: GambleElements }
      const elements = containerWithElements.gambleElements
      if (elements && elements.faceDownCard && !elements.faceDownCard.destroyed) {
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        elements.faceDownCard.texture = gambleAtlas.textures[CARD_TEXTURES.backRed]
      }
    }
  }, [onSoundStop])

  // Enter gamble mode
  const enterGambleMode = useCallback(() => {
    if (pendingWin > 0 && !isSpinning && enabled) {
      console.log('Entering gamble mode with amount:', pendingWin)
      
      // Stop all other sounds before starting gamble mode
      if (onSoundStopAll) {
        onSoundStopAll()
      }
      
      setGambleState({
        isActive: true,
        amount: pendingWin,
        stage: 'choice',
        selectedColor: null,
        cardColor: null
      })
      
      // Show gamble UI
      if (gambleContainerRef.current && pixiApp && typeof pixiApp === 'object' && 'stage' in pixiApp) {
        gambleContainerRef.current.visible = true
        
        // Move gamble container to top of display list
        ;(pixiApp as any).stage.removeChild(gambleContainerRef.current)
        ;(pixiApp as any).stage.addChild(gambleContainerRef.current)
        
        const containerWithElements = gambleContainerRef.current as Container & { gambleElements?: GambleElements }
        const elements = containerWithElements.gambleElements
        if (elements) {
          // Show face-down card, hide face-up card
          elements.faceDownCard.visible = true
          elements.faceUpCard.visible = false
          
          // Update amount display
          elements.gambleAmountText.text = formatCurrency(pendingWin)
          
          // Update instructions
          elements.instructionsText.text = 'Press R for Red, B for Black, Space to Collect'
        }
      }
      
      // Start card flashing animation
      startCardFlashing()
      
      // Notify parent component
      onEnterGamble()
    }
  }, [pendingWin, isSpinning, enabled, onSoundStopAll, pixiApp, startCardFlashing, onEnterGamble])

  // Exit gamble mode
  const exitGambleMode = useCallback(() => {
    console.log('Exiting gamble mode')
    
    setGambleState({
      isActive: false,
      amount: 0,
      stage: 'choice',
      selectedColor: null,
      cardColor: null
    })
    
    // Stop card flashing
    stopCardFlashing()
    
    // Hide gamble UI if it exists
    if (gambleContainerRef.current) {
      gambleContainerRef.current.visible = false
    }
    
    // Notify parent component
    onExitGamble()
  }, [stopCardFlashing, onExitGamble])

  // Collect gamble win
  const collectGambleWin = useCallback(() => {
    console.log(`Collecting gamble win: $${gambleState.amount}`)
    
    // Notify parent component with the amount to collect
    onCollectWin(gambleState.amount)
    
    // Exit gamble mode
    exitGambleMode()
  }, [gambleState.amount, onCollectWin, exitGambleMode])

  // Choose gamble color (main game logic)
  const chooseGambleColor = useCallback((color: 'red' | 'black') => {
    if (gambleState.stage === 'choice' && gambleContainerRef.current) {
      console.log('Player chose:', color)
      
      setGambleState(prev => ({
        ...prev,
        selectedColor: color,
        stage: 'reveal'
      }))
      
      // Stop card flashing when player makes choice
      stopCardFlashing()
      
      // Generate random card color (50/50 chance)
      const randomColor = Math.random() < 0.5 ? 'red' : 'black'
      
      const containerWithElements = gambleContainerRef.current as Container & { gambleElements?: GambleElements }
      const elements = containerWithElements.gambleElements
      if (elements) {
        // Update instructions
        elements.instructionsText.text = 'Revealing card...'
        
        // Show appropriate card based on random result
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        
        // Pick random card texture for the chosen color
        const availableCards = CARD_TEXTURES[randomColor] || CARD_TEXTURES.red
        const randomCardTexture = availableCards[Math.floor(Math.random() * availableCards.length)]
        
        setTimeout(() => {
          // Hide face-down card, show face-up card
          elements.faceDownCard.visible = false
          elements.faceUpCard.texture = gambleAtlas.textures[randomCardTexture]
          elements.faceUpCard.visible = true
          
          // Update state with revealed card color
          setGambleState(prev => ({
            ...prev,
            cardColor: randomColor
          }))
        }, 20)
      }
      
      // Determine win/lose
      const won = color === randomColor
      
      setTimeout(() => {
        setGambleState(prev => ({
          ...prev,
          stage: 'result'
        }))
        
        if (elements) {
          if (won) {
            // Double the gamble amount
            const newAmount = gambleState.amount * gambleConfig.winMultiplier
            
            setGambleState(prev => ({
              ...prev,
              amount: newAmount
            }))
            
            elements.gambleAmountText.text = formatCurrency(newAmount)
            elements.instructionsText.text = 'You won! Starting next round... Press Space to collect'
            
            if (onSoundPlay) {
              onSoundPlay('reelSound', gambleConfig.sounds.win)
            }
            
            console.log('Gamble won! New amount:', newAmount)
            
            // Auto-continue to next gamble round after showing win
            setTimeout(() => {
              // Reset to choice stage for another gamble
              setGambleState(prev => ({
                ...prev,
                stage: 'choice',
                selectedColor: null,
                cardColor: null
              }))
              
              // Reset UI to choice state
              if (elements) {
                elements.faceDownCard.visible = true
                elements.faceUpCard.visible = false
                elements.instructionsText.text = 'Press R for Red, B for Black, Space to Collect'
              }
              
              // Start card flashing for new gamble round
              startCardFlashing()
            }, gambleConfig.autoNextRoundDelay)
          } else {
            // Lost - clear everything
            setGambleState(prev => ({
              ...prev,
              amount: 0
            }))
            
            if (onSoundPlay) {
              onSoundPlay('reelSound', gambleConfig.sounds.loss)
            }
            
            elements.gambleAmountText.text = formatCurrency(0)
            elements.instructionsText.text = 'You lost! Better luck next time.'
            console.log('Gamble lost! Amount reset to 0')
            
            // Exit gamble mode after a short delay
            setTimeout(() => {
              exitGambleMode()
            }, gambleConfig.autoNextRoundDelay)
          }
        }
      }, gambleConfig.resultDisplayDelay)
    }
  }, [gambleState, stopCardFlashing, gambleConfig, onSoundPlay, startCardFlashing, exitGambleMode])

  // Setup UI when pixiApp becomes available
  useEffect(() => {
    if (pixiApp && enabled) {
      setupGambleUI()
    }
    
    return () => {
      // Cleanup on unmount
      if (cardFlashIntervalRef.current) {
        clearInterval(cardFlashIntervalRef.current)
      }
      if (gambleSoundLoopIntervalRef.current) {
        clearInterval(gambleSoundLoopIntervalRef.current)
      }
      
      if (gambleContainerRef.current && pixiApp && typeof pixiApp === 'object' && 'stage' in pixiApp) {
        ;(pixiApp as any).stage.removeChild(gambleContainerRef.current)
        gambleContainerRef.current.destroy({ children: true })
      }
    }
  }, [pixiApp, enabled, setupGambleUI])

  // Handle keyboard input
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || !gambleState.isActive) return

    if (event.code === 'KeyR' && gambleState.stage === 'choice') {
      event.preventDefault()
      event.stopPropagation()
      console.log('R key pressed in gamble mode - choosing red')
      chooseGambleColor('red')
    } else if (event.code === 'KeyB' && gambleState.stage === 'choice') {
      event.preventDefault()
      event.stopPropagation()
      console.log('B key pressed in gamble mode - choosing black')
      chooseGambleColor('black')
    } else if (event.code === 'Space' && (gambleState.stage === 'result' || gambleState.stage === 'choice')) {
      event.preventDefault()  
      event.stopPropagation()
      console.log('Space pressed in gamble mode - collecting win')
      collectGambleWin()
    }
  }, [enabled, gambleState, chooseGambleColor, collectGambleWin])

  // Setup keyboard listener
  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])

  return {
    // State
    gambleState,
    isActive: gambleState.isActive,
    amount: gambleState.amount,
    stage: gambleState.stage,
    selectedColor: gambleState.selectedColor,
    cardColor: gambleState.cardColor,
    
    // Actions
    enterGambleMode,
    exitGambleMode,
    collectGambleWin,
    chooseGambleColor,
    
    // Internal actions (exposed for testing/manual control)
    startCardFlashing,
    stopCardFlashing,
    
    // Config
    config: gambleConfig,
    
    // Utilities
    canEnterGamble: pendingWin > 0 && !isSpinning && enabled,
    isFlashing: cardFlashIntervalRef.current !== null
  }
}

// React component wrapper for gamble feature
export default function GambleFeature(props: GambleFeatureProps) {
  useGambleFeature(props)
  
  // This component doesn't render anything, it's just for the gamble logic
  return null
}

// HTML/React UI component for gamble feature (alternative to PIXI UI)
export function GambleUI({ 
  gambleState, 
  onChooseColor, 
  onCollectWin, 
  className = '' 
}: {
  gambleState: GambleState
  onChooseColor: (color: 'red' | 'black') => void
  onCollectWin: () => void
  className?: string
}) {
  if (!gambleState.isActive) return null

  return (
    <div className={`fixed inset-0 bg-black/70 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-gradient-to-b from-green-800 to-green-900 p-8 rounded-lg text-white text-center min-w-96">
        {/* Amount Display */}
        <div className="text-4xl font-bold text-yellow-400 mb-4">
          {formatCurrency(gambleState.amount)}
        </div>

        {/* Card Display */}
        <div className="mb-6">
          {gambleState.stage === 'choice' ? (
            <div className="text-8xl animate-pulse">🎴</div>
          ) : (
            <div className="text-8xl">
              {gambleState.cardColor === 'red' ? '♥️' : '♠️'}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="text-lg mb-6">
          {gambleState.stage === 'choice' && 'Choose a color to double your win!'}
          {gambleState.stage === 'reveal' && 'Revealing card...'}
          {gambleState.stage === 'result' && gambleState.selectedColor === gambleState.cardColor && 'You won!'}
          {gambleState.stage === 'result' && gambleState.selectedColor !== gambleState.cardColor && 'You lost!'}
        </div>

        {/* Controls */}
        {gambleState.stage === 'choice' && (
          <div className="flex gap-4 justify-center mb-4">
            <button
              onClick={() => onChooseColor('red')}
              className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded text-white font-bold text-lg"
            >
              ♥️ Red (R)
            </button>
            <button
              onClick={() => onChooseColor('black')}
              className="bg-gray-800 hover:bg-gray-900 px-6 py-3 rounded text-white font-bold text-lg"
            >
              ♠️ Black (B)
            </button>
          </div>
        )}

        <button
          onClick={onCollectWin}
          className="bg-green-600 hover:bg-green-700 px-8 py-3 rounded text-white font-bold text-lg"
        >
          Collect Win (Space)
        </button>
      </div>
    </div>
  )
}

// Utility functions
export const GambleUtils = {
  // Calculate win probability
  getWinProbability: (): number => 0.5, // 50% chance

  // Calculate potential win amount
  getPotentialWin: (currentAmount: number, multiplier: number = 2): number => {
    return currentAmount * multiplier
  },

  // Get random card color
  getRandomCardColor: (): 'red' | 'black' => {
    return Math.random() < 0.5 ? 'red' : 'black'
  },

  // Validate gamble state
  isValidGambleState: (state: GambleState): boolean => {
    return state.amount > 0 && ['choice', 'reveal', 'result'].includes(state.stage)
  },

  // Calculate max safe gamble amount (based on house edge)
  getMaxSafeGambleAmount: (balance: number, maxRisk: number = 0.1): number => {
    return balance * maxRisk
  }
}