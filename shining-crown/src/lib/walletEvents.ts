import { EventEmitter } from 'events'

// Process-wide bus for "the wallet changed underneath the game" — used to tell
// the frontend to refresh its balance when the SAS engine moves money on its
// own (AFT transfers driven by the SMIB), which the UI has no other way to
// learn about.
//
// The emitter lives on a global symbol so both this TS module (inside the Next
// server bundle) and server.js (CommonJS, a different module scope but the same
// OS process) resolve the *same* instance. server.js reads it directly off
// globalThis[Symbol.for('shining-crown.walletEvents')] rather than importing
// this file.
export const WALLET_CHANGED = 'changed'

const WALLET_EVENTS_KEY = Symbol.for('shining-crown.walletEvents')

type GlobalWithEmitter = typeof globalThis & { [WALLET_EVENTS_KEY]?: EventEmitter }

export function getWalletEmitter(): EventEmitter {
  const g = globalThis as GlobalWithEmitter
  if (!g[WALLET_EVENTS_KEY]) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0) // one long-lived listener; avoid leak warnings
    g[WALLET_EVENTS_KEY] = emitter
  }
  return g[WALLET_EVENTS_KEY]
}

// Fire after a SAS-initiated wallet mutation has been written.
export function emitWalletChanged(): void {
  getWalletEmitter().emit(WALLET_CHANGED)
}

export function onWalletChanged(listener: () => void): void {
  getWalletEmitter().on(WALLET_CHANGED, listener)
}
