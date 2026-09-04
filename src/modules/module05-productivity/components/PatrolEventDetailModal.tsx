import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Building2,
  Camera,
  Hash,
  History,
  ImageOff,
  Info,
  MapPin,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatVnDate } from '@/utils/vnDateTime'
import type { PatrolEvent } from '../data/patrolTypes'
import { PatrolEventSnapshot, preloadPatrolEventSnapshot } from './PatrolEventSnapshot'
import {
  fetchPatrolSubjectAppearances,
  formatAppearanceTimeRange,
  type PatrolAppearanceSegment,
} from '../services/patrolDayEvents.service'
import {
  fetchPatrolGalleryFaces,
  listCapturedGalleryFacePoses,
  resolveFrontGalleryFaceUrl,
  type PatrolGalleryFacePose,
} from '../services/patrolGalleryFaces.service'
import { resolveEventObjectDisplay, resolvePatrolPersonCardDisplay } from '../utils/patrolManualIdentityUi'
import { appearanceObservationStageLabel } from '../utils/patrolAppearanceTier'
import { resolveEventGalleryWorkerId } from '../utils/patrolIdentityEntity'
import {
  resolvePatrolAppearanceSubjectId,
  resolvePatrolEventDisplayMeta,
  resolvePatrolPersonStage,
  PATROL_PERSON_STAGE_META,
} from '../utils/patrolWorkforceEventLabels'
import { getPatrolEventLocationLabel } from '../utils/patrolEventsUi'
import { resolvePatrolCameraDisplayName } from '../data/patrolCameras'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

interface PatrolEventDetailModalProps {
  event: PatrolEvent | null
  /** Ngày lịch VN đang xem — bắt buộc để load lịch sử xuất hiện đúng ngày. */
  viewDate?: string
  onClose: () => void
}

interface PatrolInfoRow {
  icon?: LucideIcon
  avatarUrl?: string | null
  avatarActive?: boolean
  onAvatarClick?: () => void
  label: string
  value: string
  iconClassName?: string
}

function PatrolDetailRow({
  icon: Icon,
  avatarUrl,
  avatarActive,
  onAvatarClick,
  label,
  value,
  iconClassName,
}: PatrolInfoRow) {
  const showAvatar = Boolean(avatarUrl && onAvatarClick)
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      {showAvatar ? (
        <button
          type="button"
          onClick={onAvatarClick}
          className={cn(
            'w-7 h-7 rounded-md shrink-0 border overflow-hidden bg-[#0a0e17] transition-colors',
            avatarActive
              ? 'border-fuchsia-400/70 ring-1 ring-fuchsia-400/40'
              : 'border-[#1e2433] hover:border-fuchsia-400/50',
          )}
          aria-label="Xem ảnh quét mặt"
        >
          <img src={avatarUrl!} alt="" className="w-full h-full object-cover" />
        </button>
      ) : (
        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border border-[#1e2433] bg-[#0a0e17]">
          {Icon && <Icon className={cn('w-3.5 h-3.5', iconClassName)} aria-hidden />}
        </div>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[8px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
        <p className="text-[11px] text-foreground font-medium mt-0.5 leading-snug break-all">{value}</p>
      </div>
    </div>
  )
}

function splitInfoColumns(rows: PatrolInfoRow[]): [PatrolInfoRow[], PatrolInfoRow[]] {
  if (rows.length <= 1) return [rows, []]
  const mid = Math.ceil(rows.length / 2)
  return [rows.slice(0, mid), rows.slice(mid)]
}

function appearanceRowKey(segment: PatrolAppearanceSegment): string {
  if (segment.id != null) return String(segment.id)
  return `${segment.cameraId}-${segment.startedAt}`
}

function dedupeAppearanceSegments(segments: PatrolAppearanceSegment[]): PatrolAppearanceSegment[] {
  const seenKeys = new Set<string>()
  return segments.filter(segment => {
    const key = appearanceRowKey(segment)
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}

/** Lượt mới nhất thiếu ảnh — lấy từ thẻ sự kiện. */
function fillMissingNewestAppearanceSnapshot(
  segments: PatrolAppearanceSegment[],
  event: PatrolEvent,
): PatrolAppearanceSegment[] {
  const cardSnap = event.snapshotUrl?.trim()
  if (!cardSnap || segments.length === 0) return segments
  const [newest, ...rest] = segments
  if (newest.snapshotUrl?.trim()) return segments
  return [{ ...newest, snapshotUrl: cardSnap }, ...rest]
}

function resolveRowSnapshotUrl(
  segment: PatrolAppearanceSegment,
  event: PatrolEvent,
  isNewestSegment: boolean,
): string | undefined {
  const appearance = segment.snapshotUrl?.trim()
  if (appearance) return appearance
  const card = event.snapshotUrl?.trim()
  if (isNewestSegment && card) return card
  return card || undefined
}

function resolveAppearanceGps(segment: PatrolAppearanceSegment): { lat: number; lng: number } {
  const lat = segment.gpsLat ?? segment.gpsLatEnd ?? null
  const lng = segment.gpsLng ?? segment.gpsLngEnd ?? null
  if (lat != null && lng != null && lat !== 0 && lng !== 0
    && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}

function resolveAppearanceCameraLabel(segment: PatrolAppearanceSegment): string {
  return getPatrolEventLocationLabel(
    resolvePatrolCameraDisplayName(segment.cameraId) || segment.cameraId,
    segment.zoneId ?? '',
    segment.cameraId,
  )
}

function resolveObjectEventCode(event: PatrolEvent): string {
  const fromCard = event.id.match(/^obj:(.+)$/i)?.[1]?.trim()
  if (fromCard) return fromCard
  const oid = event.objectId?.trim()
  if (oid) return oid
  return event.id
}

function resolveEventDisplayName(
  event: PatrolEvent,
  objectDisplay: ReturnType<typeof resolveEventObjectDisplay>,
): string | null {
  const fromManual = objectDisplay.label?.trim()
  if (fromManual && fromManual !== 'Đối tượng' && fromManual !== 'Unknown') return fromManual
  const fromEvent = event.violationLabel?.trim() || event.objectLabel?.trim()
  if (fromEvent && fromEvent !== 'Đối tượng') return fromEvent
  return null
}

function resolvePrimaryCameraLabel(
  event: PatrolEvent,
  appearanceCameras: string[],
): string | null {
  const locationLabel = getPatrolEventLocationLabel(
    event.cameraName,
    event.zoneName,
    event.cameraId,
  ).trim()
  if (locationLabel) return locationLabel
  if (appearanceCameras.length > 0) {
    const id = appearanceCameras[0]
    return getPatrolEventLocationLabel('', event.zoneName, id)
  }
  return null
}

export function PatrolEventDetailModal({ event, viewDate, onClose }: PatrolEventDetailModalProps) {
  const [appearanceSegments, setAppearanceSegments] = useState<PatrolAppearanceSegment[]>([])
  const [appearancesLoading, setAppearancesLoading] = useState(false)
  const [selectedAppearanceKey, setSelectedAppearanceKey] = useState<string | null>(null)
  const [facePoses, setFacePoses] = useState<PatrolGalleryFacePose[]>([])
  const [faceGalleryOpen, setFaceGalleryOpen] = useState(false)
  const [selectedFaceSlot, setSelectedFaceSlot] = useState<number | null>(null)

  useEffect(() => {
    if (!event) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [event, onClose])

  useEffect(() => {
    setSelectedAppearanceKey(null)
    setFaceGalleryOpen(false)
    setSelectedFaceSlot(null)
    setFacePoses([])
  }, [event?.id, viewDate])

  useEffect(() => {
    if (!event) {
      setAppearanceSegments([])
      setAppearancesLoading(false)
      return
    }
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile' && stage !== 'object') {
      setAppearanceSegments([])
      setAppearancesLoading(false)
      return
    }
    const subjectId = resolvePatrolAppearanceSubjectId(event)
    const appearanceDate = viewDate ?? formatVnDate(new Date(event.lockedAt || event.startedAt))
    let cancelled = false
    setAppearancesLoading(true)
    void fetchPatrolSubjectAppearances(subjectId, appearanceDate).then(segments => {
      if (cancelled) return
      const sorted = dedupeAppearanceSegments(
        fillMissingNewestAppearanceSnapshot(
          [...segments].sort((a, b) => b.startedAt - a.startedAt),
          event,
        ),
      )
      setAppearanceSegments(sorted)
      setAppearancesLoading(false)
    })
    return () => { cancelled = true }
  }, [event?.id, viewDate])

  useEffect(() => {
    if (!event) return
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'profile') return
    const objectDisplay = resolveEventObjectDisplay(event)
    const galleryWorkerId = resolveEventGalleryWorkerId(event, objectDisplay.workerId)
    if (!galleryWorkerId) return
    let cancelled = false
    void fetchPatrolGalleryFaces(galleryWorkerId).then(poses => {
      if (cancelled) return
      setFacePoses(poses)
      const captured = listCapturedGalleryFacePoses(poses)
      if (captured[0]) setSelectedFaceSlot(captured[0].slot)
    })
    return () => { cancelled = true }
  }, [event?.id])

  const capturedFacePoses = useMemo(
    () => listCapturedGalleryFacePoses(facePoses),
    [facePoses],
  )
  const frontFaceUrl = useMemo(
    () => resolveFrontGalleryFaceUrl(facePoses),
    [facePoses],
  )

  const handleFaceAvatarClick = useCallback(() => {
    setFaceGalleryOpen(open => !open)
    setSelectedAppearanceKey(null)
  }, [])

  const summary = useMemo(() => {
    if (!event) return null
    const stage = resolvePatrolPersonStage(event)
    const stageMeta = PATROL_PERSON_STAGE_META[stage]
    const cardDisplay = resolvePatrolPersonCardDisplay(event)
    const objectDisplay = resolveEventObjectDisplay(event)
    const appearanceCameraIds = [...new Set(appearanceSegments.map(s => s.cameraId))]
    const cameraLabel = resolvePrimaryCameraLabel(event, appearanceCameraIds)

    const infoRows: PatrolInfoRow[] = []
    const displayName = resolveEventDisplayName(event, objectDisplay)
    if (stage === 'profile') {
      if (displayName) {
        infoRows.push({
          avatarUrl: frontFaceUrl,
          avatarActive: faceGalleryOpen,
          onAvatarClick: frontFaceUrl ? handleFaceAvatarClick : undefined,
          icon: User,
          label: 'Họ tên',
          value: displayName,
          iconClassName: 'text-fuchsia-400',
        })
      }
      if (objectDisplay.workerId) {
        infoRows.push({
          icon: Hash,
          label: 'Mã nhân viên',
          value: objectDisplay.workerId,
          iconClassName: 'text-sky-400',
        })
      }
      if (objectDisplay.unit) {
        infoRows.push({
          icon: Building2,
          label: 'Đơn vị',
          value: objectDisplay.unit,
          iconClassName: 'text-amber-400/90',
        })
      }
    } else if (stage === 'person') {
      if (cardDisplay.workerId) {
        infoRows.push({
          icon: Hash,
          label: 'Mã theo dõi',
          value: cardDisplay.workerId,
          iconClassName: 'text-orange-400',
        })
      }
    } else {
      infoRows.push({
        icon: Hash,
        label: 'Mã',
        value: resolveObjectEventCode(event),
        iconClassName: 'text-stone-400',
      })
    }

    if (cameraLabel) {
      infoRows.push({
        icon: Camera,
        label: 'Vị trí',
        value: cameraLabel,
        iconClassName: 'text-cyan-400',
      })
    }

    const [infoPrimary, infoSecondary] = splitInfoColumns(infoRows)

    return {
      stage,
      stageMeta,
      cardDisplay,
      infoPrimary,
      infoSecondary,
    }
  }, [event, appearanceSegments, frontFaceUrl, faceGalleryOpen, handleFaceAvatarClick])

  const selectedFaceUrl = useMemo(() => {
    if (selectedFaceSlot != null) {
      const picked = capturedFacePoses.find(p => p.slot === selectedFaceSlot)?.url
      if (picked) return picked
    }
    return frontFaceUrl
  }, [capturedFacePoses, frontFaceUrl, selectedFaceSlot])

  const activeSnapshotUrl = useMemo(() => {
    if (faceGalleryOpen) return undefined
    if (selectedAppearanceKey && event) {
      const idx = appearanceSegments.findIndex(s => appearanceRowKey(s) === selectedAppearanceKey)
      const segment = appearanceSegments[idx]
      if (segment) {
        return resolveRowSnapshotUrl(segment, event, idx === 0)
      }
    }
    // Chưa chọn lượt nào → ảnh của **thẻ vừa bấm**, không phải ảnh lượt mới nhất.
    // Hai chỗ này lấy từ hai bảng khác nhau: thẻ ngoài là `daily_events`/
    // `daily_objects` (làm mới liên tục khi bắt được khung mặt rõ hơn), còn dòng
    // lịch sử là `appearances` (đóng băng ảnh lúc bắt đầu lần gặp). Thẻ nào từng
    // là Đối tượng rồi thăng hạng thì hai ảnh khác nhau hẳn — thẻ mang khuôn mặt,
    // dòng lịch sử vẫn mang ảnh obj-* nguyên khối. Mở popup mà hiện ảnh lượt
    // mới nhất thì người dùng không thấy lại tấm mình vừa bấm.
    const card = event?.snapshotUrl?.trim()
    if (card) return card
    if (appearanceSegments.length > 0 && event) {
      return resolveRowSnapshotUrl(appearanceSegments[0], event, true)
    }
    return undefined
  }, [appearanceSegments, event, faceGalleryOpen, selectedAppearanceKey])

  if (!event || !summary) return null

  const meta = resolvePatrolEventDisplayMeta(event)
  const TypeIcon = meta.icon
  const stage = summary.stage
  const modalTitle = (stage === 'person' || stage === 'profile')
    ? summary.cardDisplay.title
    : event.violationLabel
  const hasAppearanceHistory = appearanceSegments.length > 0
  const showAppearanceHistory = (stage === 'person' || stage === 'profile' || stage === 'object')
    && (appearancesLoading || hasAppearanceHistory)
  const historySectionTitle = 'Lịch sử xuất hiện'
  const showSnapshotHero = Boolean(faceGalleryOpen && selectedFaceUrl)
    || Boolean(activeSnapshotUrl)
  const objectInfoOnly = stage === 'object'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'relative flex flex-col w-full max-h-[96dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#2a3855] bg-[#0a0e17] shadow-2xl shadow-black/60',
          showSnapshotHero ? 'sm:max-w-xl lg:max-w-2xl' : 'sm:max-w-md',
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrol-event-detail-title"
      >
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[#1e2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', meta.badge)}>
              <TypeIcon className={cn('w-3.5 h-3.5', meta.color)} aria-hidden />
            </div>
            <div className="min-w-0">
              <p id="patrol-event-detail-title" className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                {modalTitle}
              </p>
              {stage === 'profile' ? (
                summary.cardDisplay.subtitle !== '—' ? (
                  <p className="text-[9px] mt-0.5 truncate text-muted-foreground">
                    {summary.cardDisplay.subtitle}
                  </p>
                ) : null
              ) : (
                <p className="text-[9px] mt-0.5 truncate">
                  <span className={cn('font-medium', meta.color)}>{summary.stageMeta.label}</span>
                  {summary.cardDisplay.subtitle !== '—' ? (
                    <span className="text-muted-foreground">{` · ${summary.cardDisplay.subtitle}`}</span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1e2433] text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          {faceGalleryOpen && selectedFaceUrl && (
            <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 border-b border-[#1e2433]/70 bg-[#0a0e17] space-y-2">
              <div className="relative aspect-[4/3] max-h-[42vh] rounded-lg overflow-hidden border border-[#1e2433] bg-black">
                <img
                  src={selectedFaceUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              {capturedFacePoses.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {capturedFacePoses.map(pose => {
                    const selected = selectedFaceSlot === pose.slot
                    return (
                      <button
                        key={pose.slot}
                        type="button"
                        onClick={() => setSelectedFaceSlot(pose.slot)}
                        className={cn(
                          'shrink-0 flex flex-col items-center gap-1 rounded-md border p-1 transition-colors',
                          selected
                            ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/30'
                            : 'border-[#1e2433] bg-[#0a0e17] hover:border-fuchsia-400/40',
                        )}
                      >
                        <div className="w-14 h-14 rounded overflow-hidden bg-black">
                          <img
                            src={pose.url!}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[8px] text-muted-foreground max-w-[56px] truncate">
                          {pose.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {!faceGalleryOpen && showSnapshotHero && activeSnapshotUrl && (
            <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 border-b border-[#1e2433]/70 bg-[#0a0e17]">
              <PatrolEventSnapshot
                key={`${event.id}:${selectedAppearanceKey ?? 'event'}:${activeSnapshotUrl}`}
                event={event}
                snapshotUrl={activeSnapshotUrl}
                variant="detail"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3">
          {(summary.infoPrimary.length > 0 || summary.infoSecondary.length > 0) && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-violet-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  Thông tin
                </span>
              </div>
              {objectInfoOnly ? (
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                  {summary.infoPrimary.map(row => (
                    <PatrolDetailRow key={row.label} {...row} />
                  ))}
                  {summary.infoSecondary.map(row => (
                    <PatrolDetailRow key={row.label} {...row} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="space-y-3">
                    {summary.infoPrimary.map(row => (
                      <PatrolDetailRow key={row.label} {...row} />
                    ))}
                  </div>
                  {summary.infoSecondary.length > 0 && (
                    <div className="space-y-3">
                      {summary.infoSecondary.map(row => (
                        <PatrolDetailRow key={row.label} {...row} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showAppearanceHistory && (
            <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] px-3 py-2.5 space-y-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">
                  {historySectionTitle}
                </span>
              </div>
              {appearancesLoading && !hasAppearanceHistory ? (
                <p className="text-[9px] text-muted-foreground/70">Đang tải…</p>
              ) : (
                <div className="space-y-1.5 max-h-[min(42vh,320px)] overflow-y-auto overscroll-y-contain pr-0.5">
                  {appearanceSegments.map((segment, segmentIndex) => {
                    const rowKey = appearanceRowKey(segment)
                    const thumbUrl = resolveRowSnapshotUrl(segment, event, segmentIndex === 0)
                    const rowSelected = selectedAppearanceKey === rowKey
                    const gps = resolveAppearanceGps(segment)
                    const camLabel = resolveAppearanceCameraLabel(segment)
                    const observationTierLabel = appearanceObservationStageLabel(segment)

                    const selectRow = () => {
                      if (thumbUrl) preloadPatrolEventSnapshot(thumbUrl)
                      setSelectedAppearanceKey(prev => (prev === rowKey ? null : rowKey))
                      setFaceGalleryOpen(false)
                    }

                    return (
                      <div
                        key={rowKey}
                        className={cn(
                          'w-full rounded-lg border text-left transition-colors',
                          rowSelected
                            ? 'border-sky-400/50 bg-sky-500/10 ring-1 ring-sky-400/30'
                            : 'border-[#1e2433] bg-[#0a0e17]',
                        )}
                      >
                        <div className="flex items-stretch gap-2.5 px-2 py-2">
                        <button
                          type="button"
                          onClick={selectRow}
                          className={cn(
                            'relative shrink-0 self-stretch overflow-hidden rounded-md border bg-black transition-colors',
                            'w-[112px] min-h-[84px] aspect-[4/3]',
                            rowSelected
                              ? 'border-sky-400/60 ring-1 ring-sky-400/40'
                              : 'border-[#1e2433]/90 hover:border-sky-400/40',
                          )}
                          title="Xem ảnh evidence"
                          aria-label="Xem ảnh evidence"
                        >
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                              <ImageOff className="w-4 h-4" aria-hidden />
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={selectRow}
                          className="min-w-0 flex-1 space-y-1 py-0.5 text-left"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="text-[10px] tabular-nums font-semibold text-foreground shrink-0">
                              {formatAppearanceTimeRange(segment.startedAt, segment.endedAt)}
                            </span>
                            {segment.presenceSeq != null && segment.presenceSeq > 0 && (
                              <span className="text-[8px] text-sky-400/90 font-semibold shrink-0">
                                {`Lượt #${segment.presenceSeq}`}
                              </span>
                            )}
                            {segment.trackId && (
                              <span className="text-[8px] text-violet-400/90 font-mono truncate max-w-[88px]" title={segment.trackId}>
                                {segment.trackId}
                              </span>
                            )}
                            {segment.sessionId && (
                              <span className="text-[8px] text-emerald-400/90 font-mono truncate max-w-[120px]" title={segment.sessionId}>
                                {segment.sessionId}
                              </span>
                            )}
                            {segment.counted && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-green-400/15 text-green-400 font-semibold shrink-0 ml-auto">
                                Đã đếm
                              </span>
                            )}
                            {observationTierLabel && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-[#1a2235] text-muted-foreground font-semibold shrink-0">
                                {observationTierLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <Camera className="w-3 h-3 text-cyan-400/80 shrink-0" aria-hidden />
                            <span className="text-[9px] text-foreground/90 truncate">{camLabel}</span>
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 text-emerald-400/80 shrink-0" aria-hidden />
                            <span className="text-[9px] text-muted-foreground font-mono truncate">
                              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                              {(segment.gpsLat == null && segment.gpsLatEnd == null) && (
                                <span className="text-muted-foreground/60"> · mặc định</span>
                              )}
                            </span>
                          </div>
                        </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
