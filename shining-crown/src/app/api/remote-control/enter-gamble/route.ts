import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const commandId = gameController.enterGambleMode()
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: 'Entered gamble mode' 
    })
  } catch (error) {
    console.error('Enter gamble API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Cannot enter gamble mode' 
    }, { status: 400 })
  }
}