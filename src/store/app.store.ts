import { create } from 'zustand'
import type { User } from '@/types/user'

interface AppState {
  user: User | null
  sidebarCollapsed: boolean
  notifications: number
  setUser: (user: User | null) => void
  toggleSidebar: () => void
  setNotifications: (count: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: {
    id: 'u-01',
    name: 'Nguyễn Quản Lý',
    email: 'admin@vifence.vn',
    role: 'admin',
  },
  sidebarCollapsed: true,
  notifications: 3,
  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setNotifications: (notifications) => set({ notifications }),
}))
