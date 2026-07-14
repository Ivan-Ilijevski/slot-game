import { EventEmitter } from 'events'
import { afterEach, describe, expect, it } from 'vitest'

import { emitWalletChanged, getWalletEmitter, onWalletChanged, WALLET_CHANGED } from './walletEvents'

const KEY = Symbol.for('shining-crown.walletEvents')

afterEach(() => {
  getWalletEmitter().removeAllListeners()
})

describe('wallet events bus', () => {
  it('delivers emitWalletChanged to subscribers', () => {
    let count = 0
    onWalletChanged(() => { count += 1 })
    emitWalletChanged()
    emitWalletChanged()
    expect(count).toBe(2)
  })

  it('reuses one globalThis-backed emitter across calls', () => {
    const a = getWalletEmitter()
    const b = getWalletEmitter()
    expect(a).toBe(b)
    // The same instance a plain CommonJS require in server.js would resolve
    // via the shared global symbol registry.
    expect((globalThis as Record<symbol, unknown>)[KEY]).toBe(a)
    expect(a).toBeInstanceOf(EventEmitter)
    expect(a.eventNames()).not.toContain(undefined)
  })

  it('is reachable by a raw consumer that only knows the symbol + event name', () => {
    // Mirrors how server.js (CommonJS, outside the TS bundle) subscribes.
    const emitter = (globalThis as Record<symbol, EventEmitter>)[KEY]
    let fired = false
    emitter.on(WALLET_CHANGED, () => { fired = true })
    emitWalletChanged()
    expect(fired).toBe(true)
  })
})
