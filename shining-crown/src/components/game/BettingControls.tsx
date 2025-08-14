'use client'

import { useCallback, useEffect, useState } from 'react'

export interface BettingControlsProps {
  currentBet: number
  betOptions: number[]
  onBetChange: (newBet: number) => void
  disabled?: boolean
  showKeyboardHints?: boolean
}

export interface BettingControlsState {
  currentBet: number
  isDisabled: boolean
}

export interface UseBettingControlsProps {
  initialBet?: number
  betOptions: number[]
  isSpinning?: boolean
  hasPendingWin?: boolean
  isGambleMode?: boolean
  onBetChange?: (bet: number) => void
}

export function useBettingControls({
  initialBet = 5.00,
  betOptions,
  isSpinning = false,
  hasPendingWin = false,
  isGambleMode = false,
  onBetChange
}: UseBettingControlsProps) {
  const [currentBet, setCurrentBet] = useState(initialBet)

  // Check if bet controls should be disabled
  const isDisabled = useCallback(() => {
    return isSpinning || hasPendingWin || isGambleMode
  }, [isSpinning, hasPendingWin, isGambleMode])

  // Update bet and notify parent
  const updateBet = useCallback((newBet: number) => {
    if (isDisabled()) return

    const validBet = betOptions.includes(newBet) ? newBet : betOptions[0]
    setCurrentBet(validBet)
    onBetChange?.(validBet)
  }, [betOptions, isDisabled, onBetChange])

  // Increase bet to next higher option
  const increaseBet = useCallback(() => {
    if (isDisabled()) return

    const currentIndex = betOptions.indexOf(currentBet)
    if (currentIndex < betOptions.length - 1) {
      const newBet = betOptions[currentIndex + 1]
      console.log('IncreaseBet - Current bet:', currentBet, 'Index found:', currentIndex, 'New bet:', newBet)
      updateBet(newBet)
    }
  }, [betOptions, isDisabled, updateBet, currentBet])

  // Decrease bet to next lower option
  const decreaseBet = useCallback(() => {
    if (isDisabled()) return

    const currentIndex = betOptions.indexOf(currentBet)
    if (currentIndex > 0) {
      const newBet = betOptions[currentIndex - 1]
      updateBet(newBet)
    }
  }, [betOptions, isDisabled, updateBet, currentBet])

  // Set maximum bet
  const setMaxBet = useCallback(() => {
    if (isDisabled()) return
    const maxBet = betOptions[betOptions.length - 1]
    console.log('Setting max bet to:', maxBet)
    updateBet(maxBet)
  }, [betOptions, isDisabled, updateBet])

  // Cycle to next bet option (wraps around to first)
  const cycleBet = useCallback(() => {
    if (isDisabled()) return

    const currentIndex = betOptions.indexOf(currentBet)
    const nextIndex = (currentIndex + 1) % betOptions.length
    const newBet = betOptions[nextIndex]
    console.log(`Cycling bet: currentBet=$${currentBet}, currentIndex=${currentIndex}, nextIndex=${nextIndex}, newBet=$${newBet}`)
    updateBet(newBet)
  }, [betOptions, isDisabled, updateBet, currentBet])

  // Get maximum affordable bet based on balance
  const getMaxAffordableBet = useCallback((balance: number) => {
    const affordableBets = betOptions.filter(bet => bet <= balance)
    return affordableBets.length > 0 ? Math.max(...affordableBets) : betOptions[0]
  }, [betOptions])

  // Validate if current bet is affordable
  const isBetAffordable = useCallback((balance: number) => {
    return currentBet <= balance
  }, [currentBet])

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isDisabled()) return

    switch (event.code) {
      case 'KeyB': // Cycle bet
        if (!hasPendingWin) {
          event.preventDefault()
          event.stopPropagation()
          console.log('B key pressed, calling cycleBet()')
          cycleBet()
        }
        break
      case 'KeyR': // Max bet
        if (!hasPendingWin) {
          event.preventDefault()
          event.stopPropagation()
          console.log('R key pressed, calling setMaxBet()')
          setMaxBet()
        }
        break
      case 'Equal': // Increase bet (+ key)
      case 'NumpadAdd':
        event.preventDefault()
        event.stopPropagation()
        increaseBet()
        break
      case 'Minus': // Decrease bet (- key)
      case 'NumpadSubtract':
        event.preventDefault()
        event.stopPropagation()
        decreaseBet()
        break
    }
  }, [isDisabled, hasPendingWin, cycleBet, setMaxBet, increaseBet, decreaseBet])

  // Update current bet when external bet changes
  useEffect(() => {
    setCurrentBet(initialBet)
  }, [initialBet])

  return {
    currentBet,
    isDisabled: isDisabled(),
    increaseBet,
    decreaseBet,
    setMaxBet,
    cycleBet,
    getMaxAffordableBet,
    isBetAffordable,
    handleKeyDown,
    // Utility functions
    getCurrentBetIndex: () => betOptions.indexOf(currentBet),
    getNextBet: () => {
      const currentIndex = betOptions.indexOf(currentBet)
      return currentIndex < betOptions.length - 1 ? betOptions[currentIndex + 1] : null
    },
    getPreviousBet: () => {
      const currentIndex = betOptions.indexOf(currentBet)
      return currentIndex > 0 ? betOptions[currentIndex - 1] : null
    }
  }
}

// React component for betting controls UI (can be used with PIXI or HTML)
export default function BettingControls({
  currentBet,
  betOptions,
  onBetChange,
  disabled = false,
  showKeyboardHints = false
}: BettingControlsProps) {
  const {
    increaseBet,
    decreaseBet,
    setMaxBet,
    cycleBet,
    handleKeyDown,
    getNextBet,
    getPreviousBet
  } = useBettingControls({
    initialBet: currentBet,
    betOptions,
    isSpinning: disabled,
    onBetChange
  })

  // Add keyboard event listener
  useEffect(() => {
    if (disabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [disabled, handleKeyDown])

  const nextBet = getNextBet()
  const previousBet = getPreviousBet()

  return (
    <div className="betting-controls flex items-center gap-2">
      {/* Decrease Bet Button */}
      <button
        onClick={decreaseBet}
        disabled={disabled || !previousBet}
        className="bet-button bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-white font-bold text-lg"
        title={previousBet ? `Decrease to $${previousBet}` : 'Minimum bet reached'}
      >
        ▼
      </button>

      {/* Current Bet Display */}
      <div className="bet-display bg-black text-amber-400 px-4 py-2 rounded font-bold text-xl min-w-24 text-center">
        ${currentBet.toFixed(2)}
      </div>

      {/* Increase Bet Button */}
      <button
        onClick={increaseBet}
        disabled={disabled || !nextBet}
        className="bet-button bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-white font-bold text-lg"
        title={nextBet ? `Increase to $${nextBet}` : 'Maximum bet reached'}
      >
        ▲
      </button>

      {/* Max Bet Button */}
      <button
        onClick={setMaxBet}
        disabled={disabled || currentBet === betOptions[betOptions.length - 1]}
        className="bet-button bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-white font-bold text-sm"
      >
        MAX
      </button>

      {/* Cycle Bet Button */}
      <button
        onClick={cycleBet}
        disabled={disabled}
        className="bet-button bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-white font-bold text-sm"
      >
        CYCLE
      </button>

      {/* Keyboard Hints */}
      {showKeyboardHints && !disabled && (
        <div className="keyboard-hints text-xs text-gray-400 ml-4">
          <div>B - Cycle | R - Max</div>
          <div>+/- - Increase/Decrease</div>
        </div>
      )}
    </div>
  )
}

// Utility functions for betting logic
export const BettingUtils = {
  // Find the closest valid bet from options
  findClosestBet: (amount: number, betOptions: number[]): number => {
    return betOptions.reduce((prev, curr) => 
      Math.abs(curr - amount) < Math.abs(prev - amount) ? curr : prev
    )
  },

  // Get bet index safely
  getBetIndex: (bet: number, betOptions: number[]): number => {
    const index = betOptions.indexOf(bet)
    return index === -1 ? 0 : index
  },

  // Validate bet amount
  isValidBet: (bet: number, betOptions: number[]): boolean => {
    return betOptions.includes(bet)
  },

  // Get betting range info
  getBetRange: (betOptions: number[]) => ({
    min: Math.min(...betOptions),
    max: Math.max(...betOptions),
    count: betOptions.length
  })
}