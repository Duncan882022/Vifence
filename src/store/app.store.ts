import { create } from 'zustand'
import type { User } from '@/types/user'
import { IS_DEMO_AUTH } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service'

const GHPAGES_DEMO_USER: User = {
  id: 'demo-ghpages',
  username: 'demo',
  name: 'Demo Vifence',
  fullName: 'Demo Vifence',
  email: 'demo@vifence.vn',
  role: 'admin',
}

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

const getInitialUser = (): User | null => {
  if (IS_DEMO_AUTH) return GHPAGES_DEMO_USER

  try {
    const savedUser = localStorage.getItem('vifence_user')
    if (!savedUser) return null
    const parsed = JSON.parse(savedUser)

    return {
      id: parsed.id || '',
      username: parsed.username || '',
      fullName: parsed.fullName || '',
      name: parsed.fullName || parsed.name || parsed.username || '',
      email: parsed.email || '',
      phone: parsed.phone || null,
      avatarUrl: parsed.avatarUrl || null,
      avatar: parsed.avatarUrl || parsed.avatar,
      role: parsed.role?.code || parsed.role || 'user',
      roleId: parsed.roleId,
      roleDetail: parsed.role || parsed.roleDetail || null,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export const useAppStore = create<AppState>((set) => ({
  user: getInitialUser(),
  sidebarCollapsed: false,
  mobileNavOpen: false,
  notifications: 3,
  setUser: (user) => {
    if (IS_DEMO_AUTH) {
      set({ user: GHPAGES_DEMO_USER })
      return
    }
    if (user) {
      localStorage.setItem('vifence_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('vifence_user')
    }
    set({ user })
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  setNotifications: (notifications) => set({ notifications }),
}))
