/**
 * useTouchKeyboardConnection Hook
 *
 * Manages WebSocket connection to the touch keyboard interface (/keyboard route).
 * Handles remote commands from the touch keyboard for controlling the slot game:
 * - Bet management (set-bet, cycle-denomination)
 * - Game controls (start-spin, toggle-autostart)
 * - Gamble controls (enter-gamble, gamble-choice, collect-gamble)
 * - Cashout operations (cash-out, cashout-started, cashout-completed, cashout-failed)
 * - System controls (language-toggle, volume-toggle, balance-updated)
 *
 * Also broadcasts game state updates to connected touch keyboards.
 *
 * Extracted from page.tsx lines 2972-3243
 */

import { useEffect, useRef } from 'react'
import { WebSocketClient } from '@/lib/websocketClient'

export interface UseTouchKeyboardConnectionProps {
  // Game state
  currentBet: number
  denomination: number
  totalBalance: number
  pendingWin: number
  animatedWinAmount: number
  isSpinning: boolean
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  gambleAmount: number
  isAutoStart: boolean

  // Refs for immediate access (needed for WebSocket handlers)
  isSpinningRef: React.MutableRefObject<boolean>
  isGambleModeRef: React.MutableRefObject<boolean>
  pendingWinRef: React.MutableRefObject<number>
  gambleStageRef: React.MutableRefObject<'choice' | 'reveal' | 'result'>
  gambleAmountRef: React.MutableRefObject<number>
  spinReelsRef: React.MutableRefObject<(() => void) | null>
  denominationRef: React.MutableRefObject<number>
  winAnimationRef: React.MutableRefObject<NodeJS.Timeout | null>
  winCycleIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>

  // State setters
  setCurrentBet: (bet: number) => void
  setDenomination: (denom: number) => void
  setPendingWin: (amount: number) => void
  setIsAutoStart: (enabled: boolean) => void
  setPrintingAmount: (amount: number) => void
  setShowPrintingScreen: (show: boolean) => void

  // Callback functions
  isBetControlsDisabled: () => boolean
  toggleLanguage: () => void
  enterGambleMode: () => void
  exitGambleMode: () => void
  chooseGambleColor: (color: 'red' | 'black') => void
  performCashout: (amount: number) => Promise<{ success: boolean; error?: string }>
  refreshBalance: () => Promise<number | null>
  showMessage: (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void

  // Optional: connection delay
  connectionDelay?: number
}

export function useTouchKeyboardConnection({
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
  setCurrentBet,
  setDenomination,
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
  showMessage,
  connectionDelay = 500
}: UseTouchKeyboardConnectionProps) {

  const wsClient = useRef<WebSocketClient | null>(null)

  // Initialize WebSocket connection
  useEffect(() => {
    wsClient.current = new WebSocketClient('main-game')

    // Handle connection confirmation
    wsClient.current.on('connection-confirmed', (message) => {
      console.log('🎰 [Touch Keyboard] Connection confirmed:', message)
    })

    // Handle game state updates
    wsClient.current.on('game-state', (message) => {
      console.log('🎰 [Touch Keyboard] Game state received:', message)
    })

    // Handle remote commands from touch keyboard
    wsClient.current.on('execute-command', (message) => {
      console.log('🎰 [Main Game] Received execute-command:', message.data)
      const { commandId, action, payload } = message.data as {
        commandId: string
        action: string
        payload: Record<string, unknown>
      }

      console.log('🎰 [Main Game] Processing command:', { commandId, action, payload })
      let success = true
      let errorMessage = ''

      try {
        switch (action) {
          case 'set-bet':
            if (payload?.amount && !isBetControlsDisabled()) {
              setCurrentBet(payload.amount as number)
            } else {
              success = false
              errorMessage = 'Cannot change bet at this time'
            }
            break

          case 'cycle-denomination':
            if (!isBetControlsDisabled()) {
              const DENOMINATION_OPTIONS = [0.01, 0.10, 0.50, 1.00]
              const currentDenomination = denominationRef.current
              const currentIndex = DENOMINATION_OPTIONS.indexOf(currentDenomination)
              const nextIndex = (currentIndex + 1) % DENOMINATION_OPTIONS.length
              const newDenomination = DENOMINATION_OPTIONS[nextIndex]
              setDenomination(newDenomination)
            } else {
              success = false
              errorMessage = 'Cannot change denomination at this time'
            }
            break

          case 'language-toggle':
            toggleLanguage()
            break

          case 'enter-gamble':
            console.log('🎰 [DEBUG] Enter-gamble command received')
            const canEnterGamble = pendingWinRef.current > 0 && !isSpinningRef.current && !isGambleModeRef.current
            console.log('🎰 [DEBUG] Can enter gamble mode:', canEnterGamble)

            if (canEnterGamble) {
              enterGambleMode()
            } else {
              success = false
              errorMessage = 'Cannot enter gamble mode - no pending win or game is busy'
            }
            break

          case 'gamble-choice':
            if (isGambleModeRef.current && payload?.color && gambleStageRef.current === 'choice') {
              chooseGambleColor(payload.color as 'red' | 'black')
            } else {
              success = false
              errorMessage = 'Not in gamble mode, invalid color, or not in choice stage'
            }
            break

          case 'collect-gamble':
            console.log('🎰 [Main Game] Processing collect-gamble command')
            if (isGambleModeRef.current) {
              exitGambleMode()
              setPendingWin(gambleAmountRef.current)
            } else {
              success = false
              errorMessage = 'Not in gamble mode'
            }
            break

          case 'cash-out':
            if (pendingWin > 0) {
              // Start the cashout process (don't wait for it to complete)
              performCashout(pendingWin).then(cashoutResult => {
                if (cashoutResult.success) {
                  setPendingWin(0)
                  // Clear win animations
                  if (winAnimationRef.current) {
                    clearInterval(winAnimationRef.current)
                    winAnimationRef.current = null
                  }
                  if (winCycleIntervalRef.current) {
                    clearTimeout(winCycleIntervalRef.current)
                    winCycleIntervalRef.current = null
                  }
                  console.log('Cashout completed successfully')
                } else {
                  console.error('Cashout failed:', cashoutResult.error)
                }
              }).catch(error => {
                console.error('Cashout error:', error)
              })
              console.log('Cashout process initiated')
            } else {
              success = false
              errorMessage = 'No pending win to cash out'
            }
            break

          case 'volume-toggle':
            // Volume toggle logic would go here
            console.log('🎰 [Main Game] Volume toggle requested')
            break

          case 'start-spin':
            if (spinReelsRef.current && !isSpinningRef.current) {
              spinReelsRef.current()
            } else {
              success = false
              errorMessage = 'Cannot start spin - game is busy'
            }
            break

          case 'toggle-autostart':
            setIsAutoStart(!isAutoStart)
            break

          case 'cashout-started':
            const startedData = payload as { amount: number; currency: string }
            console.log(`🎰 Received cashout-started command: ${startedData.amount} ${startedData.currency}`)
            setPrintingAmount(startedData.amount)
            setShowPrintingScreen(true)

            // Clear pending win since cashout is in progress
            setPendingWin(0)
            // Clear win animations
            if (winAnimationRef.current) {
              clearInterval(winAnimationRef.current)
              winAnimationRef.current = null
            }
            if (winCycleIntervalRef.current) {
              clearTimeout(winCycleIntervalRef.current)
              winCycleIntervalRef.current = null
            }
            break

          case 'cashout-completed':
            const completedData = payload as { amount: number; currency: string }
            console.log(`🎰 Received cashout-completed command: ${completedData.amount} ${completedData.currency}`)

            // Refresh balance from server since cashout succeeded
            refreshBalance().then(() => {
              console.log('🎰 Balance refreshed after successful cashout')
            })

            // Hide printing screen after a short delay
            setTimeout(() => {
              setShowPrintingScreen(false)
              setPrintingAmount(0)
            }, 2000)
            break

          case 'cashout-failed':
            const failedData = payload as { amount: number; currency: string; error: string }
            console.log(`🎰 Received cashout-failed command: ${failedData.amount} ${failedData.currency} - Error: ${failedData.error}`)

            // Show error message to user
            showMessage('error', 'Cashout Failed', failedData.error)

            // Hide printing screen immediately since cashout failed
            setShowPrintingScreen(false)
            setPrintingAmount(0)
            break

          case 'balance-updated':
            // Refresh balance from server when notified of balance changes
            refreshBalance().then(() => {
              console.log('🎰 Balance refreshed due to balance-updated command')
            }).catch(error => {
              console.error('🎰 Failed to refresh balance:', error)
              success = false
              errorMessage = 'Failed to refresh balance'
            })
            break

          default:
            success = false
            errorMessage = `Unknown command: ${action}`
        }
      } catch (error) {
        success = false
        errorMessage = `Error executing command: ${error}`
        console.error('[Main Game] Error processing WebSocket command:', error)
      }

      // Send command result back to server
      console.log('🎰 [Main Game] Sending command result:', {
        commandId,
        success,
        message: success ? 'Command executed successfully' : errorMessage
      })
      wsClient.current?.sendCommandResult(
        commandId,
        success,
        success ? 'Command executed successfully' : errorMessage
      )
    })

    // Connect to WebSocket server with a delay
    setTimeout(() => {
      wsClient.current?.connect()
        .then(() => {
          console.log('✅ [Main Game] WebSocket connected successfully')
        })
        .catch((error) => {
          console.error('❌ [Main Game] WebSocket connection failed:', error)
        })
    }, connectionDelay)

    return () => {
      if (wsClient.current) {
        wsClient.current.disconnect()
      }
    }
  }, []) // Empty dependency array to avoid reconnections

  // Send game state updates to touch keyboard
  useEffect(() => {
    if (wsClient.current?.isConnected()) {
      const gameState = {
        currentBet,
        denomination,
        totalBalance,
        pendingWin,
        animatedWinAmount,
        isSpinning,
        isGambleMode,
        gambleStage,
        gambleAmount,
        isAutoStart
      }

      wsClient.current.sendGameState(gameState)
    }
  }, [
    currentBet,
    denomination,
    totalBalance,
    pendingWin,
    animatedWinAmount,
    isSpinning,
    isGambleMode,
    gambleStage,
    gambleAmount,
    isAutoStart
  ])

  // Return the WebSocket client for manual control if needed
  return {
    wsClient: wsClient.current,
    isConnected: wsClient.current?.isConnected() || false
  }
}

export default useTouchKeyboardConnection
