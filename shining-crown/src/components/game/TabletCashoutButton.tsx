'use client'

import { useState } from 'react'
import { Banknote } from 'lucide-react'

export interface TabletCashoutButtonProps {
  balance: number
  currency: string
  onCashoutSuccess?: (result: any) => void
  onCashoutError?: (error: string) => void
  disabled?: boolean
  className?: string
  useUSB?: boolean
  machineId?: string
}

export default function TabletCashoutButton({
  balance,
  currency,
  onCashoutSuccess,
  onCashoutError,
  disabled = false,
  className = '',
  useUSB = true,
  machineId = 'SHINING-CROWN-TABLET'
}: TabletCashoutButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  // Check if cashout is available
  const minCashout = 10
  const canCashout = balance >= minCashout && !disabled && !isProcessing

  // Process cashout
  const processCashout = async () => {
    if (!canCashout) return

    setIsProcessing(true)

    try {
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

  return (
    <button
      onClick={processCashout}
      disabled={!canCashout}
      className={`
        w-20 h-20 rounded-xl bg-transparent border-2 transition-all active:scale-95 touch-manipulation flex items-center justify-center
        ${canCashout 
          ? 'border-green-300 shadow-[0_0_15px_rgba(34,197,94,0.4)] text-green-400' 
          : 'border-gray-600 opacity-50 text-gray-600'
        }
        ${isProcessing ? 'animate-pulse' : ''}
        ${className}
      `}
      aria-label={canCashout ? `Cash out ${balance.toFixed(2)} ${currency}` : 'Cashout unavailable'}
    >
      {isProcessing ? (
        <div className="text-xs">⏳</div>
      ) : (
        <Banknote size={28} />
      )}
    </button>
  )
}