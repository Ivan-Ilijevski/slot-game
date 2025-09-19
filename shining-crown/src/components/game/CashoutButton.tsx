'use client'

import { useState } from 'react'
import { formatCurrency } from './CurrencyUtils'

export interface CashoutButtonProps {
  balance: number
  currency: string
  onCashoutSuccess?: (result: any) => void
  onCashoutError?: (error: string) => void
  disabled?: boolean
  className?: string
  useUSB?: boolean
  machineId?: string
}

export default function CashoutButton({
  balance,
  currency,
  onCashoutSuccess,
  onCashoutError,
  disabled = false,
  className = '',
  useUSB = false,
  machineId = 'SHINING-CROWN-001'
}: CashoutButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [printerStatus, setPrinterStatus] = useState<{
    connected: boolean
    error?: string
  } | null>(null)

  // Check if cashout is available
  const minCashout = 10
  const canCashout = balance >= minCashout && !disabled && !isProcessing

  // Check printer status
  const checkPrinter = async () => {
    try {
      const response = await fetch(`/api/printer/test?usb=${useUSB}`)
      const data = await response.json()
      setPrinterStatus(data.printer)
      return data.printer.connected
    } catch (error) {
      setPrinterStatus({ connected: false, error: 'Failed to check printer' })
      return false
    }
  }

  // Process cashout
  const processCashout = async () => {
    if (!canCashout) return

    setIsProcessing(true)
    setShowConfirmDialog(false)

    try {
      // Check printer before cashout
      const printerConnected = await checkPrinter()
      if (!printerConnected) {
        const error = 'Printer not connected. Please check printer connection.'
        onCashoutError?.(error)
        setIsProcessing(false)
        return
      }

      // Process cashout
      const response = await fetch('/api/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: balance,
          useUSB,
          machineId
        }),
      })

      const data = await response.json()

      if (data.success) {
        console.log('Cashout successful:', data)
        onCashoutSuccess?.(data)
      } else {
        console.error('Cashout failed:', data.error)
        onCashoutError?.(data.error || 'Cashout failed')
      }

    } catch (error) {
      console.error('Cashout error:', error)
      onCashoutError?.('Network error. Please try again.')
    }

    setIsProcessing(false)
  }

  // Test printer connection
  const testPrinter = async () => {
    try {
      setIsProcessing(true)
      
      const response = await fetch('/api/printer/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ useUSB }),
      })

      const data = await response.json()

      if (data.success) {
        alert('Printer test successful! Check your printer for the test receipt.')
        setPrinterStatus({ connected: true })
      } else {
        alert(`Printer test failed: ${data.error}`)
        setPrinterStatus({ connected: false, error: data.error })
      }

    } catch (error) {
      alert('Failed to test printer connection.')
      setPrinterStatus({ connected: false, error: 'Network error' })
    }

    setIsProcessing(false)
  }

  return (
    <div className={`cashout-controls ${className}`}>
      {/* Cashout Button */}
      <button
        onClick={() => setShowConfirmDialog(true)}
        disabled={!canCashout}
        className={`
          cashout-button px-6 py-3 rounded-lg font-bold text-white transition-all duration-200
          ${canCashout 
            ? 'bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:scale-105' 
            : 'bg-gray-500 cursor-not-allowed opacity-50'
          }
          ${isProcessing ? 'animate-pulse' : ''}
        `}
      >
        {isProcessing ? (
          <>
            <span className="inline-block animate-spin mr-2">⏳</span>
            Processing...
          </>
        ) : (
          <>
            💵 CASHOUT
            {canCashout && (
              <div className="text-sm font-normal">
                {formatCurrency(balance)} {currency}
              </div>
            )}
          </>
        )}
      </button>

      {/* Printer Test Button */}
      <button
        onClick={testPrinter}
        disabled={isProcessing}
        className="test-printer-button px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:bg-gray-500 disabled:cursor-not-allowed ml-2"
      >
        🖨️ Test Printer
      </button>

      {/* Printer Status Indicator */}
      {printerStatus && (
        <div className={`printer-status mt-2 text-sm ${
          printerStatus.connected ? 'text-green-400' : 'text-red-400'
        }`}>
          🖨️ {printerStatus.connected ? 'Printer Ready' : `Printer Error: ${printerStatus.error}`}
        </div>
      )}

      {/* Cashout unavailable message */}
      {!canCashout && !isProcessing && (
        <div className="cashout-message mt-2 text-sm text-gray-400">
          {balance < minCashout 
            ? `Minimum cashout: ${formatCurrency(minCashout)} ${currency}`
            : disabled 
            ? 'Cashout currently unavailable'
            : 'No balance to cash out'
          }
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirmation-dialog fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="dialog-content bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Cashout</h3>
            
            <div className="cashout-details text-white mb-6">
              <p className="mb-2">You are about to cash out:</p>
              <p className="text-2xl font-bold text-green-400">
                {formatCurrency(balance)} {currency}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                A receipt will be printed. Present it to the cashier.
              </p>
            </div>

            <div className="dialog-buttons flex gap-4">
              <button
                onClick={processCashout}
                disabled={isProcessing}
                className="confirm-button flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold disabled:bg-gray-500"
              >
                {isProcessing ? 'Processing...' : 'Confirm Cashout'}
              </button>
              
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={isProcessing}
                className="cancel-button flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg font-bold disabled:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}