interface WindowWithOpera extends Window {
  opera?: string
}

export const isMobile = (): boolean => {
  if (typeof window === 'undefined') return false
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as WindowWithOpera).opera || ''
  
  // Check for mobile devices
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
  const isMobileDevice = mobileRegex.test(userAgent)
  
  // Check for touch capability
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  
  // Check screen size (typical mobile breakpoint)
  const isSmallScreen = window.innerWidth <= 768
  
  return isMobileDevice || (hasTouchScreen && isSmallScreen)
}

export const isTablet = (): boolean => {
  if (typeof window === 'undefined') return false
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as WindowWithOpera).opera || ''
  const tabletRegex = /iPad|Android(?!.*Mobile)/i
  
  return tabletRegex.test(userAgent) && window.innerWidth >= 768
}

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false
  
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}