import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function GET(request: NextRequest) {
  try {
    const state = gameController.getGameState()
    
    return NextResponse.json(state)
  } catch (error) {
    console.error('Get state API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to get game state' 
    }, { status: 500 })
  }
}