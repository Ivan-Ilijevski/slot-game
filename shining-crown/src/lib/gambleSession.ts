import fs from 'fs'
import path from 'path'
import { addBalance, deductBalance, readWallet } from '../utils/wallet'
import { secureRandom } from '../utils/secureRandom'

export type GambleColor = 'red' | 'black'

interface GambleHistoryEntry {
  round: number
  choice: GambleColor
  drawn: GambleColor
  won: boolean
  at: string
}

interface GambleState {
  schemaVersion?: 2
  eligibleWin: { amount: number; spinId: string; createdAt: string } | null
  session: {
    stake: number
    currentAmount: number
    round: number
    history: GambleHistoryEntry[]
    startedAt: string
  } | null
}

export class GambleStateError extends Error {}

const emptyState = (): GambleState => ({ schemaVersion: 2, eligibleWin: null, session: null })

// globalThis-backed so route bundles and instrumentation share one queue even
// when Next gives each its own copy of this module.
const GAMBLE_QUEUE_KEY = Symbol.for('shining-crown.gambleQueue')
type GlobalWithQueue = typeof globalThis & { [GAMBLE_QUEUE_KEY]?: Promise<unknown> }

function statePath(): string {
  return path.join(process.cwd(), 'src', 'data', 'gambleState.json')
}

function readState(): GambleState {
  const file = statePath()
  if (!fs.existsSync(file)) {
    const state = emptyState()
    writeState(state)
    return state
  }
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as GambleState
  if (state.schemaVersion !== 2) {
    // Legacy state stored whole MKD; convert amounts to deni.
    if (state.eligibleWin) state.eligibleWin.amount = Math.round(state.eligibleWin.amount * 100)
    if (state.session) {
      state.session.stake = Math.round(state.session.stake * 100)
      state.session.currentAmount = Math.round(state.session.currentAmount * 100)
    }
    state.schemaVersion = 2
    writeState(state)
  }
  return state
}

function writeState(state: GambleState): void {
  const file = statePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...state, schemaVersion: 2 }, null, 2), 'utf8')
}

function serialize<T>(operation: () => T | Promise<T>): Promise<T> {
  const g = globalThis as GlobalWithQueue
  const queue = g[GAMBLE_QUEUE_KEY] ?? Promise.resolve()
  const result = queue.then(operation, operation)
  g[GAMBLE_QUEUE_KEY] = result.then(() => undefined, () => undefined)
  return result
}

const denars = (deni: number) => (deni / 100).toFixed(2)

function metadata(session: NonNullable<GambleState['session']>, forceCollected = false) {
  const netAmount = session.currentAmount - session.stake
  return {
    initialAmount: session.stake,
    finalAmount: session.currentAmount,
    netAmount,
    rounds: session.round,
    ...(forceCollected ? { forceCollected: true } : {}),
    description: netAmount >= 0
      ? `Gamble win: gained ${denars(netAmount)} MKD`
      : `Gamble loss: lost ${denars(Math.abs(netAmount))} MKD`
  }
}

export function setEligibleWin(amount: number, spinId: string): Promise<void> {
  return serialize(() => {
    if (!Number.isFinite(amount) || amount <= 0 || !spinId) throw new Error('Invalid eligible win')
    const state = readState()
    state.eligibleWin = { amount, spinId, createdAt: new Date().toISOString() }
    writeState(state)
  })
}

export function clearEligibleWin(): Promise<void> {
  return serialize(() => {
    const state = readState()
    state.eligibleWin = null
    writeState(state)
  })
}

export function startGamble() {
  return serialize(() => {
    const state = readState()
    if (state.session) throw new GambleStateError('A gamble session is already active')
    if (!state.eligibleWin) throw new GambleStateError('No win is eligible for gamble')

    const amount = state.eligibleWin.amount
    state.session = {
      stake: amount,
      currentAmount: amount,
      round: 0,
      history: [],
      startedAt: new Date().toISOString()
    }
    state.eligibleWin = null
    writeState(state)
    return { amount, toWin: amount * 2 }
  })
}

export function chooseColor(choice: GambleColor) {
  return serialize(async () => {
    const state = readState()
    if (!state.session) throw new GambleStateError('No active gamble session')

    const session = state.session
    const cardIndex = secureRandom(0, 1)
    const drawn: GambleColor = secureRandom(0, 1) === 0 ? 'red' : 'black'
    const won = choice === drawn
    session.history.push({ round: session.round + 1, choice, drawn, won, at: new Date().toISOString() })

    if (!won) {
      const lossMetadata = {
        ...metadata({ ...session, currentAmount: 0 }),
        description: `Gamble loss: lost ${denars(session.stake)} MKD`
      }
      const wallet = await deductBalance(session.stake, 'gamble_loss', lossMetadata)
      state.session = null
      writeState(state)
      return { won, card: { color: drawn, cardIndex }, currentAmount: 0, round: session.round, balance: wallet.balance }
    }

    session.currentAmount *= 2
    session.round += 1
    if (session.round === 5) {
      const wallet = await addBalance(session.currentAmount - session.stake, 'gamble_win', metadata(session, true))
      const result = { won, card: { color: drawn, cardIndex }, currentAmount: session.currentAmount, round: session.round, forceCollected: true, balance: wallet.balance }
      state.session = null
      writeState(state)
      return result
    }

    writeState(state)
    return { won, card: { color: drawn, cardIndex }, currentAmount: session.currentAmount, round: session.round }
  })
}

export function collect() {
  return serialize(async () => {
    const state = readState()
    if (!state.session) return { settled: false, balance: readWallet().balance }

    const session = state.session
    let balance = readWallet().balance
    const netAmount = session.currentAmount - session.stake
    if (netAmount > 0) balance = (await addBalance(netAmount, 'gamble_win', metadata(session))).balance
    state.session = null
    writeState(state)
    return { settled: true, netAmount, balance }
  })
}

export function getState() {
  const state = readState()
  return {
    sessionActive: state.session !== null,
    ...(state.session ? { currentAmount: state.session.currentAmount, round: state.session.round } : {}),
    ...(state.eligibleWin ? { eligibleWin: state.eligibleWin.amount } : {})
  }
}

export function isSessionActive(): boolean {
  return getState().sessionActive
}
