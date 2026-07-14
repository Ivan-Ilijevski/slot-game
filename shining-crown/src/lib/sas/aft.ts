import fs from 'fs'
import path from 'path'
import { bcdToNumber, numberToBcd } from './bcd'
import type { ExceptionQueue } from './exceptionQueue'
import {
  AFT_CODE_FULL,
  AFT_CODE_INTERROGATE,
  AFT_STATUS_EXCEEDS_LIMIT,
  AFT_STATUS_FAILED,
  AFT_STATUS_FULL_OK,
  AFT_STATUS_INSUFFICIENT,
  AFT_STATUS_LOCK_REFUSED,
  AFT_STATUS_PENDING,
  AFT_TYPE_FROM_EGM,
  CMD_AFT_TRANSFER,
  EXC_AFT_TRANSFER_COMPLETE
} from './types'

export interface AftInFlight {
  txn: string
  type: number
  amountDeni: number
  phase: 'accepted' | 'applied'
  status: number
  startedAt: string
}

export interface AftCompleted {
  txn: string
  type: number
  amountDeni: number
  status: number
  at: string
}

export type CashoutLatchState = 'idle' | 'aft-window' | 'voucher-committed'

export interface AftState {
  schemaVersion: 1
  inFlight: AftInFlight | null
  lastCompleted: AftCompleted | null
  cashoutLatch?: { state: CashoutLatchState; amountDeni: number; expiresAt: string | null }
  history: AftCompleted[]
}

function aftStatePath(): string {
  return path.join(process.cwd(), 'src', 'data', 'aftState.json')
}

function emptyAftState(): AftState {
  return {
    schemaVersion: 1,
    inFlight: null,
    lastCompleted: null,
    cashoutLatch: { state: 'idle', amountDeni: 0, expiresAt: null },
    history: []
  }
}

export function readAftState(): AftState {
  const file = aftStatePath()
  if (!fs.existsSync(file)) {
    const state = emptyAftState()
    writeAftState(state)
    return state
  }
  return { ...emptyAftState(), ...(JSON.parse(fs.readFileSync(file, 'utf8')) as AftState) }
}

export function writeAftState(state: AftState): void {
  fs.mkdirSync(path.dirname(aftStatePath()), { recursive: true })
  fs.writeFileSync(aftStatePath(), JSON.stringify(state, null, 2), 'utf8')
}

export interface AftDeps {
  assetNumber: number
  maxCreditsDeni: number
  exceptions: ExceptionQueue
  isGambleActive: () => boolean
  canFromEgm: () => boolean // false while the cashout latch is voucher-committed
  getCreditsDeni: () => number
  hasJournalTxn: (txn: string) => boolean
  applyToEgm: (amountDeni: number, txn: string) => Promise<void>
  applyFromEgm: (amountDeni: number, txn: string) => Promise<void>
  now?: () => Date
}

// Request-body offsets (after [addr][0x72]), matching tools/host_sim/sas_egm.py.
const OFF_CODE = 1
const OFF_INDEX = 2
const OFF_TYPE = 3
const OFF_CASHABLE = 4
const OFF_TXN_LEN = 44

export class AftEngine {
  private readonly deps: AftDeps
  private settling: Promise<void> = Promise.resolve()

  constructor(deps: AftDeps) {
    this.deps = deps
  }

  // The 0x72 long-poll handler. Returns the response body bytes (which the
  // engine wraps with [addr][cmd] and a CRC), or null to ignore.
  handle072(body: Buffer): Buffer | null {
    if (body.length < 2) return null
    const code = body[OFF_CODE]

    if (code === AFT_CODE_INTERROGATE) {
      return this.responseForCurrent()
    }
    if (code !== AFT_CODE_FULL) {
      return null
    }

    const type = body[OFF_TYPE]
    const amountDeni = bcdToNumber(body.subarray(OFF_CASHABLE, OFF_CASHABLE + 5))
    const txnLen = body[OFF_TXN_LEN]
    const txn = body.subarray(OFF_TXN_LEN + 1, OFF_TXN_LEN + 1 + txnLen).toString('ascii')

    const state = readAftState()

    // AFT-level idempotency: an already-completed or in-flight txn returns its
    // status without re-applying (the engine byte-cache only covers verbatim
    // repeats not separated by another poll).
    if (state.lastCompleted?.txn === txn) {
      return this.buildResponse(state.lastCompleted.status, state.lastCompleted.type, state.lastCompleted.amountDeni, txn)
    }
    if (state.inFlight?.txn === txn) {
      return this.buildResponse(state.inFlight.status, state.inFlight.type, state.inFlight.amountDeni, txn)
    }

    // New transfer: persist "accepted" (phase 1 of two-phase), schedule the
    // async settle, and answer pending immediately.
    const record: AftInFlight = {
      txn,
      type,
      amountDeni,
      phase: 'accepted',
      status: AFT_STATUS_PENDING,
      startedAt: this.nowIso()
    }
    state.inFlight = record
    writeAftState(state)

    this.scheduleSettle(record)
    return this.buildResponse(AFT_STATUS_PENDING, type, amountDeni, txn)
  }

  // Awaitable for tests / graceful shutdown.
  whenSettled(): Promise<void> {
    return this.settling
  }

  // Resolve a transaction left in-flight by a crash, before serving new ones.
  recoverOnBoot(): void {
    const state = readAftState()
    if (!state.inFlight) return

    const record = state.inFlight
    let status: number
    if (record.phase === 'applied') {
      status = record.status
    } else {
      // Accepted but not confirmed applied: the money mutation is the source of
      // truth — did the journal record it?
      status = this.deps.hasJournalTxn(record.txn) ? AFT_STATUS_FULL_OK : AFT_STATUS_FAILED
    }
    this.finalize(record, status)
  }

  private scheduleSettle(record: AftInFlight): void {
    this.settling = this.settling.then(() => this.settle(record)).catch(err => {
      console.error('[SAS] AFT settle error:', err)
    })
  }

  private async settle(record: AftInFlight): Promise<void> {
    let status = AFT_STATUS_FULL_OK
    try {
      if (record.type === AFT_TYPE_FROM_EGM) {
        if (this.deps.isGambleActive() || !this.deps.canFromEgm()) {
          status = AFT_STATUS_LOCK_REFUSED
        } else if (record.amountDeni > this.deps.getCreditsDeni()) {
          status = AFT_STATUS_INSUFFICIENT
        } else {
          await this.deps.applyFromEgm(record.amountDeni, record.txn)
        }
      } else {
        if (this.deps.getCreditsDeni() + record.amountDeni > this.deps.maxCreditsDeni) {
          status = AFT_STATUS_EXCEEDS_LIMIT
        } else {
          await this.deps.applyToEgm(record.amountDeni, record.txn)
        }
      }
    } catch (err) {
      console.error('[SAS] AFT apply failed:', err)
      status = AFT_STATUS_FAILED
    }

    // Persist "applied" (phase 2) before finalizing, so a crash here is
    // recoverable from the record alone.
    const state = readAftState()
    if (state.inFlight?.txn === record.txn) {
      state.inFlight = { ...record, phase: 'applied', status }
      writeAftState(state)
    }
    this.finalize({ ...record, phase: 'applied', status }, status)
    this.deps.exceptions.push(EXC_AFT_TRANSFER_COMPLETE)
  }

  private finalize(record: AftInFlight, status: number): void {
    const state = readAftState()
    const completed: AftCompleted = {
      txn: record.txn,
      type: record.type,
      amountDeni: record.amountDeni,
      status,
      at: this.nowIso()
    }
    state.inFlight = null
    state.lastCompleted = completed
    state.history = [completed, ...state.history].slice(0, 50)
    writeAftState(state)
  }

  private responseForCurrent(): Buffer {
    const state = readAftState()
    const record = state.inFlight ?? state.lastCompleted
    if (!record) {
      return this.buildResponse(AFT_STATUS_FAILED, 0x00, 0, '')
    }
    return this.buildResponse(record.status, record.type, record.amountDeni, record.txn)
  }

  // Response body layout mirrors sas_egm.py _aft_response.
  private buildResponse(status: number, type: number, amountDeni: number, txn: string): Buffer {
    const asset = Buffer.alloc(4)
    asset.writeUInt32LE(this.deps.assetNumber, 0)
    const payload = Buffer.concat([
      Buffer.from([0x00]), // buffer position
      Buffer.from([status]),
      Buffer.from([0x00]), // receipt status
      Buffer.from([type]),
      numberToBcd(amountDeni, 5), // cashable
      Buffer.alloc(5), // restricted
      Buffer.alloc(5), // nonrestricted
      Buffer.from([0x00]), // flags
      asset,
      Buffer.from([txn.length]),
      Buffer.from(txn, 'ascii'),
      Buffer.alloc(4), // date BCD
      Buffer.alloc(3) // time BCD
    ])
    return Buffer.concat([Buffer.from([payload.length]), payload])
  }

  private nowIso(): string {
    return (this.deps.now?.() ?? new Date()).toISOString()
  }
}

export const AFT_COMMAND = CMD_AFT_TRANSFER
