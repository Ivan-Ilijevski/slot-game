// WebSocket Client for Real-time Communication
// Handles connection, reconnection, and message passing

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
  private url: string
  private clientType: 'main-game' | 'tablet'
  private messageHandlers: Map<string, MessageHandler[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null

  constructor(clientType: 'main-game' | 'tablet', port = 3000) {
    this.clientType = clientType
    // Use the current host instead of hardcoded localhost for cross-device compatibility
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    this.url = `ws://${host}:${port}/ws` // Connect to /ws path
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

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.connectionPromise = null

          // Add a small delay before sending connection type to ensure server is ready
          setTimeout(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.send({
                type: 'connection-type',
                clientType: this.clientType
              })
            }
          }, 100)

          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this._handleMessage(message)
          } catch (error) {
            console.error(`[${this.clientType}] Error parsing message:`, error)
          }
        }

        // Note: Browser WebSocket API automatically handles ping/pong

        this.ws.onclose = (event) => {
          
          // Log more details about the close event
          if (event.code === 1006) {
            console.warn(`[${this.clientType}] Connection closed abnormally (1006) - possible network issue or server restart`)
          }
          
          this.ws = null
          this.isConnecting = false
          this.connectionPromise = null
          this._handleReconnect()
        }

        this.ws.onerror = (error) => {
          console.error(`[${this.clientType}] WebSocket error:`, error)
          this.isConnecting = false
          this.connectionPromise = null
          reject(error)
        }

      } catch (error) {
        this.isConnecting = false
        this.connectionPromise = null
        console.error(`[${this.clientType}] Failed to create WebSocket:`, error)
        reject(error)
      }
    })
  }

  private _handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 10000) // Exponential backoff, max 10s
      
      
      setTimeout(() => {
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          this.connect().catch((error) => {
            console.error(`[${this.clientType}] Reconnection attempt ${this.reconnectAttempts} failed:`, error)
          })
        }
      }, delay)
    } else {
      console.error(`[${this.clientType}] Max reconnection attempts (${this.maxReconnectAttempts}) reached - giving up`)
      this._notifyConnectionStatus(false)
    }
  }

  private _handleMessage(message: WebSocketMessage): void {
    // Handle connection status messages
    if (message.type === 'connection-confirmed') {
      this._notifyConnectionStatus(true)
      return
    }

    // Call registered message handlers
    const handlers = this.messageHandlers.get(message.type) || []
    handlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error(`[${this.clientType}] Error in message handler for ${message.type}:`, error)
      }
    })
  }

  private _notifyConnectionStatus(connected: boolean): void {
    const handlers = this.messageHandlers.get('connection-status') || []
    handlers.forEach(handler => {
      handler({
        type: 'connection-status',
        data: { connected }
      })
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

  // Send message to server
  send(message: WebSocketMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        return true
      } catch (error) {
        console.error(`[${this.clientType}] Error sending message:`, error)
        return false
      }
    } else {
      console.warn(`[${this.clientType}] WebSocket not connected, cannot send message:`, message.type)
      return false
    }
  }

  // Send tablet command
  sendCommand(action: string, payload?: Record<string, unknown>): boolean {
    return this.send({
      type: 'tablet-command',
      data: {
        action,
        ...payload
      }
    })
  }

  // Send game state update (from main game)
  sendGameState(gameState: Record<string, unknown>): boolean {
    return this.send({
      type: 'game-state-update',
      data: gameState
    })
  }

  // Send command execution result (from main game)
  sendCommandResult(commandId: string, success: boolean, message?: string): boolean {
    return this.send({
      type: 'command-result',
      commandId,
      success,
      message
    })
  }

  // Check connection status
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // Get connection state
  getConnectionState(): string {
    if (!this.ws) return 'disconnected'
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'connected'
      case WebSocket.CLOSING:
        return 'closing'
      case WebSocket.CLOSED:
        return 'disconnected'
      default:
        return 'unknown'
    }
  }

  // Disconnect
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
    this.connectionPromise = null
  }
}