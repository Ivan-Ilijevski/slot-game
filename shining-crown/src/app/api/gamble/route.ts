import { NextRequest, NextResponse } from 'next/server'
import {
  GambleColor,
  GambleStateError,
  chooseColor,
  collect,
  getState,
  startGamble
} from '../../../lib/gambleSession'

export async function GET() {
  return NextResponse.json(getState())
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || !('action' in body)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }

    const { action } = body as { action?: unknown }
    if (action === 'start') {
      return NextResponse.json({ success: true, ...(await startGamble()) })
    }
    if (action === 'collect') {
      return NextResponse.json({ success: true, ...(await collect()) })
    }
    if (action === 'choose') {
      const { color } = body as { color?: unknown }
      if (color !== 'red' && color !== 'black') {
        return NextResponse.json({ success: false, error: 'Color must be red or black' }, { status: 400 })
      }
      return NextResponse.json({ success: true, ...(await chooseColor(color as GambleColor)) })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Gamble API error:', error)
    if (error instanceof GambleStateError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: 'Failed to process gamble request' }, { status: 500 })
  }
}
