import { useMemo, useState } from 'react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import {
  CameraModeToggle,
  type CameraPanelMode,
} from '@/components/common/CameraModeToggle/CameraModeToggle'
import { TierCollapseButton } from '@/modules/module02-training/components/TierCollapseButton'
import { TrainingCameraPanel } from '@/modules/module02-training/components/TrainingCameraPanel'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import {
  filterSafetyCameras,
  groupSafetyCamerasForSidebar,
  DEFAULT_SAFETY_CAMERA_IDS,
  SAFETY_CAMERA_FILTER_TABS,
  SAFETY_CAMERAS,
} from '../data/safetyCameras'
import { SafetyKpiStrip } from '../components/dashboard/SafetyKpiStrip'
import { SafetyOverviewCollapsedSummary } from '../components/dashboard/SafetyOverviewCollapsedSummary'
import { SafetyEventsCollapsedSummary } from '../components/dashboard/SafetyEventsCollapsedSummary'
import { SafetyEventsPanel } from '../components/dashboard/SafetyPriorityAlerts'
import { SafetyGroupGrid } from '../components/dashboard/SafetyGroupGrid'
import { SafetyGroupCollapsedSummary } from '../components/dashboard/SafetyGroupCollapsedSummary'
import { SafetyViolationTable } from '../components/dashboard/SafetyViolationTable'
import { CameraPlaybackPanel } from '@/components/common/CameraPlayback'
import { SafetyHandleConfirmDialog } from '../components/SafetyHandleConfirmDialog'
import { SafetyPlaybackModal } from '../components/SafetyPlaybackModal'
import type { SafetyDashboardFilters, SafetyViolationRecord, ViolationStatus } from '../types/safety.types'
import {
  computeDashboardKpis,
  computeGroupStats,
  filterViolations,
  getAllSafetyRecords,
  getPriorityAlerts,
  mergeViolationStatusOverrides,
} from '../services/safetyDashboard.service'
import { violationRecordToEvent } from '../utils/violationAdapter'
import {
  fetchSafetyCameraRecords,
  fetchSafetyRecordDetections,
  getSafetyDefaultPlaybackDate,
} from '../services/safetyCameraPlayback.service'
import type { Event } from '@/types/event'
import { useShellLayout } from '@/hooks/useShellLayout'
import { cn } from '@/utils/cn'

const DEFAULT_FILTERS: SafetyDashboardFilters = {
  dateRange: 'today',
  zoneId: null,
  groupId: null,
  scenarioId: null,
  status: null,
  searchQuery: undefined,
  quickFilter: null,
  eventSubjectType: null,
  deviceType: null,
  responsibleUnit: null,
  severity: null,
  advancedStatus: null,
  contractorId: null,
}

/** Tạm ẩn tier Sự Kiện Vi Phạm trên dashboard tổng quan */
const SHOW_VIOLATION_EVENTS_PANEL = false

type LowerPanel = 'none' | 'camera' | 'events'

export function SafetyDashboardPage() {
  const { isDesktop } = useShellLayout()
  const [filters] = useState<SafetyDashboardFilters>(DEFAULT_FILTERS)
  const [tier1Open, setTier1Open] = useState(true)
  const [groupPanelOpen, setGroupPanelOpen] = useState(true)
  const [lowerPanel, setLowerPanel] = useState<LowerPanel>('camera')
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [selectedCamId, setSelectedCamId] = useState<string | undefined>()
  const [cameraMode, setCameraMode] = useState<CameraPanelMode>('live')
  const [playbackModalEvent, setPlaybackModalEvent] = useState<Event | null>(null)
  const [activeStreamCount, setActiveStreamCount] = useState(12)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ViolationStatus>>({})
  const [handleTarget, setHandleTarget] = useState<SafetyViolationRecord | null>(null)

  const allRecords = useMemo(
    () => mergeViolationStatusOverrides(getAllSafetyRecords(), statusOverrides),
    [statusOverrides],
  )

  const tier2Open = lowerPanel === 'camera'
  const eventsPanelOpen = SHOW_VIOLATION_EVENTS_PANEL && lowerPanel === 'events'

  /** Pool chung Nhóm ATLĐ + Sự kiện — không bị cắt bởi filter nhóm đang chọn */
  const alertScope = useMemo(
    () => filterViolations(allRecords, { ...filters, groupId: null, scenarioId: null }),
    [allRecords, filters],
  )

  const kpis = useMemo(() => computeDashboardKpis(alertScope), [alertScope])
  const groupStats = useMemo(() => computeGroupStats(alertScope), [alertScope])
  const alerts = useMemo(() => getPriorityAlerts(alertScope), [alertScope])

  const handlePlayback = (v: SafetyViolationRecord) => {
    setPlaybackModalEvent(violationRecordToEvent(v))
    setSelectedId(v.id)
  }

  const handleSelectCamera = (cam: TrainingCamera) => {
    setSelectedCamId(cam.id)
  }

  const handleToggleCamera = () => {
    setLowerPanel(prev => (prev === 'camera' ? 'none' : 'camera'))
  }

  const handleHandleRequest = (v: SafetyViolationRecord) => {
    setHandleTarget(v)
  }

  const confirmHandled = () => {
    if (!handleTarget) return
    setStatusOverrides(prev => ({ ...prev, [handleTarget.id]: 'CLOSED' }))
    setHandleTarget(null)
  }

  const bothLowerCollapsed = lowerPanel === 'none'
  const groupPanelExpanded = isDesktop || groupPanelOpen

  return (
    <>
      <PageLayout>
        <Panel
          title="Tổng Quan"
          fit
          expandable={tier1Open}
          noPadding
          className="shrink-0"
          headerRight={
            <div className="flex items-center gap-2 min-w-0">
              {!tier1Open && (
                <SafetyOverviewCollapsedSummary
                  kpis={kpis}
                  groupTotal={groupStats.reduce((sum, g) => sum + g.total, 0)}
                />
              )}
              <TierCollapseButton
                open={tier1Open}
                onToggle={() => setTier1Open(open => !open)}
                label="Tổng Quan"
              />
            </div>
          }
        >
          {tier1Open && (
            <div className="p-2 sm:p-3 max-lg:overflow-x-hidden">
              <SafetyKpiStrip kpis={kpis} groupStats={groupStats} embedded />
            </div>
          )}
        </Panel>

        <div className={cn(
          'flex flex-col gap-3',
          'max-lg:flex-none',
          'lg:flex-1 lg:min-h-0 lg:overflow-hidden',
        )}>
          {/* Camera — ưu tiên chiều cao khi mở (LIVE phải thấy rõ, giống Module 02) */}
          <div className={cn(
            'flex flex-col min-h-0',
            tier2Open
              ? cn(
                'max-lg:flex-none max-lg:min-h-[280px]',
                cameraMode === 'playback' ? 'lg:flex-[13]' : 'lg:flex-[11]',
              )
              : 'shrink-0',
          )}>
            <Panel
              title="Camera"
              expandable={tier2Open}
              fit={!tier2Open}
              noPadding
              className={cn(
                tier2Open && 'lg:flex-1 lg:min-h-[260px]',
                tier2Open && 'max-lg:!h-auto max-lg:min-h-[280px] max-lg:overflow-visible max-lg:[&>div:last-child]:!h-auto',
                tier2Open && 'max-lg:[&>div:last-child]:flex-none max-lg:[&>div:last-child]:overflow-visible max-lg:[&>div:last-child]:min-h-[240px]',
                !tier2Open && 'max-lg:!h-auto max-lg:min-h-0',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  {tier2Open && (
                    <CameraModeToggle mode={cameraMode} onChange={setCameraMode} />
                  )}
                  {!tier2Open && cameraMode === 'live' && (
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      <span className="text-primary font-semibold">{activeStreamCount}</span> luồng
                    </span>
                  )}
                  <TierCollapseButton
                    open={tier2Open}
                    onToggle={handleToggleCamera}
                    label="Camera"
                  />
                </div>
              }
            >
              {tier2Open && (
                <div className={cn(
                  'flex flex-col flex-1 min-h-0 h-full w-full max-lg:min-h-[240px]',
                  cameraMode === 'live' && 'max-lg:h-auto max-lg:flex-none',
                  cameraMode === 'playback' && 'max-lg:h-auto max-lg:flex-none',
                )}>
                  {cameraMode === 'live' ? (
                    <TrainingCameraPanel
                      selectedId={selectedCamId}
                      onSelectCamera={handleSelectCamera}
                      onStreamCountChange={setActiveStreamCount}
                      cameras={SAFETY_CAMERAS}
                      defaultCameraIds={DEFAULT_SAFETY_CAMERA_IDS}
                      filterTabs={[...SAFETY_CAMERA_FILTER_TABS]}
                      filterFn={tab => filterSafetyCameras(tab as typeof SAFETY_CAMERA_FILTER_TABS[number])}
                      groupFn={(cams, tab) => groupSafetyCamerasForSidebar(cams, tab as typeof SAFETY_CAMERA_FILTER_TABS[number])}
                    />
                  ) : (
                    <CameraPlaybackPanel
                      cameras={SAFETY_CAMERAS}
                      selectedCameraId={selectedCamId}
                      onSelectCamera={handleSelectCamera}
                      defaultDate={getSafetyDefaultPlaybackDate()}
                      maxDate={getSafetyDefaultPlaybackDate()}
                      initialRecordId={undefined}
                      filterTabs={[...SAFETY_CAMERA_FILTER_TABS]}
                      filterFn={tab => filterSafetyCameras(tab as typeof SAFETY_CAMERA_FILTER_TABS[number])}
                      groupFn={(cams, tab) => groupSafetyCamerasForSidebar(cams, tab as typeof SAFETY_CAMERA_FILTER_TABS[number])}
                      fetchRecords={fetchSafetyCameraRecords}
                      fetchDetections={fetchSafetyRecordDetections}
                    />
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* Nhóm ATLĐ + Sự kiện — mobile & desktop: nhóm trước */}
          <div className={cn(
            'flex flex-col lg:flex-row gap-3 min-h-0',
            'max-lg:flex-none',
            bothLowerCollapsed
              ? 'lg:flex-1 lg:min-h-0'
              : tier2Open
                ? cameraMode === 'playback' ? 'lg:flex-[7]' : 'lg:flex-[9]'
                : eventsPanelOpen
                  ? 'lg:flex-[5]'
                  : 'lg:flex-1',
          )}>
            <div className={cn(
              'w-full lg:flex-[58] min-w-0 flex flex-col',
              bothLowerCollapsed
                ? 'lg:min-h-0 lg:flex-1'
                : 'max-lg:min-h-0 lg:min-h-0',
            )}>
              <Panel
                title="Nhóm ATLĐ"
                noPadding
                expandable={groupPanelExpanded}
                fit={!isDesktop || !groupPanelOpen}
                className={cn(
                  isDesktop && 'flex-1 min-h-0 overflow-hidden',
                  !isDesktop && 'shrink-0 max-lg:!h-auto',
                )}
                headerRight={
                  !isDesktop ? (
                    <div className="flex items-center gap-2 min-w-0">
                      {!groupPanelOpen && (
                        <SafetyGroupCollapsedSummary groupStats={groupStats} />
                      )}
                      <TierCollapseButton
                        open={groupPanelOpen}
                        onToggle={() => setGroupPanelOpen(open => !open)}
                        label="Nhóm ATLĐ"
                      />
                    </div>
                  ) : undefined
                }
              >
                {groupPanelExpanded && <SafetyGroupGrid stats={groupStats} />}
              </Panel>
            </div>

            <div className={cn(
              'w-full lg:flex-[42] min-w-0 flex flex-col',
              bothLowerCollapsed
                ? 'lg:min-h-0 lg:flex-1'
                : 'max-lg:min-h-[320px] lg:min-h-0',
            )}>
              <SafetyEventsPanel
                all={alerts.all}
                warning={alerts.warning}
                violation={alerts.violation}
                critical={alerts.critical}
                selectedGroupId={filters.groupId}
                onPlayback={handlePlayback}
                onSelect={v => setSelectedId(v.id)}
                onHandle={handleHandleRequest}
              />
            </div>
          </div>

          {SHOW_VIOLATION_EVENTS_PANEL && (
          <div className={cn(
            'w-full flex flex-col min-h-0',
            eventsPanelOpen
              ? 'max-lg:flex-none max-lg:min-h-[320px] lg:flex-[14] lg:min-h-0'
              : 'shrink-0',
          )}>
            <Panel
              title="Sự Kiện Vi Phạm"
              fit={!eventsPanelOpen}
              noPadding
              className={cn(
                eventsPanelOpen
                  ? 'flex-1 min-h-0 max-lg:!h-auto max-lg:min-h-[320px] lg:min-h-0'
                  : 'shrink-0',
                eventsPanelOpen && 'max-lg:[&>div:last-child]:!h-auto max-lg:[&>div:last-child]:min-h-[280px]',
              )}
              headerRight={
                <div className="flex items-center gap-2 min-w-0">
                  {!eventsPanelOpen && (
                    <SafetyEventsCollapsedSummary
                      count={filterViolations(allRecords, filters).length}
                      criticalCount={kpis.criticalCount}
                    />
                  )}
                  <TierCollapseButton
                    open={eventsPanelOpen}
                    onToggle={() => setLowerPanel(prev => (prev === 'events' ? 'none' : 'events'))}
                    label="Sự Kiện Vi Phạm"
                  />
                </div>
              }
            >
              {eventsPanelOpen && (
                <SafetyViolationTable
                  records={filterViolations(allRecords, filters)}
                  selectedId={selectedId}
                  onSelect={v => setSelectedId(v.id)}
                  onPlayback={handlePlayback}
                />
              )}
            </Panel>
          </div>
          )}
        </div>
      </PageLayout>

      <SafetyHandleConfirmDialog
        record={handleTarget}
        onClose={() => setHandleTarget(null)}
        onConfirm={confirmHandled}
      />

      <SafetyPlaybackModal
        open={playbackModalEvent != null}
        event={playbackModalEvent}
        onClose={() => setPlaybackModalEvent(null)}
      />
    </>
  )
}
