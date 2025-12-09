// Sound management system for slot games using PIXI Sound
import type { GameConfig } from './GameConfig'

export interface SoundOptions {
  start?: number
  end?: number
  volume?: number
  loop?: boolean
}

export interface PIXISound {
  play: (alias: string, options?: SoundOptions) => void
  stop: (alias: string) => void
  stopAll: () => void
  exists: (alias: string) => boolean
}

export type SoundType = 'reelStop' | 'wildReel' | 'wildExpand' | 'win' | 'button' | 'coin'

export class SoundManager {
  private sound: PIXISound | null = null
  private config: GameConfig['soundConfig']
  private isInitialized = false
  private soundEnabled = true
  private globalVolume = 1.0

  constructor(config: GameConfig['soundConfig']) {
    this.config = config
    this.initializeSound()
  }

  // Initialize PIXI Sound with SSR compatibility
  private async initializeSound(): Promise<void> {
    if (typeof window === 'undefined') return

    try {
      const pixiSound = await import('@pixi/sound')
      this.sound = pixiSound.sound as PIXISound
      this.isInitialized = true
      console.log('✅ SoundManager initialized')
    } catch (error) {
      console.error('❌ Failed to initialize SoundManager:', error)
    }
  }

  // Wait for sound system to be ready
  async waitForInitialization(): Promise<void> {
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  // Enable/disable all sounds
  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled
    if (!enabled) {
      this.stopAll()
    }
  }

  // Set global volume (0.0 to 1.0)
  setGlobalVolume(volume: number): void {
    this.globalVolume = Math.max(0, Math.min(1, volume))
  }

  // Play reel stop sound
  playReelStop(): void {
    this.playSound('reelSound', {
      start: this.config.reelStop.start,
      end: this.config.reelStop.end,
      volume: this.config.reelStop.volume
    })
  }

  // Play wild reel sound
  playWildReel(): void {
    this.playSound('shortSound', {
      start: this.config.wildReel.start,
      end: this.config.wildReel.end,
      volume: this.config.wildReel.volume
    })
  }

  // Play wild expansion sound
  playWildExpand(): void {
    this.playSound('winSound', {
      start: this.config.wildExpand.start,
      end: this.config.wildExpand.end,
      volume: this.config.wildExpand.volume
    })
  }

  // Play win sound with custom timing
  playWinSound(start: number = 0, end?: number, volume: number = 0.8): void {
    this.playSound('winSound', { start, end, volume })
  }

  // Play button click sound
  playButtonClick(): void {
    this.playSound('shortSound', {
      start: 0,
      end: 0.2,
      volume: 0.6
    })
  }

  // Play coin collection sound
  playCoinCollect(): void {
    this.playSound('shortSound', {
      start: 0.5,
      end: 1.0,
      volume: 0.7
    })
  }

  // Play custom sound with options
  playCustomSound(alias: string, options?: SoundOptions): void {
    this.playSound(alias, options)
  }

  // Generic play sound method
  private playSound(alias: string, options?: SoundOptions): void {
    if (!this.soundEnabled || !this.sound || !this.isInitialized) return

    try {
      // Apply global volume modifier
      const adjustedOptions = options ? {
        ...options,
        volume: (options.volume || 1.0) * this.globalVolume
      } : { volume: this.globalVolume }

      this.sound.play(alias, adjustedOptions)
    } catch (error) {
      console.warn(`Failed to play sound "${alias}":`, error)
    }
  }

  // Stop specific sound
  stopSound(alias: string): void {
    if (!this.sound || !this.isInitialized) return
    
    try {
      this.sound.stop(alias)
    } catch (error) {
      console.warn(`Failed to stop sound "${alias}":`, error)
    }
  }

  // Stop all sounds
  stopAll(): void {
    if (!this.sound || !this.isInitialized) return
    
    try {
      this.sound.stopAll()
    } catch (error) {
      console.warn('Failed to stop all sounds:', error)
    }
  }

  // Check if sound exists
  soundExists(alias: string): boolean {
    return this.sound?.exists?.(alias) ?? false
  }

  // Get current state
  getState() {
    return {
      isInitialized: this.isInitialized,
      soundEnabled: this.soundEnabled,
      globalVolume: this.globalVolume
    }
  }
}

// React hook for using SoundManager
export function useSoundManager(config: GameConfig['soundConfig']) {
  const soundManager = new SoundManager(config)
  
  return {
    playReelStop: () => soundManager.playReelStop(),
    playWildReel: () => soundManager.playWildReel(),
    playWildExpand: () => soundManager.playWildExpand(),
    playWinSound: (start?: number, end?: number, volume?: number) => 
      soundManager.playWinSound(start, end, volume),
    playButtonClick: () => soundManager.playButtonClick(),
    playCoinCollect: () => soundManager.playCoinCollect(),
    playCustomSound: (alias: string, options?: SoundOptions) => 
      soundManager.playCustomSound(alias, options),
    stopSound: (alias: string) => soundManager.stopSound(alias),
    stopAll: () => soundManager.stopAll(),
    setSoundEnabled: (enabled: boolean) => soundManager.setSoundEnabled(enabled),
    setGlobalVolume: (volume: number) => soundManager.setGlobalVolume(volume),
    soundExists: (alias: string) => soundManager.soundExists(alias),
    getState: () => soundManager.getState(),
    waitForInitialization: () => soundManager.waitForInitialization()
  }
}

// Sound effect presets for common game events
export const SOUND_PRESETS = {
  REEL_SPIN_START: { alias: 'reelSound', options: { start: 0, end: 0.5, volume: 0.5 } },
  REEL_SPIN_LOOP: { alias: 'reelSound', options: { start: 0.5, end: 1.0, volume: 0.4, loop: true } },
  SMALL_WIN: { alias: 'winSound', options: { start: 0, end: 2, volume: 0.7 } },
  BIG_WIN: { alias: 'winSound', options: { start: 2, end: 6, volume: 0.9 } },
  MEGA_WIN: { alias: 'winSound', options: { start: 6, end: 10, volume: 1.0 } },
  GAMBLE_REVEAL: { alias: 'shortSound', options: { start: 0.2, end: 0.8, volume: 0.8 } },
  AUTOPLAY_START: { alias: 'shortSound', options: { start: 0, end: 0.3, volume: 0.6 } }
} as const