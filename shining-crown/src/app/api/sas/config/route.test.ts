import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'

import { GET, POST } from './route'

const originalCwd = process.cwd()
let fixtureDir: string

function postRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/sas/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }) as unknown as NextRequest
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sas-config-route-'))
  fs.mkdirSync(path.join(fixtureDir, 'src', 'data'), { recursive: true })
  process.chdir(fixtureDir)
  delete process.env.SAS_SERIAL_PORT
  delete process.env.SAS_CMS_HOST
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('/api/sas/config', () => {
  it('returns current settings and service status', async () => {
    const response = await GET()
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.settings.serialPort).toBe('auto')
    expect(payload.status).toHaveProperty('linkUp')
  })

  it('updates serial port and CMS address at runtime', async () => {
    const response = await POST(postRequest({
      serialPort: '/dev/cu.usbserial-1420',
      cmsHost: '192.168.1.77',
      cmsPort: 9021
    }))
    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.settings.serialPort).toBe('/dev/cu.usbserial-1420')
    expect(payload.settings.cmsHost).toBe('192.168.1.77')

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'src', 'data', 'sasSettings.json'), 'utf8')
    )
    expect(onDisk.cmsPort).toBe(9021)
  })

  it('rejects invalid settings', async () => {
    const response = await POST(postRequest({ cmsPort: 'not-a-port' }))
    expect(response.status).toBe(400)
  })
})
