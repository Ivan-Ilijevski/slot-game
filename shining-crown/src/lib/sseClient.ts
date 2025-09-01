// Server-Sent Events Client for Real-time Communication
// This works better with Next.js than WebSockets

export interface SSEMessage {
  type: string
  data?: Record<string, unknown>
  id?: string
}

export type MessageHandler = (message: SSEMessage) => void

export class SSEClient {
  private eventSource: EventSource | null = null
  private clientType: 'main-game' | 'tablet'
  private messageHandlers: Map<string, MessageHandler[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null

  constructor(clientType: 'main-game' | 'tablet') {
    this.clientType = clientType
  }

  async connect(): Promise<void> {
    if (this.eventSource?.readyState === EventSource.OPEN) {
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
      console.log(`[${this.clientType}] Connecting to SSE server...`)

      try {
        // Connect to SSE endpoint
        this.eventSource = new EventSource(`/api/sse?clientType=${this.clientType}`)

        this.eventSource.onopen = () => {
          console.log(`[${this.clientType}] SSE connected`)
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.connectionPromise = null
          this._notifyConnectionStatus(true)
          resolve()
        }

        this.eventSource.onmessage = (event) => {
          try {
            const message: SSEMessage = JSON.parse(event.data)
            console.log(`[${this.clientType}] Received:`, message.type, message.data)
            this._handleMessage(message)
          } catch (error) {
            console.error(`[${this.clientType}] Error parsing SSE message:`, error)
          }
        }

        this.eventSource.onerror = (error) => {
          console.error(`[${this.clientType}] SSE error:`, error)
          console.log(`[${this.clientType}] SSE readyState:`, this.eventSource?.readyState)
          console.log(`[${this.clientType}] SSE url:`, this.eventSource?.url)
          
          this.isConnecting = false
          this.connectionPromise = null
          this._notifyConnectionStatus(false)
          
          // Check if connection is actually closed or just had an error
          if (this.eventSource?.readyState === EventSource.CLOSED) {
            console.log(`[${this.clientType}] Connection closed, will reconnect`)
            this._handleReconnect()
          } else if (this.eventSource?.readyState === EventSource.CONNECTING) {
            console.log(`[${this.clientType}] Still connecting, waiting...`)
            // Don't reconnect immediately if still trying to connect
          } else {
            console.log(`[${this.clientType}] Unknown state, will try to reconnect`)
            this._handleReconnect()
          }
        }

      } catch (error) {
        this.isConnecting = false
        this.connectionPromise = null
        console.error(`[${this.clientType}] Failed to create SSE connection:`, error)
        reject(error)
      }
    })
  }

  private _handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      
      console.log(`[${this.clientType}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
      
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error(`[${this.clientType}] Reconnection failed:`, error)
        })
      }, delay)
    } else {
      console.error(`[${this.clientType}] Max reconnection attempts reached`)
      this._notifyConnectionStatus(false)
    }
  }

  private _handleMessage(message: SSEMessage): void {
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

  // Send command via HTTP POST (since SSE is receive-only)
  async sendCommand(action: string, payload?: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch('/api/tablet-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          clientType: this.clientType,
          ...payload
        })
      })

      if (response.ok) {
        console.log(`[${this.clientType}] Command sent:`, action, payload)
        return true
      } else {
        console.error(`[${this.clientType}] Command failed:`, action, response.status)
        return false
      }
    } catch (error) {
      console.error(`[${this.clientType}] Error sending command:`, error)
      return false
    }
  }

  // Send game state update (from main game)
  async sendGameState(gameState: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch('/api/game-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientType: this.clientType,
          gameState
        })
      })

      if (response.ok) {
        return true
      } else {
        console.error(`[${this.clientType}] Game state update failed:`, response.status)
        return false
      }
    } catch (error) {
      console.error(`[${this.clientType}] Error sending game state:`, error)
      return false
    }
  }

  // Check connection status
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN
  }

  // Get connection state
  getConnectionState(): string {
    if (!this.eventSource) return 'disconnected'
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'connecting'
      case EventSource.OPEN:
        return 'connected'
      case EventSource.CLOSED:
        return 'disconnected'
      default:
        return 'unknown'
    }
  }

  // Disconnect
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
    this.connectionPromise = null
    this._notifyConnectionStatus(false)
  }
}