import { create } from 'zustand'
import type { User } from '@/types/user'

interface AppState {
  user: User | null
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  notifications: number
  setUser: (user: User | null) => void
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  closeMobileNav: () => void
  setNotifications: (count: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: {
    id: 'u-01',
    name: 'Nguyễn Quản Lý',
    email: 'admin@vifence.vn',
    role: 'admin',
  },
  sidebarCollapsed: false,
  mobileNavOpen: false,
  notifications: 3,
  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  setNotifications: (notifications) => set({ notifications }),
}))
