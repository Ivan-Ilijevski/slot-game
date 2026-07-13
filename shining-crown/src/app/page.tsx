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
import { useSpinLogic } from '../components/game/useSpinLogic'
import { useWinAnimations, WinResults } from '../components/game/useWinAnimations'
import { useGameControlKeys } from '../components/game/useGameControlKeys'
import { createGambleUI } from '../components/game/gambleUI'
import { playReelStopSound as playReelStopSoundEffect, playWildReelSound as playWildReelSoundEffect } from '../utils/gameSounds'
import dynamic from 'next/dynamic'

// PIXI must never render on the server
const PixiGameIntegration = dynamic(
  () => import('../components/game/PixiGameIntegration'),
  { ssr: false }
)
import { getWinConfig, getAnimationSpeed, formatWinType, getWinColor, startWinSoundSequence, stopWinSoundSequence, updateGambleModeState, startWinCountingSound, stopWinCountingSound } from '../utils/winSystem'
import walletData from '../data/wallet.json'

// Dynamic import for PIXI Sound to avoid SSR issues
let sound: {
  play: (alias: string, options?: { start?: number; end?: number; volume?: number }) => void;
  stop: (alias: string) => void;
  stopAll: () => void;
  muteAll: () => void;
  unmuteAll: () => void;
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
    initialBalance: walletData.balance,
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
  const refreshWalletBalance = wallet.refreshBalance

  // ===== END: Integrated Hooks =====

  // Remaining state (not yet extracted to hooks)
  const [lastWin, setLastWin] = useState(0)
  const [animatedWinAmount, setAnimatedWinAmount] = useState(0) // Animated display amount
  const [isAutoStart, setIsAutoStart] = useState(false) // Autostart feature toggle
  const [isMuted, setIsMuted] = useState(false) // Global sound mute
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'mk'>('en') // Language for UI overlay

  // Gamble feature state (kept in main component - tightly coupled to PIXI)
  const [gambleAmount, setGambleAmount] = useState(0) // Amount being gambled
  const [gambleStage, setGambleStage] = useState<'choice' | 'reveal' | 'result'>('choice') // Current gamble stage
  const [selectedColor, setSelectedColor] = useState<'red' | 'black' | null>(null) // Player's color choice
  const [cardColor, setCardColor] = useState<'red' | 'black' | null>(null) // Revealed card color
  const [gambleHistory, setGambleHistory] = useState<GambleHistoryEntry[]>([]) // History of gamble results

  // Display balance: subtract pending win to show balance before win was added
  // (The server already added the win, but we display it as pending for animation)
  // During gamble mode, use gambleAmount (constant) instead of pendingWin (which doubles)
  const totalBalance = isGambleMode
    ? wallet.balance - gambleAmount  // Use constant gambleAmount during gamble
    : (pendingWin > 0 ? wallet.balance - pendingWin : wallet.balance)

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

  // Helper function to convert deni amounts to credits for UI display
  const currencyToCredits = useCallback((amountDeni: number): number => {
    return Math.round(amountDeni / (denomination * 100)) // Credits based on denomination (denars per credit)
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
  const wildExpansionSoundTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const winCycleIntervalRef = useRef<NodeJS.Timeout | null>(null)
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
  const isMutedRef = useRef<boolean>(false)
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
  const playReelStopSoundRef = useRef<(() => void) | null>(playReelStopSoundEffect)
  const playWildReelSoundRef = useRef<(() => void) | null>(playWildReelSoundEffect)
  const checkAndAnimateWildsRef = useRef<((winResults: WinResults) => void) | null>(null)
  const reelHasWildRef = useRef<((reelIndex: number) => boolean) | null>(null)
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
  const enterGambleMode = useCallback(async () => {
    console.log('🎰 [DEBUG] enterGambleMode() function called')
    console.log('🎰 [DEBUG] pendingWin (state):', pendingWin)
    console.log('🎰 [DEBUG] pendingWinRef.current:', pendingWinRef.current)
    console.log('🎰 [DEBUG] isSpinningRef.current:', isSpinningRef.current)
    console.log('🎰 [DEBUG] Condition check: pendingWinRef.current > 0 && !isSpinningRef.current =', pendingWinRef.current > 0 && !isSpinningRef.current)
    
    if (pendingWinRef.current > 0 && !isSpinningRef.current) {
      console.log('🎰 [DEBUG] Condition passed - executing gamble mode setup')

      try {
        const response = await fetch('/api/gamble', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        })
        const data = await response.json()
        if (!response.ok || !data.success) {
          console.error('Failed to start gamble:', data.error)
          return
        }
        pendingWinRef.current = data.amount
        setPendingWin(data.amount)
      } catch (error) {
        console.error('Error starting gamble:', error)
        return
      }
      
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

  const exitGambleMode = useCallback(async () => {

    // Clear any pending gamble timeouts first
    if (gambleWinTimeoutRef.current) {
      clearTimeout(gambleWinTimeoutRef.current)
      gambleWinTimeoutRef.current = null
    }
    if (gambleLoseTimeoutRef.current) {
      clearTimeout(gambleLoseTimeoutRef.current)
      gambleLoseTimeoutRef.current = null
    }

    try {
      const response = await fetch('/api/gamble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collect' })
      })
      const data = await response.json()
      if (data.success) await refreshWalletBalance()
      else console.error('Failed to collect gamble:', data.error)
    } catch (error) {
      console.error('Error collecting gamble:', error)
    }

    setIsGambleMode(false)
    setGambleAmount(0)
    setPendingWin(0)
    setLastWin(0)
    setAnimatedWinAmount(0)
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
  }, [stopCardFlashing, refreshWalletBalance])


  const collectGambleWin = useCallback(() => {
    // Transaction is now handled in exitGambleMode
    // Just exit gamble mode (which will trigger the transaction)
    exitGambleMode()
  }, [exitGambleMode])

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

  const chooseGambleColor = useCallback(async (color: 'red' | 'black') => {
    if (gambleStage === 'choice' && gambleContainerRef.current) {
      setSelectedColor(color)
      setGambleStage('reveal')
      
      // Stop card flashing when player makes choice
      stopCardFlashing()
      
      let result
      try {
        const response = await fetch('/api/gamble', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'choose', color })
        })
        result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || 'Gamble choice failed')
      } catch (error) {
        console.error('Error choosing gamble color:', error)
        setGambleStage('choice')
        setSelectedColor(null)
        startCardFlashing()
        return
      }

      const randomColor = result.card.color as 'red' | 'black'
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
        
        // The server selects the card variant as well as its color.
        const availableCards = cardTextures[randomColor] || cardTextures.red
        const randomCardTexture = availableCards[result.card.cardIndex]
        
        
        const won = result.won
        
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
      const won = result.won
      
      setTimeout(() => {
        setGambleStage('result')
        
        if (elements) {
          if (won) {
            // Double the pending win amount (gambleAmount stays constant)
            const newPendingWin = result.currentAmount
            pendingWinRef.current = newPendingWin
            setPendingWin(newPendingWin)
            if (sound) {
          sound.play('reelSound', {
            start: 10,
            end: 11, // 400ms = 0.4 seconds
            volume: 0.9
          })
        }
            elements.gambleAmountText.text = `GAMBLE AMOUNT\n${formatCurrency(newPendingWin)}`
            elements.gambleToWinText.text = `GAMBLE TO WIN\n${formatCurrency(newPendingWin * 2)}`
            elements.instructionsText.text = 'You won!'
            
            // Auto-continue to next gamble round after showing win
            gambleWinTimeoutRef.current = setTimeout(() => {
              if (result.forceCollected) {
                exitGambleMode()
                gambleWinTimeoutRef.current = null
                return
              }
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
            // The server has already settled the loss.
            pendingWinRef.current = 0
            setPendingWin(0)
            setLastWin(0)
            setAnimatedWinAmount(0)
            // gambleAmount stays intact for the exit transaction
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
  }, [gambleStage, exitGambleMode, stopCardFlashing, startCardFlashing, updateGambleHistory])

  // Update gamble mode ref when state changes
  useEffect(() => {
    isGambleModeRef.current = isGambleMode
  }, [isGambleMode])

  // A reload during gamble safely collects the server-held amount so spins
  // and cashout cannot remain blocked by an abandoned session.
  useEffect(() => {
    const recoverGambleSession = async () => {
      try {
        const response = await fetch('/api/gamble')
        const state = await response.json()
        if (!state.sessionActive) return

        await fetch('/api/gamble', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'collect' })
        })
        await refreshWalletBalance()
      } catch (error) {
        console.error('Failed to recover gamble session:', error)
      }
    }

    recoverGambleSession()
  }, [refreshWalletBalance])

  // Function to flash credit display to indicate insufficient funds
  const flashInsufficientFunds = useCallback(() => {
    if (creditDollarTextRef.current && creditAmountTextRef.current) {
      // Store original colors
      const originalDollarColor = creditDollarTextRef.current.style.fill
      const originalAmountColor = creditAmountTextRef.current.style.fill
      
      // Flash to gray
      creditDollarTextRef.current.style.fill = 0x666666
      creditAmountTextRef.current.style.fill = 0x666666
      if (sound) {
          sound.play('reelSound', {
            start: 13,
            end: 13.1, // 400ms = 0.4 seconds
            volume: 0.7
          })
        }
      
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
      }, 200)
      
    }
  }, [])

  // Check if a reel currently shows any wild symbols (reads the atlas at call time)
  const reelHasWild = useCallback((reelIndex: number): boolean => {
    const reel = reelsRef.current[reelIndex]
    const reelAtlas = Assets.cache.get('/assets/reelImages.json')
    if (!reel || !reelAtlas) return false

    // Check all symbol positions in this reel (skip mask at 0 and overshoot at 1)
    for (let i = 2; i < reel.children.length; i++) {
      const symbolSprite = reel.children[i] as Sprite
      if (symbolSprite && symbolSprite.texture === reelAtlas.textures['08.png']) {
        return true
      }
    }
    return false
  }, [])

  // ===== Win animation + spin logic hooks (replace the old inline monolith logic) =====
  const winAnimations = useWinAnimations({
    appRef,
    reelsRef,
    animationsRunningRef,
    pendingWinRef,
    pendingWinLinesRef,
    currentBetRef,
    isGambleModeRef,
    isWinAnimatingRef,
    takeWinActiveRef,
    winHighlightsRef,
    winCycleIntervalRef,
    animateWinRef,
    isGambleMode
  })

  const spinLogic = useSpinLogic({
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
    wildExpansionTimeoutRef,
    setLastWin,
    setPendingWin,
    setAnimatedWinAmount,
    refreshBalance: refreshWalletBalance,
    flashInsufficientFunds,
    clearWinHighlights: winAnimations.clearWinHighlights,
    collectWinRef,
    playReelStopSoundRef,
    playWildReelSoundRef,
    showWinHighlightsRef,
    checkAndAnimateWildsRef,
    reelHasWildRef
  })

  // Keep the legacy function refs (consumed by the keyboard handler, touch
  // controller, and gamble flows) pointing at the current hook callbacks
  useEffect(() => {
    spinReelsRef.current = spinLogic.spinReels
    showWinHighlightsRef.current = winAnimations.showWinHighlights
    checkAndAnimateWildsRef.current = winAnimations.checkAndAnimateWilds
    completeWildExpansionsRef.current = winAnimations.completeWildExpansions
    reelHasWildRef.current = reelHasWild
  }, [spinLogic.spinReels, winAnimations.showWinHighlights, winAnimations.checkAndAnimateWilds, winAnimations.completeWildExpansions, reelHasWild])

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
  // Single source of truth for switching autostart on/off, shared by the
  // P key, the mobile controller, and the tablet remote. Undefined toggles;
  // an explicit value makes remote commands stateful and idempotent.
  const setAutoStart = useCallback((enabled?: boolean) => {
    const next = enabled ?? !isAutoStartRef.current
    if (next === isAutoStartRef.current) return
    isAutoStartRef.current = next
    setIsAutoStart(next)

    if (next && !isSpinningRef.current) {
      // Start autostart immediately if not spinning
      if (sound) {
        sound.play('reelSound', {
          start: 14.0,
          end: 14.8,
          volume: 0.9
        })
      }
      spinReelsRef.current?.()
    } else if (!next && autoStartTimeoutRef.current) {
      // Stop autostart
      if (sound) {
        sound.play('reelSound', {
          start: 14.9,
          end: 15.3,
          volume: 0.9
        })
      }
      clearTimeout(autoStartTimeoutRef.current)
      autoStartTimeoutRef.current = null
    }
  }, [])

  // Global mute, shared by the tablet remote (stateful set-muted command)
  // and any future local control. Undefined toggles.
  const setMuted = useCallback((muted?: boolean) => {
    const next = muted ?? !isMutedRef.current
    if (next === isMutedRef.current) return
    isMutedRef.current = next
    setIsMuted(next)
    if (sound) {
      if (next) {
        sound.muteAll()
      } else {
        sound.unmuteAll()
      }
    }
  }, [])

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
    isMuted,
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
    setAutoStart,
    setMuted,
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
      // denomination is denars-per-credit (e.g. 0.01), not a deni amount
      denomTextRef.current.text = formatCurrency(Math.round(denomination * 100))
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

  // Swap the cabinet overlay texture when the language changes
  useEffect(() => {
    updateOverlayRef.current = (newLanguage: 'en' | 'mk') => {
      const overlayPath = newLanguage === 'en' ? '/assets/ui-cabinet-overlay.png' : '/assets/ui-cabinet-overlay-mk.png'
      const newTexture = Assets.cache.get(overlayPath)
      if (uiCabinetOverlayRef.current && newTexture) {
        uiCabinetOverlayRef.current.texture = newTexture
      } else {
        console.error('\u274c Missing overlay texture or sprite for language:', newLanguage)
      }
    }
  }, [])

  // Space (spin/stop/take-win) and P (autostart) keys
  useGameControlKeys({
    isGambleModeRef,
    isSpinningRef,
    pendingWinRef,
    isWinAnimatingRef,
    animationsRunningRef,
    stopRequestedRef,
    reelsStoppedCountRef,
    takeWinRef,
    spinReelsRef,
    playReelStopSoundRef,
    setAutoStart
  })

  // Mount the gamble UI on the PixiGame stage once the scene is ready
  const handlePixiReady = useCallback((app: Application) => {
    if (gambleContainerRef.current && !gambleContainerRef.current.destroyed &&
        gambleContainerRef.current.parent === app.stage) {
      return
    }
    const gambleContainer = createGambleUI(app.stage)
    gambleContainerRef.current = gambleContainer
    gambleCardRef.current = gambleContainer.gambleElements.faceUpCard
  }, [])

  // Clear game timers and sounds on unmount (PIXI teardown is owned by PixiGame)
  useEffect(() => {
    return () => {
      const timeoutRefs = [autoStartTimeoutRef, creditFlashTimeoutRef, gambleWinTimeoutRef, gambleLoseTimeoutRef, wildExpansionTimeoutRef, soundTimeoutRef, autoCollectTimeoutRef]
      timeoutRefs.forEach(ref => {
        if (ref.current) {
          clearTimeout(ref.current)
          ref.current = null
        }
      })
      const intervalRefs = [cardFlashIntervalRef, gambleSoundLoopIntervalRef, winCycleIntervalRef]
      intervalRefs.forEach(ref => {
        if (ref.current) {
          clearInterval(ref.current)
          ref.current = null
        }
      })
      if (sound) {
        sound.stopAll()
      }
    }
  }, [])


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
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
        }}
      >
        <PixiGameIntegration
          denomination={denomination}
          totalBalance={totalBalance}
          currentBet={currentBet}
          lastWin={lastWin}
          currentLanguage={currentLanguage}
          onIncreaseBet={increaseBet}
          onDecreaseBet={decreaseBet}
          onReady={handlePixiReady}
          appRef={appRef}
          reelsRef={reelsRef}
          reelContainerRef={reelContainerRef}
          uiCabinetOverlayRef={uiCabinetOverlayRef}
          denomTextRef={denomTextRef}
          denomLabelTextRef={denomLabelTextRef}
          creditDollarTextRef={creditDollarTextRef}
          creditAmountTextRef={creditAmountTextRef}
          betDollarTextRef={betDollarTextRef}
          betAmountTextRef={betAmountTextRef}
          winDollarTextRef={winDollarTextRef}
          winAmountTextRef={winAmountTextRef}
          autoStartTextRef={autoStartTextRef}
        />
      </div>
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
              void enterGambleMode()
            }
          },
          chooseGambleColor: (color: 'red' | 'black') => {
            if (isGambleModeRef.current) {
              void chooseGambleColor(color)
            }
          },
          collectGambleWin: () => {
            if (isGambleModeRef.current) {
              collectGambleWin()
            }
          },
          toggleAutoStart: () => {
            setAutoStart()
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
