import { useEffect } from 'react'
import { KEY_BINDINGS } from '../../config/gameConstants'

// Space (spin / slam-stop / take-win), P (autostart) and C (cashout) key
// handling. Runs alongside useKeyboardHandler (R/B/D/L + gamble keys),
// matching the live setup of two independent keydown listeners.

export interface UseGameControlKeysProps {
  isGambleModeRef: React.RefObject<boolean>
  isSpinningRef: React.RefObject<boolean>
  pendingWinRef: React.RefObject<number>
  isWinAnimatingRef: React.RefObject<boolean>
  animationsRunningRef: React.RefObject<Set<number>>
  stopRequestedRef: React.RefObject<boolean>
  reelsStoppedCountRef: React.RefObject<number>
  cashoutConfirmOpenRef: React.RefObject<boolean>
  takeWinRef: React.RefObject<(() => void) | null>
  spinReelsRef: React.RefObject<(() => void) | null>
  playReelStopSoundRef: React.RefObject<(() => void) | null>
  setAutoStart: (enabled?: boolean) => void
  requestCashout: () => void
}

export function useGameControlKeys({
  isGambleModeRef,
  isSpinningRef,
  pendingWinRef,
  isWinAnimatingRef,
  animationsRunningRef,
  stopRequestedRef,
  reelsStoppedCountRef,
  cashoutConfirmOpenRef,
  takeWinRef,
  spinReelsRef,
  playReelStopSoundRef,
  setAutoStart,
  requestCashout
}: UseGameControlKeysProps) {
  useEffect(() => {
    const keydownHandler = (event: KeyboardEvent) => {
      // The cashout confirmation owns the keyboard while it is open
      if (cashoutConfirmOpenRef.current) {
        return
      }

      // Prevent space in gamble mode
      if (isGambleModeRef.current) {
        return
      }

      if (event.code === KEY_BINDINGS.SPIN) {
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
      } else if (event.code === KEY_BINDINGS.AUTOSTART) {
        event.preventDefault()
        setAutoStart()
      } else if (event.code === KEY_BINDINGS.CASHOUT) {
        event.preventDefault()
        requestCashout()
      }
    }

    window.addEventListener('keydown', keydownHandler)
    return () => window.removeEventListener('keydown', keydownHandler)
  }, [isGambleModeRef, isSpinningRef, pendingWinRef, isWinAnimatingRef, animationsRunningRef, stopRequestedRef, reelsStoppedCountRef, cashoutConfirmOpenRef, takeWinRef, spinReelsRef, playReelStopSoundRef, setAutoStart, requestCashout])
}
