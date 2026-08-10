import { createContext, useContext, type ReactNode } from 'react'
import type { MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

export interface VmsDetectionFeed {
  active: boolean
  status: MobileAiConnectionStatus
  statusMsg?: string
  snapshot: VmsDetectionSnapshot | null
}

const VmsDetectionContext = createContext<VmsDetectionFeed | null>(null)

export function VmsDetectionProvider({
  value,
  children,
}: {
  value: VmsDetectionFeed | null
  children: ReactNode
}) {
  return (
    <VmsDetectionContext.Provider value={value}>
      {children}
    </VmsDetectionContext.Provider>
  )
}

export function useVmsDetections(): VmsDetectionFeed | null {
  return useContext(VmsDetectionContext)
}
