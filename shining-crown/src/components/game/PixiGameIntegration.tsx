'use client'

import { useRef, useEffect } from 'react'
import PixiGame, { PixiGameHandle } from './PixiGame'
import { Application, Container } from 'pixi.js'

/**
 * Integration wrapper that bridges the new PixiGame component
 * with existing game logic that expects vanilla PIXI refs
 */

interface PixiGameIntegrationProps {
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number
  currentLanguage: 'en' | 'mk'
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void
  onSpinReels?: () => void

  // Refs to populate for backward compatibility with existing code
  appRef: React.MutableRefObject<Application | null>
  reelsRef: React.MutableRefObject<Container[]>
  reelContainerRef: React.MutableRefObject<Container | null>
}

export default function PixiGameIntegration(props: PixiGameIntegrationProps) {
  const handleRef = useRef<PixiGameHandle | null>(null)

  // When PixiGame is ready, populate the legacy refs
  const handleGameReady = (handle: PixiGameHandle) => {
    handleRef.current = handle

    const app = handle.getApp()
    const reelsContainer = handle.getReelsContainer()
    const reels = handle.getReels()

    // Populate refs for backward compatibility
    props.appRef.current = app
    props.reelContainerRef.current = reelsContainer
    props.reelsRef.current = reels.filter((r): r is Container => r !== null)

    console.log('✅ PixiGame ready - refs populated:', {
      app: !!app,
      reelsContainer: !!reelsContainer,
      reelsCount: props.reelsRef.current.length
    })
  }

  // Clean up refs on unmount
  useEffect(() => {
    return () => {
      props.appRef.current = null
      props.reelContainerRef.current = null
      props.reelsRef.current = []
    }
  }, [props.appRef, props.reelContainerRef, props.reelsRef])

  return (
    <PixiGame
      denomination={props.denomination}
      totalBalance={props.totalBalance}
      currentBet={props.currentBet}
      lastWin={props.lastWin}
      currentLanguage={props.currentLanguage}
      onIncreaseBet={props.onIncreaseBet}
      onDecreaseBet={props.onDecreaseBet}
      onSpinReels={props.onSpinReels}
      onGameReady={handleGameReady}
    />
  )
}
