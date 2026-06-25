import { useEffect } from 'react'
import { useAppStore } from '@/store/app.store'
import { useMediaQuery } from './useMediaQuery'

const DESKTOP_QUERY = '(min-width: 1024px)'

export function useShellLayout() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const {
    sidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
    closeMobileNav,
  } = useAppStore()

  const sidebarInset = isDesktop ? (sidebarCollapsed ? 56 : 200) : 0

  useEffect(() => {
    if (isDesktop && mobileNavOpen) closeMobileNav()
  }, [isDesktop, mobileNavOpen, closeMobileNav])

  return {
    isDesktop,
    sidebarInset,
    mobileNavOpen,
    openMobileNav: () => setMobileNavOpen(true),
    closeMobileNav,
    toggleMobileNav: () => setMobileNavOpen(!mobileNavOpen),
  }
}
