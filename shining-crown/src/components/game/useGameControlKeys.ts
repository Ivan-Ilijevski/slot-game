import { useEffect } from 'react'
import { getSound } from '../../utils/gameSounds'

// Space (spin / slam-stop / take-win) and P (autostart) key handling,
// lifted verbatim from the page.tsx monolith's keydown handler. Runs
// alongside useKeyboardHandler (R/B/D/L + gamble keys), matching the
// live setup of two independent keydown listeners.

export interface UseGameControlKeysProps {
  isGambleModeRef: React.RefObject<boolean>
  isSpinningRef: React.RefObject<boolean>
  pendingWinRef: React.RefObject<number>
  isWinAnimatingRef: React.RefObject<boolean>
  animationsRunningRef: React.RefObject<Set<number>>
  stopRequestedRef: React.RefObject<boolean>
  reelsStoppedCountRef: React.RefObject<number>
  isAutoStartRef: React.RefObject<boolean>
  autoStartTimeoutRef: React.RefObject<NodeJS.Timeout | null>
  takeWinRef: React.RefObject<(() => void) | null>
  spinReelsRef: React.RefObject<(() => void) | null>
  playReelStopSoundRef: React.RefObject<(() => void) | null>
  setIsAutoStart: React.Dispatch<React.SetStateAction<boolean>>
}

export function useGameControlKeys({
  isGambleModeRef,
  isSpinningRef,
  pendingWinRef,
  isWinAnimatingRef,
  animationsRunningRef,
  stopRequestedRef,
  reelsStoppedCountRef,
  isAutoStartRef,
  autoStartTimeoutRef,
  takeWinRef,
  spinReelsRef,
  playReelStopSoundRef,
  setIsAutoStart
}: UseGameControlKeysProps) {
  useEffect(() => {
    const keydownHandler = (event: KeyboardEvent) => {
      // Prevent space in gamble mode
      if (isGambleModeRef.current) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        if (!isSpinningRef.current && pendingWinRef.current > 0 && (isWinAnimatingRef.current || animationsRunningRef.current.size > 0)) {
          // Take win feature - skip slow animations during wins
          if (takeWinRef.current) {
            takeWinRef.current()
          }
        } else if (!isSpinningRef.current) {
          spinReelsRef.current?.()
        } else if (!stopRequestedRef.current) {
          // Request stop during spinning (only if not already requested)
          stopRequestedRef.current = true

          // Play single sound immediately if all reels will stop together
          if (reelsStoppedCountRef.current === 0) {
            playReelStopSoundRef.current?.()
          }
        }
      } else if (event.code === 'KeyP') {
        event.preventDefault()
        // Toggle autostart feature
        setIsAutoStart(prev => {
          const newAutoStart = !prev
          isAutoStartRef.current = newAutoStart
          const sound = getSound()

          if (newAutoStart && !isSpinningRef.current) {
            // Start autostart immediately if not spinning
            sound?.play('reelSound', {
              start: 14.0,
              end: 14.8,
              volume: 0.9
            })
            spinReelsRef.current?.()
          } else if (!newAutoStart && autoStartTimeoutRef.current) {
            // Stop autostart
            sound?.play('reelSound', {
              start: 14.9,
              end: 15.3,
              volume: 0.9
            })
            clearTimeout(autoStartTimeoutRef.current)
            autoStartTimeoutRef.current = null
          }

          return newAutoStart
        })
      }
    }

    window.addEventListener('keydown', keydownHandler)
    return () => window.removeEventListener('keydown', keydownHandler)
  }, [isGambleModeRef, isSpinningRef, pendingWinRef, isWinAnimatingRef, animationsRunningRef, stopRequestedRef, reelsStoppedCountRef, isAutoStartRef, autoStartTimeoutRef, takeWinRef, spinReelsRef, playReelStopSoundRef, setIsAutoStart])
}
