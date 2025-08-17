'use client'

import { useCallback, useEffect, useRef } from 'react'

export interface KeyboardActions {
  // Spinning actions
  spinReels: () => void
  stopReels: () => void
  takeWin: () => void
  
  // Betting actions
  cycleBet: () => void
  setMaxBet: () => void
  cycleDenomination: () => void
  
  // Gamble actions
  enterGambleMode: () => void
  chooseGambleColor: (color: 'red' | 'black') => void
  collectGambleWin: () => void
  
  // Autoplay actions
  toggleAutoStart: () => void
}

export interface GameState {
  isSpinning: boolean
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  hasPendingWin: boolean
  isWinAnimating: boolean
  stopRequested: boolean
  hasRunningAnimations: boolean
  isAutoStart?: boolean
}

export interface KeyboardHandlerProps {
  gameState: GameState
  actions: KeyboardActions
  enabled?: boolean
  preventDefaults?: boolean
  logKeyPresses?: boolean
}

export interface UseKeyboardHandlerProps extends KeyboardHandlerProps {
  enableComponentLevel?: boolean
  enablePIXILevel?: boolean
}

export type GameMode = 'normal' | 'spinning' | 'winAnimation' | 'gamble'
export type KeyboardShortcut = {
  key: string
  description: string
  context: string
  action: string
}

// Keyboard shortcuts documentation
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'Space', description: 'Start spin / Stop reels / Take win / Collect gamble', context: 'Context-dependent', action: 'Primary action' },
  { key: 'R', description: 'Max bet / Enter gamble / Choose red', context: 'No pending win / Pending win / Gamble mode', action: 'Red action' },
  { key: 'B', description: 'Cycle bet / Enter gamble / Choose black', context: 'No pending win / Pending win / Gamble mode', action: 'Black/Bet action' },
  { key: 'D', description: 'Cycle denomination', context: 'Normal mode', action: 'Denomination' },
  { key: 'P', description: 'Toggle autostart', context: 'Any mode', action: 'Autoplay' }
]

export function useKeyboardHandler({
  gameState,
  actions,
  enabled = true,
  preventDefaults = true,
  logKeyPresses = false,
  enableComponentLevel = true,
  enablePIXILevel = true
}: UseKeyboardHandlerProps) {
  const gameStateRef = useRef(gameState)
  const actionsRef = useRef(actions)

  // Update refs to avoid stale closures
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  // Determine current game mode
  const getCurrentMode = useCallback((): GameMode => {
    const state = gameStateRef.current
    if (state.isGambleMode) return 'gamble'
    if (state.isSpinning) return 'spinning'
    if (state.isWinAnimating || state.hasRunningAnimations) return 'winAnimation'
    return 'normal'
  }, [])

  // Component-level keyboard handler (for betting and gamble controls)
  const handleComponentKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    const state = gameStateRef.current
    const actions = actionsRef.current
    
    if (logKeyPresses) {
      console.log('Component level key pressed:', event.code)
    }
    
    // Gamble mode controls
    if (state.isGambleMode) {
      if (event.code === 'KeyR' && state.gambleStage === 'choice') {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('R key pressed in gamble mode - choosing red')
        actions.chooseGambleColor('red')
      } else if (event.code === 'KeyB' && state.gambleStage === 'choice') {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('B key pressed in gamble mode - choosing black')
        actions.chooseGambleColor('black')
      } else if (event.code === 'Space' && (state.gambleStage === 'result' || state.gambleStage === 'choice')) {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('Space pressed in gamble mode - collecting win')
        actions.collectGambleWin()
      }
    }
    // Normal game controls (only when not in gamble mode)
    else if (!state.isSpinning) {
      if (event.code === 'KeyR' && state.hasPendingWin) {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('R key pressed with pending win - entering gamble mode')
        actions.enterGambleMode()
      } else if (event.code === 'KeyB' && state.hasPendingWin) {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('B key pressed with pending win - entering gamble mode')
        actions.enterGambleMode()
      } else if (event.code === 'KeyB' && !state.hasPendingWin) {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('B key pressed, calling cycleBet()')
        actions.cycleBet()
      } else if (event.code === 'KeyR' && !state.hasPendingWin) {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('R key pressed, calling setMaxBet()')
        actions.setMaxBet()
      } else if (event.code === 'KeyD') {
        if (preventDefaults) {
          event.preventDefault()
          event.stopPropagation()
        }
        if (logKeyPresses) console.log('D key pressed, calling cycleDenomination()')
        actions.cycleDenomination()
      }
    }
  }, [enabled, preventDefaults, logKeyPresses])

  // PIXI-level keyboard handler (for spinning and autostart controls)
  const handlePIXIKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    const state = gameStateRef.current
    const actions = actionsRef.current

    if (logKeyPresses) {
      console.log('PIXI level key pressed:', event.code)
    }
    
    // Prevent space in gamble mode at PIXI level
    if (state.isGambleMode) {
      return
    }
    
    if (event.code === 'Space') {
      if (preventDefaults) {
        event.preventDefault()
      }
      
      if (!state.isSpinning && state.hasPendingWin && (state.isWinAnimating || state.hasRunningAnimations)) {
        // Take win feature - skip slow animations during wins
        if (logKeyPresses) console.log('Space pressed during win - activating take win')
        actions.takeWin()
      } else if (!state.isSpinning) {
        // Start spinning
        actions.spinReels()
      } else if (!state.stopRequested) {
        // Request stop during spinning (only if not already requested)
        if (logKeyPresses) console.log('Space pressed - requesting early stop')
        actions.stopReels()
      }
    } else if (event.code === 'KeyP') {
      if (preventDefaults) {
        event.preventDefault()
      }
      // Toggle autostart feature
      if (logKeyPresses) console.log('P key pressed - toggling autostart')
      actions.toggleAutoStart()
    }
  }, [enabled, preventDefaults, logKeyPresses])

  // Set up event listeners
  useEffect(() => {
    if (!enabled) return

    if (enableComponentLevel) {
      window.addEventListener('keydown', handleComponentKeyDown)
    }
    
    if (enablePIXILevel) {
      window.addEventListener('keydown', handlePIXIKeyDown)
    }

    return () => {
      if (enableComponentLevel) {
        window.removeEventListener('keydown', handleComponentKeyDown)
      }
      if (enablePIXILevel) {
        window.removeEventListener('keydown', handlePIXIKeyDown)
      }
    }
  }, [enabled, enableComponentLevel, enablePIXILevel, handleComponentKeyDown, handlePIXIKeyDown])

  return {
    currentMode: getCurrentMode(),
    shortcuts: KEYBOARD_SHORTCUTS,
    handleComponentKeyDown,
    handlePIXIKeyDown
  }
}

// React component for keyboard handler (can also display shortcuts)
export default function KeyboardHandler({
  gameState,
  actions,
  enabled = true,
  preventDefaults = true,
  logKeyPresses = false
}: KeyboardHandlerProps) {
  const keyboard = useKeyboardHandler({
    gameState,
    actions,
    enabled,
    preventDefaults,
    logKeyPresses,
    enableComponentLevel: true,
    enablePIXILevel: true
  })

  // This component doesn't render anything, it's just for the keyboard handling
  return null
}

// Component to display keyboard shortcuts help
export function KeyboardShortcutsDisplay({ 
  gameState, 
  className = '',
  compact = false 
}: { 
  gameState: GameState
  className?: string
  compact?: boolean
}) {
  const getCurrentMode = () => {
    if (gameState.isGambleMode) return 'gamble'
    if (gameState.isSpinning) return 'spinning'
    if (gameState.isWinAnimating) return 'winAnimation'
    return 'normal'
  }

  const getRelevantShortcuts = () => {
    const mode = getCurrentMode()
    const pendingWin = gameState.hasPendingWin

    switch (mode) {
      case 'gamble':
        if (gameState.gambleStage === 'choice') {
          return [
            { key: 'R', action: 'Choose Red' },
            { key: 'B', action: 'Choose Black' },
            { key: 'Space', action: 'Collect Win' }
          ]
        } else {
          return [{ key: 'Space', action: 'Collect Win' }]
        }
      case 'spinning':
        return [
          { key: 'Space', action: gameState.stopRequested ? 'Stop Requested' : 'Stop Reels' },
          { key: 'P', action: 'Toggle Autostart' }
        ]
      case 'winAnimation':
        return [
          { key: 'Space', action: 'Take Win (Skip Animation)' },
          { key: 'P', action: 'Toggle Autostart' }
        ]
      case 'normal':
        const shortcuts = [
          { key: 'Space', action: 'Spin Reels' },
          { key: 'P', action: 'Toggle Autostart' }
        ]
        
        if (pendingWin) {
          shortcuts.push(
            { key: 'R', action: 'Enter Gamble' },
            { key: 'B', action: 'Enter Gamble' }
          )
        } else {
          shortcuts.push(
            { key: 'R', action: 'Max Bet' },
            { key: 'B', action: 'Cycle Bet' },
            { key: 'D', action: 'Change Denom' }
          )
        }
        
        return shortcuts
      default:
        return []
    }
  }

  const shortcuts = getRelevantShortcuts()

  if (compact) {
    return (
      <div className={`keyboard-shortcuts-compact text-xs text-gray-400 ${className}`}>
        {shortcuts.map((shortcut, index) => (
          <span key={shortcut.key}>
            <kbd className="bg-gray-700 px-1 rounded text-white">{shortcut.key}</kbd>
            <span className="ml-1">{shortcut.action}</span>
            {index < shortcuts.length - 1 && ' | '}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={`keyboard-shortcuts bg-black/80 p-4 rounded ${className}`}>
      <h3 className="text-sm font-bold text-amber-400 mb-2">
        Keyboard Controls - {getCurrentMode().toUpperCase()} MODE
      </h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.key} className="flex justify-between">
            <kbd className="bg-gray-700 px-2 py-1 rounded text-white font-mono">
              {shortcut.key}
            </kbd>
            <span className="text-gray-300">{shortcut.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Utility functions
export const KeyboardUtils = {
  // Get the primary action for current game state
  getPrimaryAction: (gameState: GameState): string => {
    if (gameState.isGambleMode) {
      return gameState.gambleStage === 'choice' ? 'Choose Color (R/B)' : 'Collect Win (Space)'
    }
    if (gameState.isSpinning) {
      return gameState.stopRequested ? 'Stopping...' : 'Stop Reels (Space)'
    }
    if (gameState.isWinAnimating) {
      return 'Take Win (Space)'
    }
    if (gameState.hasPendingWin) {
      return 'Gamble (R/B) or Spin (Space)'
    }
    return 'Spin Reels (Space)'
  },

  // Check if a key should be handled based on game state
  shouldHandleKey: (key: string, gameState: GameState): boolean => {
    if (!key) return false
    
    // Always handle P (autostart toggle)
    if (key === 'KeyP') return true
    
    // In gamble mode, only handle R, B, Space
    if (gameState.isGambleMode) {
      return ['KeyR', 'KeyB', 'Space'].includes(key)
    }
    
    // During spinning, only handle Space and P
    if (gameState.isSpinning) {
      return ['Space', 'KeyP'].includes(key)
    }
    
    // Normal mode handles all keys
    return ['Space', 'KeyR', 'KeyB', 'KeyD', 'KeyP'].includes(key)
  },

  // Get help text for a specific key in current context
  getKeyHelp: (key: string, gameState: GameState): string => {
    const keyMap: { [key: string]: { [mode: string]: string } } = {
      'Space': {
        'normal': gameState.hasPendingWin ? 'Spin Reels' : 'Spin Reels',
        'spinning': 'Stop Reels',
        'winAnimation': 'Take Win',
        'gamble': 'Collect Win'
      },
      'KeyR': {
        'normal': gameState.hasPendingWin ? 'Enter Gamble' : 'Max Bet',
        'gamble': 'Choose Red'
      },
      'KeyB': {
        'normal': gameState.hasPendingWin ? 'Enter Gamble' : 'Cycle Bet',
        'gamble': 'Choose Black'
      },
      'KeyD': {
        'normal': 'Change Denomination'
      },
      'KeyP': {
        'all': 'Toggle Autostart'
      }
    }

    const mode = gameState.isGambleMode ? 'gamble' : 
                 gameState.isSpinning ? 'spinning' : 
                 gameState.isWinAnimating ? 'winAnimation' : 'normal'

    return keyMap[key]?.[mode] || keyMap[key]?.['all'] || 'Unknown'
  }
}