/**
 * useKeyboardHandler Hook
 *
 * Manages keyboard input for the slot game, handling different modes:
 * - Normal game mode: B (cycle bet), R (max bet), D (denomination), L (language)
 * - Gamble mode: R (red), B (black), Space (collect)
 * - With pending win: R/B (enter gamble)
 *
 * Key bindings are configurable via gameConfig.json for easy customization.
 *
 * Extracted from page.tsx lines 882-938
 */

import { useEffect, useCallback } from 'react'
import { KEY_BINDINGS } from '@/config/gameConstants'

export interface UseKeyboardHandlerProps {
  // Game state
  isSpinning: boolean
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  pendingWin: number

  // Callback functions
  cycleBet: () => void
  setMaxBet: () => void
  cycleDenomination: () => void
  toggleLanguage: () => void

  // Gamble callbacks
  chooseGambleColor: (color: 'red' | 'black') => void
  collectGambleWin: () => void
  enterGambleMode: () => void

  // Optional: disabled state
  disabled?: boolean
}

export function useKeyboardHandler({
  isSpinning,
  isGambleMode,
  gambleStage,
  pendingWin,
  cycleBet,
  setMaxBet,
  cycleDenomination,
  toggleLanguage,
  chooseGambleColor,
  collectGambleWin,
  enterGambleMode,
  disabled = false
}: UseKeyboardHandlerProps) {

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't handle keys if disabled
    if (disabled) return

    // Gamble mode controls
    if (isGambleMode) {
      if (event.code === KEY_BINDINGS.GAMBLE_RED && gambleStage === 'choice') {
        event.preventDefault()
        event.stopPropagation()
        chooseGambleColor('red')
      } else if (event.code === KEY_BINDINGS.GAMBLE_BLACK && gambleStage === 'choice') {
        event.preventDefault()
        event.stopPropagation()
        chooseGambleColor('black')
      } else if (event.code === KEY_BINDINGS.GAMBLE_COLLECT && (gambleStage === 'result' || gambleStage === 'choice')) {
        event.preventDefault()
        event.stopPropagation()
        collectGambleWin()
      }
    }
    // Normal game controls (only when not in gamble mode)
    else if (!isSpinning) {
      // Enter gamble mode if there's a pending win
      if (KEY_BINDINGS.ENTER_GAMBLE.includes(event.code) && pendingWin > 0) {
        event.preventDefault()
        event.stopPropagation()
        enterGambleMode()
      }
      // Cycle bet (only when no pending win)
      else if (event.code === KEY_BINDINGS.CYCLE_BET && pendingWin === 0) {
        event.preventDefault()
        event.stopPropagation()
        cycleBet()
      }
      // Set max bet (only when no pending win)
      else if (event.code === KEY_BINDINGS.MAX_BET && pendingWin === 0) {
        event.preventDefault()
        event.stopPropagation()
        setMaxBet()
      }
      // Cycle denomination
      else if (event.code === KEY_BINDINGS.CYCLE_DENOMINATION) {
        event.preventDefault()
        event.stopPropagation()
        cycleDenomination()
      }
    }

    // Language toggle (works in any mode)
    if (event.code === KEY_BINDINGS.TOGGLE_LANGUAGE) {
      event.preventDefault()
      event.stopPropagation()
      toggleLanguage()
    }
  }, [
    disabled,
    isGambleMode,
    isSpinning,
    gambleStage,
    pendingWin,
    cycleBet,
    setMaxBet,
    cycleDenomination,
    toggleLanguage,
    chooseGambleColor,
    collectGambleWin,
    enterGambleMode
  ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  // Return nothing - this hook only manages side effects
  return null
}

export default useKeyboardHandler
