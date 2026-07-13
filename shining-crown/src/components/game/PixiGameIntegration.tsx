'use client'

import { useRef, useEffect } from 'react'
import PixiGame, { PixiGameHandle } from './PixiGame'
import { Application, Container, Sprite, Text } from 'pixi.js'

/**
 * Integration wrapper that bridges the declarative PixiGame scene with the
 * existing game logic, which drives everything through vanilla PIXI refs.
 */

interface PixiGameIntegrationProps {
  denomination: number
  totalBalance: number
  currentBet: number
  lastWin: number
  currentLanguage: 'en' | 'mk'
  onIncreaseBet?: () => void
  onDecreaseBet?: () => void

  // Called once the PIXI application and scene are ready
  onReady?: (app: Application) => void

  // Refs to populate for backward compatibility with existing code
  appRef: React.MutableRefObject<Application | null>
  reelsRef: React.MutableRefObject<Container[]>
  reelContainerRef: React.MutableRefObject<Container | null>
  uiCabinetOverlayRef?: React.MutableRefObject<Sprite | null>
  denomTextRef?: React.MutableRefObject<Text | null>
  denomLabelTextRef?: React.MutableRefObject<Text | null>
  creditDollarTextRef?: React.MutableRefObject<Text | null>
  creditAmountTextRef?: React.MutableRefObject<Text | null>
  betDollarTextRef?: React.MutableRefObject<Text | null>
  betAmountTextRef?: React.MutableRefObject<Text | null>
  winDollarTextRef?: React.MutableRefObject<Text | null>
  winAmountTextRef?: React.MutableRefObject<Text | null>
  autoStartTextRef?: React.MutableRefObject<Text | null>
}

export default function PixiGameIntegration(props: PixiGameIntegrationProps) {
  const handleRef = useRef<PixiGameHandle | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  // When PixiGame is ready, populate the legacy refs
  const handleGameReady = (handle: PixiGameHandle) => {
    handleRef.current = handle
    const p = propsRef.current

    const app = handle.getApp()
    const reelsContainer = handle.getReelsContainer()
    const reels = handle.getReels()
    const textRefs = handle.getTextRefs()

    p.appRef.current = app
    p.reelContainerRef.current = reelsContainer
    p.reelsRef.current = reels.filter((r): r is Container => r !== null)

    if (p.uiCabinetOverlayRef) p.uiCabinetOverlayRef.current = handle.getUiCabinetOverlay()
    if (p.denomTextRef) p.denomTextRef.current = textRefs.denomText
    if (p.denomLabelTextRef) p.denomLabelTextRef.current = textRefs.denomLabelText
    if (p.creditDollarTextRef) p.creditDollarTextRef.current = textRefs.creditDollarText
    if (p.creditAmountTextRef) p.creditAmountTextRef.current = textRefs.creditAmountText
    if (p.betDollarTextRef) p.betDollarTextRef.current = textRefs.betDollarText
    if (p.betAmountTextRef) p.betAmountTextRef.current = textRefs.betAmountText
    if (p.winDollarTextRef) p.winDollarTextRef.current = textRefs.winDollarText
    if (p.winAmountTextRef) p.winAmountTextRef.current = textRefs.winAmountText
    if (p.autoStartTextRef) p.autoStartTextRef.current = textRefs.autoStartText

    console.log('✅ PixiGame ready - refs populated:', {
      app: !!app,
      reelsContainer: !!reelsContainer,
      reelsCount: p.reelsRef.current.length
    })

    p.onReady?.(app)
  }

  // Clean up refs on unmount
  useEffect(() => {
    const p = propsRef.current
    return () => {
      p.appRef.current = null
      p.reelContainerRef.current = null
      p.reelsRef.current = []
    }
  }, [])

  return (
    <PixiGame
      denomination={props.denomination}
      totalBalance={props.totalBalance}
      currentBet={props.currentBet}
      lastWin={props.lastWin}
      currentLanguage={props.currentLanguage}
      onIncreaseBet={props.onIncreaseBet}
      onDecreaseBet={props.onDecreaseBet}
      onGameReady={handleGameReady}
    />
  )
}
