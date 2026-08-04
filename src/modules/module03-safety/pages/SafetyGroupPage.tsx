import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import type { SafetyGroupId } from '../types/safety.types'
import { SAFETY_GROUP_MAP } from '../data/safetyGroups'
import { getScenarioForGroup, getAllSafetyRecords } from '../services/safetyDashboard.service'
import { mergeSafetyRecordsWithAi } from '../services/safetyAiEvents.service'
import { useSafetyAiEvents } from '../hooks/useSafetyAiEvents'
import { SafetyViolationTable } from '../components/dashboard/SafetyViolationTable'
import { SafetyEventsCollapsedSummary } from '../components/dashboard/SafetyEventsCollapsedSummary'
import { GROUP_COLORS, GROUP_ICONS } from '../utils/safetyDashboardUi'
import { SAFETY_DEMO_TODAY } from '../data/safetyDemoDate'
import { cn } from '@/utils/cn'

const VALID_GROUPS: SafetyGroupId[] = ['PPE', 'WAH', 'DZ', 'ATGT', 'BPTC', 'PCCC']

export function SafetyGroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [eventsOpen, setEventsOpen] = useState(true)
  const validId = VALID_GROUPS.includes(groupId as SafetyGroupId) ? groupId as SafetyGroupId : 'WAH'
  const group = SAFETY_GROUP_MAP.get(validId)!
  const Icon = GROUP_ICONS[validId]
  const scenarios = getScenarioForGroup(validId)
  const aiLiveRecords = useSafetyAiEvents(5000)
  const allRecords = useMemo(
    () => mergeSafetyRecordsWithAi(getAllSafetyRecords(), aiLiveRecords),
    [aiLiveRecords],
  )

  const records = useMemo(
    () => allRecords.filter(
      v => v.groupId === validId
        && (v.detectedAt.startsWith(SAFETY_DEMO_TODAY) || v.id.startsWith('ai-')),
    ),
    [validId, allRecords],
  )

  const automationStats = useMemo(() => {
    const counts = { AUTOMATIC: 0, AI_ASSISTED: 0, HSE_VERIFICATION: 0 }
    records.forEach(v => {
      const s = scenarios.find(sc => sc.id === v.scenarioId)
      if (s) counts[s.automationLevel]++
    })
    return counts
  }, [records, scenarios])

  const criticalCount = records.filter(v => v.severity === 'CRITICAL').length

  return (
    <PageLayout>
      <div className="px-3 pt-2 shrink-0">
        <Link to="/module03" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary mb-2">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-[#111827] flex items-center justify-center">
            <Icon className={cn('w-5 h-5', GROUP_COLORS[validId])} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">{validId}</p>
            <h1 className="text-sm font-bold text-foreground">{group.name}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 shrink-0">
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">Vi phạm</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{records.length}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">AI tự động</p>
          <p className="text-xl font-bold text-green-400 tabular-nums">{automationStats.AUTOMATIC}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">AI đề xuất</p>
          <p className="text-xl font-bold text-amber-400 tabular-nums">{automationStats.AI_ASSISTED}</p>
        </div>
        <div className="rounded-lg border border-[#1e2433] p-2 bg-[#0b0f1a]">
          <p className="text-[8px] text-muted-foreground">HSE xác minh</p>
          <p className="text-xl font-bold text-violet-400 tabular-nums">{automationStats.HSE_VERIFICATION}</p>
        </div>
      </div>

      <Panel title="Kịch bản giám sát" expandable noPadding className="mx-3 shrink-0">
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
          {scenarios.map(s => {
            const count = records.filter(v => v.scenarioId === s.id).length
            return (
              <div key={s.id} className="rounded border border-[#1e2433] p-2 bg-[#0a0e17]">
                <p className="text-[9px] font-mono text-muted-foreground">{s.id}</p>
                <p className="text-[10px] font-medium text-foreground">{s.name}</p>
                <p className="text-[9px] text-muted-foreground mt-1">{count} sự kiện hôm nay</p>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className={cn('mx-3 flex flex-col', eventsOpen ? 'flex-1 min-h-[320px]' : 'shrink-0')}>
        <Panel
          title="Sự Kiện Nhóm"
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
                label="Sự Kiện Nhóm"
              />
            </div>
          }
        >
          {eventsOpen && (
            <SafetyViolationTable records={records} />
          )}
        </Panel>
      </div>
    </PageLayout>
  )
}
