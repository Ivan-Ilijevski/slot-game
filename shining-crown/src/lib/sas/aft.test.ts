import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { numberToBcd, bcdToNumber } from './bcd'
import { AftEngine, readAftState } from './aft'
import { ExceptionQueue } from './exceptionQueue'
import {
  AFT_CODE_FULL,
  AFT_CODE_INTERROGATE,
  AFT_STATUS_FULL_OK,
  AFT_STATUS_PENDING,
  AFT_TYPE_FROM_EGM,
  AFT_TYPE_TO_EGM,
  EXC_AFT_TRANSFER_COMPLETE
} from './types'

const originalCwd = process.cwd()
let fixtureDir: string

// Build a 0x72 request body at the exact offsets sas_egm.py parses.
function aftBody(opts: { code: number; type?: number; amountCents?: number; txn?: string; index?: number }): Buffer {
  const { code, type = 0x00, amountCents = 0, txn = '', index = 0 } = opts
  if (code === AFT_CODE_INTERROGATE) {
    return Buffer.from([0x02, code, index])
  }
  const parts = [
    Buffer.from([0x00, code, index, type]), // len placeholder, code, index, type
    numberToBcd(amountCents, 5), // cashable
    Buffer.alloc(5), // restricted
    Buffer.alloc(5), // nonrestricted
    Buffer.from([0x00]), // flags
    Buffer.alloc(4), // asset
    Buffer.alloc(20), // reg key
    Buffer.from([txn.length]),
    Buffer.from(txn, 'ascii'),
    Buffer.alloc(4), // expiration
    Buffer.from([0x00, 0x00]), // pool id
    Buffer.from([0x00]), // receipt len
    Buffer.from([0x00, 0x00]) // lock timeout
  ]
  const body = Buffer.concat(parts)
  body[0] = body.length - 1
  return body
}

// Response body layout: [len][bufferPos][status][receipt][type][cashable5]...
function parseStatus(response: Buffer): number {
  return response[2]
}
function parseCashable(response: Buffer): number {
  return bcdToNumber(response.subarray(5, 10))
}

interface FakeLedger {
  balance: number
  aftIn: number
  aftOut: number
  gambleActive: boolean
  journalTxns: Set<string>
}

function makeEngine(ledger: FakeLedger, exceptions = new ExceptionQueue()) {
  return new AftEngine({
    assetNumber: 1001,
    maxCreditsDeni: 99_999_999,
    exceptions,
    isGambleActive: () => ledger.gambleActive,
    canFromEgm: () => true,
    getCreditsDeni: () => ledger.balance,
    hasJournalTxn: txn => ledger.journalTxns.has(txn),
    applyToEgm: async (amount, txn) => {
      ledger.balance += amount
      ledger.aftIn += amount
      ledger.journalTxns.add(txn)
    },
    applyFromEgm: async (amount, txn) => {
      ledger.balance -= amount
      ledger.aftOut += amount
      ledger.journalTxns.add(txn)
    }
  })
}

function freshLedger(balance = 0): FakeLedger {
  return { balance, aftIn: 0, aftOut: 0, gambleActive: false, journalTxns: new Set() }
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-'))
  fs.mkdirSync(path.join(fixtureDir, 'src', 'data'), { recursive: true })
  process.chdir(fixtureDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('AFT to-EGM (credits onto the machine)', () => {
  it('accepts a transfer as pending, then applies it and queues 0x69', async () => {
    const ledger = freshLedger(0)
    const exceptions = new ExceptionQueue()
    const engine = makeEngine(ledger, exceptions)

    const first = engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 12345, txn: 'TXN-1' }))
    expect(parseStatus(first!)).toBe(AFT_STATUS_PENDING)

    await engine.whenSettled()
    expect(ledger.balance).toBe(12345)
    expect(ledger.aftIn).toBe(12345)
    expect(exceptions.pop()).toBe(EXC_AFT_TRANSFER_COMPLETE)

    const interrogate = engine.handle072(aftBody({ code: AFT_CODE_INTERROGATE }))
    expect(parseStatus(interrogate!)).toBe(AFT_STATUS_FULL_OK)
    expect(parseCashable(interrogate!)).toBe(12345)
  })

  it('refuses a transfer that would exceed the max credit meter', async () => {
    const ledger = freshLedger(99_999_000)
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 5000, txn: 'TXN-BIG' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(99_999_000) // unchanged
    const interrogate = engine.handle072(aftBody({ code: AFT_CODE_INTERROGATE }))
    expect(parseStatus(interrogate!)).toBeGreaterThanOrEqual(0x80)
  })
})

describe('AFT from-EGM (host cashout)', () => {
  it('removes credits and meters aftOut', async () => {
    const ledger = freshLedger(52100)
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_FROM_EGM, amountCents: 52100, txn: 'TXN-OUT' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(0)
    expect(ledger.aftOut).toBe(52100)
  })

  it('fails when the machine has insufficient credits', async () => {
    const ledger = freshLedger(1000)
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_FROM_EGM, amountCents: 5000, txn: 'TXN-OUT2' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(1000)
    const interrogate = engine.handle072(aftBody({ code: AFT_CODE_INTERROGATE }))
    expect(parseStatus(interrogate!)).toBeGreaterThanOrEqual(0x80)
  })

  it('refuses from-EGM while a gamble session is active', async () => {
    const ledger = freshLedger(5000)
    ledger.gambleActive = true
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_FROM_EGM, amountCents: 5000, txn: 'TXN-G' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(5000)
  })

  it('refuses from-EGM when the cashout latch blocks it', async () => {
    const ledger = freshLedger(5000)
    const engine = new AftEngine({
      assetNumber: 1001,
      maxCreditsDeni: 99_999_999,
      exceptions: new ExceptionQueue(),
      isGambleActive: () => false,
      canFromEgm: () => false, // voucher-committed
      getCreditsDeni: () => ledger.balance,
      hasJournalTxn: () => false,
      applyToEgm: async () => {},
      applyFromEgm: async (amount) => { ledger.balance -= amount }
    })
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_FROM_EGM, amountCents: 5000, txn: 'TXN-L' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(5000)
  })
})

describe('AFT idempotency', () => {
  it('replays the final status for an already-completed txn without re-applying', async () => {
    const ledger = freshLedger(0)
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 1000, txn: 'DUP' }))
    await engine.whenSettled()
    expect(ledger.balance).toBe(1000)

    // Re-send the identical full transfer (e.g. host retry after our response
    // was lost). A general poll happened in between so the engine byte-cache
    // does not cover it — AFT-level idempotency must.
    const replay = engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 1000, txn: 'DUP' }))
    await engine.whenSettled()
    expect(parseStatus(replay!)).toBe(AFT_STATUS_FULL_OK)
    expect(ledger.balance).toBe(1000) // not doubled
  })

  it('reports pending while an in-flight txn has not settled', async () => {
    const ledger = freshLedger(0)
    const engine = makeEngine(ledger)
    const first = engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 1000, txn: 'INF' }))
    // before settling, an interrogate returns pending
    const interrogate = engine.handle072(aftBody({ code: AFT_CODE_INTERROGATE }))
    expect(parseStatus(first!)).toBe(AFT_STATUS_PENDING)
    expect(parseStatus(interrogate!)).toBe(AFT_STATUS_PENDING)
    await engine.whenSettled()
  })

  it('persists the transaction record to aftState.json', async () => {
    const ledger = freshLedger(0)
    const engine = makeEngine(ledger)
    engine.handle072(aftBody({ code: AFT_CODE_FULL, type: AFT_TYPE_TO_EGM, amountCents: 777, txn: 'PERSIST' }))
    await engine.whenSettled()
    const state = readAftState()
    expect(state.lastCompleted?.txn).toBe('PERSIST')
    expect(state.lastCompleted?.status).toBe(AFT_STATUS_FULL_OK)
  })
})

describe('AFT crash recovery', () => {
  it('resolves an accepted-but-unapplied txn to success when the journal shows it applied', async () => {
    // Simulate a crash between "accepted" persist and "applied" persist, where
    // the wallet mutation actually landed (journal has the txn).
    fs.writeFileSync(path.join(fixtureDir, 'src', 'data', 'aftState.json'), JSON.stringify({
      schemaVersion: 1,
      inFlight: { txn: 'CRASH-1', type: AFT_TYPE_TO_EGM, amountDeni: 2000, phase: 'accepted', status: AFT_STATUS_PENDING, startedAt: new Date().toISOString() },
      lastCompleted: null,
      history: []
    }))

    const ledger = freshLedger(2000)
    ledger.journalTxns.add('CRASH-1') // the mutation did land
    const engine = makeEngine(ledger)
    engine.recoverOnBoot()

    const state = readAftState()
    expect(state.inFlight).toBeNull()
    expect(state.lastCompleted?.txn).toBe('CRASH-1')
    expect(state.lastCompleted?.status).toBe(AFT_STATUS_FULL_OK)
  })

  it('resolves an accepted-but-unapplied txn to failure when the journal has no record', async () => {
    fs.writeFileSync(path.join(fixtureDir, 'src', 'data', 'aftState.json'), JSON.stringify({
      schemaVersion: 1,
      inFlight: { txn: 'CRASH-2', type: AFT_TYPE_TO_EGM, amountDeni: 2000, phase: 'accepted', status: AFT_STATUS_PENDING, startedAt: new Date().toISOString() },
      lastCompleted: null,
      history: []
    }))

    const ledger = freshLedger(0) // mutation did not land
    const engine = makeEngine(ledger)
    engine.recoverOnBoot()

    const state = readAftState()
    expect(state.inFlight).toBeNull()
    expect(state.lastCompleted?.txn).toBe('CRASH-2')
    expect(state.lastCompleted?.status).toBeGreaterThanOrEqual(0x80)
  })
})
