import { WebSocket } from 'ws'

// Store reference to the main game socket for notifications
let mainGameSocket: WebSocket | null = null

export function setMainGameSocket(socket: WebSocket | null) {
  mainGameSocket = socket
}

export function getMainGameSocket(): WebSocket | null {
  return mainGameSocket
}

// Function to send cashout started notification to main game
export function notifyCashoutStarted(amount: number, currency: string) {
  if (mainGameSocket && mainGameSocket.readyState === WebSocket.OPEN) {
    mainGameSocket.send(JSON.stringify({
      type: 'cashout-notification',
      data: {
        action: 'cashout-started',
        amount,
        currency
      }
    }))
    console.log(`✅ Sent cashout started notification to main game: ${amount} ${currency}`)
  } else {
    console.log('❌ Main game not connected - cannot send cashout started notification')
  }
}

// Function to send cashout completed notification to main game
export function notifyCashoutCompleted(success: boolean, amount: number, currency: string, error?: string) {
  if (mainGameSocket && mainGameSocket.readyState === WebSocket.OPEN) {
    mainGameSocket.send(JSON.stringify({
      type: 'cashout-notification',
      data: {
        action: 'cashout-completed',
        success,
        amount,
        currency,
        error
      }
    }))
    console.log(`Sent cashout completed notification to main game: success=${success}, amount=${amount} ${currency}`)
  } else {
    console.log('Main game not connected - cannot send cashout completed notification')
  }
}