import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const gameState = await request.json()
    
    // Update game controller with current game state
    gameController.updateGameState(gameState)
    
    // Get pending commands
    const commands = gameController.getPendingCommands()
    
    return NextResponse.json({ 
      commands,
      gameState: gameController.getGameState()
    })
  } catch (error) {
    console.error('Commands API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to get commands',
      commands: []
    }, { status: 500 })
  }
}