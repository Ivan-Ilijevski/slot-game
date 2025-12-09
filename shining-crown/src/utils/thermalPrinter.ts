import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer'

// macOS specific configurations for POS58
const MACOS_CONFIGS = [
  // Your actual printer name from terminal
  {
    name: 'STMicroelectronics_POS58_Printer_USB',
    config: {
      type: PrinterTypes.EPSON,
      interface: 'printer:STMicroelectronics_POS58_Printer_USB',
      characterSet: CharacterSet.PC852_LATIN2, // Use Latin2 for better compatibility
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
      characterSet: CharacterSet.PC852_LATIN2,
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
      characterSet: CharacterSet.PC852_LATIN2,
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
      characterSet: CharacterSet.PC852_LATIN2,
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
  voucherId?: string // Optional voucher ID from server
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

// Generate ESC/POS barcode commands using raw commands
function addBarcodeCommands(printer: any, ticketId: string): void {
  console.log(`🔍 addBarcodeCommands called with ticketId: "${ticketId}"`)
  
  try {
    printer.newLine()
    printer.alignCenter()
    
    console.log(`🖨️ Attempting to print barcode for: ${ticketId}`)
    
    // Set barcode height (in dots, 162 = ~20mm height)
    printer.raw(Buffer.from('\x1D\x68\xA2', 'binary')) // GS h 162
    
    // Set barcode width (2 = medium width)
    printer.raw(Buffer.from('\x1D\x77\x02', 'binary')) // GS w 2
    
    // Print barcode with HRI (Human Readable Interpretation) below
    printer.raw(Buffer.from('\x1D\x48\x02', 'binary')) // GS H 2 (print HRI below barcode)
    
    // Set font for HRI
    printer.raw(Buffer.from('\x1D\x66\x00', 'binary')) // GS f 0 (font A)
    
    // Print CODE128 barcode
    const barcodeCommand = Buffer.concat([
      Buffer.from('\x1D\x6B\x49', 'binary'), // GS k 73 (CODE128)
      Buffer.from([ticketId.length]), // Length byte
      Buffer.from(ticketId, 'ascii') // Data
    ])
    printer.raw(barcodeCommand)
    
    console.log(`✅ Barcode command sent successfully`)
    printer.newLine()
  } catch (error) {
    console.error('❌ Barcode generation failed:', error)
    // Fallback: print the ticket ID as text
    printer.newLine()
    printer.alignCenter()
    printer.println(`ID: ${ticketId}`)
    printer.newLine()
    console.log(`📝 Printed fallback text: ID: ${ticketId}`)
  }
}

// Format voucher ID for display (xx-xxxx-xxxx-xxxx-xxxx)
function formatVoucherId(voucherId: string): string {
  if (voucherId.length !== 18) {
    return voucherId // Return as-is if not expected length
  }
  
  return `${voucherId.slice(0, 2)}-${voucherId.slice(2, 6)}-${voucherId.slice(6, 10)}-${voucherId.slice(10, 14)}-${voucherId.slice(14, 18)}`
}

// Generate ESC/POS QR code commands using raw commands
function addQRCodeCommands(printer: any, data: string, label?: string): void {
  console.log(`🔍 addQRCodeCommands called with data: "${data}", label: "${label}"`)
  
  printer.newLine()
  printer.alignCenter()
  
  if (label) {
    printer.println(label)
    printer.newLine()
  }
  
  try {
    console.log(`🖨️ Attempting to print QR code for: ${data}`)
    
    // QR Code model 2
    printer.raw(Buffer.from('\x1D\x28\x6B\x04\x00\x31\x41\x32\x00', 'binary')) // GS ( k - QR Code model 2
    
    // QR Code size (8)
    printer.raw(Buffer.from('\x1D\x28\x6B\x03\x00\x31\x43\x08', 'binary')) // GS ( k - Module size 8
    
    // Error correction level H (30% - highest error correction)
    printer.raw(Buffer.from('\x1D\x28\x6B\x03\x00\x31\x45\x33', 'binary')) // GS ( k - Error correction H
    
    // Store QR code data
    const qrDataLength = data.length + 3
    const qrStoreCommand = Buffer.concat([
      Buffer.from('\x1D\x28\x6B', 'binary'), // GS ( k
      Buffer.from([qrDataLength & 0xFF, (qrDataLength >> 8) & 0xFF]), // Length (little endian)
      Buffer.from('\x31\x50\x30', 'binary'), // Function 180, store data
      Buffer.from(data, 'utf8') // QR data
    ])
    printer.raw(qrStoreCommand)
    
    // Print stored QR code
    printer.raw(Buffer.from('\x1D\x28\x6B\x03\x00\x31\x51\x30', 'binary')) // GS ( k - Print QR code
    
    console.log(`✅ QR code command sent successfully`)
  } catch (error) {
    console.error('❌ QR code generation failed:', error)
    // Fallback: print the voucher ID as text
    printer.println(`CODE: ${data}`)
    console.log(`📝 Printed fallback text: CODE: ${data}`)
  }
  
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

    // Clear any previous content and initialize properly
    printer.clear()
    
    // Initialize printer with proper character set
    printer.raw(Buffer.from('\x1B\x40', 'binary')) // ESC @ - Initialize printer
    printer.raw(Buffer.from('\x1B\x74\x12', 'binary')) // ESC t 18 - Set character set to PC852 (Latin2)
    
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
    
    // Voucher Code (if available)
    if (ticketData.voucherId) {
      printer.alignCenter()
      printer.newLine()
      printer.setTextSize(1, 1)
      printer.bold(true)
      printer.println('VOUCHER CODE:')
      printer.setTextSize(1, 2)
      printer.println(formatVoucherId(ticketData.voucherId))
      printer.bold(false)
      printer.setTextNormal()
      printer.drawLine()
    }
    
    // Instructions
    printer.alignCenter()
    printer.println('Valid for 30 days')
    printer.println('Present to cashier')
    printer.newLine()
    
    // Add voucher QR code (if available)
    if (ticketData.voucherId) {
      console.log(`🎫 Printing voucher QR code: ${ticketData.voucherId}`)
      addQRCodeCommands(printer, ticketData.voucherId, 'SCAN TO REDEEM:')
      printer.newLine()
    } else {
      console.log('⚠️ No voucher ID available for QR code')
    }
    
    
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