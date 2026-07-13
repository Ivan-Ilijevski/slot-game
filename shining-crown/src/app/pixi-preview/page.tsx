'use client'

// Temporary dev-only route for pixel-comparing the declarative PixiGame scene
// against the live vanilla scene at / — deleted at the end of the migration.

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import { Application, Container } from 'pixi.js'

const PixiGameIntegration = dynamic(
  () => import('../../components/game/PixiGameIntegration'),
  { ssr: false }
)

export default function PixiPreview() {
  const appRef = useRef<Application | null>(null)
  const reelsRef = useRef<Container[]>([])
  const reelContainerRef = useRef<Container | null>(null)

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      <PixiGameIntegration
        denomination={0.01}
        totalBalance={662591}
        currentBet={5}
        lastWin={0}
        currentLanguage="en"
        appRef={appRef}
        reelsRef={reelsRef}
        reelContainerRef={reelContainerRef}
        onReady={(app) => {
          console.log('✅ pixi-preview ready', { stageChildren: app.stage.children.length })
        }}
      />
    </div>
  )
}
