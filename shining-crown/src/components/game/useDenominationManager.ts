/**
 * useDenominationManager Hook
 *
 * Manages denomination selection for cosmetic display purposes.
 * Denomination affects how credits are displayed but doesn't change actual bet amounts.
 *
 * Separated from useBetManager because denomination is purely cosmetic/UI concern.
 * Extracted from page.tsx (lines 285-291) for reusability.
 */

import { useState, useCallback, useEffect } from 'react'
import { DENOMINATION_OPTIONS, getNextDenomination, isValidDenomination } from '../../config/gameConstants'

export interface UseDenominationManagerProps {
  /** Initial denomination when component mounts */
  initialDenomination?: number

  /** Whether controls are disabled (e.g., during spin or gamble) */
  isDisabled?: boolean

  /** Callback fired when denomination changes */
  onDenominationChange?: (newDenomination: number) => void

  /** Whether to log denomination changes to console (for debugging) */
  debug?: boolean
}

export interface UseDenominationManagerReturn {
  /** Current denomination value */
  denomination: number

  /** Set denomination to a specific value */
  setDenomination: (denom: number) => void

  /** Cycle to next denomination option (wraps around) */
  cycleDenomination: () => void

  /** Check if denomination controls are disabled */
  isDisabled: boolean

  /** Get all available denomination options */
  availableOptions: readonly number[]
}

/**
 * Custom hook for managing denomination selection
 *
 * @example
 * ```typescript
 * const denomManager = useDenominationManager({
 *   isDisabled: isSpinning || isGambleMode,
 *   onDenominationChange: (denom) => console.log('Denom changed to:', denom)
 * })
 *
 * <button onClick={denomManager.cycleDenomination}>
 *   {denomManager.denomination.toFixed(2)} MKD
 * </button>
 * ```
 */
export function useDenominationManager({
  initialDenomination = DENOMINATION_OPTIONS[0],
  isDisabled = false,
  onDenominationChange,
  debug = false
}: UseDenominationManagerProps = {}): UseDenominationManagerReturn {

  // Validate and set initial denomination
  const validInitialDenom = isValidDenomination(initialDenomination)
    ? initialDenomination
    : DENOMINATION_OPTIONS[0]

  const [denomination, setDenominationState] = useState<number>(validInitialDenom)

  /**
   * Set denomination to a specific value
   * Validates that the denomination is in the available options
   */
  const setDenomination = useCallback((newDenom: number) => {
    if (isDisabled) {
      if (debug) console.log('[useDenominationManager] Change blocked - controls disabled')
      return
    }

    if (!isValidDenomination(newDenom)) {
      console.warn(`[useDenominationManager] Invalid denomination: ${newDenom}. Using closest valid denomination.`)
      // Find closest valid denomination
      const closest = DENOMINATION_OPTIONS.reduce((prev, curr) =>
        Math.abs(curr - newDenom) < Math.abs(prev - newDenom) ? curr : prev
      )
      newDenom = closest
    }

    if (debug) console.log(`[useDenominationManager] Setting denomination to: ${newDenom}`)
    setDenominationState(newDenom)
  }, [isDisabled, debug])

  /**
   * Cycle to next denomination option (wraps around to first)
   */
  const cycleDenomination = useCallback(() => {
    if (isDisabled) {
      if (debug) console.log('[useDenominationManager] Cycle blocked - controls disabled')
      return
    }

    const nextDenom = getNextDenomination(denomination)
    if (debug) console.log(`[useDenominationManager] Cycling denomination from ${denomination} to ${nextDenom}`)
    setDenominationState(nextDenom)
  }, [isDisabled, denomination, debug])

  /**
   * Notify parent component when denomination changes
   */
  useEffect(() => {
    if (onDenominationChange) {
      onDenominationChange(denomination)
    }
  }, [denomination, onDenominationChange])

  return {
    denomination,
    setDenomination,
    cycleDenomination,
    isDisabled,
    availableOptions: DENOMINATION_OPTIONS
  }
}

/**
 * Re-export for convenience
 */
export default useDenominationManager
