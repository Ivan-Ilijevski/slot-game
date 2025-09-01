const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { WebSocketServer } = require('ws')

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  // Don't exit - let the server continue running
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - let the server continue running
})

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = 3000

// Create Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// Game controller for managing state
let gameState = {
  currentBet: 5.00,
  denomination: 0.01,
  isGambleMode: false,
  canEnterGamble: false,
  pendingWin: 0,
  currentLanguage: 'en',
  balance: 1000,
  isSpinning: false,
  lastUpdated: Date.now()
}

// Store commands
let commands = []
let commandIdCounter = 0

// Connected clients
let mainGameSocket = null
let tabletSocket = null

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  // Create WebSocket server with path filtering
  const wss = new WebSocketServer({ 
    server,
    path: '/ws' // Only handle WebSocket connections on /ws path
  })

  wss.on('connection', function connection(ws, req) {
    console.log('New WebSocket connection from:', req.socket.remoteAddress, 'path:', req.url)

    // Disable ping/pong for now to avoid frame corruption
    let pingInterval = null

    ws.on('message', function message(data) {
      try {
        const message = JSON.parse(data.toString())

        handleWebSocketMessage(ws, message)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
        if (ws.readyState === 1) { // Only send if connection is open
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }))
        }
      }
    })

    ws.on('close', (code, reason) => {
      console.log('WebSocket connection closed', code, reason?.toString())
      
      // Clear ping interval
      if (pingInterval) {
        clearInterval(pingInterval)
      }
      
      if (ws === mainGameSocket) {
        mainGameSocket = null
        console.log('Main game disconnected')
      }
      if (ws === tabletSocket) {
        tabletSocket = null
        console.log('Tablet disconnected')
      }
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
      // Don't try to send error messages on error - just log
    })

    // Send connection confirmation
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify({
          type: 'connection-confirmed',
          message: 'WebSocket connection established'
        }))
      } catch (error) {
        console.error('Error sending connection confirmation:', error)
      }
    }
  })

  function handleWebSocketMessage(ws, message) {
    switch (message.type) {
      case 'connection-type':
        if (message.clientType === 'main-game') {
          mainGameSocket = ws
          
          // Send current game state
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'game-state',
              data: gameState
            }))
          }
        } else if (message.clientType === 'tablet') {
          tabletSocket = ws
          
          // Send current game state
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'game-state',
              data: gameState
            }))
          }
        }
        break

      case 'game-state-update':
        // Update game state from main game
        if (message.data) {
          gameState = {
            ...gameState,
            ...message.data,
            lastUpdated: Date.now()
          }
          
          gameState.canEnterGamble = gameState.pendingWin > 0 && !gameState.isSpinning && !gameState.isGambleMode
          
          
          // Send updated state to tablet
          if (tabletSocket && tabletSocket.readyState === 1) {
            tabletSocket.send(JSON.stringify({
              type: 'game-state',
              data: gameState
            }))
          }
        }
        break

      case 'tablet-command':
        // Command from tablet
        console.log('🎰 [Server] Received tablet command:', message.data?.action, message.data)
        if (message.data?.action) {
          try {
            const commandId = `cmd_${++commandIdCounter}`
            const command = {
              id: commandId,
              action: message.data.action,
              payload: message.data,
              timestamp: Date.now(),
              processed: false
            }
            
            console.log('🎰 [Server] Created command:', command)
            commands.push(command)

            // Send command to main game
            if (mainGameSocket && mainGameSocket.readyState === 1) {
              console.log('🎰 [Server] Sending command to main game:', commandId, message.data.action)
              mainGameSocket.send(JSON.stringify({
                type: 'execute-command',
                data: {
                  commandId,
                  action: message.data.action,
                  payload: message.data
                }
              }))
            } else {
              console.log('🎰 [Server] Cannot send to main game - not connected!')
            }

            // Send confirmation to tablet
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'command-result',
                commandId,
                success: true,
                message: `Command ${message.data.action} sent to main game`
              }))
            }

          } catch (error) {
            console.error('Error processing tablet command:', error)
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type: 'command-result',
                success: false,
                message: error.message
              }))
            }
          }
        }
        break

      case 'command-result':
        // Main game reporting command execution result
        const commandId = message.commandId
        const command = commands.find(cmd => cmd.id === commandId)
        if (command) {
          command.processed = true
        }

        // Forward result to tablet
        if (tabletSocket && tabletSocket.readyState === 1) {
          tabletSocket.send(JSON.stringify({
            type: 'command-executed',
            commandId: message.commandId,
            success: message.success,
            message: message.message
          }))
        }
        break
    }
  }

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> WebSocket server is running on the same port`)
  })
})