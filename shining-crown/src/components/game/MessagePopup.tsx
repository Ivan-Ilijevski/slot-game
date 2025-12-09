'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

interface MessagePopupProps {
  isVisible: boolean
  type: 'success' | 'error' | 'info' | 'warning'
  title?: string
  message: string
  onClose: () => void
  autoCloseDelay?: number // milliseconds, 0 = manual close only
}

export default function MessagePopup({
  isVisible,
  type,
  title,
  message,
  onClose,
  autoCloseDelay = 3000
}: MessagePopupProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true)
      
      // Auto-close after delay if specified
      if (autoCloseDelay > 0) {
        const timer = setTimeout(() => {
          onClose()
        }, autoCloseDelay)
        
        return () => clearTimeout(timer)
      }
    } else {
      setIsAnimating(false)
    }
  }, [isVisible, autoCloseDelay, onClose])

  // Handle keyboard events
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, onClose])

  if (!isVisible) return null

  // Get colors and icon based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-900/95',
          borderColor: 'border-green-500',
          textColor: 'text-green-100',
          iconColor: 'text-green-400',
          icon: CheckCircle
        }
      case 'error':
        return {
          bgColor: 'bg-red-900/95',
          borderColor: 'border-red-500',
          textColor: 'text-red-100',
          iconColor: 'text-red-400',
          icon: XCircle
        }
      case 'warning':
        return {
          bgColor: 'bg-orange-900/95',
          borderColor: 'border-orange-500',
          textColor: 'text-orange-100',
          iconColor: 'text-orange-400',
          icon: AlertTriangle
        }
      case 'info':
      default:
        return {
          bgColor: 'bg-blue-900/95',
          borderColor: 'border-blue-500',
          textColor: 'text-blue-100',
          iconColor: 'text-blue-400',
          icon: Info
        }
    }
  }

  const styles = getTypeStyles()
  const IconComponent = styles.icon

  return (
    <div 
      className={`
        fixed inset-0 z-50 flex items-center justify-center
        transition-all duration-300 ease-in-out
        ${isAnimating ? 'opacity-100' : 'opacity-0'}
      `}
      onClick={onClose}
    >

      <div 
        className={`
          relative min-w-96 max-w-lg mx-4 p-6 rounded-lg border-2 shadow-2xl
          transform transition-all duration-300 ease-in-out
          ${styles.bgColor} ${styles.borderColor} ${styles.textColor}
          ${isAnimating ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={`
            absolute top-3 right-3 p-1 rounded-full transition-colors
            hover:bg-white/10 ${styles.iconColor}
          `}
          aria-label="Close message"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="flex items-start space-x-4">
          {/* Icon */}
          <div className={`flex-shrink-0 ${styles.iconColor}`}>
            <IconComponent size={32} />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-lg font-bold mb-2 pr-6">
                {title}
              </h3>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message}
            </p>
          </div>
        </div>

        {/* Progress bar for auto-close */}
        {autoCloseDelay > 0 && (
          <div className="mt-4 w-full bg-white/20 rounded-full h-1 overflow-hidden">
            <div 
              className={`
                h-full transition-all ease-linear
                ${type === 'success' ? 'bg-green-400' : 
                  type === 'error' ? 'bg-red-400' : 
                  type === 'warning' ? 'bg-orange-400' : 'bg-blue-400'}
              `}
              style={{
                width: '100%',
                animation: `shrink ${autoCloseDelay}ms linear`
              }}
            />
          </div>
        )}
      </div>

      {/* Keyframes for progress bar animation */}
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}