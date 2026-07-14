import { describe, expect, it } from 'vitest'
import { ExceptionQueue } from './exceptionQueue'
import { EXC_AFT_TRANSFER_COMPLETE, EXC_BUFFER_OVERFLOW, EXC_GAME_ENDED, EXC_GAME_STARTED, EXC_HANDPAY_PENDING, EXC_NONE } from './types'

describe('exception queue', () => {
  it('pops 0x00 when empty', () => {
    const q = new ExceptionQueue()
    expect(q.pop()).toBe(EXC_NONE)
  })

  it('is FIFO for normal exceptions', () => {
    const q = new ExceptionQueue()
    q.push(EXC_GAME_STARTED)
    q.push(EXC_GAME_ENDED)
    expect(q.pop()).toBe(EXC_GAME_STARTED)
    expect(q.pop()).toBe(EXC_GAME_ENDED)
    expect(q.pop()).toBe(EXC_NONE)
  })

  it('lets priority exceptions jump the queue', () => {
    const q = new ExceptionQueue()
    q.push(EXC_GAME_STARTED)
    q.push(EXC_HANDPAY_PENDING)
    q.push(EXC_AFT_TRANSFER_COMPLETE)
    expect(q.pop()).toBe(EXC_HANDPAY_PENDING)
    expect(q.pop()).toBe(EXC_AFT_TRANSFER_COMPLETE)
    expect(q.pop()).toBe(EXC_GAME_STARTED)
  })

  it('drops the oldest and reports overflow when full', () => {
    const q = new ExceptionQueue(4)
    for (let i = 0; i < 6; i++) q.push(EXC_GAME_STARTED)
    // Overflow marker is reported first (priority), then what still fits
    const popped: number[] = []
    for (;;) {
      const code = q.pop()
      if (code === EXC_NONE) break
      popped.push(code)
    }
    expect(popped).toContain(EXC_BUFFER_OVERFLOW)
    expect(popped.length).toBeLessThanOrEqual(5)
  })
})
