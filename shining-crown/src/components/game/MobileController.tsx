'use client'

import { useEffect, useState, useCallback } from 'react'
import { KeyboardActions, GameState } from './KeyboardHandler'
import { isMobile } from '@/utils/mobile'

interface MobileControllerProps {
  gameState: GameState
  actions: KeyboardActions
  enabled?: boolean
}

interface TouchButton {
  key: string
  label: string
  action: () => void
  className: string
  position: string
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  hapticType?: 'light' | 'medium' | 'heavy'
}

export default function MobileController({
  gameState,
  actions,
  enabled = true
}: MobileControllerProps) {
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [activeButton, setActiveButton] = useState<string | null>(null)
  const [lastPressTime, setLastPressTime] = useState<{ [key: string]: number }>({})
  const [screenSize, setScreenSize] = useState<'small' | 'medium' | 'large'>('medium')

  useEffect(() => {
    setIsMobileDevice(isMobile())
    
    // Detect screen size
    const updateScreenSize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const minDimension = Math.min(width, height)
      
      if (minDimension < 400) {
        setScreenSize('small')
      } else if (minDimension < 600) {
        setScreenSize('medium')
      } else {
        setScreenSize('large')
      }
    }

    updateScreenSize()
    window.addEventListener('resize', updateScreenSize)
    window.addEventListener('orientationchange', updateScreenSize)

    return () => {
      window.removeEventListener('resize', updateScreenSize)
      window.removeEventListener('orientationchange', updateScreenSize)
    }
  }, [])


  const triggerHapticFeedback = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ('vibrate' in navigator) {
      // Vibration patterns for different intensities
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40
      }
      navigator.vibrate(patterns[intensity])
    }
  }, [])

  const handleButtonPress = useCallback((keyCode: string, action: () => void, hapticType: 'light' | 'medium' | 'heavy' = 'medium') => {
    const now = Date.now()
    const lastPress = lastPressTime[keyCode] || 0
    
    // Debounce button presses (prevent double clicks within 300ms)
    if (now - lastPress < 300) {
      console.log(`Mobile controller: Debounced ${keyCode} press`)
      return
    }
    
    setLastPressTime(prev => ({ ...prev, [keyCode]: now }))
    setActiveButton(keyCode)
    
    // Trigger haptic feedback
    triggerHapticFeedback(hapticType)
    
    // Visual feedback timeout
    setTimeout(() => setActiveButton(null), 150)
    
    // Execute the action directly (don't simulate keyboard event to avoid double triggers)
    console.log(`Mobile controller: Executing ${keyCode} action`)
    action()
  }, [lastPressTime, triggerHapticFeedback])

  const getResponsiveSize = useCallback((baseSize: 'small' | 'medium' | 'large' | 'xl') => {
    const sizes = {
      small: {
        small: 'w-12 h-12',
        medium: 'w-14 h-14', 
        large: 'w-16 h-16'
      },
      medium: {
        small: 'w-14 h-10',
        medium: 'w-16 h-12',
        large: 'w-18 h-14'
      },
      large: {
        small: 'w-16 h-16',
        medium: 'w-18 h-18',
        large: 'w-20 h-20'
      },
      xl: {
        small: 'w-18 h-18',
        medium: 'w-20 h-20',
        large: 'w-24 h-24'
      }
    }
    return sizes[baseSize][screenSize]
  }, [screenSize])

  const getButtons = useCallback((): TouchButton[] => {
    const buttons: TouchButton[] = []

    // Primary action button (Space)
    if (gameState.isGambleMode) {
      if (gameState.gambleStage === 'choice') {
        buttons.push({
          key: 'Space',
          label: 'COLLECT',
          action: actions.collectGambleWin,
          className: `bottom-8 right-8 ${getResponsiveSize('xl')} pb-safe pr-safe`,
          position: 'fixed',
          variant: 'success',
          hapticType: 'heavy'
        })
      } else {
        buttons.push({
          key: 'Space',
          label: 'COLLECT',
          action: actions.collectGambleWin,
          className: `bottom-8 right-8 ${getResponsiveSize('xl')} pb-safe pr-safe`,
          position: 'fixed',
          variant: 'success',
          hapticType: 'heavy'
        })
      }
    } else if (gameState.isSpinning) {
      buttons.push({
        key: 'Space',
        label: gameState.stopRequested ? 'STOPPING...' : 'STOP',
        action: actions.stopReels,
        className: 'bottom-8 right-8 w-20 h-20 pb-safe pr-safe',
        position: 'fixed',
        variant: 'danger',
        disabled: gameState.stopRequested,
        hapticType: 'medium'
      })
    } else if (gameState.isWinAnimating || gameState.hasRunningAnimations) {
      buttons.push({
        key: 'Space',
        label: 'TAKE WIN',
        action: actions.takeWin,
        className: 'bottom-8 right-8 w-20 h-20 pb-safe pr-safe',
        position: 'fixed',
        variant: 'success',
        hapticType: 'heavy'
      })
    } else {
      buttons.push({
        key: 'Space',
        label: 'SPIN',
        action: actions.spinReels,
        className: 'bottom-8 right-8 w-20 h-20 pb-safe pr-safe',
        position: 'fixed',
        variant: 'primary',
        hapticType: 'heavy'
      })
    }

    // Gamble mode specific buttons
    if (gameState.isGambleMode && gameState.gambleStage === 'choice') {
      buttons.push({
        key: 'KeyR',
        label: 'RED',
        action: () => actions.chooseGambleColor('red'),
        className: `bottom-8 left-8 ${getResponsiveSize('large')} pb-safe pl-safe`,
        position: 'fixed',
        variant: 'danger',
        hapticType: 'medium'
      })
      buttons.push({
        key: 'KeyB',
        label: 'BLACK',
        action: () => actions.chooseGambleColor('black'),
        className: `bottom-8 left-28 ${getResponsiveSize('large')} pb-safe pl-safe`,
        position: 'fixed',
        variant: 'secondary',
        hapticType: 'medium'
      })
    }
    // Normal mode betting buttons
    else if (!gameState.isSpinning && !gameState.isGambleMode) {
      if (gameState.hasPendingWin) {
        buttons.push({
          key: 'KeyR',
          label: 'GAMBLE',
          action: actions.enterGambleMode,
          className: `bottom-8 left-8 ${getResponsiveSize('medium')} pb-safe pl-safe`,
          position: 'fixed',
          variant: 'danger',
          hapticType: 'medium'
        })
        buttons.push({
          key: 'KeyB',
          label: 'GAMBLE',
          action: actions.enterGambleMode,
          className: `bottom-8 left-28 ${getResponsiveSize('medium')} pb-safe pl-safe`,
          position: 'fixed',
          variant: 'secondary',
          hapticType: 'medium'
        })
      } else {
        buttons.push({
          key: 'KeyR',
          label: 'MAX BET',
          action: actions.setMaxBet,
          className: `bottom-32 right-8 ${getResponsiveSize('medium')} pr-safe`,
          position: 'fixed',
          variant: 'danger',
          hapticType: 'light'
        })
        buttons.push({
          key: 'KeyB',
          label: 'BET',
          action: actions.cycleBet,
          className: `bottom-32 right-28 ${getResponsiveSize('medium')} pr-safe`,
          position: 'fixed',
          variant: 'secondary',
          hapticType: 'light'
        })
        buttons.push({
          key: 'KeyD',
          label: 'DENOM',
          action: actions.cycleDenomination,
          className: `bottom-32 left-8 ${getResponsiveSize('medium')} pl-safe`,
          position: 'fixed',
          variant: 'secondary',
          hapticType: 'light'
        })
      }
    }

    // Autoplay toggle (always available)
    buttons.push({
      key: 'KeyP',
      label: 'AUTO',
      action: actions.toggleAutoStart,
      className: `top-8 right-8 ${getResponsiveSize('small')} pt-safe pr-safe`,
      position: 'fixed',
      variant: 'secondary',
      hapticType: 'light'
    })

    return buttons
  }, [gameState, actions, getResponsiveSize])

  const getButtonStyles = (button: TouchButton) => {
    const baseStyles = 'rounded-lg font-bold text-xs flex items-center justify-center select-none touch-manipulation transition-all duration-150 border-2 active:scale-95'
    
    const variantStyles = {
      primary: 'bg-green-600 hover:bg-green-500 border-green-400 text-white shadow-lg shadow-green-600/50',
      secondary: 'bg-blue-600 hover:bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-600/50',
      danger: 'bg-red-600 hover:bg-red-500 border-red-400 text-white shadow-lg shadow-red-600/50',
      success: 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-600/50'
    }

    const disabledStyles = 'opacity-50 cursor-not-allowed bg-gray-600 border-gray-500 text-gray-300'
    const activeStyles = 'scale-95 brightness-125'

    let styles = `${baseStyles} ${variantStyles[button.variant || 'secondary']}`
    
    if (button.disabled) {
      styles = `${baseStyles} ${disabledStyles}`
    }
    
    if (activeButton === button.key) {
      styles += ` ${activeStyles}`
    }

    return styles
  }

  // Don't render on non-mobile devices
  if (!isMobileDevice || !enabled) {
    return null
  }

  const buttons = getButtons()

  return (
    <div className="mobile-controller pointer-events-none fixed inset-0 z-50">
      {buttons.map((button) => (
        <button
          key={button.key}
          className={`${button.position} ${button.className} ${getButtonStyles(button)} pointer-events-auto`}
          onTouchStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!button.disabled) {
              handleButtonPress(button.key, button.action, button.hapticType)
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!button.disabled) {
              handleButtonPress(button.key, button.action, button.hapticType)
            }
          }}
          disabled={button.disabled}
          aria-label={`${button.label} button`}
        >
          <span className="drop-shadow-lg">{button.label}</span>
        </button>
      ))}
      
      {/* Mobile controller indicator with game state */}
      <div className="fixed top-4 left-4 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg pointer-events-none border border-white/20">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            gameState.isSpinning ? 'bg-yellow-400 animate-pulse' :
            gameState.isGambleMode ? 'bg-purple-400' :
            gameState.hasPendingWin ? 'bg-green-400' :
            gameState.isWinAnimating ? 'bg-amber-400 animate-bounce' :
            gameState.isAutoStart ? 'bg-cyan-400' :
            'bg-blue-400'
          }`} />
          <span className="font-medium">
            {gameState.isGambleMode ? 'GAMBLE' :
             gameState.isSpinning ? (gameState.isAutoStart ? 'AUTO SPIN' : 'SPINNING') :
             gameState.isWinAnimating ? 'WIN ANIM' :
             gameState.hasPendingWin ? 'PENDING WIN' :
             gameState.isAutoStart ? 'AUTO READY' :
             'READY'}
          </span>
          {gameState.isAutoStart && (
            <div className="w-1 h-1 bg-cyan-400 rounded-full animate-ping" />
          )}
        </div>
        <div className="text-xs opacity-70 mt-1">Touch Controls</div>
      </div>
    </div>
  )
}