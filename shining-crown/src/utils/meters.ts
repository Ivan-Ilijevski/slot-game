import fs from 'fs'
import path from 'path'
import { enqueueMoneyOp } from './wallet'

// Lifetime accounting meters (SAS-style), all money values in integer deni.
// Meters only ever increase; 8-digit BCD rollover is applied at SAS encode
// time, never in the store.
export interface Meters {
  coinIn: number       // total wagered (spins + gamble stakes lost)
  coinOut: number      // total won (spin wins + gamble net wins)
  drop: number         // reserved for physical money in (bill acceptor)
  jackpot: number      // reserved for handpay
  gamesPlayed: number
  gamesWon: number
  aftIn: number        // AFT transfers to the machine
  aftOut: number       // AFT transfers from the machine
  voucherIn: number    // voucher redemptions
  voucherOut: number   // voucher cashouts
}

export interface MetersData {
  schemaVersion: 1
  unit: 'deni'
  meters: Meters
  lastUpdated: string
}

const ZERO_METERS: Meters = {
  coinIn: 0,
  coinOut: 0,
  drop: 0,
  jackpot: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  aftIn: 0,
  aftOut: 0,
  voucherIn: 0,
  voucherOut: 0
}

function getMetersPath(): string {
  return path.join(process.cwd(), 'src', 'data', 'meters.json')
}

function defaultMeters(): MetersData {
  return {
    schemaVersion: 1,
    unit: 'deni',
    meters: { ...ZERO_METERS },
    lastUpdated: new Date().toISOString()
  }
}

export function readMeters(): MetersData {
  const metersPath = getMetersPath()

  if (!fs.existsSync(metersPath)) {
    const data = defaultMeters()
    writeMeters(data)
    return data
  }

  const raw = JSON.parse(fs.readFileSync(metersPath, 'utf8')) as MetersData
  if (raw.schemaVersion !== 1 || typeof raw.meters !== 'object') {
    // Meters are append-only lifetime counters; an unreadable store must not
    // silently reset them.
    throw new Error('Invalid meters file')
  }
  return { ...raw, meters: { ...ZERO_METERS, ...raw.meters } }
}

function writeMeters(data: MetersData): void {
  const metersPath = getMetersPath()
  fs.mkdirSync(path.dirname(metersPath), { recursive: true })
  fs.writeFileSync(
    metersPath,
    JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }, null, 2),
    'utf8'
  )
}

// Atomic (single-tick) increment. Call directly only from inside an
// enqueueMoneyOp critical section, alongside the wallet *Sync functions.
export function incrementMetersSync(delta: Partial<Meters>): MetersData {
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Meter deltas must be non-negative integers, got ${key}=${value}`)
    }
  }

  const data = readMeters()
  for (const key of Object.keys(delta) as (keyof Meters)[]) {
    const value = delta[key]
    if (value) data.meters[key] += value
  }
  writeMeters(data)
  return data
}

// Serialized against all other money operations.
export function incrementMeters(delta: Partial<Meters>): Promise<MetersData> {
  return enqueueMoneyOp(() => incrementMetersSync(delta))
}
