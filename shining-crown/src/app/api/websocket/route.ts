import { NextRequest } from 'next/server'
import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import gameController from '@/lib/gameController'
import { setMainGameSocket } from '@/lib/websocketNotifications'

// Global WebSocket server instance
let wss: WebSocketServer | null = null
let mainGameSocket: WebSocket | null = null
let tabletSocket: WebSocket | null = null

interface WebSocketMessage {
  type: 'game-state-update' | 'tablet-command' | 'connection-type' | 'command-result' | 'cashout-notification'
  data?: Record<string, unknown>
  clientType?: 'main-game' | 'tablet'
  commandId?: string
  success?: boolean
  message?: string
}

// Initialize WebSocket server
function initWebSocketServer() {
  if (wss) return wss

  wss = new WebSocketServer({ port: 8080 })
  
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection established')
    
    ws.on('message', (message: Buffer) => {
      try {
        const msg: WebSocketMessage = JSON.parse(message.toString())
        console.log('Received WebSocket message:', msg.type, msg.data)
        
        handleWebSocketMessage(ws, msg)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }))
      }
    })
    
    ws.on('close', () => {
      console.log('WebSocket connection closed')
      if (ws === mainGameSocket) {
        mainGameSocket = null
        setMainGameSocket(null) // Update the notification utility
        console.log('Main game disconnected')
      }
      if (ws === tabletSocket) {
        tabletSocket = null
        console.log('Tablet disconnected')
      }
    })
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
    })
    
    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection-confirmed',
      message: 'WebSocket connection established'
    }))
  })
  
  console.log('WebSocket server initialized on port 8080')
  return wss
}

async function handleWebSocketMessage(ws: WebSocket, msg: WebSocketMessage) {
  try {
    switch (msg.type) {
      case 'connection-type':
        // Identify client type
        if (msg.clientType === 'main-game') {
          mainGameSocket = ws
          setMainGameSocket(ws) // Update the notification utility
          console.log('Main game client connected')
          
          // Send current game state to main game
          ws.send(JSON.stringify({
            type: 'game-state',
            data: gameController.getGameState()
          }))
        } else if (msg.clientType === 'tablet') {
          tabletSocket = ws
          console.log('Tablet client connected')
          
          // Send current game state to tablet
          ws.send(JSON.stringify({
            type: 'game-state',
            data: gameController.getGameState()
          }))
        }
        break
        
      case 'game-state-update':
        // Main game sending state update
        if (msg.data) {
          gameController.updateGameState(msg.data)
          
          // Forward state to tablet if connected
          if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
            tabletSocket.send(JSON.stringify({
              type: 'game-state',
              data: gameController.getGameState()
            }))
          }
        }
        break
        
      case 'tablet-command':
        // Tablet sending command
        if (msg.data?.action) {
          try {
            let commandId: string
            const action = msg.data.action as string
            
            switch (action) {
              case 'set-bet':
                commandId = gameController.setBet(msg.data.amount as number)
                break
              case 'cycle-denomination':
                commandId = gameController.cycleDenomination()
                break
              case 'language-toggle':
                commandId = gameController.toggleLanguage()
                break
              case 'enter-gamble':
                commandId = gameController.enterGambleMode()
                break
              case 'gamble-choice':
                commandId = gameController.chooseGambleColor(msg.data.color as 'red' | 'black')
                break
              case 'collect-gamble':
                commandId = gameController.collectGamble()
                break
              default:
                throw new Error(`Unknown command: ${action}`)
            }
            
            // Send command to main game
            if (mainGameSocket && mainGameSocket.readyState === WebSocket.OPEN) {
              mainGameSocket.send(JSON.stringify({
                type: 'execute-command',
                data: {
                  commandId,
                  action,
                  payload: msg.data
                }
              }))
            }
            
            // Send confirmation to tablet
            ws.send(JSON.stringify({
              type: 'command-result',
              commandId,
              success: true,
              message: `Command ${action} queued successfully`
            }))
            
          } catch (error) {
            console.error('Command execution error:', error)
            ws.send(JSON.stringify({
              type: 'command-result',
              success: false,
              message: error instanceof Error ? error.message : 'Command failed'
            }))
          }
        }
        break
        
      case 'command-result':
        // Main game reporting command execution result
        gameController.markCommandProcessed(msg.commandId || '')
        
        // Forward result to tablet if connected
        if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
          tabletSocket.send(JSON.stringify({
            type: 'command-executed',
            commandId: msg.commandId,
            success: msg.success,
            message: msg.message
          }))
        }
        break
    }
  } catch (error) {
    console.error('Error handling WebSocket message:', error)
    ws.send(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Server error'
    }))
  }
}


// Initialize server when this module loads
initWebSocketServer()

// HTTP upgrade handler for WebSocket connections
export async function GET(req: NextRequest) {
  return new Response('WebSocket server running on port 8080', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}