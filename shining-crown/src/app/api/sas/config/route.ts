import { NextRequest, NextResponse } from 'next/server'
import { readSasSettings, updateSasSettings } from '../../../../lib/sas/sasConfig'
import { getSasService } from '../../../../lib/sas/singleton'

// GET /api/sas/config - current SAS connection settings + live status
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      settings: readSasSettings(),
      status: getSasService().status()
    })
  } catch (error) {
    console.error('SAS config GET error:', error)
    return NextResponse.json({ success: false, error: 'Failed to read SAS settings' }, { status: 500 })
  }
}

// POST /api/sas/config - update settings; the service hot-applies them
// (reopens the serial port / reconnects the CMS bridge, no restart needed)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const partial: Record<string, unknown> = {}
    for (const key of ['enabled', 'serialPort', 'cmsHost', 'cmsPort'] as const) {
      if (body[key] !== undefined) partial[key] = body[key]
    }

    let settings
    try {
      settings = updateSasSettings(partial)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Invalid settings' },
        { status: 400 }
      )
    }

    getSasService().reload()

    return NextResponse.json({
      success: true,
      settings,
      status: getSasService().status()
    })
  } catch (error) {
    console.error('SAS config POST error:', error)
    return NextResponse.json({ success: false, error: 'Failed to update SAS settings' }, { status: 500 })
  }
}
