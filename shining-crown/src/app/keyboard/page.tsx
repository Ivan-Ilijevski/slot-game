'use client'

import React, { useEffect, useState, useRef } from 'react'
import { WebSocketClient } from '../../lib/websocketClient'
import { 
  Banknote, 
  Coins, 
  Volume2, 
  VolumeOff, 
  Globe, 
  RotateCcw, 
  Dice6, 
  Play,
  Heart,
  Spade,
  CurrencyIcon
} from 'lucide-react'

interface GameState {
  currentBet: number
  denomination: number
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  gambleAmount: number
  canEnterGamble: boolean
  pendingWin: number
  currentLanguage: 'en' | 'mk'
}

export default function KeyboardPage() {
  const [gameState, setGameState] = useState<GameState>({
    currentBet: 5.00,
    denomination: 0.01,
    isGambleMode: false,
    gambleStage: 'choice',
    gambleAmount: 0,
    canEnterGamble: false,
    pendingWin: 0,
    currentLanguage: 'en'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [isMuted, setIsMuted] = useState(false)
  const wsClient = useRef<WebSocketClient | null>(null)

  // Bet options available in the game
  const BET_OPTIONS = [5.00, 10.00, 20.00, 50.00, 100.00, 200.00, 500.00, 1000.00]

  // WebSocket connection and message handling
  useEffect(() => {
    wsClient.current = new WebSocketClient('tablet')

    // Handle connection status
    wsClient.current.on('connection-status', (message) => {
      const connected = message.data?.connected as boolean
      setConnectionStatus(connected ? 'connected' : 'disconnected')
    })

    // Handle game state updates
    wsClient.current.on('game-state', (message) => {
      if (message.data) {
        const gameStateData = message.data as Record<string, unknown>
        setGameState({
          currentBet: (gameStateData.currentBet as number) || 5.00,
          denomination: (gameStateData.denomination as number) || 0.01,
          isGambleMode: (gameStateData.isGambleMode as boolean) || false,
          gambleStage: (gameStateData.gambleStage as 'choice' | 'reveal' | 'result') || 'choice',
          gambleAmount: (gameStateData.gambleAmount as number) || 0,
          canEnterGamble: (gameStateData.canEnterGamble as boolean) || false,
          pendingWin: (gameStateData.pendingWin as number) || 0,
          currentLanguage: (gameStateData.currentLanguage as 'en' | 'mk') || 'en'
        })
      }
    })

    // Handle command execution results
    wsClient.current.on('command-executed', () => {
      setIsLoading(false) // Clear loading state when command finishes
    })

    // Connect to WebSocket server with a small delay to ensure server is ready
    setTimeout(() => {
      if (wsClient.current) {
        wsClient.current.connect()
          .then(() => {
            setConnectionStatus('connected')
          })
          .catch((error) => {
            console.error('[Tablet] WebSocket connection failed:', error)
            setConnectionStatus('disconnected')
          })
      }
    }, 1500) // Slightly longer delay for tablet

    return () => {
      if (wsClient.current) {
        wsClient.current.disconnect()
      }
    }
  }, [])

  // Haptic feedback for touch devices
  const hapticFeedback = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50) // 50ms vibration
    }
  }

  // Generic WebSocket command function
  const sendCommand = (action: string, payload?: Record<string, unknown>) => {
    console.log(`🎲 [Tablet] sendCommand called with action: ${action}, payload:`, payload)
    console.log(`🎲 [Tablet] Connection checks:`, {
      isLoading,
      connectionStatus,
      wsClientConnected: wsClient.current?.isConnected(),
      wsClientState: wsClient.current?.getConnectionState()
    })
    
    if (isLoading || connectionStatus !== 'connected' || !wsClient.current?.isConnected()) {
      console.log(`🎲 [Tablet] Command ${action} blocked due to connection issues`)
      return
    }
    
    hapticFeedback() // Add haptic feedback on button press
    setIsLoading(true)
    
    console.log(`🎲 [Tablet] Attempting to send command: ${action}`)
    const success = wsClient.current.sendCommand(action, payload)
    console.log(`🎲 [Tablet] Command send result: ${success}`)
    
    if (!success) {
      setIsLoading(false)
    }
    // Loading state will be cleared when we receive command-executed message
  }

  // Handler functions
  const handleSetBet = (amount: number) => {
    sendCommand('set-bet', { amount })
  }

  const handleCycleDenomination = () => {
    sendCommand('cycle-denomination')
  }

  const handleToggleLanguage = () => {
    sendCommand('language-toggle')
  }

  const handleEnterGamble = () => {
    console.log('🎲 [Tablet] Gamble button clicked')
    console.log('🎲 [Tablet] Game state:', {
      canEnterGamble: gameState.canEnterGamble,
      isGambleMode: gameState.isGambleMode,
      pendingWin: gameState.pendingWin,
      isLoading: isLoading,
      connectionStatus: connectionStatus
    })
    
    // Check if button should be disabled
    const isDisabled = isLoading || !gameState.canEnterGamble || gameState.isGambleMode
    console.log('🎲 [Tablet] Button should be disabled:', isDisabled)
    
    if (!isDisabled) {
      console.log('🎲 [Tablet] Sending enter-gamble command...')
      sendCommand('enter-gamble')
    } else {
      console.log('🎲 [Tablet] Button is disabled, not sending command')
    }
  }

  const handleGambleChoice = (color: 'red' | 'black') => {
    sendCommand('gamble-choice', { color })
  }

  const handleCollectGamble = () => {
    console.log('🎲 [Tablet] Collect gamble button clicked!')
    console.log('🎲 [Tablet] Current game state:', {
      isGambleMode: gameState.isGambleMode,
      gambleStage: gameState.gambleStage,
      gambleAmount: gameState.gambleAmount,
      pendingWin: gameState.pendingWin,
      connectionStatus: connectionStatus,
      isLoading: isLoading
    })
    console.log('🎲 [Tablet] Sending collect-gamble command...')
    sendCommand('collect-gamble')
  }

  const handleCashOut = () => {
    sendCommand('cash-out')
  }

  const handleVolumeToggle = () => {
    setIsMuted(prev => !prev)
    sendCommand('volume-toggle')
  }

  const handleStartSpin = () => {
    sendCommand('start-spin')
  }

  const handleToggleAutostart = () => {
    sendCommand('toggle-autostart')
  }

  // Debug: Log game state changes
  React.useEffect(() => {
    console.log('🎲 [Tablet] Game state updated:', gameState)
  }, [gameState])

  return (
    <div className="min-h-screen bg-black p-4 touch-manipulation select-none flex flex-col relative overflow-hidden">
      {/* Top Row - Icon Buttons */}
      <div className="flex justify-between items-center mb-6 px-4">
        {/* Cash Out */}
        <button
          onClick={handleCashOut}
          disabled={isLoading || gameState.pendingWin === 0}
          className="w-20 h-20 rounded-xl bg-transparent border-2 border-green-400 hover:border-green-300 hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] disabled:border-gray-600 disabled:opacity-50 flex items-center justify-center text-green-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg"
          aria-label="Cash out winnings"
        >
          <Banknote size={28} />
        </button>

        {/* Denomination Icon */}
        <button
          onClick={handleCycleDenomination}
          disabled={isLoading || gameState.isGambleMode}
          className="w-20 h-20 rounded-xl bg-transparent border-2 border-blue-400 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(0,255,255,0.3)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-blue-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg"
          aria-label={`Change denomination (current: $${gameState.denomination.toFixed(2)})`}
        >
          <Coins size={24} />
          <div className="text-xs font-bold mt-1">{gameState.denomination.toFixed(2)} MKD</div>
        </button>

        {/* Volume Icon */}
        <button
          onClick={handleVolumeToggle}
          disabled={isLoading}
          className="w-20 h-20 rounded-xl bg-transparent border-2 border-cyan-400 hover:border-cyan-300 hover:shadow-[0_0_15px_rgba(0,255,255,0.4)] disabled:border-gray-600 disabled:opacity-50 flex items-center justify-center text-cyan-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg"
          aria-label={isMuted ? "Unmute sound" : "Mute sound"}
        >
          {isMuted ? <VolumeOff size={28} /> : <Volume2 size={28} />}
        </button>

        {/* Language Icon */}
        <button
          onClick={handleToggleLanguage}
          disabled={isLoading}
          className="w-20 h-20 rounded-xl bg-transparent border-2 border-orange-400 hover:border-orange-300 hover:shadow-[0_0_15px_rgba(249,115,22,0.4)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-orange-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg"
          aria-label={`Toggle language (current: ${gameState.currentLanguage.toUpperCase()})`}
        >
          <Globe size={24} />
          <div className="text-xs font-bold mt-1">{gameState.currentLanguage.toUpperCase()}</div>
        </button>
      </div>

      {/* Center Area - Grid of Bet Options or Gamble Status */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-4xl">
          {gameState.isGambleMode ? (
            /* Gamble Mode Display */
            <div className="h-full flex flex-col bg-transparent border-2 border-red-400 rounded-2xl p-6 shadow-xl">
              {/* Top Corner Amounts */}
              <div className="flex justify-between items-start mb-8">
                {/* Left Corner - Current Win */}
                <div className="bg-transparent border-2 border-green-400 rounded-xl p-4 shadow-lg">
                  <p className="text-green-400 font-bold text-sm">Current Win</p>
                  <p className="text-white text-2xl font-bold">${gameState.pendingWin.toFixed(2)}</p>
                </div>
                
                {/* Right Corner - Gamble Amount */}
                <div className="bg-transparent border-2 border-yellow-400 rounded-xl p-4 shadow-lg">
                  <p className="text-yellow-400 font-bold text-sm">Gamble to</p>
                  <p className="text-white text-2xl font-bold">${(gameState.gambleAmount * 2).toFixed(2)}</p>
                </div>
              </div>

              {/* Center - Large Red and Black Buttons */}
              <div className="flex-1 flex items-center justify-center gap-8">
                <button
                  onClick={() => handleGambleChoice('red')}
                  disabled={isLoading || gameState.gambleStage !== 'choice'}
                  className="w-40 h-40 rounded-3xl bg-transparent border-3 border-red-400 hover:border-red-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-red-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-xl"
                  aria-label="Choose red"
                >
                  <Heart size={48} />
                  <span className="text-2xl font-bold mt-2">RED</span>
                </button>

                <button
                  onClick={() => handleGambleChoice('black')}
                  disabled={isLoading || gameState.gambleStage !== 'choice'}
                  className="w-40 h-40 rounded-3xl bg-transparent border-3 border-gray-300 hover:border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-white disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-xl"
                  aria-label="Choose black"
                >
                  <Spade size={48} />
                  <span className="text-2xl font-bold mt-2">BLACK</span>
                </button>
              </div>

              {/* Bottom Center - Collect Button */}
              <div className="flex justify-center mt-8">
                <button
                  onClick={handleCollectGamble}
                  disabled={isLoading}
                  className="px-12 py-6 rounded-2xl bg-transparent border-3 border-green-400 hover:border-green-300 hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] disabled:border-gray-600 disabled:opacity-50 text-green-400 disabled:text-gray-600 font-bold text-xl transition-all active:scale-95 touch-manipulation shadow-xl flex items-center gap-3"
                  aria-label="Collect winnings"
                >
                  <Banknote size={28} />
                  COLLECT
                </button>
              </div>
            </div>
          ) : (
            /* Normal Bet Options Display */
            <div className="bg-transparent border-2 border-gray-500 rounded-2xl p-8 shadow-xl">
          
              <div className="grid grid-cols-4 gap-6">
                {BET_OPTIONS.map((bet) => (
                  <button
                    key={bet}
                    onClick={() => handleSetBet(bet)}
                    disabled={isLoading || gameState.isGambleMode}
                    className={`
                      aspect-square rounded-2xl text-2xl font-bold border-2 transition-all transform touch-manipulation shadow-lg bg-transparent
                      ${gameState.currentBet === bet
                        ? 'border-green-400 text-green-400 scale-105 shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                        : 'border-gray-400 text-white hover:border-blue-400 hover:text-blue-400 hover:shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:scale-105'
                      }
                      ${(isLoading || gameState.isGambleMode) 
                        ? 'opacity-50 cursor-not-allowed border-gray-600 text-gray-600' 
                        : 'active:scale-95'
                      }
                    `}
                  >
                    ${bet.toFixed(0)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row - Action Buttons with Overflowing Corners */}
      <div className="flex justify-between items-center mt-6 px-4 relative">
        {gameState.isGambleMode ? (
          /* Gamble Mode - Simplified Bottom Row */
          <>
            {/* Empty spacer */}
            <div className="w-24 h-24"></div>
            
            {/* Center message */}
            <div className="text-center">
              <p className="text-white/80 text-lg font-bold">
                {gameState.gambleStage === 'choice' && 'Choose your color!'}
                {gameState.gambleStage === 'reveal' && 'Revealing card...'}
                {gameState.gambleStage === 'result' && 'Round complete!'}
              </p>
            </div>
            
            {/* Empty spacer */}
            <div className="w-24 h-24"></div>
          </>
        ) : (
          /* Normal Mode - Full Controls with Corner Buttons */
          <>
            {/* Left spacer for corner button */}
            <div className="w-24 h-24"></div>
            
            {/* Enter Gamble Button - Center */}
            <button
              onClick={() => {
                console.log('🎲 [Tablet] Button physically clicked!')
                handleEnterGamble()
              }}
              disabled={isLoading || !gameState.canEnterGamble || gameState.isGambleMode}
              className={`
                px-12 py-6 rounded-2xl font-bold text-xl transition-all touch-manipulation flex items-center gap-2 shadow-lg bg-transparent border-2
                ${gameState.canEnterGamble && !gameState.isGambleMode
                  ? 'border-orange-400 text-orange-400 hover:border-red-400 hover:text-red-400 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] active:scale-95'
                  : 'border-gray-600 text-gray-600 cursor-not-allowed opacity-50'
                }
              `}
              aria-label="Enter gamble mode"
            >
              <Dice6 size={24} />
              GAMBLE
            </button>

            {/* Right spacer for corner button */}
            <div className="w-24 h-24"></div>

            {/* Autostart - Overflowing Bottom Left */}
            <button
              onClick={handleToggleAutostart}
              disabled={isLoading}
              className="absolute bottom-0 left-[-100px] w-50 h-50 rounded-full bg-transparent border-2 border-blue-400 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(0,255,255,0.4)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-blue-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg z-10"
              aria-label="Toggle autostart"
            >
              <RotateCcw size={32} />
              <div className="text-sm font-bold mt-1">AUTO</div>
            </button>

            {/* Start - Overflowing Bottom Right */}
            <button
              onClick={handleStartSpin}
              disabled={isLoading}
              className="absolute bottom-0 right-[-100px] w-50 h-50 rounded-full bg-transparent border-2 border-green-400 hover:border-green-300 hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] disabled:border-gray-600 disabled:opacity-50 flex flex-col items-center justify-center text-green-400 disabled:text-gray-600 transition-all active:scale-95 touch-manipulation shadow-lg z-10"
              aria-label="Start spin"
            >
              <Play size={32} />
              <div className="text-sm font-bold mt-1">START</div>
            </button>
          </>
        )}
      </div>

      {/* Connection Status - Minimal */}
      <div className="text-center mt-4">
        <div className={`inline-block w-3 h-3 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' : 
          connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
        }`}></div>
      </div>
    </div>
  )
}