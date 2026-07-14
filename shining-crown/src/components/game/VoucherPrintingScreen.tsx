'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/utils/currency'

interface VoucherPrintingScreenProps {
  amount: number
  currency: string
  onComplete: () => void
  onError: (error: string) => void
  isVisible: boolean
  // How the cash-out is being paid: 'voucher' prints a ticket, 'aft' sends the
  // credits to the player's card via the SAS host.
  method?: 'voucher' | 'aft'
}

export default function VoucherPrintingScreen({
  amount,
  currency,
  onComplete,
  onError,
  isVisible,
  method = 'voucher'
}: VoucherPrintingScreenProps) {
  const [stage, setStage] = useState<'preparing' | 'generating' | 'printing' | 'complete' | 'error'>('preparing')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isVisible) {
      setStage('preparing')
      setMessage('')
      setProgress(0)
      return
    }

    const isCard = method === 'aft'

    const simulateProcess = async () => {
      try {
        setStage('preparing')
        setMessage('Preparing cashout...')
        setProgress(10)
        await new Promise(resolve => setTimeout(resolve, 500))

        setStage('generating')
        setMessage(isCard ? 'Transferring to card...' : 'Generating voucher code...')
        setProgress(40)
        await new Promise(resolve => setTimeout(resolve, 1000))

        setStage('printing')
        setMessage(isCard ? 'Confirming transfer...' : 'Printing voucher ticket...')
        setProgress(80)
        await new Promise(resolve => setTimeout(resolve, 1500))

        setStage('complete')
        setMessage(isCard ? 'Credits sent to card!' : 'Voucher printed successfully!')
        setProgress(100)

        setTimeout(() => {
          onComplete()
        }, 2000)

      } catch (error) {
        setStage('error')
        setMessage(isCard ? 'Card transfer failed. Please try again.' : 'Printing failed. Please try again.')
        onError(isCard ? 'Card transfer failed' : 'Voucher printing failed')
      }
    }

    simulateProcess()
  }, [isVisible, method, onComplete, onError])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-8 max-w-lg w-full mx-4 text-center border-2 border-yellow-500">
        <h2 className="text-3xl font-bold text-white mb-4">CASHOUT</h2>
        <div className="text-4xl font-bold text-yellow-400 mb-6">
          {formatCurrency(amount)}
        </div>

        <div className="mb-6">
          <div className={`text-6xl mb-4 ${stage === 'printing' ? 'animate-pulse' : ''}`}>
            {stage === 'preparing' && '⏳'}
            {stage === 'generating' && '🎫'}
            {stage === 'printing' && '🖨️'}
            {stage === 'complete' && '✅'}
            {stage === 'error' && '❌'}
          </div>
          <div className={`text-xl font-semibold ${
            stage === 'complete' ? 'text-green-400' : 
            stage === 'error' ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {message}
          </div>
        </div>

        <div className="w-full bg-gray-700 rounded-full h-4 mb-4">
          <div 
            className="bg-yellow-500 h-4 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-lg text-gray-400">{progress}% Complete</div>

        {stage === 'complete' && (
          <div className="mt-6 text-green-400 text-lg">
            {method === 'aft' ? 'Credits added to your card' : 'Present ticket to cashier'}
          </div>
        )}
      </div>
    </div>
  )
}