import fs from 'fs'
import path from 'path'
import type { SasEngineConfig } from './engine'

// Fixed machine identity/constants (change in code, not at runtime).
export const SAS_CONSTANTS: SasEngineConfig & {
  hostCashoutWindowMs: number
  maxCreditsDeni: number
} = {
  sasAddress: 0x01,
  assetNumber: 1001,
  serialNumber: 'SHINING-CROWN-001',
  gameId: 'SC',
  additionalGameId: '001',
  denomCode: 0x01, // 1 credit = 0.01 MKD = 1 deni
  maxBetCode: 0x05,
  progressiveGroup: 0x00,
  paytableId: 'PT0001',
  basePercent: '9500',
  linkTimeoutMs: 2000,
  hostCashoutWindowMs: 8000,
  maxCreditsDeni: 99_999_999 // 8 BCD digits; SAS credit meter cap
}

// Runtime-editable connection settings, persisted to src/data/sasSettings.json
// and managed through /api/sas/config. Env vars seed the very first run only.
export interface SasSettings {
  schemaVersion: 1
  enabled: boolean
  serialPort: string // 'auto' or an explicit device path
  cmsHost: string
  cmsPort: number
}

function settingsPath(): string {
  return path.join(process.cwd(), 'src', 'data', 'sasSettings.json')
}

function defaultSettings(): SasSettings {
  return {
    schemaVersion: 1,
    enabled: process.env.SAS_ENABLED !== 'false',
    serialPort: process.env.SAS_SERIAL_PORT || 'auto',
    cmsHost: process.env.SAS_CMS_HOST || '127.0.0.1',
    cmsPort: Number(process.env.SAS_CMS_PORT) || 9020
  }
}

export function readSasSettings(): SasSettings {
  const file = settingsPath()
  if (!fs.existsSync(file)) {
    const settings = defaultSettings()
    writeSettings(settings)
    return settings
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as SasSettings
}

function writeSettings(settings: SasSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

export function updateSasSettings(partial: Partial<Omit<SasSettings, 'schemaVersion'>>): SasSettings {
  if (partial.serialPort !== undefined && (typeof partial.serialPort !== 'string' || partial.serialPort.length === 0)) {
    throw new Error('serialPort must be a non-empty string ("auto" or a device path)')
  }
  if (partial.cmsHost !== undefined && (typeof partial.cmsHost !== 'string' || partial.cmsHost.length === 0)) {
    throw new Error('cmsHost must be a non-empty string')
  }
  if (partial.cmsPort !== undefined && (!Number.isInteger(partial.cmsPort) || partial.cmsPort < 1 || partial.cmsPort > 65535)) {
    throw new Error('cmsPort must be a valid TCP port')
  }
  if (partial.enabled !== undefined && typeof partial.enabled !== 'boolean') {
    throw new Error('enabled must be a boolean')
  }

  const settings = { ...readSasSettings(), ...partial, schemaVersion: 1 as const }
  writeSettings(settings)
  return settings
}

// --- serial port discovery ---------------------------------------------

export interface PortInfo {
  path: string
  vendorId?: string
  productId?: string
}

// Thermal printer VID/PIDs (mirrors src/utils/pos58Detector.ts) — the SMIB
// must never grab the printer's port.
const PRINTER_VIDS = new Set(['0fe6', '04b8', '0483', '1fc9', '28e9', '1659'])

// Common USB-UART bridge chips (CH340 on CYD boards, CP210x, FTDI, Prolific)
const UART_BRIDGE_VIDS = new Set(['1a86', '10c4', '0403', '067b'])

export async function pickSerialPort(
  configured: string,
  listPorts: () => Promise<PortInfo[]>
): Promise<string | null> {
  if (configured !== 'auto') {
    return configured
  }

  const ports = await listPorts()
  const candidates = ports.filter(p => {
    const vid = p.vendorId?.toLowerCase()
    if (vid && PRINTER_VIDS.has(vid)) return false
    return /usbserial|ttyUSB|ttyACM|SLAB_USBtoUART|wchusbserial/i.test(p.path)
  })

  const bridge = candidates.find(p => p.vendorId && UART_BRIDGE_VIDS.has(p.vendorId.toLowerCase()))
  return (bridge ?? candidates[0])?.path ?? null
}
