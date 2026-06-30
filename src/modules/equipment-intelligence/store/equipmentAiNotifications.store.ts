import { create } from 'zustand'
import { CEO_DASHBOARD_MOCK } from '../ceo-dashboard/data/mockCeoDashboard'
import type { AiRecommendationRow } from '../ceo-dashboard/types'

const SORTED_ITEMS = [...CEO_DASHBOARD_MOCK.aiRecommendations].sort(
  (a, b) => b.riskScorePct - a.riskScorePct,
)

interface EquipmentAiNotificationsState {
  items: AiRecommendationRow[]
  unreadIds: string[]
  dropdownOpen: boolean
  drawerOpen: boolean
  selectedItem: AiRecommendationRow | null
  setDropdownOpen: (open: boolean) => void
  openDrawer: (item: AiRecommendationRow) => void
  closeDrawer: () => void
  markRead: (id: string) => void
  unreadCount: () => number
}

export const useEquipmentAiNotifications = create<EquipmentAiNotificationsState>((set, get) => ({
  items: SORTED_ITEMS,
  unreadIds: SORTED_ITEMS.map(i => i.id),
  dropdownOpen: false,
  drawerOpen: false,
  selectedItem: null,
  setDropdownOpen: (dropdownOpen) => set({ dropdownOpen }),
  openDrawer: (item) => set({
    selectedItem: item,
    drawerOpen: true,
    dropdownOpen: false,
    unreadIds: get().unreadIds.filter(id => id !== item.id),
  }),
  closeDrawer: () => set({ drawerOpen: false }),
  markRead: (id) => set({ unreadIds: get().unreadIds.filter(x => x !== id) }),
  unreadCount: () => get().unreadIds.length,
}))
