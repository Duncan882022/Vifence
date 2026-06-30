import { useMemo } from 'react'
import { getTenantById, tenantHasDemoData } from '@/data/tenants'
import { useTenantStore } from '@/store/tenant.store'
import { TRAINING_COURSES } from '@/modules/module02-training/components/TrainingCourseAccordion'
import { TRAINING_ATTENDEES } from '@/modules/module02-training/components/TrainingEventTable'

export function useActiveTenant() {
  const activeTenantId = useTenantStore(s => s.activeTenantId)
  const activeTenant = getTenantById(activeTenantId)
  const hasDemoData = tenantHasDemoData(activeTenantId)

  return {
    activeTenantId,
    activeTenant,
    hasDemoData,
    tenantName: activeTenant?.name ?? activeTenantId,
  }
}

export function useTenantTrainingScope() {
  const { activeTenantId, hasDemoData, tenantName, activeTenant } = useActiveTenant()

  const attendees = useMemo(
    () => (hasDemoData ? TRAINING_ATTENDEES : []),
    [hasDemoData],
  )

  const courses = useMemo(
    () => (hasDemoData ? TRAINING_COURSES : []),
    [hasDemoData],
  )

  return {
    activeTenantId,
    activeTenant,
    tenantName,
    hasDemoData,
    attendees,
    courses,
  }
}
