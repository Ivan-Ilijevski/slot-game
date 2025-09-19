import { exec } from 'child_process'
import { promisify } from 'util'
import { CashoutTicket } from './thermalPrinter'

const execAsync = promisify(exec)

// Raw printing using macOS lp command (like your terminal command)
export async function printCashoutTicketRaw(
  ticketData: CashoutTicket,
  printerName: string = 'STMicroelectronics_POS58_Printer_USB'
): Promise<{ success: boolean; error?: string; ticketId: string }> {
  try {
    console.log(`🖨️ Raw printing to: ${printerName}`)
    
    // Build receipt content with ESC/POS commands
    const escCodes = {
      INIT: '\\x1B\\x40',              // ESC @ - Initialize
      CHARSET: '\\x1B\\x74\\x49',     // ESC t I - Set character set to Cyrillic
      CENTER: '\\x1B\\x61\\x01',      // ESC a 1 - Center alignment
      LEFT: '\\x1B\\x61\\x00',        // ESC a 0 - Left alignment
      BOLD_ON: '\\x1B\\x45\\x01',     // ESC E 1 - Bold on
      BOLD_OFF: '\\x1B\\x45\\x00',    // ESC E 0 - Bold off
      DOUBLE_HEIGHT: '\\x1B\\x21\\x10', // ESC ! 0x10 - Double height
      DOUBLE_SIZE: '\\x1B\\x21\\x30',   // ESC ! 0x30 - Double width & height
      NORMAL: '\\x1B\\x21\\x00',      // ESC ! 0x00 - Normal size
      CUT: '\\x1D\\x56\\x42\\x00',    // GS V B 0 - Cut paper
      NEWLINE: '\\x0A',               // Line feed
      DOUBLELINEFD: '\\x0A\\x0A'      // Double line feed
    }
    
    // Convert text to CP1251 encoding for Cyrillic support
    const convertText = (text: string): string => {
      // Note: In a real implementation, you'd convert UTF-8 to CP1251
      // For now, we'll use the text as-is since your terminal command worked
      return text
    }
    
    // Build receipt content
    const receiptLines = [
      // Initialize and set charset
      escCodes.INIT,
      escCodes.CHARSET,
      
      // Header
      escCodes.CENTER,
      escCodes.BOLD_ON,
      escCodes.DOUBLE_HEIGHT,
      convertText('SHINING CROWN SLOT'),
      escCodes.NEWLINE,
      escCodes.BOLD_OFF,
      escCodes.NORMAL,
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Date and details
      escCodes.LEFT,
      convertText(`Date: ${ticketData.timestamp.toLocaleString()}`),
      escCodes.NEWLINE,
      convertText(`Machine: ${ticketData.machineId}`),
      escCodes.NEWLINE,
      convertText(`Ticket: #${ticketData.ticketId}`),
      escCodes.NEWLINE,
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Cashout amount
      escCodes.CENTER,
      escCodes.BOLD_ON,
      escCodes.DOUBLE_SIZE,
      convertText('CASHOUT VOUCHER'),
      escCodes.NEWLINE,
      convertText(`${ticketData.amount.toFixed(2)} ${ticketData.currency}`),
      escCodes.NEWLINE,
      escCodes.BOLD_OFF,
      escCodes.NORMAL,
      
      // Separator
      '================================',
      escCodes.NEWLINE,
      
      // Instructions
      escCodes.CENTER,
      convertText('Valid for 30 days'),
      escCodes.NEWLINE,
      convertText('Present to cashier'),
      escCodes.NEWLINE,
      
      // Barcode and QR code
      escCodes.NEWLINE,
      convertText('Ticket Barcode:'),
      escCodes.NEWLINE,
      generateBarcodeCommands(ticketData.ticketId),
      escCodes.NEWLINE,
      escCodes.NEWLINE,
      escCodes.NEWLINE,
      convertText('QR Code (Large):'),
      escCodes.NEWLINE,
      generateQRCodeCommands(ticketData.ticketId),
      escCodes.NEWLINE,
      escCodes.NEWLINE,
      
      // Footer
      '================================',
      escCodes.NEWLINE,
      convertText('Thank you for playing!'),
      escCodes.NEWLINE,
      convertText('Malfunction voids all pays'),
      escCodes.DOUBLELINEFD,
      
      // Cut paper
      escCodes.CUT
    ]
    
    // Join all parts
    const receiptContent = receiptLines.join('')
    
    // Create print command (similar to your terminal command)
    const printCommand = `printf '${receiptContent}' | lp -d "${printerName}" -o raw`
    
    console.log(`🖨️ Executing: ${printCommand}`)
    
    // Execute print command
    const { stdout, stderr } = await execAsync(printCommand)
    
    if (stderr && !stderr.includes('request id is')) {
      throw new Error(`Print command failed: ${stderr}`)
    }
    
    console.log(`✅ Print job submitted: ${stdout}`)
    
    return {
      success: true,
      ticketId: ticketData.ticketId
    }
    
  } catch (error) {
    console.error('❌ Raw printing failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Raw printing failed',
      ticketId: ticketData.ticketId
    }
  }
}

// Generate ESC/POS barcode commands for raw printing
function generateBarcodeCommands(ticketId: string): string {
  const commands = [
    // Set barcode height (162 dots ≈ 20mm)
    '\\x1D\\x68\\xA2',
    // Set barcode width (2 = medium)
    '\\x1D\\x77\\x02',
    // Print HRI below barcode
    '\\x1D\\x48\\x02',
    // Set HRI font
    '\\x1D\\x66\\x00',
    // Print CODE128 barcode
    `\\x1D\\x6B\\x49\\x${(ticketId.length).toString(16).padStart(2, '0')}${ticketId}`
  ]
  return commands.join('')
}

// Generate ESC/POS QR code commands for raw printing
function generateQRCodeCommands(ticketId: string): string {
  const dataLength = ticketId.length + 3
  const lengthLow = (dataLength & 0xFF).toString(16).padStart(2, '0')
  const lengthHigh = ((dataLength >> 8) & 0xFF).toString(16).padStart(2, '0')
  
  const commands = [
    // QR Code model 2
    '\\x1D\\x28\\x6B\\x04\\x00\\x31\\x41\\x32\\x00',
    // Module size 16 (MAXIMUM size for 58mm paper)
    '\\x1D\\x28\\x6B\\x03\\x00\\x31\\x43\\x10',
    // Error correction level M (better for large QR codes)
    '\\x1D\\x28\\x6B\\x03\\x00\\x31\\x45\\x31',
    // Store QR data
    `\\x1D\\x28\\x6B\\x${lengthLow}\\x${lengthHigh}\\x31\\x50\\x30${ticketId}`,
    // Print QR code
    '\\x1D\\x28\\x6B\\x03\\x00\\x31\\x51\\x30'
  ]
  return commands.join('')
}

// Test raw printing
export async function testRawPrinter(
  printerName: string = 'STMicroelectronics_POS58_Printer_USB'
): Promise<{ success: boolean; error?: string }> {
  try {
    const testTicketId = `TEST${Date.now().toString().slice(-6)}`
    
    // Test with barcode and QR code
    const testContent = [
      '\\x1B\\x40',  // Initialize
      '\\x1B\\x74\\x49',  // Set charset to Cyrillic
      '\\x1B\\x61\\x01',  // Center
      'TEST RECEIPT\\n',
      `Time: ${new Date().toLocaleString()}\\n`,
      '\\n',
      'Test Barcode:\\n',
      generateBarcodeCommands(testTicketId),
      '\\n\\n\\n',
      'Large QR Code Test:\\n',
      generateQRCodeCommands(testTicketId),
      '\\n\\n',
      '\\x1D\\x56\\x42\\x00'  // Cut
    ].join('')
    
    const testCommand = `printf '${testContent}' | lp -d "${printerName}" -o raw`
    
    console.log(`🧪 Testing raw printer with barcode/QR: ${printerName}`)
    
    const { stdout, stderr } = await execAsync(testCommand)
    
    if (stderr && !stderr.includes('request id is')) {
      throw new Error(`Test print failed: ${stderr}`)
    }
    
    console.log(`✅ Test print with barcode/QR submitted: ${stdout}`)
    
    return { success: true }
    
  } catch (error) {
    console.error('❌ Raw printer test failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Raw test failed'
    }
  }
}