'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCurrency, formatNumberWithSpaces, currencyToCredits } from './CurrencyUtils'

export interface BalanceDisplayData {
  balance: number
  currentBet: number
  winAmount: number
  denomination: number
}

export interface BalanceDisplayProps {
  balance: number
  currentBet: number
  winAmount: number
  denomination: number
  pendingWin: number
  isAnimating?: boolean
  onWinCollected?: () => void
  onTakeWin?: () => void
  autoCollectDelay?: number
  animationDuration?: number
  className?: string
  showCredits?: boolean
}

export interface UseBalanceDisplayProps {
  balance: number
  currentBet: number
  denomination: number
  autoCollectDelay?: number
  animationDuration?: number
  onWinCollected?: () => void
}

export function useBalanceDisplay({
  balance,
  currentBet,
  denomination,
  autoCollectDelay = 10000, // 10 seconds default
  animationDuration = 2000, // 2 seconds default
  onWinCollected
}: UseBalanceDisplayProps) {
  const [pendingWin, setPendingWin] = useState(0)
  const [animatedWinAmount, setAnimatedWinAmount] = useState(0)
  const [lastWin, setLastWin] = useState(0)
  const [isWinAnimating, setIsWinAnimating] = useState(false)
  const [isInsufficientFunds, setIsInsufficientFunds] = useState(false)

  const winAnimationRef = useRef<NodeJS.Timeout | null>(null)
  const autoCollectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const creditFlashTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const takeWinActiveRef = useRef(false)

  // Collect win function
  const collectWin = useCallback(() => {
    console.log(`Collecting win: $${pendingWin}`)
    
    if (pendingWin > 0) {
      // Balance is already updated by the server in the spin response
      // Just clear the pending win state
      setPendingWin(0)
      setLastWin(0)
      setAnimatedWinAmount(0)
      onWinCollected?.()
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
    setIsWinAnimating(false)
    takeWinActiveRef.current = false
  }, [pendingWin, onWinCollected])

  // Start auto-collect timeout
  const startAutoCollectTimeout = useCallback(() => {
    if (autoCollectTimeoutRef.current) {
      clearTimeout(autoCollectTimeoutRef.current)
    }

    if (pendingWin > 0) {
      console.log(`Starting auto-collect timeout: ${autoCollectDelay}ms`)
      autoCollectTimeoutRef.current = setTimeout(() => {
        console.log('Auto-collecting win due to timeout')
        collectWin()
      }, autoCollectDelay)
    }
  }, [pendingWin, autoCollectDelay, collectWin])

  // Animate win amount from 0 to target
  const animateWinAmount = useCallback((targetAmount: number) => {
    console.log(`Starting win animation from 0 to $${targetAmount}`)
    
    // Clear any existing animation
    if (winAnimationRef.current) {
      clearInterval(winAnimationRef.current)
    }

    setAnimatedWinAmount(0)
    takeWinActiveRef.current = false
    
    if (targetAmount === 0) {
      setIsWinAnimating(false)
      return
    }

    // Mark that win animations are active
    setIsWinAnimating(true)
    console.log('💰 Win animations started - press SPACE to take win and skip slow animations')

    const steps = 50 // Number of animation steps
    const increment = targetAmount / steps
    const stepDuration = animationDuration / steps
    let currentStep = 0

    winAnimationRef.current = setInterval(() => {
      currentStep++
      const currentAmount = Math.min(currentStep * increment, targetAmount)
      setAnimatedWinAmount(currentAmount)

      if (currentStep >= steps) {
        setAnimatedWinAmount(targetAmount)
        clearInterval(winAnimationRef.current!)
        winAnimationRef.current = null
        
        // Mark that slow animations are complete
        setIsWinAnimating(false)
        
        // Start auto-collect timeout after animation finishes
        startAutoCollectTimeout()
      }
    }, stepDuration)
  }, [animationDuration, startAutoCollectTimeout])

  // Take win function (skip animations)
  const takeWin = useCallback(() => {
    console.log('Take win triggered - skipping slow animations')
    
    if (pendingWin > 0) {
      // Mark that take win is active
      takeWinActiveRef.current = true
      
      // Instantly set win amount to final value (skip counting animation)
      if (winAnimationRef.current) {
        clearInterval(winAnimationRef.current)
        winAnimationRef.current = null
      }
      setAnimatedWinAmount(pendingWin)
      setIsWinAnimating(false)
      
      // Start auto-collect timeout
      startAutoCollectTimeout()
    }
  }, [pendingWin, startAutoCollectTimeout])

  // Flash insufficient funds indicator
  const flashInsufficientFunds = useCallback(() => {
    setIsInsufficientFunds(true)
    
    // Clear any existing timeout
    if (creditFlashTimeoutRef.current) {
      clearTimeout(creditFlashTimeoutRef.current)
    }
    
    // Restore after 800ms
    creditFlashTimeoutRef.current = setTimeout(() => {
      setIsInsufficientFunds(false)
    }, 800)
    
    console.log('💸 Insufficient funds - flashing credit display')
  }, [])

  // Set new win amount and start animation
  const setWinAmount = useCallback((amount: number) => {
    console.log(`Setting win amount: $${amount}`)
    setPendingWin(amount)
    setLastWin(amount)
    
    if (amount > 0) {
      animateWinAmount(amount)
    } else {
      setAnimatedWinAmount(0)
      setIsWinAnimating(false)
    }
  }, [animateWinAmount])

  // Check if bet is affordable
  const isBetAffordable = useCallback((betAmount: number) => {
    return betAmount <= balance
  }, [balance])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (winAnimationRef.current) clearInterval(winAnimationRef.current)
      if (autoCollectTimeoutRef.current) clearTimeout(autoCollectTimeoutRef.current)
      if (creditFlashTimeoutRef.current) clearTimeout(creditFlashTimeoutRef.current)
    }
  }, [])

  return {
    // State
    balance,
    currentBet,
    denomination,
    pendingWin,
    animatedWinAmount,
    lastWin,
    isWinAnimating,
    isInsufficientFunds,
    
    // Actions
    collectWin,
    takeWin,
    setWinAmount,
    flashInsufficientFunds,
    animateWinAmount,
    
    // Utilities
    isBetAffordable,
    hasPendingWin: pendingWin > 0,
    
    // Formatted values
    formattedBalance: formatCurrency(balance),
    formattedBet: formatCurrency(currentBet),
    formattedWin: formatCurrency(animatedWinAmount),
    balanceCredits: currencyToCredits(balance, denomination),
    betCredits: currencyToCredits(currentBet, denomination),
    winCredits: currencyToCredits(animatedWinAmount, denomination),
    formattedBalanceCredits: formatNumberWithSpaces(currencyToCredits(balance, denomination)),
    formattedBetCredits: formatNumberWithSpaces(currencyToCredits(currentBet, denomination)),
    formattedWinCredits: formatNumberWithSpaces(currencyToCredits(animatedWinAmount, denomination))
  }
}

// React component for balance display UI
export default function BalanceDisplay({
  balance,
  currentBet,
  winAmount,
  denomination,
  onWinCollected,
  onTakeWin,
  autoCollectDelay = 10000,
  animationDuration = 2000,
  className = '',
  showCredits = true
}: BalanceDisplayProps) {
  const balanceDisplay = useBalanceDisplay({
    balance,
    currentBet,
    denomination,
    autoCollectDelay,
    animationDuration,
    onWinCollected
  })

  // Handle external win amount changes
  useEffect(() => {
    if (winAmount !== balanceDisplay.animatedWinAmount && !balanceDisplay.isWinAnimating) {
      balanceDisplay.setWinAmount(winAmount)
    }
  }, [winAmount, balanceDisplay])

  // Handle take win from external trigger
  useEffect(() => {
    if (onTakeWin) {
      // This allows external components to trigger take win
      // Implementation depends on how you want to expose this
    }
  }, [onTakeWin])

  return (
    <div className={`balance-display grid grid-cols-3 gap-8 ${className}`}>
      {/* Balance Display */}
      <div className="balance-section text-center">
        <div className="label text-xs text-gray-400 mb-1">CREDIT</div>
        <div 
          className={`currency-amount text-lg font-bold transition-colors duration-300 ${
            balanceDisplay.isInsufficientFunds ? 'text-red-500' : 'text-yellow-400'
          }`}
        >
          {balanceDisplay.formattedBalance}
        </div>
        {showCredits && (
          <div 
            className={`credit-amount text-sm transition-colors duration-300 ${
              balanceDisplay.isInsufficientFunds ? 'text-red-400' : 'text-white'
            }`}
          >
            {balanceDisplay.formattedBalanceCredits}
          </div>
        )}
      </div>

      {/* Bet Display */}
      <div className="bet-section text-center">
        <div className="label text-xs text-gray-400 mb-1">BET</div>
        <div className="currency-amount text-lg font-bold text-yellow-400">
          {balanceDisplay.formattedBet}
        </div>
        {showCredits && (
          <div className="credit-amount text-sm text-white">
            {balanceDisplay.formattedBetCredits}
          </div>
        )}
      </div>

      {/* Win Display */}
      <div className="win-section text-center">
        <div className="label text-xs text-gray-400 mb-1">WIN</div>
        <div 
          className={`currency-amount text-lg font-bold transition-all duration-200 ${
            balanceDisplay.isWinAnimating ? 'text-green-400 scale-110' : 'text-yellow-400'
          }`}
        >
          {balanceDisplay.formattedWin}
        </div>
        {showCredits && (
          <div 
            className={`credit-amount text-sm transition-all duration-200 ${
              balanceDisplay.isWinAnimating ? 'text-green-300' : 'text-white'
            }`}
          >
            {balanceDisplay.formattedWinCredits}
          </div>
        )}
        
        {/* Win Collection Buttons */}
        {balanceDisplay.hasPendingWin && (
          <div className="win-controls flex gap-2 mt-2 justify-center">
            <button
              onClick={balanceDisplay.collectWin}
              className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs text-white"
            >
              COLLECT
            </button>
            {balanceDisplay.isWinAnimating && (
              <button
                onClick={balanceDisplay.takeWin}
                className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs text-white"
              >
                TAKE WIN
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Utility functions for balance management
export const BalanceUtils = {
  // Format balance data for display
  formatBalanceData: (data: BalanceDisplayData) => ({
    balance: {
      currency: formatCurrency(data.balance),
      credits: formatNumberWithSpaces(currencyToCredits(data.balance, data.denomination))
    },
    bet: {
      currency: formatCurrency(data.currentBet),
      credits: formatNumberWithSpaces(currencyToCredits(data.currentBet, data.denomination))
    },
    win: {
      currency: formatCurrency(data.winAmount),
      credits: formatNumberWithSpaces(currencyToCredits(data.winAmount, data.denomination))
    }
  }),

  // Calculate win multiplier
  getWinMultiplier: (winAmount: number, betAmount: number): number => {
    return betAmount > 0 ? Math.round(winAmount / betAmount) : 0
  },

  // Check if balance is sufficient for bet
  canAffordBet: (balance: number, betAmount: number): boolean => {
    return balance >= betAmount
  },

  // Get return to player percentage for a win
  getRTPPercentage: (winAmount: number, betAmount: number): number => {
    return betAmount > 0 ? Math.round((winAmount / betAmount) * 100) : 0
  }
}