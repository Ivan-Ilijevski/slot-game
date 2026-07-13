import { useEffect } from 'react'

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
  takeWinRef: React.RefObject<(() => void) | null>
  spinReelsRef: React.RefObject<(() => void) | null>
  playReelStopSoundRef: React.RefObject<(() => void) | null>
  setAutoStart: (enabled?: boolean) => void
}

export function useGameControlKeys({
  isGambleModeRef,
  isSpinningRef,
  pendingWinRef,
  isWinAnimatingRef,
  animationsRunningRef,
  stopRequestedRef,
  reelsStoppedCountRef,
  takeWinRef,
  spinReelsRef,
  playReelStopSoundRef,
  setAutoStart
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
        setAutoStart()
      }
    }

    window.addEventListener('keydown', keydownHandler)
    return () => window.removeEventListener('keydown', keydownHandler)
  }, [isGambleModeRef, isSpinningRef, pendingWinRef, isWinAnimatingRef, animationsRunningRef, stopRequestedRef, reelsStoppedCountRef, takeWinRef, spinReelsRef, playReelStopSoundRef, setAutoStart])
}
