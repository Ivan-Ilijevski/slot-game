import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { color } = body

    if (color !== 'red' && color !== 'black') {
      return NextResponse.json({ error: 'Invalid color choice. Must be "red" or "black"' }, { status: 400 })
    }

    const commandId = gameController.chooseGambleColor(color)
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: `Chose ${color}` 
    })
  } catch (error) {
    console.error('Gamble choice API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to make gamble choice' 
    }, { status: 400 })
  }
}