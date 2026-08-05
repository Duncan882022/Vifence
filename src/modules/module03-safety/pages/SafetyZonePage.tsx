import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { SAFETY_ZONE_MAP } from '../data/safetyZones'
import { MONITORING_DEVICE_MAP } from '../data/monitoringDevices'
import { MONITORING_PROFILE_MAP } from '../data/monitoringProfiles'
import {
  getZoneOpenCount,
  getZoneViolationsToday,
} from '../services/safetyDashboard.service'
import { useSafetyAiEvents } from '../hooks/useSafetyAiEvents'
import { SafetyViolationTable } from '../components/dashboard/SafetyViolationTable'
import { SafetyViolationDetailModal } from '../components/SafetyViolationDetailModal'
import { SafetySiteMap } from '../components/dashboard/SafetySiteMap'
import { SafetyEventsCollapsedSummary } from '../components/dashboard/SafetyEventsCollapsedSummary'
import { cn } from '@/utils/cn'
import type { SafetyViolationRecord } from '../types/safety.types'

export function SafetyZonePage() {
  const { zoneId } = useParams<{ zoneId: string }>()
  const [eventsOpen, setEventsOpen] = useState(true)
  const [detailRecord, setDetailRecord] = useState<SafetyViolationRecord | null>(null)
  const zone = zoneId ? SAFETY_ZONE_MAP.get(zoneId) : null
  const aiLiveRecords = useSafetyAiEvents(15000)
  const allRecords = aiLiveRecords

  const records = useMemo(
    () => (zoneId ? getZoneViolationsToday(zoneId, allRecords) : []),
    [zoneId, allRecords],
  )

  const openCount = zoneId ? getZoneOpenCount(zoneId, allRecords) : 0
  const criticalCount = records.filter(v => v.severity === 'CRITICAL').length

  if (!zone) {
    return (
      <PageLayout>
        <div className="p-6 text-center text-muted-foreground text-sm">Không tìm thấy khu vực</div>
      </PageLayout>
    )
  }

  const devices = zone.deviceIds.map(id => MONITORING_DEVICE_MAP.get(id)).filter(Boolean)
  const profiles = zone.monitoringProfileIds.map(id => MONITORING_PROFILE_MAP.get(id)).filter(Boolean)

  return (
    <PageLayout>
      <div className="px-3 pt-2 shrink-0">
        <Link to="/module03" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary mb-2">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <h1 className="text-sm font-bold text-foreground">{zone.name}</h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">{zone.id} · {zone.type === 'BUILDING' ? 'Công trình' : zone.type === 'ROAD' ? 'Giao thông nội bộ' : 'Khu đào'}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 shrink-0">
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">Vi phạm</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{records.length}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">Đang mở</p>
          <p className="text-xl font-bold text-amber-400 tabular-nums">{openCount}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">Thiết bị</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{devices.length}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">Profile</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{profiles.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-3 shrink-0 min-h-[280px]">
        <Panel title="Bản Đồ Khu Vực" noPadding className="min-h-[280px]">
          <SafetySiteMap
            records={allRecords}
            selectedZoneId={zoneId}
          />
        </Panel>

        <div className="flex flex-col gap-3 min-h-0">
          <Panel title="Monitoring Profile" expandable noPadding className="flex-1 min-h-0">
            <div className="p-3 space-y-2 text-[10px] max-h-[130px] overflow-y-auto">
              {profiles.map(p => p && (
                <div key={p.id} className="rounded border border-[#1e2433] p-2 bg-[#0a0e17]">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="text-muted-foreground mt-1">Nhóm: {p.groups.join(', ')}</p>
                  <p className="text-muted-foreground">{p.scenarios.length} kịch bản</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Thiết Bị Giám Sát" expandable noPadding className="flex-1 min-h-0">
            <ul className="p-3 space-y-1 text-[10px] max-h-[130px] overflow-y-auto">
              {devices.map(d => d && (
                <li key={d.id} className="flex justify-between text-muted-foreground border-b border-[#1e2433]/40 pb-1 last:border-0">
                  <span>{d.name}</span>
                  <span className={d.status === 'OFFLINE' ? 'text-red-400' : 'text-green-400'}>{d.status}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className={cn('px-3 flex flex-col', eventsOpen ? 'flex-1 min-h-[320px]' : 'shrink-0')}>
        <Panel
          title="Sự Kiện Khu Vực"
          fit={!eventsOpen}
          noPadding
          className={cn(eventsOpen ? 'flex-1 min-h-0' : 'shrink-0')}
          headerRight={
            <div className="flex items-center gap-2 min-w-0">
              {!eventsOpen && (
                <SafetyEventsCollapsedSummary count={records.length} criticalCount={criticalCount} />
              )}
              <TierCollapseButton
                open={eventsOpen}
                onToggle={() => setEventsOpen(open => !open)}
                label="Sự Kiện Khu Vực"
              />
            </div>
          }
        >
          {eventsOpen && (
            <SafetyViolationTable
              records={records}
              onSnapshotClick={setDetailRecord}
            />
          )}
        </Panel>
      </div>

      <SafetyViolationDetailModal
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
      />
    </PageLayout>
  )
}
