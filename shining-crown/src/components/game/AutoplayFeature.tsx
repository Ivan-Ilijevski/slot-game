'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from 'pixi.js'

export interface AutoplayConfig {
  winDelay: number // Delay after wins (ms)
  normalDelay: number // Delay for regular spins (ms)
  maxSpins?: number // Maximum number of auto spins (0 = unlimited)
  maxWin?: number // Stop when total win exceeds this amount
  maxLoss?: number // Stop when loss exceeds this amount
  stopOnBonus?: boolean // Stop when bonus feature triggers
  stopOnBigWin?: boolean // Stop when big win occurs
  bigWinThreshold?: number // Multiplier threshold for big win
}

export interface AutoplayState {
  isActive: boolean
  spinsRemaining: number
  totalSpins: number
  totalWins: number
  totalLosses: number
  bigWins: number
  currentStreak: number
  maxStreak: number
}

export interface AutoplayFeatureProps {
  isSpinning: boolean
  hasWins: boolean
  currentBet: number
  balance: number
  pixiApp?: unknown
  config?: Partial<AutoplayConfig>
  onSpin: () => void
  onToggle?: (isActive: boolean) => void
  onStop?: (reason: string) => void
  enabled?: boolean
}

export interface UseAutoplayFeatureProps extends AutoplayFeatureProps {
  showUI?: boolean
}

// Default autoplay configuration
const DEFAULT_AUTOPLAY_CONFIG: AutoplayConfig = {
  winDelay: 5000, // 5 seconds after wins
  normalDelay: 300, // 300ms for regular spins
  maxSpins: 0, // Unlimited by default
  maxWin: 0, // No limit by default
  maxLoss: 0, // No limit by default
  stopOnBonus: false,
  stopOnBigWin: false,
  bigWinThreshold: 10 // 10x bet is considered big win
}

export function useAutoplayFeature({
  isSpinning,
  hasWins,
  currentBet,
  balance,
  pixiApp,
  config = {},
  onSpin,
  onToggle,
  onStop,
  enabled = true,
  showUI = true
}: UseAutoplayFeatureProps) {
  // Merge with default config
  const autoplayConfig = { ...DEFAULT_AUTOPLAY_CONFIG, ...config }

  // State management
  const [autoplayState, setAutoplayState] = useState<AutoplayState>({
    isActive: false,
    spinsRemaining: autoplayConfig.maxSpins || 0,
    totalSpins: 0,
    totalWins: 0,
    totalLosses: 0,
    bigWins: 0,
    currentStreak: 0,
    maxStreak: 0
  })

  // Refs for timing and UI
  const autoStartTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoStartTextRef = useRef<Text | null>(null)
  const isAutoStartRef = useRef(false)
  const initialBalanceRef = useRef(balance)

  // Sync state with ref for use in callbacks
  useEffect(() => {
    isAutoStartRef.current = autoplayState.isActive
  }, [autoplayState.isActive])

  // Track balance changes for win/loss calculation
  useEffect(() => {
    if (autoplayState.isActive && !isSpinning) {
      const balanceChange = balance - initialBalanceRef.current
      
      setAutoplayState(prev => ({
        ...prev,
        totalWins: Math.max(0, balanceChange),
        totalLosses: Math.abs(Math.min(0, balanceChange))
      }))
    }
  }, [balance, autoplayState.isActive, isSpinning])

  // Setup UI indicator in PIXI
  const setupAutoplayUI = useCallback(() => {
    if (!pixiApp || !showUI || autoStartTextRef.current) return

    // Type guard for PIXI app
    if (typeof pixiApp === 'object' && pixiApp && 'stage' in pixiApp) {
      const autoStartText = new Text({
        text: 'AUTO',
        style: {
          fontFamily: 'Arial',
          fontSize: 24,
          fill: 0x00FF00,
          fontWeight: 'bold'
        }
      })
      
      autoStartText.x = 100
      autoStartText.y = 100
      autoStartText.visible = false
      
      autoStartTextRef.current = autoStartText
      ;(pixiApp as any).stage.addChild(autoStartText)
    }
  }, [pixiApp, showUI])

  // Update UI visibility
  const updateUI = useCallback(() => {
    if (autoStartTextRef.current) {
      autoStartTextRef.current.visible = autoplayState.isActive
      console.log(`Autostart UI: ${autoplayState.isActive ? 'shown' : 'hidden'}`)
    }
  }, [autoplayState.isActive])

  // Clear autoplay timeout
  const clearAutoplayTimeout = useCallback(() => {
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current)
      autoStartTimeoutRef.current = null
      console.log('🔄 Autoplay timeout cleared')
    }
  }, [])

  // Check stop conditions
  const checkStopConditions = useCallback((reason?: string): boolean => {
    if (!autoplayState.isActive) return false

    // Check max spins
    if (autoplayConfig.maxSpins && autoplayConfig.maxSpins > 0 && autoplayState.totalSpins >= autoplayConfig.maxSpins) {
      stopAutoplay('Maximum spins reached')
      return true
    }

    // Check max win
    if (autoplayConfig.maxWin && autoplayConfig.maxWin > 0 && autoplayState.totalWins >= autoplayConfig.maxWin) {
      stopAutoplay('Maximum win reached')
      return true
    }

    // Check max loss
    if (autoplayConfig.maxLoss && autoplayConfig.maxLoss > 0 && autoplayState.totalLosses >= autoplayConfig.maxLoss) {
      stopAutoplay('Maximum loss reached')
      return true
    }

    // Check insufficient balance
    if (balance < currentBet) {
      stopAutoplay('Insufficient balance')
      return true
    }

    // Check big win stop condition
    if (autoplayConfig.stopOnBigWin && hasWins) {
      // This would need more context about win amount to determine if it's a "big win"
      // For now, we'll assume caller provides this info via reason
      if (reason === 'big_win') {
        stopAutoplay('Big win occurred')
        return true
      }
    }

    return false
  }, [autoplayState, autoplayConfig, balance, currentBet, hasWins])

  // Stop autoplay
  const stopAutoplay = useCallback((reason: string = 'Manual stop') => {
    console.log(`🛑 Stopping autoplay: ${reason}`)
    
    clearAutoplayTimeout()
    
    setAutoplayState(prev => ({
      ...prev,
      isActive: false
    }))
    
    isAutoStartRef.current = false
    
    // Notify parent component
    onStop?.(reason)
    onToggle?.(false)
  }, [clearAutoplayTimeout, onStop, onToggle])

  // Start autoplay
  const startAutoplay = useCallback((spins: number = 0) => {
    if (!enabled) return

    console.log(`🚀 Starting autoplay${spins > 0 ? ` for ${spins} spins` : ''}`)
    
    // Reset statistics
    initialBalanceRef.current = balance
    
    setAutoplayState(prev => ({
      ...prev,
      isActive: true,
      spinsRemaining: spins || autoplayConfig.maxSpins || 0,
      totalSpins: 0,
      totalWins: 0,
      totalLosses: 0,
      bigWins: 0,
      currentStreak: 0,
      maxStreak: 0
    }))
    
    isAutoStartRef.current = true
    
    // Start first spin immediately if not spinning
    if (!isSpinning) {
      console.log('🔄 Autoplay starting first spin immediately')
      onSpin()
    }
    
    // Notify parent component
    onToggle?.(true)
  }, [enabled, balance, autoplayConfig, isSpinning, onSpin, onToggle])

  // Toggle autoplay
  const toggleAutoplay = useCallback(() => {
    if (autoplayState.isActive) {
      stopAutoplay('User toggle')
    } else {
      startAutoplay()
    }
  }, [autoplayState.isActive, stopAutoplay, startAutoplay])

  // Schedule next auto spin
  const scheduleNextSpin = useCallback(() => {
    if (!isAutoStartRef.current || isSpinning) {
      console.log('🔄 Autoplay not scheduling: not active or currently spinning')
      return
    }

    // Check stop conditions before scheduling
    if (checkStopConditions()) {
      return
    }

    // Determine delay based on wins
    const delay = hasWins ? autoplayConfig.winDelay : autoplayConfig.normalDelay
    console.log(`🔄 Autoplay scheduling next spin in ${delay}ms`)
    
    clearAutoplayTimeout() // Clear any existing timeout
    
    autoStartTimeoutRef.current = setTimeout(() => {
      if (isAutoStartRef.current && !isSpinning) {
        console.log('🔄 Autoplay triggering next spin')
        
        // Update spin count
        setAutoplayState(prev => {
          const newSpinsRemaining = prev.spinsRemaining > 0 ? prev.spinsRemaining - 1 : 0
          return {
            ...prev,
            totalSpins: prev.totalSpins + 1,
            spinsRemaining: newSpinsRemaining
          }
        })
        
        onSpin()
      } else {
        console.log('🔄 Autoplay cancelled - conditions changed')
      }
    }, delay)
  }, [isSpinning, hasWins, autoplayConfig, checkStopConditions, clearAutoplayTimeout, onSpin])

  // Handle keyboard input (P key)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    if (event.code === 'KeyP') {
      event.preventDefault()
      console.log('P key pressed - toggling autoplay')
      toggleAutoplay()
    }
  }, [enabled, toggleAutoplay])

  // Setup keyboard listener
  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])

  // Setup UI when pixiApp becomes available
  useEffect(() => {
    if (pixiApp && showUI) {
      setupAutoplayUI()
    }
    
    return () => {
      // Cleanup on unmount
      clearAutoplayTimeout()
      
      if (autoStartTextRef.current && pixiApp && typeof pixiApp === 'object' && 'stage' in pixiApp) {
        ;(pixiApp as any).stage.removeChild(autoStartTextRef.current)
        autoStartTextRef.current.destroy()
        autoStartTextRef.current = null
      }
    }
  }, [pixiApp, showUI, setupAutoplayUI, clearAutoplayTimeout])

  // Update UI when state changes
  useEffect(() => {
    updateUI()
  }, [updateUI])

  // Handle spin completion (should be called by parent when spin completes)
  const onSpinComplete = useCallback((hadWin: boolean = false) => {
    if (!autoplayState.isActive) return

    // Update streak tracking
    setAutoplayState(prev => {
      const newStreak = hadWin ? prev.currentStreak + 1 : 0
      return {
        ...prev,
        currentStreak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak),
        bigWins: hadWin && currentBet > 0 ? prev.bigWins + 1 : prev.bigWins // Simplified big win logic
      }
    })

    // Schedule next spin
    scheduleNextSpin()
  }, [autoplayState.isActive, scheduleNextSpin, currentBet])

  // Handle manual spin (clears autoplay timeout but continues autoplay)
  const onManualSpin = useCallback(() => {
    clearAutoplayTimeout()
    
    if (autoplayState.isActive) {
      // Update spin count for manual spins during autoplay
      setAutoplayState(prev => ({
        ...prev,
        totalSpins: prev.totalSpins + 1,
        spinsRemaining: prev.spinsRemaining > 0 ? prev.spinsRemaining - 1 : 0
      }))
    }
  }, [clearAutoplayTimeout, autoplayState.isActive])

  return {
    // State
    autoplayState,
    isActive: autoplayState.isActive,
    spinsRemaining: autoplayState.spinsRemaining,
    totalSpins: autoplayState.totalSpins,
    
    // Actions
    startAutoplay,
    stopAutoplay,
    toggleAutoplay,
    scheduleNextSpin,
    onSpinComplete,
    onManualSpin,
    
    // Config
    config: autoplayConfig,
    
    // Utilities
    canStart: enabled && !isSpinning && balance >= currentBet,
    timeToNextSpin: autoStartTimeoutRef.current ? 
      (hasWins ? autoplayConfig.winDelay : autoplayConfig.normalDelay) : 0,
    
    // Statistics
    winRate: autoplayState.totalSpins > 0 ? 
      (autoplayState.totalWins / (autoplayState.totalWins + autoplayState.totalLosses)) * 100 : 0,
    averageBet: currentBet,
    profitLoss: autoplayState.totalWins - autoplayState.totalLosses
  }
}

// React component wrapper for autoplay feature
export default function AutoplayFeature(props: AutoplayFeatureProps) {
  const autoplay = useAutoplayFeature(props)
  
  // This component doesn't render anything, it's just for the autoplay logic
  return null
}

// HTML/React UI component for autoplay controls
export function AutoplayControls({ 
  autoplayState, 
  onStart, 
  onStop, 
  onToggle,
  canStart = true,
  className = '' 
}: {
  autoplayState: AutoplayState
  onStart: (spins?: number) => void
  onStop: () => void
  onToggle: () => void
  canStart?: boolean
  className?: string
}) {
  const [selectedSpins, setSelectedSpins] = useState(10)
  const spinOptions = [10, 25, 50, 100, 250, 500, 1000]

  return (
    <div className={`autoplay-controls bg-gray-800 p-4 rounded ${className}`}>
      <h3 className="text-lg font-bold text-white mb-3">Autoplay</h3>
      
      {!autoplayState.isActive ? (
        <div className="space-y-3">
          {/* Spin count selection */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Number of spins:</label>
            <select 
              value={selectedSpins} 
              onChange={(e) => setSelectedSpins(Number(e.target.value))}
              className="bg-gray-700 text-white p-2 rounded w-full"
            >
              {spinOptions.map(count => (
                <option key={count} value={count}>{count}</option>
              ))}
              <option value={0}>Unlimited</option>
            </select>
          </div>
          
          {/* Start button */}
          <button
            onClick={() => onStart(selectedSpins)}
            disabled={!canStart}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            Start Autoplay (P)
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status display */}
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-green-400 font-bold mb-1">AUTOPLAY ACTIVE</div>
            <div className="text-sm text-gray-300">
              <div>Spins: {autoplayState.totalSpins}</div>
              {autoplayState.spinsRemaining > 0 && (
                <div>Remaining: {autoplayState.spinsRemaining}</div>
              )}
              <div>Wins: {autoplayState.totalWins.toFixed(2)}</div>
              <div>Current Streak: {autoplayState.currentStreak}</div>
            </div>
          </div>
          
          {/* Stop button */}
          <button
            onClick={onStop}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Stop Autoplay (P)
          </button>
        </div>
      )}
      
      {/* Quick toggle button */}
      <button
        onClick={onToggle}
        className={`w-full mt-2 ${autoplayState.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-1 px-4 rounded text-sm`}
      >
        {autoplayState.isActive ? 'Stop' : 'Quick Start'} (P)
      </button>
    </div>
  )
}

// Utility functions
export const AutoplayUtils = {
  // Calculate optimal spin count based on balance and bet
  getOptimalSpinCount: (balance: number, bet: number): number => {
    const maxSpins = Math.floor(balance / bet)
    return Math.min(maxSpins, 100) // Cap at 100 spins for safety
  },

  // Calculate estimated time for autoplay session
  getEstimatedTime: (spins: number, hasWins: boolean, config: AutoplayConfig): number => {
    const avgDelay = hasWins ? config.winDelay : config.normalDelay
    return (spins * avgDelay) / 1000 // Return in seconds
  },

  // Validate autoplay settings
  validateSettings: (
    spins: number, 
    bet: number, 
    balance: number, 
    config: Partial<AutoplayConfig>
  ): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    if (spins < 0) errors.push('Spin count cannot be negative')
    if (bet <= 0) errors.push('Bet must be greater than zero')
    if (balance < bet) errors.push('Insufficient balance for autoplay')
    if (spins > 0 && balance < (bet * spins)) errors.push('Insufficient balance for all spins')
    
    if (config.maxWin && config.maxWin < bet) {
      errors.push('Max win should be at least one bet amount')
    }
    
    if (config.maxLoss && config.maxLoss < bet) {
      errors.push('Max loss should be at least one bet amount')
    }
    
    return { valid: errors.length === 0, errors }
  },

  // Format autoplay statistics
  formatStats: (state: AutoplayState): string => {
    return `${state.totalSpins} spins, ${state.totalWins.toFixed(2)} won, streak: ${state.currentStreak} (max: ${state.maxStreak})`
  }
}