// Shared game sound effects backed by a lazy @pixi/sound singleton.
// The dynamic import avoids SSR issues; callers resolve the instance at call
// time so early renders never capture a null instance.

export interface GameSound {
  play: (alias: string, options?: { start?: number; end?: number; volume?: number }) => void;
  stop: (alias: string) => void;
  stopAll: () => void;
}

let soundInstance: GameSound | null = null

if (typeof window !== 'undefined') {
  import('@pixi/sound').then((pixiSound) => {
    soundInstance = pixiSound.sound
  })
}

export function getSound(): GameSound | null {
  return soundInstance
}

// Play reel stop sound from 1 second for 0.3 seconds duration
export function playReelStopSound() {
  soundInstance?.play('reelSound', {
    start: 1,
    end: 1.3,
    volume: 0.7
  })
}

// Play wild reel sound from beginning for 1 second
export function playWildReelSound() {
  soundInstance?.play('shortSound', {
    start: 0,
    end: 1,
    volume: 0.8
  })
}

// Play wild expansion sound (4.3 seconds of the win sound sprite)
export function playWildExpandSound() {
  soundInstance?.play('winSound', {
    start: 6.0,
    end: 10.3,
    volume: 0.9
  })
}
