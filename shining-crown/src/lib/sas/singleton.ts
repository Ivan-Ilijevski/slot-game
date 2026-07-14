import type { Readable, Writable } from 'stream'
import { addBalanceSync, deductBalanceSync, enqueueMoneyOp, getBalance } from '../../utils/wallet'
import { incrementMetersSync, readMeters } from '../../utils/meters'
import { hasTransactionWithSasTxnId } from '../../utils/transactionLogger'
import { isSessionActive } from '../gambleSession'
import { emitWalletChanged } from '../walletEvents'
import { AftEngine, readAftState, writeAftState } from './aft'
import { CmsBridge } from './cmsBridge'
import { SasEngine } from './engine'
import { ExceptionQueue } from './exceptionQueue'
import { LockController } from './lock'
import { readSasSettings, SAS_CONSTANTS, type SasSettings } from './sasConfig'
import { SerialTransport } from './serialTransport'
import { StreamTransport } from './transport'
import {
  AFT_STATUS_FULL_OK,
  AFT_TYPE_FROM_EGM,
  CMD_AFT_LOCK,
  CMD_AFT_TRANSFER,
  EXC_CASHOUT_BUTTON,
  EXC_HOST_CASHOUT_REQUEST
} from './types'

export type HostCashoutResult = 'aft' | 'timeout'

export interface SasStatus {
  running: boolean
  linkUp: boolean
  serialPort: string | null
  portOpen: boolean
  cmsConnected: boolean
  cmsPending: number
}

export interface StartOptions {
  // Test hook: run the engine over an in-memory duplex pair instead of the
  // serial port + CMS bridge.
  testStream?: { input: Readable; output: Writable }
}

// One service per process, shared across Next's separate route bundles.
const SERVICE_KEY = Symbol.for('shining-crown.sasService')
type GlobalWithService = typeof globalThis & { [SERVICE_KEY]?: SasService }

export class SasService {
  readonly engine: SasEngine
  readonly exceptions: ExceptionQueue
  readonly aft: AftEngine
  readonly lock: LockController
  private serial: SerialTransport | null = null
  private bridge: CmsBridge | null = null
  private stream: StreamTransport | null = null
  private settings: SasSettings | null = null
  private running = false

  // Host cashout coordinator state
  private cashoutResolve: ((r: HostCashoutResult) => void) | null = null
  private cashoutTimer: NodeJS.Timeout | null = null

  constructor() {
    this.exceptions = new ExceptionQueue()
    this.engine = new SasEngine({
      config: SAS_CONSTANTS,
      state: {
        getCreditsDeni: () => getBalance(),
        getTotalMeters: () => {
          const { meters } = readMeters()
          return {
            coinIn: meters.coinIn,
            coinOut: meters.coinOut,
            // Coinless kiosk: voucher redemptions are the machine's "drop"
            drop: meters.voucherIn,
            jackpot: meters.jackpot,
            gamesPlayed: meters.gamesPlayed
          }
        }
      },
      exceptions: this.exceptions
    })

    this.lock = new LockController({
      assetNumber: SAS_CONSTANTS.assetNumber,
      getCreditsDeni: () => getBalance(),
      isPlayBusy: () => isSessionActive()
    })

    this.aft = new AftEngine({
      assetNumber: SAS_CONSTANTS.assetNumber,
      maxCreditsDeni: SAS_CONSTANTS.maxCreditsDeni,
      exceptions: this.exceptions,
      isGambleActive: () => isSessionActive(),
      // The host may pull credits any time unless the game has committed the
      // current cash-out to the voucher path (Phase 5 latch).
      canFromEgm: () => readAftState().cashoutLatch?.state !== 'voucher-committed',
      getCreditsDeni: () => getBalance(),
      hasJournalTxn: txn => hasTransactionWithSasTxnId(txn),
      applyToEgm: (amountDeni, txn) =>
        enqueueMoneyOp(() => {
          addBalanceSync(amountDeni, 'aft_in', { sasTxnId: txn })
          incrementMetersSync({ aftIn: amountDeni })
        }).then(() => {
          // Tell the game UI to refresh — this money moved without any user
          // action, so the frontend has no other way to know.
          emitWalletChanged()
        }),
      applyFromEgm: (amountDeni, txn) =>
        enqueueMoneyOp(() => {
          // Re-check the latch inside the money critical section so a
          // concurrent voucher commit can't be bypassed.
          if (readAftState().cashoutLatch?.state === 'voucher-committed') {
            throw new Error('cashout committed to voucher')
          }
          deductBalanceSync(amountDeni, 'aft_out', { sasTxnId: txn })
          incrementMetersSync({ aftOut: amountDeni })
        }).then(() => {
          emitWalletChanged()
        }),
      onSettled: record => {
        if (record.type === AFT_TYPE_FROM_EGM && record.status === AFT_STATUS_FULL_OK) {
          this.finishCashout('aft')
        }
      }
    })

    this.engine.registerHandler(CMD_AFT_TRANSFER, body => this.aft.handle072(body))
    this.engine.registerHandler(CMD_AFT_LOCK, body => this.lock.handle074(body))
  }

  isLockedForPlay(): boolean {
    return this.lock.isLockedForPlay()
  }

  // Player pressed cash-out for the full balance with the link up: arm the
  // AFT window, tell the host (0x66 cash-out button + 0x6A host-cashout
  // request), and wait for either the host to pull the credits (-> 'aft') or
  // the window to expire (-> 'timeout', fall back to voucher).
  requestHostCashout(amountDeni: number, windowMs: number): Promise<HostCashoutResult> {
    const state = readAftState()
    state.cashoutLatch = {
      state: 'aft-window',
      amountDeni,
      expiresAt: new Date(Date.now() + windowMs).toISOString()
    }
    writeAftState(state)

    this.exceptions.push(EXC_CASHOUT_BUTTON)
    this.exceptions.push(EXC_HOST_CASHOUT_REQUEST)

    return new Promise<HostCashoutResult>(resolve => {
      this.cashoutResolve = resolve
      this.armCashoutTimer(windowMs)
    })
  }

  // Commit the current cash-out to the voucher path: refuse any further
  // from-EGM transfer and report the balance at commit time (0 means the host
  // already pulled it, so the caller should treat it as a card payout).
  commitVoucherCashout(): Promise<number> {
    return enqueueMoneyOp(() => {
      const state = readAftState()
      state.cashoutLatch = {
        state: 'voucher-committed',
        amountDeni: state.cashoutLatch?.amountDeni ?? 0,
        expiresAt: null
      }
      writeAftState(state)
      return getBalance()
    })
  }

  releaseCashout(): void {
    const state = readAftState()
    state.cashoutLatch = { state: 'idle', amountDeni: 0, expiresAt: null }
    writeAftState(state)
  }

  private armCashoutTimer(ms: number): void {
    if (this.cashoutTimer) clearTimeout(this.cashoutTimer)
    this.cashoutTimer = setTimeout(() => this.onCashoutWindowExpire(), ms)
    this.cashoutTimer.unref?.()
  }

  private onCashoutWindowExpire(): void {
    // If a from-EGM transfer is still mid-flight, wait for it rather than
    // racing it to the voucher.
    const inFlight = readAftState().inFlight
    if (inFlight && inFlight.type === AFT_TYPE_FROM_EGM) {
      this.armCashoutTimer(500)
      return
    }
    this.finishCashout('timeout')
  }

  private finishCashout(result: HostCashoutResult): void {
    if (this.cashoutTimer) {
      clearTimeout(this.cashoutTimer)
      this.cashoutTimer = null
    }
    const resolve = this.cashoutResolve
    this.cashoutResolve = null
    resolve?.(result)
  }

  start(opts: StartOptions = {}): void {
    if (this.running) return

    if (opts.testStream) {
      this.stream = new StreamTransport({
        input: opts.testStream.input,
        output: opts.testStream.output,
        onSas: payload => this.engine.handleSasPayload(payload),
        onCms: () => {},
        onLog: line => console.log(`[SMIB] ${line}`)
      })
      this.running = true
      return
    }

    this.settings = readSasSettings()
    if (!this.settings.enabled) {
      console.log('[SAS] disabled in sasSettings.json; engine idle')
      return
    }

    // Reconcile any AFT transaction left in-flight by a crash before serving.
    try {
      this.aft.recoverOnBoot()
    } catch (error) {
      console.error('[SAS] AFT boot recovery failed:', error)
    }

    this.bridge = new CmsBridge({
      host: this.settings.cmsHost,
      port: this.settings.cmsPort,
      onReply: payload => this.serial?.sendCms(payload)
    })

    this.serial = new SerialTransport({
      path: this.settings.serialPort,
      onSas: payload => this.engine.handleSasPayload(payload),
      onCms: payload => this.bridge?.forward(payload),
      onLog: line => console.log(`[SMIB] ${line}`)
    })

    this.running = true
    console.log('[SAS] service started (port setting: %s, CMS %s:%d)',
      this.settings.serialPort, this.settings.cmsHost, this.settings.cmsPort)
  }

  // Apply changed settings without restarting the server.
  reload(): void {
    const next = readSasSettings()
    const prev = this.settings
    this.settings = next

    if (!next.enabled) {
      this.stopHardware()
      return
    }

    if (!this.running || !prev || !this.serial) {
      this.stopHardware()
      this.start()
      return
    }

    if (next.serialPort !== prev.serialPort) {
      console.log('[SAS] serial port setting changed -> reopening (%s)', next.serialPort)
      this.serial.reopen(next.serialPort)
    }
    if (next.cmsHost !== prev.cmsHost || next.cmsPort !== prev.cmsPort) {
      console.log('[SAS] CMS address changed -> reconnecting (%s:%d)', next.cmsHost, next.cmsPort)
      this.bridge?.reconfigure(next.cmsHost, next.cmsPort)
    }
  }

  private stopHardware(): void {
    this.serial?.close()
    this.serial = null
    this.bridge?.close()
    this.bridge = null
    this.running = false
  }

  stop(): void {
    this.stopHardware()
    this.stream = null
  }

  queueException(code: number): void {
    this.exceptions.push(code)
  }

  isLinkUp(): boolean {
    return this.engine.isLinkUp()
  }

  status(): SasStatus {
    return {
      running: this.running,
      linkUp: this.engine.isLinkUp(),
      serialPort: this.serial?.currentPath() ?? null,
      portOpen: this.serial?.isOpen() ?? this.stream !== null,
      cmsConnected: this.bridge?.isConnected() ?? false,
      cmsPending: this.bridge?.pendingCount() ?? 0
    }
  }
}

// Facade used by route handlers: always safe to call, no-ops until the
// service is started by instrumentation.
export interface SasFacade {
  queueException(code: number): void
  isLinkUp(): boolean
  isLockedForPlay(): boolean
  requestHostCashout(amountDeni: number, windowMs: number): Promise<HostCashoutResult>
  commitVoucherCashout(): Promise<number>
  releaseCashout(): void
  status(): SasStatus
  reload(): void
}

const NOOP_STATUS: SasStatus = {
  running: false,
  linkUp: false,
  serialPort: null,
  portOpen: false,
  cmsConnected: false,
  cmsPending: 0
}

export function getSasService(): SasFacade {
  const g = globalThis as GlobalWithService
  const service = g[SERVICE_KEY]
  if (service) return service
  return {
    queueException: () => {},
    isLinkUp: () => false,
    isLockedForPlay: () => false,
    // SAS off: no card payout possible, always fall back to voucher.
    requestHostCashout: () => Promise.resolve('timeout'),
    commitVoucherCashout: () => Promise.resolve(getBalance()),
    releaseCashout: () => {},
    status: () => ({ ...NOOP_STATUS }),
    reload: () => {}
  }
}

export function startSasService(opts: StartOptions = {}): SasService {
  const g = globalThis as GlobalWithService
  if (!g[SERVICE_KEY]) {
    g[SERVICE_KEY] = new SasService()
  }
  g[SERVICE_KEY].start(opts)
  return g[SERVICE_KEY]
}

export function __resetSasServiceForTests(): void {
  const g = globalThis as GlobalWithService
  g[SERVICE_KEY]?.stop()
  delete g[SERVICE_KEY]
}
