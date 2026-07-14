import type { Readable, Writable } from 'stream'
import { addBalanceSync, deductBalanceSync, enqueueMoneyOp, getBalance } from '../../utils/wallet'
import { incrementMetersSync, readMeters } from '../../utils/meters'
import { hasTransactionWithSasTxnId } from '../../utils/transactionLogger'
import { isSessionActive } from '../gambleSession'
import { AftEngine, readAftState } from './aft'
import { CmsBridge } from './cmsBridge'
import { SasEngine } from './engine'
import { ExceptionQueue } from './exceptionQueue'
import { LockController } from './lock'
import { readSasSettings, SAS_CONSTANTS, type SasSettings } from './sasConfig'
import { SerialTransport } from './serialTransport'
import { StreamTransport } from './transport'
import { CMD_AFT_TRANSFER, CMD_AFT_LOCK } from './types'

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
        }),
      applyFromEgm: (amountDeni, txn) =>
        enqueueMoneyOp(() => {
          deductBalanceSync(amountDeni, 'aft_out', { sasTxnId: txn })
          incrementMetersSync({ aftOut: amountDeni })
        })
    })

    this.engine.registerHandler(CMD_AFT_TRANSFER, body => this.aft.handle072(body))
    this.engine.registerHandler(CMD_AFT_LOCK, body => this.lock.handle074(body))
  }

  isLockedForPlay(): boolean {
    return this.lock.isLockedForPlay()
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
