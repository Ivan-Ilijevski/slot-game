import { NextRequest, NextResponse } from 'next/server'
import gameController from '@/lib/gameController'

export async function POST(request: NextRequest) {
  try {
    const commandId = gameController.toggleLanguage()
    
    return NextResponse.json({ 
      success: true, 
      commandId,
      message: 'Language toggled' 
    })
  } catch (error) {
    console.error('Language toggle API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to toggle language' 
    }, { status: 500 })
  }
}