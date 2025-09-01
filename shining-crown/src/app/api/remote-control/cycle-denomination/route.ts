import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const commandId = gameController.cycleDenomination()
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: 'Denomination cycled' 
    })
  } catch (error) {
    console.error('Cycle denomination API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to cycle denomination' 
    }, { status: 500 })
  }
}