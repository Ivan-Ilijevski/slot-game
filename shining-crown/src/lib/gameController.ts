// Game Controller for Cross-Device Remote Control
// Manages shared state between main game and tablet interface

export interface RemoteGameState {
  // Betting
  currentBet: number
  denomination: number
  availableBets: number[]
  availableDenoms: number[]
  
  // Balance & Wins
  balance: number
  pendingWin: number
  lastWin: number
  
  // Game States
  isGambleMode: boolean
  gambleStage: 'choice' | 'reveal' | 'result'
  canEnterGamble: boolean // pendingWin > 0
  isSpinning: boolean
  
  // Language
  currentLanguage: 'en' | 'mk'
  
  // Connection
  lastUpdated: number
  connected: boolean
}

export interface RemoteCommand {
  id: string
  action: 'language-toggle' | 'set-bet' | 'cycle-denomination' | 'enter-gamble' | 'gamble-choice' | 'collect-gamble'
  payload?: Record<string, unknown>
  timestamp: number
  processed: boolean
}

class GameController {
  private static instance: GameController
  private gameState: RemoteGameState
  private commands: RemoteCommand[] = []
  private commandIdCounter = 0

  private constructor() {
    // Initialize with default state
    this.gameState = {
      currentBet: 5.00,
      denomination: 0.01,
      availableBets: [5.00, 10.00, 20.00, 50.00, 100.00, 200.00, 500.00, 1000.00],
      availableDenoms: [0.01, 0.10, 0.50, 1.00],
      balance: 1000,
      pendingWin: 0,
      lastWin: 0,
      isGambleMode: false,
      gambleStage: 'choice',
      canEnterGamble: false,
      isSpinning: false,
      currentLanguage: 'en',
      lastUpdated: Date.now(),
      connected: false
    }
  }

  public static getInstance(): GameController {
    if (!GameController.instance) {
      GameController.instance = new GameController()
    }
    return GameController.instance
  }

  // State Management
  public getGameState(): RemoteGameState {
    return { ...this.gameState }
  }

  public updateGameState(updates: Partial<RemoteGameState>): void {
    this.gameState = {
      ...this.gameState,
      ...updates,
      lastUpdated: Date.now(),
      connected: true
    }
    
    // Update canEnterGamble based on pendingWin
    this.gameState.canEnterGamble = this.gameState.pendingWin > 0 && !this.gameState.isSpinning && !this.gameState.isGambleMode
  }

  // Command Management
  public addCommand(action: RemoteCommand['action'], payload?: Record<string, unknown>): string {
    const command: RemoteCommand = {
      id: `cmd_${++this.commandIdCounter}`,
      action,
      payload,
      timestamp: Date.now(),
      processed: false
    }
    
    this.commands.push(command)
    
    // Keep only last 100 commands to prevent memory leaks
    if (this.commands.length > 100) {
      this.commands = this.commands.slice(-100)
    }
    
    console.log(`Remote command added: ${action}`, payload)
    return command.id
  }

  public getPendingCommands(): RemoteCommand[] {
    return this.commands.filter(cmd => !cmd.processed)
  }

  public markCommandProcessed(commandId: string): void {
    const command = this.commands.find(cmd => cmd.id === commandId)
    if (command) {
      command.processed = true
      console.log(`Remote command processed: ${command.action}`)
    }
  }

  public clearOldCommands(): void {
    const oneMinuteAgo = Date.now() - 60000
    this.commands = this.commands.filter(cmd => cmd.timestamp > oneMinuteAgo)
  }

  // Specific Game Actions
  public setBet(amount: number): string {
    if (this.gameState.availableBets.includes(amount)) {
      return this.addCommand('set-bet', { amount })
    }
    throw new Error(`Invalid bet amount: ${amount}`)
  }

  public cycleDenomination(): string {
    return this.addCommand('cycle-denomination')
  }

  public toggleLanguage(): string {
    return this.addCommand('language-toggle')
  }

  public enterGambleMode(): string {
    if (this.gameState.canEnterGamble) {
      return this.addCommand('enter-gamble')
    }
    throw new Error('Cannot enter gamble mode')
  }

  public chooseGambleColor(color: 'red' | 'black'): string {
    if (this.gameState.isGambleMode && this.gameState.gambleStage === 'choice') {
      return this.addCommand('gamble-choice', { color })
    }
    throw new Error('Cannot choose gamble color in current state')
  }

  public collectGamble(): string {
    if (this.gameState.isGambleMode) {
      return this.addCommand('collect-gamble')
    }
    throw new Error('Not in gamble mode')
  }

  // Connection Management
  public updateConnection(connected: boolean): void {
    this.gameState.connected = connected
    this.gameState.lastUpdated = Date.now()
  }

  public isConnected(): boolean {
    const fiveSecondsAgo = Date.now() - 5000
    return this.gameState.connected && this.gameState.lastUpdated > fiveSecondsAgo
  }
}

export default GameController.getInstance()