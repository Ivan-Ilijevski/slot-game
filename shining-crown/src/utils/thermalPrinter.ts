import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer'

// macOS specific configurations for POS58
const MACOS_CONFIGS = [
  // Your actual printer name from terminal
  {
    name: 'STMicroelectronics_POS58_Printer_USB',
    config: {
      type: PrinterTypes.EPSON,
      interface: 'printer:STMicroelectronics_POS58_Printer_USB',
      characterSet: CharacterSet.WPC1251_CYRILLIC, // Use Cyrillic for your Macedonian text
      width: 32,
      removeSpecialCharacters: false,
      lineCharacter: '='
    }
  },
  // Try raw printing approach (like your terminal command)
  {
    name: 'STMicroelectronics Raw',
    config: {
      type: PrinterTypes.EPSON,
      interface: 'printer:STMicroelectronics_POS58_Printer_USB',
      characterSet: CharacterSet.WPC1251_CYRILLIC,
      width: 32,
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: {
        timeout: 5000
      }
    }
  },
  // Fallback configurations
  {
    name: 'USB Receipt Printer',
    config: {
      type: PrinterTypes.EPSON,
      interface: 'printer:USB Receipt Printer',
      characterSet: CharacterSet.WPC1251_CYRILLIC,
      width: 32,
      removeSpecialCharacters: false,
      lineCharacter: '='
    }
  },
  {
    name: 'POS-58',
    config: {
      type: PrinterTypes.EPSON,
      interface: 'printer:POS-58',
      characterSet: CharacterSet.WPC1251_CYRILLIC,
      width: 32,
      removeSpecialCharacters: false,
      lineCharacter: '='
    }
  }
]

// Cashout ticket data interface
export interface CashoutTicket {
  amount: number
  currency: string
  ticketId: string
  machineId: string
  timestamp: Date
  balanceAfter: number
}

// Initialize thermal printer - auto-detect best config for macOS
export function initializePrinter(configIndex: number = 0): ThermalPrinter {
  const config = MACOS_CONFIGS[configIndex]?.config || MACOS_CONFIGS[0].config
  const printer = new ThermalPrinter(config)
  
  return printer
}

// Test all available configurations to find working one
export async function findWorkingPrinterConfig(): Promise<{ 
  configIndex: number; 
  configName: string; 
  success: boolean;
  error?: string;
}> {
  for (let i = 0; i < MACOS_CONFIGS.length; i++) {
    const config = MACOS_CONFIGS[i]
    console.log(`🧪 Testing configuration: ${config.name}`)
    
    try {
      const printer = new ThermalPrinter(config.config)
      const isConnected = await printer.isPrinterConnected()
      
      if (isConnected) {
        console.log(`✅ Found working configuration: ${config.name}`)
        return {
          configIndex: i,
          configName: config.name,
          success: true
        }
      }
    } catch (error) {
      console.log(`❌ Configuration ${config.name} failed:`, error)
    }
  }
  
  return {
    configIndex: -1,
    configName: 'None',
    success: false,
    error: 'No working printer configuration found'
  }
}

// Generate ticket ID
export function generateTicketId(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `SC${date}${time}${random}`
}

// Format currency for printing
function formatCurrency(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`
}

// Generate ESC/POS barcode commands
function addBarcodeCommands(printer: any, ticketId: string): void {
  // CODE128 Barcode (most common for receipts)
  printer.newLine()
  printer.alignCenter()
  
  // Set barcode height (in dots, 162 = ~20mm height)
  printer.code('\x1D\x68\xA2') // GS h 162
  
  // Set barcode width (2 = medium width)
  printer.code('\x1D\x77\x02') // GS w 2
  
  // Print barcode with HRI (Human Readable Interpretation) below
  printer.code('\x1D\x48\x02') // GS H 2 (print HRI below barcode)
  
  // Set font for HRI
  printer.code('\x1D\x66\x00') // GS f 0 (font A)
  
  // Print CODE128 barcode
  const barcodeData = `\x1D\x6B\x49${String.fromCharCode(ticketId.length)}${ticketId}`
  printer.code(barcodeData) // GS k 73 (CODE128)
  
  printer.newLine()
}

// Generate ESC/POS QR code commands  
function addQRCodeCommands(printer: any, ticketId: string): void {
  printer.newLine()
  printer.alignCenter()
  
  // QR Code model
  printer.code('\x1D\x28\x6B\x04\x00\x31\x41\x32\x00') // GS ( k - QR Code model 2
  
  // QR Code size (16 = MAXIMUM size for 58mm paper)
  // Module sizes: 1-16, where 16 gives largest possible QR code
  printer.code('\x1D\x28\x6B\x03\x00\x31\x43\x10') // GS ( k - Module size 16 (0x10)
  
  // Error correction level M (15%) - better for large QR codes
  printer.code('\x1D\x28\x6B\x03\x00\x31\x45\x31') // GS ( k - Error correction M
  
  // Store QR code data
  const qrDataLength = ticketId.length + 3
  const qrCommand = `\x1D\x28\x6B${String.fromCharCode(qrDataLength & 0xFF)}${String.fromCharCode((qrDataLength >> 8) & 0xFF)}\x31\x50\x30${ticketId}`
  printer.code(qrCommand)
  
  // Print stored QR code
  printer.code('\x1D\x28\x6B\x03\x00\x31\x51\x30') // GS ( k - Print QR code
  
  printer.newLine()
}

// Print cashout ticket
export async function printCashoutTicket(
  ticketData: CashoutTicket, 
  useDirectUSB: boolean = true
): Promise<{ success: boolean; error?: string; ticketId: string }> {
  try {
    const printer = initializePrinter(0)
    
    // Check if printer is connected
    const isConnected = await printer.isPrinterConnected()
    if (!isConnected) {
      return {
        success: false,
        error: 'Printer not connected. Please check USB connection.',
        ticketId: ticketData.ticketId
      }
    }

    // Clear any previous content
    printer.clear()
    
    // Header
    printer.alignCenter()
    printer.setTextSize(1, 1)
    printer.bold(true)
    printer.println('SHINING CROWN SLOT')
    printer.bold(false)
    printer.drawLine()
    
    // Date and machine info
    printer.alignLeft()
    printer.setTextNormal()
    printer.println(`Date: ${ticketData.timestamp.toLocaleString()}`)
    printer.println(`Machine: ${ticketData.machineId}`)
    printer.println(`Ticket: #${ticketData.ticketId}`)
    printer.drawLine()
    
    // Cashout amount (prominent)
    printer.alignCenter()
    printer.setTextSize(1, 2)
    printer.bold(true)
    printer.println('CASHOUT VOUCHER')
    printer.newLine()
    printer.setTextSize(2, 2)
    printer.println(`${formatCurrency(ticketData.amount, ticketData.currency)}`)
    printer.bold(false)
    printer.setTextNormal()
    printer.drawLine()
    
    // Instructions
    printer.alignCenter()
    printer.println('Valid for 30 days')
    printer.println('Present to cashier')
    printer.newLine()
    
    // Add CODE128 barcode
    printer.println('Ticket Barcode:')
    addBarcodeCommands(printer, ticketData.ticketId)
    
    // Add QR code with same data (large size)
    printer.newLine()
    printer.newLine()
    printer.println('QR Code:')
    addQRCodeCommands(printer, ticketData.ticketId)
    printer.newLine()
    
    // Footer
    printer.drawLine()
    printer.alignCenter()
    printer.println('Thank you for playing!')
    printer.println('Malfunction voids all pays')
    
    // Cut paper
    printer.cut()
    
    // Execute print job
    await printer.execute()
    
    console.log(`Cashout ticket printed: ${ticketData.ticketId}`)
    
    return {
      success: true,
      ticketId: ticketData.ticketId
    }
    
  } catch (error) {
    console.error('Printer error:', error)
    
    let errorMessage = 'Unknown printer error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    
    return {
      success: false,
      error: errorMessage,
      ticketId: ticketData.ticketId
    }
  }
}

// Test printer connection
export async function testPrinter(useDirectUSB: boolean = true): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = initializePrinter(0)
    
    const isConnected = await printer.isPrinterConnected()
    if (!isConnected) {
      return {
        success: false,
        error: 'Printer not connected'
      }
    }
    
    // Print test receipt with barcode and QR code
    const testTicketId = `TEST${Date.now().toString().slice(-6)}`
    
    printer.clear()
    printer.alignCenter()
    printer.bold(true)
    printer.println('PRINTER TEST')
    printer.bold(false)
    printer.newLine()
    printer.println('Connection successful!')
    printer.println(`Time: ${new Date().toLocaleString()}`)
    printer.newLine()
    
    // Test barcode
    printer.println('Test Barcode:')
    addBarcodeCommands(printer, testTicketId)
    
    // Test QR code (large)
    printer.newLine()
    printer.newLine()
    printer.println('Large QR Code Test:')
    addQRCodeCommands(printer, testTicketId)
    
    printer.newLine()
    printer.cut()
    
    await printer.execute()
    
    return { success: true }
    
  } catch (error) {
    console.error('Printer test error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Get available printers (for setup/debugging)
export async function getAvailablePrinters(): Promise<string[]> {
  try {
    // This would require additional system integration
    // For now, return common POS58 printer names
    return [
      'POS-58',
      'POS58',
      'Thermal Printer',
      'USB Receipt Printer'
    ]
  } catch (error) {
    console.error('Error getting printers:', error)
    return []
  }
}

// Printer status check
export async function getPrinterStatus(useDirectUSB: boolean = true): Promise<{
  connected: boolean
  error?: string
  printerName?: string
}> {
  try {
    const printer = initializePrinter(0)
    const isConnected = await printer.isPrinterConnected()
    
    return {
      connected: isConnected,
      printerName: useDirectUSB ? 'Direct USB POS58' : 'Serial POS58'
    }
    
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}