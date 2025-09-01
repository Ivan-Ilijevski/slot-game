import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const { commandId } = await request.json()
    
    if (!commandId) {
      return NextResponse.json({ error: 'Command ID is required' }, { status: 400 })
    }
    
    gameController.markCommandProcessed(commandId)
    
    return NextResponse.json({ 
      success: true,
      message: 'Command marked as processed' 
    })
  } catch (error) {
    console.error('Mark processed API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to mark command as processed' 
    }, { status: 500 })
  }
}