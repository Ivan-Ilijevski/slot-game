'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Assets, Sprite, Container, Graphics, Text } from 'pixi.js'
import { formatCurrency } from '../config/currency'
import { formatNumberWithSpaces } from '../utils/currency'
import MobileController from '../components/game/MobileController'
import VoucherInput from '../components/game/VoucherInput'
import VoucherPrintingScreen from '../components/game/VoucherPrintingScreen'
import MessagePopup from '../components/game/MessagePopup'
import { useBetManager } from '../components/game/useBetManager'
import { useDenominationManager } from '../components/game/useDenominationManager'
import { useWallet } from '../components/game/useWallet'
import { useKeyboardHandler } from '../components/game/useKeyboardHandler'
import { useTouchKeyboardConnection } from '../components/game/useTouchKeyboardConnection'
import { getWinConfig, getAnimationSpeed, formatWinType, getWinColor, startWinSoundSequence, stopWinSoundSequence, updateGambleModeState, startWinCountingSound, stopWinCountingSound } from '../utils/winSystem'

// Dynamic import for PIXI Sound to avoid SSR issues
let sound: {
  play: (alias: string, options?: { start?: number; end?: number; volume?: number }) => void;
  stop: (alias: string) => void;
  stopAll: () => void;
} | null = null

if (typeof window !== 'undefined') {
  import('@pixi/sound').then((pixiSound) => {
    sound = pixiSound.sound
  })
}

// Type for gamble UI elements
interface GambleElements {
  faceDownCard: Sprite
  faceUpCard: Sprite
  gambleAmountText: Text
  gambleToWinText: Text
  instructionsText: Text
  historyContainer: Container
}

// Type for gamble history entry
interface GambleHistoryEntry {
  cardTexture: string
  won: boolean
}

export default function Home() {
  // ===== NEW: Integrated Hooks =====

  // Gamble and spin state (needed for disabling bet controls)
  const [isSpinning, setIsSpinning] = useState(false)
  const [isGambleMode, setIsGambleMode] = useState(false)
  const [pendingWin, setPendingWin] = useState(0)

  // Bet management using useBetManager hook
  const betManager = useBetManager({
    isSpinning,
    hasPendingWin: pendingWin > 0,
    isGambleMode,
    onBetChange: (newBet) => {
      console.log('Bet changed to:', newBet)
    }
  })

  // Denomination management using useDenominationManager hook
  const denomManager = useDenominationManager({
    isDisabled: isSpinning || isGambleMode,
    onDenominationChange: (newDenom) => {
      console.log('Denomination changed to:', newDenom)
    }
  })

  // Wallet/balance management using useWallet hook
  const wallet = useWallet({
    autoFetch: true,
    onBalanceChange: (newBalance) => {
      console.log('Balance updated to:', newBalance)
    },
    onCashoutSuccess: (result) => {
      console.log('Cashout successful:', result)
      setShowPrintingScreen(false)
    },
    onCashoutError: (error) => {
      console.error('Cashout failed:', error)
      setShowPrintingScreen(false)
    }
  })

  // Access hook values with shorter aliases for backward compatibility
  const currentBet = betManager.currentBet
  const denomination = denomManager.denomination

  // Display balance: subtract pending win to show balance before win was added
  // (The server already added the win, but we display it as pending for animation)
  const totalBalance = pendingWin > 0 ? wallet.balance - pendingWin : wallet.balance

  // ===== END: Integrated Hooks =====

  // Remaining state (not yet extracted to hooks)
  const [lastWin, setLastWin] = useState(0)
  const [animatedWinAmount, setAnimatedWinAmount] = useState(0) // Animated display amount
  const [isAutoStart, setIsAutoStart] = useState(false) // Autostart feature toggle
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'mk'>('en') // Language for UI overlay

  // Gamble feature state (kept in main component - tightly coupled to PIXI)
  const [gambleAmount, setGambleAmount] = useState(0) // Amount being gambled
  const [gambleStage, setGambleStage] = useState<'choice' | 'reveal' | 'result'>('choice') // Current gamble stage
  const [selectedColor, setSelectedColor] = useState<'red' | 'black' | null>(null) // Player's color choice
  const [cardColor, setCardColor] = useState<'red' | 'black' | null>(null) // Revealed card color
  const [gambleHistory, setGambleHistory] = useState<GambleHistoryEntry[]>([]) // History of gamble results

  // Mobile controller state tracking
  const [stopRequested, setStopRequested] = useState(false)
  const [isWinAnimating, setIsWinAnimating] = useState(false)
  const [hasRunningAnimations, setHasRunningAnimations] = useState(false)
  
  // Voucher system state
  // Message popup state
  const [showMessagePopup, setShowMessagePopup] = useState(false)
  const [messagePopupType, setMessagePopupType] = useState<'success' | 'error' | 'info' | 'warning'>('info')
  const [messagePopupTitle, setMessagePopupTitle] = useState<string>('')
  const [messagePopupMessage, setMessagePopupMessage] = useState<string>('')
  
  // Printing screen state
  const [showPrintingScreen, setShowPrintingScreen] = useState(false)
  const [printingAmount, setPrintingAmount] = useState(0)

  // Helper function to convert currency to credits for UI display
  const currencyToCredits = useCallback((amount: number): number => {
    return Math.round(amount / denomination) // Credits based on denomination
  }, [denomination])
  
  // Message popup helper
  const showMessage = useCallback((type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    setMessagePopupType(type)
    setMessagePopupTitle(title)
    setMessagePopupMessage(message)
    setShowMessagePopup(true)
  }, [])
  
  // Voucher system handlers (updated to use wallet hook)
  const handleVoucherValidated = useCallback((credit: number) => {
    // Refresh balance from server after voucher validation
    wallet.refreshBalance()
    showMessage('success', 'Voucher Redeemed', `Successfully added ${formatCurrency(credit)} to your balance`)
  }, [showMessage, wallet])

  const handleVoucherError = useCallback((message: string) => {
    showMessage('error', 'Voucher Error', message)
  }, [showMessage])

  // Use wallet hook's methods directly
  const refreshBalance = wallet.refreshBalance

  // Cashout function (updated to use wallet hook)
  const performCashout = useCallback(async (amount: number) => {
    // Show printing screen
    setPrintingAmount(amount)
    setShowPrintingScreen(true)

    // Use wallet hook's cashout method
    const result = await wallet.cashout({
      amount,
      useUSB: true,
      machineId: 'SHINING-CROWN-001'
    })

    return result
  }, [wallet])
  
  // Printing screen handlers
  const handlePrintingComplete = useCallback(() => {
    setShowPrintingScreen(false)
  }, [])
  
  const handlePrintingError = useCallback((error: string) => {
    console.error('Printing error:', error)
    setShowPrintingScreen(false)
  }, [])

  const pixiContainer = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const reelsRef = useRef<Container[]>([])
  const reelContainerRef = useRef<Container | null>(null)
  const isSpinningRef = useRef(false)
  const soundTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stopRequestedRef = useRef(false)
  const reelsStoppedRef = useRef<boolean[]>([false, false, false, false, false])
  const reelsStoppedCountRef = useRef(0)
  const simultaneousStopRef = useRef(false)
  const animationsRunningRef = useRef<Set<number>>(new Set())
  const lastWinRef = useRef(0)
  const winHighlightsRef = useRef<Container[]>([])
  const winInfoDisplayRef = useRef<HTMLDivElement | null>(null)
  const wildExpansionSoundTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const winCycleIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const uiUpdateRef = useRef<((balance: number, bet: number, win: number) => void) | null>(null)
  const denomTextRef = useRef<Text | null>(null)
  const denomLabelTextRef = useRef<Text | null>(null)
  const creditDollarTextRef = useRef<Text | null>(null)
  const creditAmountTextRef = useRef<Text | null>(null)
  const betDollarTextRef = useRef<Text | null>(null)
  const betAmountTextRef = useRef<Text | null>(null)
  const winDollarTextRef = useRef<Text | null>(null)
  const winAmountTextRef = useRef<Text | null>(null)
  const winAnimationRef = useRef<NodeJS.Timeout | null>(null)
  const autoStartTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoStartTextRef = useRef<Text | null>(null)
  const isAutoStartRef = useRef<boolean>(false)
  const autoCollectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const creditFlashTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingWinRef = useRef<number>(0)
  const animateWinRef = useRef<((amount: number) => void) | null>(null)
  const collectWinRef = useRef<(() => void) | null>(null)
  const isWinAnimatingRef = useRef(false)
  const takeWinRef = useRef<(() => void) | null>(null)
  const completeWildExpansionsRef = useRef<(() => void) | null>(null)
  const takeWinActiveRef = useRef(false)
  const spinReelsRef = useRef<(() => void) | null>(null)
  const playReelStopSoundRef = useRef<(() => void) | null>(null)
  const wildExpansionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingWinLinesRef = useRef<{ payline: number, symbols: string[], count: number, symbol: string, payout: number }[] | null>(null)
  const showWinHighlightsRef = useRef<((winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[]) => void) | null>(null)
  const uiCabinetOverlayRef = useRef<Sprite | null>(null)
  const updateOverlayRef = useRef<((newLanguage: 'en' | 'mk') => void) | null>(null)
  
  // Gamble feature refs
  const gambleContainerRef = useRef<Container | null>(null)
  const gambleCardRef = useRef<Sprite | null>(null)
  const gambleButtonsRef = useRef<Container | null>(null)
  const isGambleModeRef = useRef<boolean>(false)
  const cardFlashIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const gambleSoundLoopIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const gambleWinTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const gambleLoseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs to store current values to avoid stale closures in handlers
  const currentBetRef = useRef<number>(currentBet)
  const denominationRef = useRef<number>(denomination)
  const gambleStageRef = useRef<'choice' | 'reveal' | 'result'>(gambleStage)
  const gambleAmountRef = useRef<number>(gambleAmount)

  // ===== Use hook methods directly (replaces old inline functions) =====
  const increaseBet = betManager.increaseBet
  const decreaseBet = betManager.decreaseBet
  const setMaxBet = betManager.setMaxBet
  const cycleBet = betManager.cycleBet
  const cycleDenomination = denomManager.cycleDenomination
  const isBetControlsDisabled = () => betManager.isDisabled

  // Function to collect pending win
  const collectWin = useCallback(() => {
    
    if (pendingWin > 0) {
      // Balance is already updated by the server in the spin response
      // Just clear the pending win state
      setPendingWin(0)
      setLastWin(0)
      setAnimatedWinAmount(0)
    }

    // Clear timeouts and animations
    if (winAnimationRef.current) {
      clearInterval(winAnimationRef.current)
      winAnimationRef.current = null
    }
    if (autoCollectTimeoutRef.current) {
      clearTimeout(autoCollectTimeoutRef.current)
      autoCollectTimeoutRef.current = null
    }
    
    // Reset win animation state
    isWinAnimatingRef.current = false
  }, [pendingWin])

  // Function to stop all sounds immediately (for gamble mode and takeWin)
  const stopAllSounds = useCallback(() => {
    
    // Stop wild expansion sound timeout
    if (wildExpansionSoundTimeoutRef.current) {
      clearTimeout(wildExpansionSoundTimeoutRef.current)
      wildExpansionSoundTimeoutRef.current = null
    }
    
    // Stop all win sound sequences
    stopWinSoundSequence()
    
    // Stop win counting sounds
    if (sound) {
      stopWinCountingSound(sound)
    }
    
  }, [])

  // Function to complete all animations to final state (for gamble mode)
  const completeAllAnimations = useCallback(() => {
    
    // Complete win counting animation to final amount
    if (winAnimationRef.current) {
      clearInterval(winAnimationRef.current)
      winAnimationRef.current = null
    }
    
    // Complete wild expansion animations instantly
    if (animationsRunningRef.current.size > 0 && completeWildExpansionsRef.current) {
      completeWildExpansionsRef.current()
    }
    
    // Clear animation timeouts but set final states
    if (winCycleIntervalRef.current) {
      clearTimeout(winCycleIntervalRef.current)
      winCycleIntervalRef.current = null
    }
    
    if (autoCollectTimeoutRef.current) {
      clearTimeout(autoCollectTimeoutRef.current)
      autoCollectTimeoutRef.current = null
    }
    
    // Clear wild expansion timeout to prevent delayed win animations
    if (wildExpansionTimeoutRef.current) {
      clearTimeout(wildExpansionTimeoutRef.current)
      wildExpansionTimeoutRef.current = null
    }
    
    // Clear pending win lines to prevent win animations
    pendingWinLinesRef.current = null
    
    // Set win amount to final value
    if (pendingWinRef.current > 0) {
      setAnimatedWinAmount(pendingWinRef.current)
    }
    
    // Reset animation states to complete
    isWinAnimatingRef.current = false
    setIsWinAnimating(false)
    setHasRunningAnimations(false)
    
  }, [])


  // Function to take win immediately (skip slow animations)
  const takeWin = useCallback(() => {
    
    if (pendingWin > 0) {
      // Mark that take win is active to distinguish from new spin cancellations
      takeWinActiveRef.current = true
      
      // Complete ALL animations to final state (don't stop them entirely)
      completeAllAnimations()
      
      // Stop only sounds (animations are completed, not stopped)
      stopAllSounds()
      
      // Reset take win flag after completing all animations
      takeWinActiveRef.current = false
      
      // Immediately start auto-collect timeout (shortened)
      if (autoCollectTimeoutRef.current) {
        clearTimeout(autoCollectTimeoutRef.current)
      }
      autoCollectTimeoutRef.current = setTimeout(() => {
        if (collectWinRef.current) {
          collectWinRef.current()
        }
      }, 500) // Very short timeout after take win
      
      // Mark that we're no longer in slow animation phase
      isWinAnimatingRef.current = false
    }
  }, [pendingWin, completeAllAnimations, stopAllSounds])

  // Function to start auto-collect timeout
  const startAutoCollectTimeout = useCallback(() => {
    
    // Clear any existing timeout
    if (autoCollectTimeoutRef.current) {
      clearTimeout(autoCollectTimeoutRef.current)
    }

    autoCollectTimeoutRef.current = setTimeout(() => {
      collectWin()
    }, 30000) // 30 seconds - more time for gamble mode
  }, [collectWin])

  // Function to animate win amount counting up
  const animateWinAmount = useCallback((targetAmount: number) => {
    
    // Clear any existing animation
    if (winAnimationRef.current) {
      clearInterval(winAnimationRef.current)
    }

    setAnimatedWinAmount(0)
    
    if (targetAmount === 0) {
      isWinAnimatingRef.current = false
      return
    }

    // Counting sound will be triggered during the actual counting animation

    // Mark that win animations are active
    isWinAnimatingRef.current = true

    const duration = 2000 // 2 seconds animation
    const steps = 50 // Number of animation steps
    const increment = targetAmount / steps
    const stepDuration = duration / steps
    let currentStep = 0
    
    // Start counting sound when win amount starts counting up
    if (sound) {
      startWinCountingSound(sound)
    }

    winAnimationRef.current = setInterval(() => {
      currentStep++
      const currentAmount = Math.min(currentStep * increment, targetAmount)
      setAnimatedWinAmount(currentAmount)

      if (currentStep >= steps) {
        setAnimatedWinAmount(targetAmount)
        clearInterval(winAnimationRef.current!)
        winAnimationRef.current = null
        
        // Stop counting sound when animation completes
        if (sound) {
          stopWinCountingSound(sound)
        }
        
        // Mark that slow animations are complete
        isWinAnimatingRef.current = false
        
        // Start auto-collect timeout after animation finishes
        startAutoCollectTimeout()
      }
    }, stepDuration)
  }, [startAutoCollectTimeout])


  // Update refs when state or function changes
  useEffect(() => {
    pendingWinRef.current = pendingWin
  }, [pendingWin])

  useEffect(() => {
    currentBetRef.current = currentBet
  }, [currentBet])

  useEffect(() => {
    denominationRef.current = denomination
  }, [denomination])

  useEffect(() => {
    gambleAmountRef.current = gambleAmount
  }, [gambleAmount])

  useEffect(() => {
    gambleStageRef.current = gambleStage
  }, [gambleStage])

  useEffect(() => {
    animateWinRef.current = animateWinAmount
  }, [animateWinAmount])

  useEffect(() => {
    collectWinRef.current = collectWin
  }, [collectWin])

  useEffect(() => {
    takeWinRef.current = takeWin
  }, [takeWin])

  // Card flashing helper functions
  const startCardFlashing = useCallback(() => {
    if (cardFlashIntervalRef.current) {
      clearInterval(cardFlashIntervalRef.current)
    }

    // Start looping sound effect using PIXI Sound (13s start, 400ms duration)
    let loopCount = 0
    const playGambleSoundLoop = () => {
      if (gambleSoundLoopIntervalRef.current) {
        loopCount++
        
        // Play the sound starting at 13 seconds for 400ms duration
        if (sound) {
          sound.play('reelSound', {
            start: 13,
            end: 13.1, // 400ms = 0.4 seconds
            volume: 0.9
          })
        }
        
        // The sound will automatically stop at 13.4 seconds due to the 'end' parameter
      }
    }
    
    // Play immediately
    playGambleSoundLoop()
    
    // Set up interval to repeat every 450ms
    gambleSoundLoopIntervalRef.current = setInterval(playGambleSoundLoop, 100)

    if (gambleContainerRef.current) {
      const elements = (gambleContainerRef.current as Container & { gambleElements?: GambleElements }).gambleElements
      if (elements) {
        let isRed = true
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        
        // Flash between red and black card backs every 250ms (faster)
        cardFlashIntervalRef.current = setInterval(() => {
          if (isRed) {
            elements.faceDownCard.texture = gambleAtlas.textures['cardBackBlack.png']
          } else {
            elements.faceDownCard.texture = gambleAtlas.textures['cardBackRed.png']
          }
          isRed = !isRed
        }, 80)
      }
    }
  }, [])

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
    // Stop the gamble sound using PIXI
    if (sound) {
      sound.stop('reelSound')
    }
    
    // Reset to default red back
    if (gambleContainerRef.current) {
      const elements = (gambleContainerRef.current as Container & { gambleElements?: GambleElements }).gambleElements
      if (elements) {
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        elements.faceDownCard.texture = gambleAtlas.textures['cardBackRed.png']
      }
    }
  }, [])

  // Gamble feature functions
  const enterGambleMode = useCallback(() => {
    console.log('🎰 [DEBUG] enterGambleMode() function called')
    console.log('🎰 [DEBUG] pendingWin (state):', pendingWin)
    console.log('🎰 [DEBUG] pendingWinRef.current:', pendingWinRef.current)
    console.log('🎰 [DEBUG] isSpinningRef.current:', isSpinningRef.current)
    console.log('🎰 [DEBUG] Condition check: pendingWinRef.current > 0 && !isSpinningRef.current =', pendingWinRef.current > 0 && !isSpinningRef.current)
    
    if (pendingWinRef.current > 0 && !isSpinningRef.current) {
      console.log('🎰 [DEBUG] Condition passed - executing gamble mode setup')
      
      // Complete animations to final state (don't stop them entirely)
      completeAllAnimations()
      
      // Stop all sounds immediately
      stopAllSounds()
      if (sound) {
        sound.stopAll()
      }
      
      // Clear any remaining sound timeouts
      if (soundTimeoutRef.current) {
        clearTimeout(soundTimeoutRef.current)
        soundTimeoutRef.current = null
      }
      
      setIsGambleMode(true)
      setGambleAmount(pendingWinRef.current)
      setGambleStage('choice')
      setSelectedColor(null)
      setCardColor(null)
      isGambleModeRef.current = true
      
      // Update gamble mode state for win sound system
      updateGambleModeState(true)
      
      // Show gamble UI
      if (gambleContainerRef.current && appRef.current) {
        gambleContainerRef.current.visible = true
        
        // Move gamble container to top of display list to ensure it's above everything
        appRef.current.stage.removeChild(gambleContainerRef.current)
        appRef.current.stage.addChild(gambleContainerRef.current)
        const elements = (gambleContainerRef.current as Container & { gambleElements?: GambleElements }).gambleElements
        if (elements) {
          // Show face-down card, hide face-up card
          elements.faceDownCard.visible = true
          elements.faceUpCard.visible = false
          
          // Update amount display
          const currentAmount = pendingWinRef.current
          elements.gambleAmountText.text = `GAMBLE AMOUNT\n${formatCurrency(currentAmount)}`
          elements.gambleToWinText.text = `GAMBLE TO WIN\n${formatCurrency(currentAmount * 2)}`

          // Update instructions
          elements.instructionsText.text = 'Select RED or BLACK'
        }
      }
      
      // Start card flashing animation
      startCardFlashing()
      
      // Clear auto-collect timeout when entering gamble
      if (autoCollectTimeoutRef.current) {
        clearTimeout(autoCollectTimeoutRef.current)
        autoCollectTimeoutRef.current = null
      }
    } else {
      console.log('🎰 [DEBUG] Condition failed - cannot enter gamble mode')
      console.log('🎰 [DEBUG] pendingWinRef.current > 0:', pendingWinRef.current > 0)
      console.log('🎰 [DEBUG] !isSpinningRef.current:', !isSpinningRef.current)
    }
  }, [pendingWin, startCardFlashing, completeAllAnimations, stopAllSounds])

  const exitGambleMode = useCallback(() => {
    
    // Clear any pending gamble timeouts first
    if (gambleWinTimeoutRef.current) {
      clearTimeout(gambleWinTimeoutRef.current)
      gambleWinTimeoutRef.current = null
    }
    if (gambleLoseTimeoutRef.current) {
      clearTimeout(gambleLoseTimeoutRef.current)
      gambleLoseTimeoutRef.current = null
    }
    
    setIsGambleMode(false)
    setGambleAmount(0)
    setGambleStage('choice')
    setSelectedColor(null)
    setCardColor(null)
    // Keep gamble history - don't clear when exiting gamble mode
    isGambleModeRef.current = false
    
    // Reset gamble mode state for win sounds
    updateGambleModeState(false)
    
    // Clear any pending win lines to prevent win animations after gamble
    pendingWinLinesRef.current = null
    
    // Stop card flashing
    stopCardFlashing()
    
    // Hide gamble UI if it exists
    if (gambleContainerRef.current) {
      gambleContainerRef.current.visible = false
      
      // Keep visual history - don't clear when hiding gamble UI
    }
  }, [stopCardFlashing])

  const collectGambleWin = useCallback(() => {

    // Refresh balance from server (server handles the update)
    wallet.refreshBalance()

    // Clear pending win and exit gamble mode
    setPendingWin(0)
    setLastWin(0)
    setAnimatedWinAmount(0)
    exitGambleMode()
  }, [gambleAmount, exitGambleMode, wallet])

  const updateGambleHistory = useCallback((cardTexture: string, won: boolean) => {
    if (gambleContainerRef.current) {
      const elements = (gambleContainerRef.current as Container & { gambleElements?: GambleElements }).gambleElements
      if (elements) {
        // Add to history state
        setGambleHistory(prev => [...prev, { cardTexture, won }])
        
        // Update visual history display
        const historyContainer = elements.historyContainer
        historyContainer.removeChildren() // Clear existing history
        
        // Get updated history (including new entry)
        const updatedHistory = [...gambleHistory, { cardTexture, won }]
        
        // Display last 5 results (or fewer if less than 5)
        const historyToShow = updatedHistory.slice(-5)
        
        historyToShow.forEach((entry, index) => {
          const gambleAtlas = Assets.get('/assets/gambleResources.json')
          const historyCard = new Sprite(gambleAtlas.textures[entry.cardTexture])
          historyCard.width = 40
          historyCard.height = 60
          historyCard.x = (index - historyToShow.length + 1) * 50
          historyCard.y = 0
          historyCard.anchor.set(0.5)
          
          // Add a colored boredr to indicate win/loss
          const border = new Graphics()
          if (entry.won) {
            border.roundRect(-22, -32, 44, 64, 5).stroke({ color: 0x358308, width: 3 })
          } else {
            border.roundRect(-22, -32, 44, 64, 5).stroke({ color: 0xDD0016, width: 3 })
          }
          border.x = historyCard.x
          border.y = historyCard.y
          
          historyContainer.addChild(historyCard)
          historyContainer.addChild(border)
        })
      }
    }
  }, [gambleHistory])

  const chooseGambleColor = useCallback((color: 'red' | 'black') => {
    if (gambleStage === 'choice' && gambleContainerRef.current) {
      setSelectedColor(color)
      setGambleStage('reveal')
      
      // Stop card flashing when player makes choice
      stopCardFlashing()
      
      // Generate random card color (50/50 chance)
      const randomColor = Math.random() < 0.5 ? 'red' : 'black'
      setCardColor(randomColor)
      
      const elements = (gambleContainerRef.current as Container & { gambleElements?: GambleElements }).gambleElements
      if (elements) {
        // Update instructions
        elements.instructionsText.text = 'Revealing card...'
        
        // Show appropriate card based on random result
        const gambleAtlas = Assets.get('/assets/gambleResources.json')
        
        // Fixed mapping based on standard playing card conventions
        // Let's try the opposite mapping since the previous one was still wrong
        const cardTextures = {
          red: ['cardFront1.png', 'cardFront2.png'], // Red cards 
          black: ['cardFront0.png', 'cardFront3.png'] // Black cards
        }
        
        // Pick random card texture for the chosen color
        const availableCards = cardTextures[randomColor] || cardTextures.red
        const randomCardTexture = availableCards[Math.floor(Math.random() * availableCards.length)]
        
        
        // Determine win/lose
        const won = color === randomColor
        
        setTimeout(() => {
          // Hide face-down card, show face-up card
          elements.faceDownCard.visible = false
          elements.faceUpCard.texture = gambleAtlas.textures[randomCardTexture]
          elements.faceUpCard.visible = true
        }, 50)
        
        // Add to history
        updateGambleHistory(randomCardTexture, won)
      }
      
      // Access won variable for timeout logic
      const won = color === randomColor
      
      setTimeout(() => {
        setGambleStage('result')
        
        if (elements) {
          if (won) {
            // Double the gamble amount
            const newAmount = gambleAmount * 2
            setGambleAmount(newAmount)
            setPendingWin(newAmount)
            if (sound) {
          sound.play('reelSound', {
            start: 10,
            end: 11, // 400ms = 0.4 seconds
            volume: 0.9
          })
        }
            elements.gambleAmountText.text = `GAMBLE AMOUNT\n${formatCurrency(newAmount)}`
            elements.gambleToWinText.text = `GAMBLE TO WIN\n${formatCurrency(newAmount * 2)}`
            elements.instructionsText.text = 'You won!'
            
            // Auto-continue to next gamble round after showing win
            gambleWinTimeoutRef.current = setTimeout(() => {
              // Reset to choice stage for another gamble
              setGambleStage('choice')
              setSelectedColor(null)
              setCardColor(null)
              
              // Reset UI to choice state
              if (elements) {
                elements.faceDownCard.visible = true
                elements.faceUpCard.visible = false
                elements.instructionsText.text = 'Select Red or Black'
              }
              
              // Start card flashing for new gamble round
              startCardFlashing()
              gambleWinTimeoutRef.current = null // Clear ref after execution
            }, 2000) // Show win message for 2 seconds before continuing
          } else {
            // Lost - clear everything
            setGambleAmount(0)
            setPendingWin(0)
            setLastWin(0)
            setAnimatedWinAmount(0)
            if (sound) {
              sound.play('reelSound', {
                start: 9,
                end: 10, // 400ms = 0.4 seconds
                volume: 0.9
              })
            }
            elements.gambleAmountText.text = 'GAMBLE AMOUNT\n' + formatCurrency(0)
            elements.gambleToWinText.text = 'GAMBLE TO WIN\n' + formatCurrency(0)
            elements.instructionsText.text = 'You lost! Better luck next time.'
            
            // Exit gamble mode after a short delay
            gambleLoseTimeoutRef.current = setTimeout(() => {
              exitGambleMode()
              gambleLoseTimeoutRef.current = null // Clear ref after execution
            }, 2000)
          }
        }
      }, 10) // Show reveal for 50 milliseconds
    }
  }, [gambleStage, gambleAmount, exitGambleMode, stopCardFlashing, startCardFlashing])

  // Update gamble mode ref when state changes
  useEffect(() => {
    isGambleModeRef.current = isGambleMode
  }, [isGambleMode])

  // Function to flash credit display to indicate insufficient funds
  const flashInsufficientFunds = useCallback(() => {
    if (creditDollarTextRef.current && creditAmountTextRef.current) {
      // Store original colors
      const originalDollarColor = creditDollarTextRef.current.style.fill
      const originalAmountColor = creditAmountTextRef.current.style.fill
      
      // Flash to gray
      creditDollarTextRef.current.style.fill = 0x666666
      creditAmountTextRef.current.style.fill = 0x666666
      
      // Clear any existing timeout
      if (creditFlashTimeoutRef.current) {
        clearTimeout(creditFlashTimeoutRef.current)
      }
      
      // Restore original colors after 800ms
      creditFlashTimeoutRef.current = setTimeout(() => {
        if (creditDollarTextRef.current && creditAmountTextRef.current) {
          creditDollarTextRef.current.style.fill = originalDollarColor
          creditAmountTextRef.current.style.fill = originalAmountColor
        }
      }, 800)
      
    }
  }, [])

  // Language toggle function - used by both L key and WebSocket commands
  const toggleLanguage = useCallback(() => {
    setCurrentLanguage(prev => {
      const newLang = prev === 'en' ? 'mk' : 'en'
      // Trigger overlay update
      if (updateOverlayRef.current) {
        updateOverlayRef.current(newLang)
      } else {
        console.error('❌ updateOverlayRef.current is null')
      }
      // Update denomination label text
      if (denomLabelTextRef.current) {
        denomLabelTextRef.current.text = newLang === 'en' ? 'CHANGE DENOM' : 'СМЕНИ ЈА\nДЕНОМИНАЦИЈАТА'
      }
      return newLang
    })
  }, [])

  // ===== NEW: Keyboard handler hook (replaces lines 883-940) =====
  useKeyboardHandler({
    isSpinning: isSpinningRef.current,
    isGambleMode: isGambleModeRef.current,
    gambleStage,
    pendingWin: pendingWinRef.current,
    cycleBet,
    setMaxBet,
    cycleDenomination,
    toggleLanguage,
    chooseGambleColor,
    collectGambleWin,
    enterGambleMode
  })

  // ===== NEW: Touch keyboard WebSocket connection hook (replaces lines 2930-3201) =====
  useTouchKeyboardConnection({
    currentBet,
    denomination,
    totalBalance,
    pendingWin,
    animatedWinAmount,
    isSpinning,
    isGambleMode,
    gambleStage,
    gambleAmount,
    isAutoStart,
    isSpinningRef,
    isGambleModeRef,
    pendingWinRef,
    gambleStageRef,
    gambleAmountRef,
    spinReelsRef,
    denominationRef,
    winAnimationRef,
    winCycleIntervalRef,
    setCurrentBet: betManager.setBet,
    setDenomination: denomManager.setDenomination,
    setPendingWin,
    setIsAutoStart,
    setPrintingAmount,
    setShowPrintingScreen,
    isBetControlsDisabled,
    toggleLanguage,
    enterGambleMode,
    exitGambleMode,
    chooseGambleColor,
    performCashout,
    refreshBalance,
    showMessage
  })

  // Update denomination display when denomination changes
  useEffect(() => {
    if (denomTextRef.current) {
      denomTextRef.current.text = formatCurrency(denomination)
    } else {
    }
  }, [denomination])

  // Update all UI displays when denomination or values change
  useEffect(() => {
    
    if (creditDollarTextRef.current) {
      creditDollarTextRef.current.text = formatCurrency(totalBalance)
    }
    if (creditAmountTextRef.current) {
      creditAmountTextRef.current.text = formatNumberWithSpaces(currencyToCredits(totalBalance))
    }
    if (betDollarTextRef.current) {
      betDollarTextRef.current.text = formatCurrency(currentBet)
    }
    if (betAmountTextRef.current) {
      betAmountTextRef.current.text = formatNumberWithSpaces(currencyToCredits(currentBet))
    }
    if (winDollarTextRef.current) {
      winDollarTextRef.current.text = formatCurrency(animatedWinAmount)
    }
    if (winAmountTextRef.current) {
      winAmountTextRef.current.text = formatNumberWithSpaces(currencyToCredits(animatedWinAmount))
    }
  }, [totalBalance, currentBet, animatedWinAmount, denomination, currencyToCredits, formatCurrency])


  // Load wallet balance on component mount
  useEffect(() => {
    refreshBalance()
  }, [refreshBalance])

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    let keydownHandler: ((event: KeyboardEvent) => void) | null = null
    let handleResize: (() => void) | null = null

    const init = async () => {
      app = new Application()
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      // Calculate scale to fit 1920x1080 design into viewport while maintaining aspect ratio
      const designWidth = 1920
      const designHeight = 1080
      const scaleX = viewportWidth / designWidth
      const scaleY = viewportHeight / designHeight
      const scale = Math.min(scaleX, scaleY)
      
      const canvasWidth = designWidth * scale
      const canvasHeight = designHeight * scale
      
      await app.init({
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: 0x1a1a2e,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      appRef.current = app

      if (pixiContainer.current && app.canvas) {
        pixiContainer.current.innerHTML = ''
        pixiContainer.current.appendChild(app.canvas)
        
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
        const newScaleX = newViewportWidth / designWidth
        const newScaleY = newViewportHeight / designHeight
        const newScale = Math.min(newScaleX, newScaleY)
        
        const newCanvasWidth = designWidth * newScale
        const newCanvasHeight = designHeight * newScale
        
        app.renderer.resize(newCanvasWidth, newCanvasHeight)
        app.stage.scale.set(newScale)
      }
      
      window.addEventListener('resize', handleResize)

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
          '/assets/10-0.json', // Crown win animation
          '/assets/ui-cabinet-overlay.png', // UI cabinet overlay (English)
          '/assets/ui-cabinet-overlay-mk.png', // UI cabinet overlay (Macedonian)
          '/assets/gambleResources.json', // Gamble assets
          // Sound assets
          { alias: 'reelSound', src: '/assets/mobileMainSounds.mp3' },
          { alias: 'winSound', src: '/assets/winSounds.mp3' },
          { alias: 'shortSound', src: '/assets/shortSounds.mp3' }
        ])

        // Load sounds via PIXI Sound - they are already loaded with Assets.load above
        // No need for separate HTML Audio objects - PIXI sound handles everything
        
        // Set up sound to play only a small portion using PIXI sound
        const playReelStopSound = () => {
          // Play reel stop sound from 1 second for 0.3 seconds duration
          if (sound) {
            sound.play('reelSound', {
              start: 1,
              end: 1.3, // 0.3 seconds duration
              volume: 0.7
            })
          }
        }
        playReelStopSoundRef.current = playReelStopSound
        
        // Function to play wild reel sound (1 second from shortSounds.mp3)
        const playWildReelSound = () => {
          // Play wild reel sound from beginning for 1 second
          if (sound) {
            sound.play('shortSound', {
              start: 0,
              end: 1, // 1 second duration
              volume: 0.8
            })
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
          // Play wild expansion sound from 4.7 seconds for 4.6 seconds
          if (sound) {
            sound.play('winSound', {
              start: 6.0,
              end: 10.3, // 4.6 seconds duration
              volume: 0.9
            })
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
        
        
        // Symbol name to number mapping
        const symbolNameToNumber: { [key: string]: string } = {
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
        

        // Main background - use full screen
        const mainBackground = new Sprite(backgroundAtlas.textures['background.png'])
        mainBackground.width = 1920
        mainBackground.height = 1080
        mainBackground.x = 0
        mainBackground.y = 0
        app.stage.addChild(mainBackground)

        // Reel background - centered
        const reelBackground = new Sprite(mainAtlas.textures['reelBackground.png'])
        reelBackground.x = (1920 - reelBackground.width) / 2
        reelBackground.y = (1080 - reelBackground.height) / 2
        app.stage.addChild(reelBackground)

        // === Reels Setup === (Make larger to fill more screen space)
        const SYMBOL_WIDTH = 260 // Increased from 198
        const SYMBOL_HEIGHT = 260 // Increased from 198
        const REEL_COUNT = 5
        const SYMBOLS_PER_REEL = 3
        const REEL_GAP = 28 // Reduced by 5px from 32

        // Calculate total reel area dimensions
        const totalReelWidth = REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP
        const totalReelHeight = SYMBOLS_PER_REEL * SYMBOL_HEIGHT
        
        // Position reels to center them exactly with the border (960, 470)
        const REEL_OFFSET_X = (1920 / 2) - (totalReelWidth / 2)
        const REEL_OFFSET_Y = (1080 / 2 - 70) - (totalReelHeight / 2)
        
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
        reelContainerRef.current = reelContainer
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

        // Logo removed - will be replaced with reference graphics
        
        // All UI will be created within PIXI canvas - remove HTML overlay
        
        // Create win line display container - positioned below reels
        const winLineDisplayContainer = new Container()
        const winLineDisplayY = REEL_OFFSET_Y + totalReelHeight + 20 // 20px below reels
        winLineDisplayContainer.x = 1920 / 2 // Center horizontally
        winLineDisplayContainer.y = winLineDisplayY
        winLineDisplayContainer.visible = false // Initially hidden
        app.stage.addChild(winLineDisplayContainer)
        
        // UI text styles are now defined inline for each element
        
        // Based on reference image - bottom UI should be much lower and larger
        const UI_Y_BASE = 980 // Move much lower to bottom of screen
        
        // UI positioning helpers for overlay alignment
        const OVERLAY_POSITIONS = {
          CREDIT: { x: 600, y: UI_Y_BASE -20 },    // Adjust these coordinates to match overlay
          BET: { x: 950, y: UI_Y_BASE -20 },       // Adjust these coordinates to match overlay  
          WIN: { x: 1340, y: UI_Y_BASE-20},      // Adjust these coordinates to match overlay
          MORE_GAMES: { x: 100, y: UI_Y_BASE }, // Adjust these coordinates to match overlay
          DENOM: { x: 275, y: UI_Y_BASE + 4 }     // Adjust these coordinates to match overlay
        }
        
        // Create PIXI-based UI elements container (will be added to stage after overlay)
        const uiContainer = new Container()
        
        // Change Denomination button (no panel - using overlay)
        
        // Large denomination number (top)
        const denomNumberText = new Text(formatCurrency(denomination), { 
          fontFamily: 'Arial', 
          fontSize: 32, // Larger font for denomination number
          fill: 0xFFFFFF, 
          fontWeight: 'bold' as const,
          align: 'center'
        })
        denomNumberText.anchor.set(0.5)
        denomNumberText.x = OVERLAY_POSITIONS.DENOM.x
        denomNumberText.y = OVERLAY_POSITIONS.DENOM.y - 12 // Position higher
        denomTextRef.current = denomNumberText
        uiContainer.addChild(denomNumberText)
        
        // Smaller "CHANGE DENOM" label (bottom)
        const denomLabelText = new Text(currentLanguage === 'en' ? 'CHANGE DENOM' : 'СМЕНИ ЈА ДЕНОМИНАЦИЈАТА', { 
          fontFamily: 'Arial', 
          fontSize: 18, // Smaller font for label
          fill: 0xFFFFFF, 
          fontWeight: 'normal' as const,
          align: 'center'
        })
        denomLabelText.anchor.set(0.5)
        denomLabelText.x = OVERLAY_POSITIONS.DENOM.x
        denomLabelText.y = OVERLAY_POSITIONS.DENOM.y + 20 // Position lower
        denomLabelTextRef.current = denomLabelText
        uiContainer.addChild(denomLabelText)
        
        // CENTER: CREDIT display (no panel - using overlay)
        
        // Yellow dollar amount on top
        const creditDollarText = new Text(`${formatCurrency(totalBalance)}`, {
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00, // Yellow
          fontWeight: '900' as const, // Extra-bold for thickness
          stroke: { color: 0x000000, width: 3 } // Small black stroke
        })
        creditDollarText.anchor.set(0.5, 0)
        creditDollarTextRef.current = creditDollarText
        creditDollarText.x = OVERLAY_POSITIONS.CREDIT.x
        creditDollarText.y = OVERLAY_POSITIONS.CREDIT.y - 25
        uiContainer.addChild(creditDollarText)
        
        // Large white credit amount (converted from currency)
        const creditAmountText = new Text(formatNumberWithSpaces(currencyToCredits(totalBalance)), {
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF, // White
          fontWeight: '900' as const // Extra-bold for thickness
        })
        creditAmountText.anchor.set(0.5, 0)
        creditAmountTextRef.current = creditAmountText
        creditAmountText.x = OVERLAY_POSITIONS.CREDIT.x - 2
        creditAmountText.y = OVERLAY_POSITIONS.CREDIT.y +10
        uiContainer.addChild(creditAmountText)
        
        // BET display (no panel - using overlay)
        
        // Yellow dollar amount on top
        const betDollarText = new Text(`${formatCurrency(currentBet)}`, {
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00, // Yellow
          fontWeight: '900' as const, // Extra-bold for thickness
          stroke: { color: 0x000000, width: 3 } // Small black stroke
        })
        betDollarText.anchor.set(0.5, 0)
        betDollarTextRef.current = betDollarText
        betDollarText.x = OVERLAY_POSITIONS.BET.x
        betDollarText.y = OVERLAY_POSITIONS.BET.y - 25
        uiContainer.addChild(betDollarText)
        
        // Large white bet amount (converted from currency)
        const betAmountText = new Text(formatNumberWithSpaces(currencyToCredits(currentBet)), {
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF, // White
          fontWeight: '900' as const // Extra-bold for thickness
        })
        betAmountText.anchor.set(0.5, 0)
        betAmountTextRef.current = betAmountText
        betAmountText.x = OVERLAY_POSITIONS.BET.x
        betAmountText.y = OVERLAY_POSITIONS.BET.y +10
        uiContainer.addChild(betAmountText)
        
        // Bet up/down arrows (larger and positioned on the right edge)
        const betUpArrow = new Text('▲', {
          fontFamily: 'Arial',
          fontSize: 24,
          fill: 0xFFFFFF,
          fontWeight: 'bold' as const
        })
        betUpArrow.anchor.set(0.5)
        betUpArrow.x = 840
        betUpArrow.y = UI_Y_BASE + 25
        betUpArrow.interactive = true
        betUpArrow.cursor = 'pointer'
        betUpArrow.on('pointerdown', increaseBet)
        uiContainer.addChild(betUpArrow)
        
        const betDownArrow = new Text('▼', {
          fontFamily: 'Arial',
          fontSize: 24,
          fill: 0xFFFFFF,
          fontWeight: 'bold' as const
        })
        betDownArrow.anchor.set(0.5)
        betDownArrow.x = 1100
        betDownArrow.y = UI_Y_BASE +25
        betDownArrow.interactive = true
        betDownArrow.cursor = 'pointer'
        betDownArrow.on('pointerdown', decreaseBet)
        uiContainer.addChild(betDownArrow)
        
        // WIN display (no panel - using overlay)
        
        // Yellow dollar amount on top
        const winDollarText = new Text(`${formatCurrency(lastWin)}`, {
          fontFamily: 'Arial Black',
          fontSize: 40,
          fill: 0xFFFF00, // Yellow
          fontWeight: '900' as const, // Extra-bold for thickness
          stroke: { color: 0x000000, width: 3 } // Small black stroke
        })
        winDollarText.anchor.set(0.5, 0)
        winDollarTextRef.current = winDollarText
        winDollarText.x = OVERLAY_POSITIONS.WIN.x
        winDollarText.y = OVERLAY_POSITIONS.WIN.y - 25
        uiContainer.addChild(winDollarText)
        
        // Large white win amount (converted from currency)
        const winAmountText = new Text(formatNumberWithSpaces(currencyToCredits(lastWin)), {
          fontFamily: 'Arial Black',
          fontSize: 50,
          fill: 0xFFFFFF, // White
          fontWeight: '900' as const // Extra-bold for thickness
        })
        winAmountText.anchor.set(0.5, 0)
        winAmountTextRef.current = winAmountText
        winAmountText.x = OVERLAY_POSITIONS.WIN.x
        winAmountText.y = OVERLAY_POSITIONS.WIN.y +10
        uiContainer.addChild(winAmountText)
        
        
        
        // Autostart indicator
        const autoStartText = new Text('AUTO', {
          fontFamily: 'Arial Black',
          fontSize: 24,
          fill: 0x666666, // Start gray, will be updated by useEffect
          fontWeight: 'bold' as const,
          stroke: { color: 0x000000, width: 2 }
        })
        autoStartText.anchor.set(0.5)
        autoStartText.x = 100 // Top left area
        autoStartText.y = 100
        autoStartText.visible = false // Hidden by default, shown only when active
        autoStartTextRef.current = autoStartText
        uiContainer.addChild(autoStartText)
        
        // Function to update UI displays will be set in useEffect below

        // Lines indicators on both sides of reels (like in reference image)
        const leftLinesIndicator = new Sprite(mainAtlas.textures['linesIndicator.png'])
        leftLinesIndicator.x = REEL_OFFSET_X - leftLinesIndicator.width - 35
        leftLinesIndicator.y = REEL_OFFSET_Y + (SYMBOLS_PER_REEL * SYMBOL_HEIGHT - leftLinesIndicator.height) / 2
        app.stage.addChild(leftLinesIndicator)
        
        // Right side lines indicator (same orientation as left, not mirrored)
        const rightLinesIndicator = new Sprite(mainAtlas.textures['linesIndicator.png'])
        rightLinesIndicator.x = REEL_OFFSET_X + (REEL_COUNT * SYMBOL_WIDTH + (REEL_COUNT - 1) * REEL_GAP) + 35
        rightLinesIndicator.y = REEL_OFFSET_Y + (SYMBOLS_PER_REEL * SYMBOL_HEIGHT - rightLinesIndicator.height) / 2
        app.stage.addChild(rightLinesIndicator)

        // UI Cabinet overlay - full screen overlay (loaded directly as PNG) - ADD BEFORE UI ELEMENTS
        const overlayPath = currentLanguage === 'en' ? '/assets/ui-cabinet-overlay.png' : '/assets/ui-cabinet-overlay-mk.png'
        const uiCabinetTexture = Assets.cache.get(overlayPath)
        const uiCabinetOverlay = new Sprite(uiCabinetTexture)
        uiCabinetOverlay.width = 1920
        uiCabinetOverlay.height = 1080
        uiCabinetOverlay.x = 0
        uiCabinetOverlay.y = 0
        uiCabinetOverlayRef.current = uiCabinetOverlay
        app.stage.addChild(uiCabinetOverlay)

        // Reel border overlay - centered and scaled
        const border = new Sprite(mainAtlas.textures['reelBorder.png'])
        border.anchor.set(0.5) // Set anchor to center
        border.scale.set(1.30) // Scale from center
        border.x = 1920 / 2  // Center horizontally
        border.y = 1080 / 2 - 70 // Center vertically
        app.stage.addChild(border)

        // Add UI container to stage AFTER overlay - so text appears on top
        app.stage.addChild(uiContainer)

        // Add keyboard event listener for space key and 'p' for autostart
        keydownHandler = (event: KeyboardEvent) => {
          
          // Prevent space in gamble mode
          if (isGambleModeRef.current) {
            return
          }
          
          if (event.code === 'Space') {
            event.preventDefault()
            if (!isSpinningRef.current && pendingWinRef.current > 0 && (isWinAnimatingRef.current || animationsRunningRef.current.size > 0)) {
              // Take win feature - skip slow animations during wins
              if (takeWinRef.current) {
                takeWinRef.current()
              }
            } else if (!isSpinningRef.current) {
              spinReels()
            } else if (!stopRequestedRef.current) {
              // Request stop during spinning (only if not already requested)
              stopRequestedRef.current = true
              
              // Play single sound immediately if all reels will stop together
              if (reelsStoppedCountRef.current === 0) {
                playReelStopSound()
              }
            }
          } else if (event.code === 'KeyP') {
            event.preventDefault()
            // Toggle autostart feature
            setIsAutoStart(prev => {
              const newAutoStart = !prev
              isAutoStartRef.current = newAutoStart
              
              if (newAutoStart && !isSpinningRef.current) {
                // Start autostart immediately if not spinning
                spinReels()
              } else if (!newAutoStart && autoStartTimeoutRef.current) {
                // Stop autostart
                clearTimeout(autoStartTimeoutRef.current)
                autoStartTimeoutRef.current = null
              }
              
              return newAutoStart
            })
          }
        }

        // Setup gamble container and UI elements
        const setupGambleUI = () => {
          if (!app) return
          
          const gambleAtlas = Assets.get('/assets/gambleResources.json')
          
          // Create gamble container (initially hidden)
          const gambleContainer = new Container()
          gambleContainer.visible = false
          gambleContainerRef.current = gambleContainer
          app.stage.addChild(gambleContainer)
          
          // Create semi-transparent background overlay
          const overlay = new Graphics()
          overlay.rect(0, 0, 1920, 1080)
          overlay.fill({ color: 0x000000, alpha: 0.7 }) // Black with 70% opacity
          gambleContainer.addChild(overlay)
          
          // Card display area - center of screen
          const cardX = 1920 / 2
          const cardY = 1080 / 2 - 50
          
          // Face-down card (initially visible)
          const faceDownCard = new Sprite(gambleAtlas.textures['cardBackRed.png'])
          faceDownCard.anchor.set(0.5)
          faceDownCard.x = cardX
          faceDownCard.y = cardY
          faceDownCard.scale.set(1.5)
          gambleContainer.addChild(faceDownCard)
          
          // Face-up card (initially hidden)
          const faceUpCard = new Sprite(gambleAtlas.textures['cardFront0.png'])
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
          
          // Red and black buttons removed - using mobile/keyboard controls instead
          
          // Gamble amount text (top left)
          const gambleAmountText = new Text({
            text: 'GAMBLE AMOUNT\n0',
            style: {
              fontFamily: 'Arial Black',
              fontSize: 48,
              fill: 0xFFFFFF,
              stroke: { color: 0x000000, width: 3 }
            }
          })
          gambleAmountText.anchor.set(0, 0.5)
          gambleAmountText.x = cardX - 800
          gambleAmountText.y = cardY - 200
          gambleContainer.addChild(gambleAmountText)
          
          // Gamble to win text (top right)
          const gambleToWinText = new Text({
            text: 'GAMBLE TO WIN\n0',
            style: {
              fontFamily: 'Arial Black',
              fontSize: 48,
              fill: 0xFFFFFF,
              stroke: { color: 0x000000, width: 3 },
              align: 'right'
            }
          })
          gambleToWinText.anchor.set(1, 0.5)
          gambleToWinText.x = cardX + 800
          gambleToWinText.y = cardY - 200
          gambleContainer.addChild(gambleToWinText)
          
          // Instructions text
          const instructionsText = new Text({
            text: 'Choose RED or BLACK',
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
          
          // History container for showing previous gamble results
          const historyContainer = new Container()
          historyContainer.x = cardX
          historyContainer.y = cardY - 350
          gambleContainer.addChild(historyContainer)
          
          // Store references for updates using type assertion
          ;(gambleContainer as Container & { gambleElements: GambleElements }).gambleElements = {
            faceDownCard,
            faceUpCard,
            gambleAmountText,
            gambleToWinText,
            instructionsText,
            historyContainer
          }
        }

        setupGambleUI()

        const spinReels = async () => {
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
          Object.keys(runningWinAnimations).forEach(key => {
            delete runningWinAnimations[key]
          })
          
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
                        } else {
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
                          } else {
                          }
                          wildExpansionTimeoutRef.current = null
                          pendingWinLinesRef.current = null
                        }, 2500)
                      } else {
                        // No wild expansions, start win animations immediately
                        // But only if not in gamble mode
                        if (!isGambleModeRef.current) {
                          showWinHighlights(serverResults.winLines)
                        } else {
                        }
                      }
                    }
                  }
                }
              }
              
              // Set up PIXI ticker for smooth animation
              tickerFunction = animate
              if (appRef.current) {
                appRef.current.ticker.add(tickerFunction)
              }
            }
          })
        }
        spinReelsRef.current = spinReels

        // Function to check for wild symbols and animate them based on server results
        const checkAndAnimateWilds = (winResults: { results: { reel: number, position: number, symbols: string[] }[], totalWin: number, winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[], expandedReels: number[] }) => {
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
        }

        // Function to instantly complete wild expansions (for take win feature)
        const completeWildExpansions = () => {
          
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
        }
        
        // Set the ref for external access
        completeWildExpansionsRef.current = completeWildExpansions

        // Function to update overlay language
        const updateOverlay = (newLanguage: 'en' | 'mk') => {
          
          if (uiCabinetOverlayRef.current && app && Assets.cache) {
            const overlayPath = newLanguage === 'en' ? '/assets/ui-cabinet-overlay.png' : '/assets/ui-cabinet-overlay-mk.png'
            const newTexture = Assets.cache.get(overlayPath)
            
            if (newTexture) {
              uiCabinetOverlayRef.current.texture = newTexture
            } else {
              console.error('❌ Failed to load overlay texture for language:', newLanguage, 'from path:', overlayPath)
            }
          } else {
            console.error('❌ Missing required refs/objects for overlay update')
          }
        }
        updateOverlayRef.current = updateOverlay

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
              } else {
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
                } else if (isGambleModeRef.current) {
                }
              }
              
            }
          }

          animateFrames()
        }
        
        // Track running win animations to stop them on new spins
        const runningWinAnimations: { [key: string]: boolean } = {}
        
        // Function to animate winning symbols (with pre-loaded assets)
        const animateWinningSymbols = async (winningPositions: { reelIndex: number, rowIndex: number, symbolName: string }[], customSpeed?: number) => {
          if (winningPositions.length === 0) {
            return
          }
          
          
          winningPositions.forEach(({ reelIndex, rowIndex, symbolName }) => {
            const animationKey = `${reelIndex}-${rowIndex}`
            runningWinAnimations[animationKey] = true // Mark animation as running
            
            const reel = reelsRef.current[reelIndex]
            if (!reel) {
              delete runningWinAnimations[animationKey]
              return
            }
            
            // Get the symbol at this position (skip mask at 0 and overshoot at 1)
            const symbolSprite = reel.children[rowIndex + 2] as Sprite
            if (!symbolSprite) {
              return
            }
            
            // Convert symbol name to number (handle both "Wild" and "Wild.png")
            const cleanSymbolName = symbolName.replace('.png', '') // Remove .png if present
            
            // Handle case where server sends clean name (like "Wild") vs filename (like "Wild.png")
            const symbolNumber = symbolNameToNumber[cleanSymbolName] || cleanSymbolName
            
            // Special logging for wild symbols - check both the clean name and number
            if (cleanSymbolName === 'Wild' || symbolNumber === '08' || symbolName === 'Wild') {
            }
            
            // Special logging for grapes
            if (cleanSymbolName === 'Grape' || symbolNumber === '05' || symbolName === 'Grape') {
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
            
            
            // Additional debugging for wild symbols
            if (symbolNumber === '08') {
            }
            
            // Create animation frames array (use all frames for smoothest animation)
            const winFrames: import('pixi.js').Texture[] = []
            
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
            
            // Animate through frames at smooth speed
            let currentFrame = 0
            const animationSpeed = customSpeed || 80 // Use custom speed or default 80ms per frame (~12.5 FPS)
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
                // Loop through last 20 frames - ensure currentFrame is within bounds
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
          
          // Hide win line display
          winLineDisplayContainer.visible = false
          
          // Hide win info display
          if (winInfoDisplayRef.current) {
            winInfoDisplayRef.current.style.display = 'none'
          }
        }
        
        // Function to show win line display (e.g., "Line 3 3x [cherry icon] = 1.00 FUN")
        const showWinLineDisplay = (winLine: { payline: number, symbols: string[], count: number, symbol: string, payout: number }) => {
          // Clear existing content
          winLineDisplayContainer.removeChildren()
          
          // Create container for the single line display
          const lineContainer = new Container()
          
          // Get win type information for this specific line
          const lineWinConfig = getWinConfig(winLine.payout, currentBet, [winLine])
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
          const symbolNumber = symbolNameToNumber[cleanSymbolName] || cleanSymbolName
          const reelImageSymbolName = `s${symbolNumber}.png`
          
          
          // Try to find the symbol in reelImages.json format
          if (reelAtlas.textures[reelImageSymbolName]) {
            symbolTexture = reelAtlas.textures[reelImageSymbolName]
          } else {
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
        }
        
        // Function to show win highlights with cycling
        const showWinHighlights = (winLines: { payline: number, symbols: string[], count: number, symbol: string, payout: number }[]) => {
          clearWinHighlights()
          
          if (winLines.length === 0) {
            return
          }

          // Classify the win and get appropriate configuration
          const totalWinAmount = pendingWinRef.current
          const winConfig = getWinConfig(totalWinAmount, currentBetRef.current, winLines)
          
          // Trigger win sound sequence immediately if no wild expansions are happening
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
          } else if (hasWildExpansions) {
          }

          // Start win count-up animation synchronized with payline animations
          // But only if gamble mode is not active
          if (pendingWinRef.current > 0 && animateWinRef.current && !isGambleMode) {
            animateWinRef.current(pendingWinRef.current)
          } else if (isGambleMode) {
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
                } else {
                }
                
                winningPositions.push({ reelIndex, rowIndex, symbolName: `${actualSymbolName}.png` })
              }
            }
          })
          
          // Enable win animations
          const ENABLE_WIN_ANIMATIONS = true
          
          if (ENABLE_WIN_ANIMATIONS && winningPositions.length > 0) {
            // Start win animations
            
            // Start animations with win-type-specific speed
            const animationSpeed = getAnimationSpeed(winConfig.type)
            
            animateWinningSymbols(winningPositions, animationSpeed).then(() => {
            }).catch(error => {
              console.error('❌ Win animation error:', error)
            })
            
            // Start payline highlights and win line display simultaneously with win animations
            showWinHighlightsAfterAnimation(winLines)
          } else {
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
            
            // Show win line display
            showWinLineDisplay(winLine)
            
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
            
            // Add to stage at correct z-index position (above border, below overlays)
            if (app && app.stage) {
              // Find insertion point - after border element
              const borderChild = app.stage.children.find(child => 
                child instanceof Sprite && child.texture?.label?.includes('reelBorder')
              )
              const borderIndex = borderChild ? app.stage.children.indexOf(borderChild) : -1
              const insertIndex = borderIndex !== -1 ? borderIndex + 1 : app.stage.children.length - 1
              
              app.stage.addChildAt(highlightContainer, insertIndex)
              
              // Restore manual positioning since not inheriting from reelContainer
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
        
        // Set the ref for external access (take win feature)
        showWinHighlightsRef.current = showWinHighlights

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
        // Clean up resize event listener
        if (handleResize) {
          window.removeEventListener('resize', handleResize)
        }
        // Clean up autostart timeout
        if (autoStartTimeoutRef.current) {
          clearTimeout(autoStartTimeoutRef.current)
          autoStartTimeoutRef.current = null
        }
        // Clean up credit flash timeout
        if (creditFlashTimeoutRef.current) {
          clearTimeout(creditFlashTimeoutRef.current)
          creditFlashTimeoutRef.current = null
        }
        // Clean up card flash interval
        if (cardFlashIntervalRef.current) {
          clearInterval(cardFlashIntervalRef.current)
          cardFlashIntervalRef.current = null
        }
        // Clean up gamble flash sound
        if (gambleSoundLoopIntervalRef.current) {
          clearInterval(gambleSoundLoopIntervalRef.current)
          gambleSoundLoopIntervalRef.current = null
        }
        // Clean up gamble timeouts
        if (gambleWinTimeoutRef.current) {
          clearTimeout(gambleWinTimeoutRef.current)
          gambleWinTimeoutRef.current = null
        }
        if (gambleLoseTimeoutRef.current) {
          clearTimeout(gambleLoseTimeoutRef.current)
          gambleLoseTimeoutRef.current = null
        }
        // Clean up PIXI sounds on unmount
        if (sound) {
          sound.stopAll()
        }
        appRef.current.destroy(true, { children: true })
        destroyed = true
        appRef.current = null
      }
    }
  }, [])

  // Update UI when state changes
  useEffect(() => {
    if (uiUpdateRef.current) {
      uiUpdateRef.current(totalBalance, currentBet, lastWin)
    }
  }, [totalBalance, currentBet, lastWin, denomination])

  // Update autostart indicator and ref when state changes
  useEffect(() => {
    isAutoStartRef.current = isAutoStart
    if (autoStartTextRef.current) {
      autoStartTextRef.current.visible = isAutoStart
      autoStartTextRef.current.style.fill = 0x00FF00 // Always green when visible
    }
  }, [isAutoStart])

  // Sync mobile controller state with refs - optimized with change detection
  useEffect(() => {
    const updateMobileControllerState = () => {
      const newIsSpinning = isSpinningRef.current
      const newStopRequested = stopRequestedRef.current
      const newIsWinAnimating = isWinAnimatingRef.current
      const newHasRunningAnimations = animationsRunningRef.current.size > 0

      // Only update state if values have actually changed
      setIsSpinning(prev => prev !== newIsSpinning ? newIsSpinning : prev)
      setStopRequested(prev => prev !== newStopRequested ? newStopRequested : prev)
      setIsWinAnimating(prev => prev !== newIsWinAnimating ? newIsWinAnimating : prev)
      setHasRunningAnimations(prev => prev !== newHasRunningAnimations ? newHasRunningAnimations : prev)
    }

    // Initial sync
    updateMobileControllerState()

    // Reduced polling frequency to 200ms for better performance
    const interval = setInterval(updateMobileControllerState, 200)

    return () => clearInterval(interval)
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
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
        }}
      />
      <MobileController
        gameState={{
          isSpinning,
          isGambleMode,
          gambleStage,
          hasPendingWin: pendingWin > 0,
          isWinAnimating,
          stopRequested,
          hasRunningAnimations,
          isAutoStart
        }}
        actions={{
          spinReels: () => {
            if (spinReelsRef.current) {
              spinReelsRef.current()
            } else {
              console.error('❌ spinReelsRef.current is null')
            }
          },
          stopReels: () => {
            if (playReelStopSoundRef.current) {
              playReelStopSoundRef.current()
            }
            simultaneousStopRef.current = true
            stopRequestedRef.current = true
          },
          takeWin: () => {
            if (takeWinRef.current) {
              takeWinRef.current()
            } else {
              console.error('❌ takeWinRef.current is null')
            }
          },
          cycleBet: () => {
            cycleBet()
          },
          setMaxBet: () => {
            setMaxBet()
          },
          cycleDenomination: () => {
            cycleDenomination()
          },
          enterGambleMode: () => {
            if (pendingWin > 0 && !isSpinningRef.current && !isGambleModeRef.current) {
              setIsGambleMode(true)
              setGambleAmount(pendingWin)
              setPendingWin(0)
              isGambleModeRef.current = true
            }
          },
          chooseGambleColor: (color: 'red' | 'black') => {
            if (isGambleModeRef.current) {
              setSelectedColor(color)
            }
          },
          collectGambleWin: () => {
            if (isGambleModeRef.current) {
              setIsGambleMode(false)
              isGambleModeRef.current = false
              setPendingWin(gambleAmountRef.current)
              setGambleAmount(0)
            }
          },
          toggleAutoStart: () => {
            setIsAutoStart(prev => !prev)
          },
          toggleLanguage: () => {
            setCurrentLanguage(prev => {
              const newLang = prev === 'en' ? 'mk' : 'en'
              // Trigger overlay update
              if (updateOverlayRef.current) {
                updateOverlayRef.current(newLang)
              } else {
                console.error('❌ updateOverlayRef.current is null')
              }
              return newLang
            })
          }
        }}
      />
      <VoucherInput
        onVoucherValidated={handleVoucherValidated}
        onError={handleVoucherError}
        className="voucher-input-overlay"
      />
      <MessagePopup
        isVisible={showMessagePopup}
        type={messagePopupType}
        title={messagePopupTitle}
        message={messagePopupMessage}
        onClose={() => setShowMessagePopup(false)}
        autoCloseDelay={3000}
      />
      <VoucherPrintingScreen
        amount={printingAmount}
        currency="MKD"
        onComplete={handlePrintingComplete}
        onError={handlePrintingError}
        isVisible={showPrintingScreen}
      />
    </div>
  )
}
