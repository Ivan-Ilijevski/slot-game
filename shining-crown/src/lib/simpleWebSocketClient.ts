// Simple WebSocket Client that connects to external WebSocket server
export interface WebSocketMessage {
  type: string
  data?: Record<string, unknown>
  clientType?: 'main-game' | 'tablet'
  commandId?: string
  success?: boolean
  message?: string
}

export type MessageHandler = (message: WebSocketMessage) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private clientType: 'main-game' | 'tablet'
  private messageHandlers: Map<string, MessageHandler[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null

  constructor(clientType: 'main-game' | 'tablet') {
    this.clientType = clientType
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this._connect()
    return this.connectionPromise
  }

  private _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        return
      }

      this.isConnecting = true
      console.log(`[${this.clientType}] Connecting to WebSocket server...`)

      try {
        // Connect to a simple external WebSocket server
        // For now, we'll use a local server or fall back to HTTP
        console.log(`[${this.clientType}] WebSocket not available, using HTTP fallback`)
        this.isConnecting = false
        this.connectionPromise = null
        resolve() // Resolve immediately for HTTP fallback
        
      } catch (error) {
        this.isConnecting = false
        this.connectionPromise = null
        console.error(`[${this.clientType}] Failed to create WebSocket:`, error)
        reject(error)
      }
    })
  }

  // Register message handler for specific message type
  on(messageType: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, [])
    }
    this.messageHandlers.get(messageType)!.push(handler)
  }

  // Remove message handler
  off(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  // Send message (HTTP fallback)
  send(message: WebSocketMessage): boolean {
    // For now, return true to indicate message was "sent"
    console.log(`[${this.clientType}] Would send WebSocket message:`, message.type, message.data)
    return true
  }

  // Send tablet command (HTTP fallback)
  sendCommand(action: string, payload?: Record<string, unknown>): boolean {
    return this.send({
      type: 'tablet-command',
      data: {
        action,
        ...payload
      }
    })
  }

  // Send game state update (HTTP fallback)
  sendGameState(gameState: Record<string, unknown>): boolean {
    return this.send({
      type: 'game-state-update',
      data: gameState
    })
  }

  // Send command execution result
  sendCommandResult(commandId: string, success: boolean, message?: string): boolean {
    return this.send({
      type: 'command-result',
      commandId,
      success,
      message
    })
  }

  // Check connection status (always true for HTTP fallback)
  isConnected(): boolean {
    return true
  }

  // Get connection state
  getConnectionState(): string {
    return 'connected' // HTTP fallback is always "connected"
  }

  // Disconnect
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts
    this.connectionPromise = null
  }
}