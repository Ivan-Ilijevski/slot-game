/**
 * useBetManager Hook
 *
 * Manages bet amount selection and validation.
 * Handles bet cycling, increasing, decreasing, and max bet functionality.
 * Excludes denomination (cosmetic feature) - see useDenominationManager for that.
 *
 * Extracted from page.tsx (lines 250-283) for reusability and testability.
 */

import { useState, useCallback, useEffect } from 'react'
import { BET_OPTIONS, getNextBet, getPreviousBet, getMaxBet, isValidBet } from '../../config/gameConstants'

export interface UseBetManagerProps {
  /** Initial bet amount when component mounts */
  initialBet?: number

  /** Whether the game is currently spinning (disables bet changes) */
  isSpinning?: boolean

  /** Whether there's a pending win to collect (disables bet changes) */
  hasPendingWin?: boolean

  /** Whether gamble mode is active (disables bet changes) */
  isGambleMode?: boolean

  /** Callback fired when bet changes */
  onBetChange?: (newBet: number) => void

  /** Whether to log bet changes to console (for debugging) */
  debug?: boolean
}

export interface UseBetManagerReturn {
  /** Current bet amount */
  currentBet: number

  /** Set bet to a specific value */
  setBet: (bet: number) => void

  /** Increase bet to next higher option */
  increaseBet: () => void

  /** Decrease bet to next lower option */
  decreaseBet: () => void

  /** Set bet to maximum available option */
  setMaxBet: () => void

  /** Cycle to next bet option (wraps around to first) */
  cycleBet: () => void

  /** Check if bet controls are currently disabled */
  isDisabled: boolean

  /** Check if at maximum bet */
  isMaxBet: boolean

  /** Check if at minimum bet */
  isMinBet: boolean

  /** Get the next bet amount (or null if at max) */
  getNextBetAmount: () => number | null

  /** Get the previous bet amount (or null if at min) */
  getPreviousBetAmount: () => number | null
}

/**
 * Custom hook for managing bet selection
 *
 * @example
 * ```typescript
 * const betManager = useBetManager({
 *   isSpinning,
 *   hasPendingWin,
 *   isGambleMode,
 *   onBetChange: (bet) => console.log('Bet changed to:', bet)
 * })
 *
 * <button onClick={betManager.increaseBet}>Bet Up</button>
 * <span>{betManager.currentBet} MKD</span>
 * ```
 */
export function useBetManager({
  initialBet = BET_OPTIONS[0],
  isSpinning = false,
  hasPendingWin = false,
  isGambleMode = false,
  onBetChange,
  debug = false
}: UseBetManagerProps = {}): UseBetManagerReturn {

  // Validate and set initial bet
  const validInitialBet = isValidBet(initialBet) ? initialBet : BET_OPTIONS[0]
  const [currentBet, setCurrentBet] = useState<number>(validInitialBet)

  /**
   * Check if bet controls should be disabled
   * Disabled when: spinning, pending win, or in gamble mode
   */
  const isDisabled = isSpinning || hasPendingWin || isGambleMode

  /**
   * Get current bet index in options array
   */
  const getCurrentBetIndex = useCallback((): number => {
    return BET_OPTIONS.indexOf(currentBet)
  }, [currentBet])

  /**
   * Check if currently at maximum bet
   */
  const isMaxBet = currentBet === BET_OPTIONS[BET_OPTIONS.length - 1]

  /**
   * Check if currently at minimum bet
   */
  const isMinBet = currentBet === BET_OPTIONS[0]

  /**
   * Get the next bet amount (or null if at max)
   */
  const getNextBetAmount = useCallback((): number | null => {
    const currentIndex = getCurrentBetIndex()
    if (currentIndex < BET_OPTIONS.length - 1) {
      return BET_OPTIONS[currentIndex + 1]
    }
    return null
  }, [getCurrentBetIndex])

  /**
   * Get the previous bet amount (or null if at min)
   */
  const getPreviousBetAmount = useCallback((): number | null => {
    const currentIndex = getCurrentBetIndex()
    if (currentIndex > 0) {
      return BET_OPTIONS[currentIndex - 1]
    }
    return null
  }, [getCurrentBetIndex])

  /**
   * Set bet to a specific value
   * Validates that the bet is in the available options
   */
  const setBet = useCallback((newBet: number) => {
    if (isDisabled) {
      if (debug) console.log('[useBetManager] Bet change blocked - controls disabled')
      return
    }

    if (!isValidBet(newBet)) {
      console.warn(`[useBetManager] Invalid bet amount: ${newBet}. Using closest valid bet.`)
      // Find closest valid bet
      const closest = BET_OPTIONS.reduce((prev, curr) =>
        Math.abs(curr - newBet) < Math.abs(prev - newBet) ? curr : prev
      )
      newBet = closest
    }

    if (debug) console.log(`[useBetManager] Setting bet to: ${newBet}`)
    setCurrentBet(newBet)
  }, [isDisabled, debug])

  /**
   * Increase bet to next higher option
   */
  const increaseBet = useCallback(() => {
    if (isDisabled) {
      if (debug) console.log('[useBetManager] Increase blocked - controls disabled')
      return
    }

    const nextBet = getNextBetAmount()
    if (nextBet !== null) {
      if (debug) console.log(`[useBetManager] Increasing bet from ${currentBet} to ${nextBet}`)
      setCurrentBet(nextBet)
    } else {
      if (debug) console.log('[useBetManager] Already at maximum bet')
    }
  }, [isDisabled, currentBet, getNextBetAmount, debug])

  /**
   * Decrease bet to next lower option
   */
  const decreaseBet = useCallback(() => {
    if (isDisabled) {
      if (debug) console.log('[useBetManager] Decrease blocked - controls disabled')
      return
    }

    const prevBet = getPreviousBetAmount()
    if (prevBet !== null) {
      if (debug) console.log(`[useBetManager] Decreasing bet from ${currentBet} to ${prevBet}`)
      setCurrentBet(prevBet)
    } else {
      if (debug) console.log('[useBetManager] Already at minimum bet')
    }
  }, [isDisabled, currentBet, getPreviousBetAmount, debug])

  /**
   * Set bet to maximum available option
   */
  const setMaxBet = useCallback(() => {
    if (isDisabled) {
      if (debug) console.log('[useBetManager] Max bet blocked - controls disabled')
      return
    }

    const maxBet = getMaxBet()
    if (debug) console.log(`[useBetManager] Setting max bet: ${maxBet}`)
    setCurrentBet(maxBet)
  }, [isDisabled, debug])

  /**
   * Cycle to next bet option (wraps around to first)
   */
  const cycleBet = useCallback(() => {
    if (isDisabled) {
      if (debug) console.log('[useBetManager] Cycle blocked - controls disabled')
      return
    }

    const nextBet = getNextBet(currentBet)
    if (debug) console.log(`[useBetManager] Cycling bet from ${currentBet} to ${nextBet}`)
    setCurrentBet(nextBet)
  }, [isDisabled, currentBet, debug])

  /**
   * Notify parent component when bet changes
   */
  useEffect(() => {
    if (onBetChange) {
      onBetChange(currentBet)
    }
  }, [currentBet, onBetChange])

  return {
    currentBet,
    setBet,
    increaseBet,
    decreaseBet,
    setMaxBet,
    cycleBet,
    isDisabled,
    isMaxBet,
    isMinBet,
    getNextBetAmount,
    getPreviousBetAmount
  }
}

/**
 * Re-export for convenience
 */
export default useBetManager
