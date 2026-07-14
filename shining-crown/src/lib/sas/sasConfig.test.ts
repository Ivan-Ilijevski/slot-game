import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { pickSerialPort, readSasSettings, updateSasSettings } from './sasConfig'

const originalCwd = process.cwd()
let fixtureDir: string

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sas-config-'))
  fs.mkdirSync(path.join(fixtureDir, 'src', 'data'), { recursive: true })
  process.chdir(fixtureDir)
  delete process.env.SAS_SERIAL_PORT
  delete process.env.SAS_CMS_HOST
  delete process.env.SAS_CMS_PORT
  delete process.env.SAS_ENABLED
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('SAS runtime settings', () => {
  it('seeds defaults (from env when present) on first read and persists them', () => {
    process.env.SAS_SERIAL_PORT = '/dev/cu.usbserial-TEST1'
    process.env.SAS_CMS_HOST = '10.0.0.5'
    const settings = readSasSettings()
    expect(settings.serialPort).toBe('/dev/cu.usbserial-TEST1')
    expect(settings.cmsHost).toBe('10.0.0.5')
    expect(settings.enabled).toBe(true)

    // Env changes after the first run do not override the persisted settings
    process.env.SAS_SERIAL_PORT = '/dev/other'
    expect(readSasSettings().serialPort).toBe('/dev/cu.usbserial-TEST1')
  })

  it('updates settings partially and persists', () => {
    readSasSettings()
    const updated = updateSasSettings({ cmsHost: '192.168.1.50', cmsPort: 9999 })
    expect(updated.cmsHost).toBe('192.168.1.50')
    expect(updated.cmsPort).toBe(9999)
    expect(readSasSettings().cmsPort).toBe(9999)
  })

  it('rejects invalid updates', () => {
    readSasSettings()
    expect(() => updateSasSettings({ cmsPort: -5 } as never)).toThrow()
    expect(() => updateSasSettings({ serialPort: 123 } as never)).toThrow()
  })
})

describe('serial port auto-discovery', () => {
  const ports = (list: { path: string; vendorId?: string; productId?: string }[]) => list

  it('returns the explicitly configured path untouched', async () => {
    expect(await pickSerialPort('/dev/cu.usbserial-XYZ', async () => [])).toBe('/dev/cu.usbserial-XYZ')
  })

  it('picks a known USB-UART bridge and skips the thermal printer', async () => {
    const list = ports([
      { path: '/dev/cu.usbserial-PRN', vendorId: '0fe6', productId: '811e' }, // POS58 printer
      { path: '/dev/cu.usbserial-1420', vendorId: '1a86', productId: '7523' } // CH340 (CYD)
    ])
    expect(await pickSerialPort('auto', async () => list)).toBe('/dev/cu.usbserial-1420')
  })

  it('returns null when only printer-like ports exist', async () => {
    const list = ports([{ path: '/dev/cu.usbserial-PRN', vendorId: '04b8', productId: '0202' }])
    expect(await pickSerialPort('auto', async () => list)).toBeNull()
  })

  it('falls back to any usbserial device with unknown vendor', async () => {
    const list = ports([{ path: '/dev/cu.usbserial-0001', vendorId: 'dead', productId: 'beef' }])
    expect(await pickSerialPort('auto', async () => list)).toBe('/dev/cu.usbserial-0001')
  })
})
