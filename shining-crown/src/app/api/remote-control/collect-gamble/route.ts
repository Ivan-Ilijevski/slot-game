import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const commandId = gameController.collectGamble()
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: 'Collected gamble winnings' 
    })
  } catch (error) {
    console.error('Collect gamble API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Cannot collect gamble winnings' 
    }, { status: 400 })
  }
}