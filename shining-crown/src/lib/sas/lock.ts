import { numberToBcd } from './bcd'
import {
  LOCK_CODE_CANCEL,
  LOCK_CODE_REQUEST,
  LOCK_CODE_STATUS_ONLY,
  LOCK_STATUS_LOCKED,
  LOCK_STATUS_NOT_LOCKED
} from './types'

export interface LockDeps {
  assetNumber: number
  getCreditsDeni: () => number
  isPlayBusy: () => boolean // a spin/gamble step is executing
}

const METER_MODULUS = 100_000_000

// 0x74 AFT game-lock responder. The host locks the EGM before a from-EGM
// transfer so play can't change the balance mid-transfer. Locking is refused
// while a game action is in flight; a granted lock auto-expires after the
// requested timeout (10 ms units) or on explicit cancel.
export class LockController {
  private readonly deps: LockDeps
  private locked = false
  private expiryTimer: NodeJS.Timeout | null = null

  constructor(deps: LockDeps) {
    this.deps = deps
  }

  isLockedForPlay(): boolean {
    return this.locked
  }

  handle074(body: Buffer): Buffer | null {
    if (body.length < 1) return null
    const code = body[0]

    switch (code) {
      case LOCK_CODE_REQUEST: {
        if (this.deps.isPlayBusy()) {
          this.clearLock()
        } else {
          const timeout10ms = body.length >= 4 ? body[2] | (body[3] << 8) : 0
          this.grant(timeout10ms)
        }
        break
      }
      case LOCK_CODE_CANCEL:
        this.clearLock()
        break
      case LOCK_CODE_STATUS_ONLY:
        // report current state without changing it
        break
      default:
        return null
    }

    return this.buildResponse()
  }

  release(): void {
    this.clearLock()
  }

  private grant(timeout10ms: number): void {
    this.locked = true
    if (this.expiryTimer) clearTimeout(this.expiryTimer)
    if (timeout10ms > 0) {
      this.expiryTimer = setTimeout(() => {
        this.locked = false
        this.expiryTimer = null
      }, timeout10ms * 10)
      // Don't keep the process alive just for a lock timer.
      this.expiryTimer.unref?.()
    }
  }

  private clearLock(): void {
    this.locked = false
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
  }

  private buildResponse(): Buffer {
    const asset = Buffer.alloc(4)
    asset.writeUInt32LE(this.deps.assetNumber, 0)
    const lockStatus = this.locked ? LOCK_STATUS_LOCKED : LOCK_STATUS_NOT_LOCKED
    const credits = this.deps.getCreditsDeni() % METER_MODULUS
    const payload = Buffer.concat([
      asset,
      Buffer.from([lockStatus]),
      Buffer.from([0x03]), // available transfers: to/from EGM
      Buffer.from([0x00]), // host cashout status
      Buffer.from([0x00]), // AFT status
      Buffer.from([0x00]), // max buffer index
      numberToBcd(credits, 5), // cashable
      Buffer.alloc(5), // restricted
      Buffer.alloc(5) // nonrestricted
    ])
    return Buffer.concat([Buffer.from([payload.length]), payload])
  }
}
