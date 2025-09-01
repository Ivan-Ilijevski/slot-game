import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount } = body

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid bet amount' }, { status: 400 })
    }

    const commandId = gameController.setBet(amount)
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: `Bet set to $${amount}` 
    })
  } catch (error) {
    console.error('Set bet API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to set bet' 
    }, { status: 500 })
  }
}