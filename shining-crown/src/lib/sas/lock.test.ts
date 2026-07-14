import { describe, expect, it, vi } from 'vitest'
import { LockController } from './lock'
import {
  LOCK_CODE_CANCEL,
  LOCK_CODE_REQUEST,
  LOCK_CODE_STATUS_ONLY,
  LOCK_STATUS_LOCKED,
  LOCK_STATUS_NOT_LOCKED
} from './types'

// Request body: [lockCode][condition][timeout lo][timeout hi]
function lockBody(code: number, timeout10ms = 0): Buffer {
  return Buffer.from([code, 0x00, timeout10ms & 0xff, timeout10ms >> 8])
}

function parseLockStatus(response: Buffer): number {
  // [len][asset u32][lockStatus]...
  return response[5]
}

function makeController(overrides: Partial<ConstructorParameters<typeof LockController>[0]> = {}) {
  return new LockController({
    assetNumber: 1001,
    getCreditsDeni: () => 52100,
    isPlayBusy: () => false,
    ...overrides
  })
}

describe('0x74 lock controller', () => {
  it('grants a lock when the machine is idle', () => {
    const lock = makeController()
    const response = lock.handle074(lockBody(LOCK_CODE_REQUEST, 500))
    expect(parseLockStatus(response!)).toBe(LOCK_STATUS_LOCKED)
    expect(lock.isLockedForPlay()).toBe(true)
  })

  it('refuses a lock while a game is in progress', () => {
    const lock = makeController({ isPlayBusy: () => true })
    const response = lock.handle074(lockBody(LOCK_CODE_REQUEST, 500))
    expect(parseLockStatus(response!)).toBe(LOCK_STATUS_NOT_LOCKED)
    expect(lock.isLockedForPlay()).toBe(false)
  })

  it('reports the current lock status without changing it (0xFF)', () => {
    const lock = makeController()
    lock.handle074(lockBody(LOCK_CODE_REQUEST, 500))
    const status = lock.handle074(lockBody(LOCK_CODE_STATUS_ONLY))
    expect(parseLockStatus(status!)).toBe(LOCK_STATUS_LOCKED)
    expect(lock.isLockedForPlay()).toBe(true)
  })

  it('cancels a lock (0x80)', () => {
    const lock = makeController()
    lock.handle074(lockBody(LOCK_CODE_REQUEST, 500))
    const cancel = lock.handle074(lockBody(LOCK_CODE_CANCEL))
    expect(parseLockStatus(cancel!)).toBe(LOCK_STATUS_NOT_LOCKED)
    expect(lock.isLockedForPlay()).toBe(false)
  })

  it('auto-expires the lock after its timeout', () => {
    vi.useFakeTimers()
    try {
      const lock = makeController()
      lock.handle074(lockBody(LOCK_CODE_REQUEST, 100)) // 100 * 10ms = 1s
      expect(lock.isLockedForPlay()).toBe(true)
      vi.advanceTimersByTime(1100)
      expect(lock.isLockedForPlay()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('includes the cashable balance in the response', () => {
    const lock = makeController({ getCreditsDeni: () => 12345 })
    const response = lock.handle074(lockBody(LOCK_CODE_REQUEST, 500))
    // cashable BCD5 starts after len(1)+asset(4)+lockStatus(1)+availTransfers(1)
    // +hostCashoutStatus(1)+aftStatus(1)+maxBufferIndex(1) = offset 10
    const cashable = response!.subarray(10, 15)
    expect(cashable).toEqual(Buffer.from([0x00, 0x00, 0x01, 0x23, 0x45]))
  })
})
