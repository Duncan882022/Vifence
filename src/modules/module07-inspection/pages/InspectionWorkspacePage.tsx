import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Filter, ListTree, Save, ScanLine, Tablet } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'
import { DAM_HOP_ASSET_ID, INSPECTION_PROJECT } from '../data/inspectionProject'
import {
  computeCompleteness,
  countByKind,
  countByOrigin,
  countByStage,
  emptyKindHint,
  filterObjects,
  findAsset,
  missingPlanGaps,
  planChecklistsFor,
  relatedChecklists,
} from '../services/inspectionWorkspace.service'
import { findPackage } from '../services/inspectionNav'
import { flowPaths, resolveAsset } from '../services/workflow/flowNav'
import { BIM_PACKAGE_FOR_ASSET } from '../data/workflow/hnqnProject'
import { useInspectionWorkspace } from '../store/inspectionWorkspace.store'
import { workspaceIsLoading } from '../services/ifcFirstPaint'
import { KIND_META, PROVENANCE_META, STAGE_META, type InspectionStageId, type ObjectKind, type ObjectOrigin } from '../types'
import { BimViewer } from '../components/BimViewer'
import { ComponentTree } from '../components/ComponentTree'
import { FilterChips, PlanStatusChip, StageSelector } from '../components/StageSelector'
import { InspectionPanel } from '../components/InspectionPanel'

const KIND_OPTIONS = (Object.keys(KIND_META) as ObjectKind[]).map(id => ({
  id,
  label: KIND_META[id].label,
}))

const ORIGIN_OPTIONS: { id: ObjectOrigin; label: string }[] = [
  { id: 'extracted', label: PROVENANCE_META.extracted.label },
  { id: 'inferred', label: PROVENANCE_META.inferred.label },
]

export function InspectionWorkspacePage() {
  const { assetId: flowAssetId = 's002' } = useParams()
  const flowAsset = resolveAsset(flowAssetId)
  const packageId = BIM_PACKAGE_FOR_ASSET[flowAssetId] ?? DAM_HOP_ASSET_ID
  const pkg = findPackage(packageId)
  const asset = findAsset(pkg?.assetId ?? DAM_HOP_ASSET_ID)
  const project = INSPECTION_PROJECT
  const fileLabel = pkg?.file ?? 'DUL.ifc + SUON.ifc'

  const stageFilter = useInspectionWorkspace(s => s.stageFilter)
  const kindFilters = useInspectionWorkspace(s => s.kindFilters)
  const originFilters = useInspectionWorkspace(s => s.originFilters)
  const ifcObjects = useInspectionWorkspace(s => s.ifcObjects)
  const selectedIds = useInspectionWorkspace(s => s.selectedIds)
  const hoveredId = useInspectionWorkspace(s => s.hoveredId)
  const focusedChecklistId = useInspectionWorkspace(s => s.focusedChecklistId)
  const hoveredChecklistId = useInspectionWorkspace(s => s.hoveredChecklistId)
  const isolatedIds = useInspectionWorkspace(s => s.isolatedIds)
  const unsaved = useInspectionWorkspace(s => s.unsaved)
  const savedFlash = useInspectionWorkspace(s => s.savedFlash)
  const loadPhase = useInspectionWorkspace(s => s.loadPhase)
  const loadPct = useInspectionWorkspace(s => s.loadPct)
  const loadMessage = useInspectionWorkspace(s => s.loadMessage)
  const loadError = useInspectionWorkspace(s => s.loadError)
  const mode = useInspectionWorkspace(s => s.mode)

  const setAsset = useInspectionWorkspace(s => s.setAsset)
  const setStage = useInspectionWorkspace(s => s.setStage)
  const toggleKind = useInspectionWorkspace(s => s.toggleKind)
  const mergeIfcObjects = useInspectionWorkspace(s => s.mergeIfcObjects)
  const addSelected = useInspectionWorkspace(s => s.addSelected)
  const setSelected = useInspectionWorkspace(s => s.setSelected)
  const setHovered = useInspectionWorkspace(s => s.setHovered)
  const setHoveredChecklist = useInspectionWorkspace(s => s.setHoveredChecklist)
  const setFocusedChecklist = useInspectionWorkspace(s => s.setFocusedChecklist)
  const isolate = useInspectionWorkspace(s => s.isolate)
  const clearKinds = useInspectionWorkspace(s => s.clearKinds)
  const toggleOrigin = useInspectionWorkspace(s => s.toggleOrigin)
  const clearOrigins = useInspectionWorkspace(s => s.clearOrigins)
  const savePlan = useInspectionWorkspace(s => s.savePlan)
  const setLoad = useInspectionWorkspace(s => s.setLoad)
  const setMode = useInspectionWorkspace(s => s.setMode)
  const assignStage = useInspectionWorkspace(s => s.assignStage)

  const [supplementOpen, setSupplementOpen] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [stagePreview, setStagePreview] = useState<InspectionStageId | null>(null)
  /** 3 cột chỉ khi đủ rộng; iPad / mobile dùng bố cục xếp chồng + cây cấu kiện dạng drawer. */
  const wide = useMediaQuery('(min-width: 1280px)')

  useEffect(() => {
    if (asset) setAsset(asset.id)
  }, [asset, setAsset])

  const allObjects = ifcObjects
  const allChecklists = useMemo(
    () => planChecklistsFor(asset?.id ?? DAM_HOP_ASSET_ID, allObjects),
    [asset, allObjects],
  )
  const visibleObjects = useMemo(
    () => filterObjects(allObjects, stageFilter, kindFilters, originFilters),
    [allObjects, stageFilter, kindFilters, originFilters],
  )
  const visibleIds = useMemo(() => new Set(visibleObjects.map(o => o.id)), [visibleObjects])
  const kindCounts = useMemo(() => countByKind(allObjects), [allObjects])
  const originCounts = useMemo(() => countByOrigin(allObjects), [allObjects])
  const kindEmptyHint = useMemo(
    () => emptyKindHint(fileLabel, kindCounts, kindFilters),
    [fileLabel, kindCounts, kindFilters],
  )
  const selected = useMemo(() => allObjects.filter(o => selectedIds.includes(o.id)), [allObjects, selectedIds])
  const handleProgress = useCallback(
    (pct: number, message: string, phase: 'ifc' | 'parse' | 'stage') => setLoad(phase, pct, null, message),
    [setLoad],
  )
  const handleReady = useCallback(() => setLoad('ready', 100, null, ''), [setLoad])
  const handleError = useCallback((message: string) => setLoad('error', 0, message, message), [setLoad])

  const stageCounts = useMemo(() => ({
    gd1: {
      objects: countByStage(allObjects, 'gd1'),
      checklists: allChecklists.filter(c => c.stage === 'gd1').length,
      missing: allChecklists.filter(c => c.stage === 'gd1' && c.status === 'missing').length,
    },
    gd2: {
      objects: countByStage(allObjects, 'gd2'),
      checklists: allChecklists.filter(c => c.stage === 'gd2').length,
      missing: allChecklists.filter(c => c.stage === 'gd2' && c.status === 'missing').length,
    },
    gd3: {
      objects: countByStage(allObjects, 'gd3'),
      checklists: allChecklists.filter(c => c.stage === 'gd3').length,
      missing: allChecklists.filter(c => c.stage === 'gd3' && c.status === 'missing').length,
    },
  }), [allObjects, allChecklists])

  const completeness = useMemo(
    () => computeCompleteness(allObjects, allChecklists),
    [allObjects, allChecklists],
  )

  const highlightIds = useMemo(() => {
    const ids = new Set<string>()
    const clId = hoveredChecklistId ?? focusedChecklistId
    if (clId) {
      const item = allChecklists.find(c => c.id === clId)
      item?.objectIds.forEach(id => ids.add(id))
    }
    if (hoveredId) relatedChecklists(allChecklists, hoveredId, allObjects.find(o => o.id === hoveredId)).forEach(c => c.objectIds.forEach(id => ids.add(id)))
    if (stagePreview) allObjects.filter(o => o.stage === stagePreview).forEach(o => ids.add(o.id))
    return [...ids]
  }, [hoveredChecklistId, focusedChecklistId, hoveredId, allChecklists, stagePreview, allObjects])

  const handleViewBim = (checklistId: string) => {
    const item = allChecklists.find(c => c.id === checklistId)
    if (!item) return
    setFocusedChecklist(checklistId)
    const live = item.objectIds.filter(id => allObjects.some(o => o.id === id))
    isolate(live.length ? live : null)
    if (live[0]) setSelected(live.slice(0, 1))
  }

  const handleSelect = (id: string, additive: boolean) => {
    if (!id) {
      setSelected([])
      isolate(null)
      return
    }
    addSelected(id, additive)
    const related = relatedChecklists(allChecklists, id, allObjects.find(o => o.id === id))[0]
    if (related) setFocusedChecklist(related.id)
  }

  if (!asset) {
    return (
      <>
        <Header title="Digital Inspection" />
        <PageLayout><p className="text-sm text-muted-foreground p-6">Không tìm thấy asset.</p></PageLayout>
      </>
    )
  }

  const loading = workspaceIsLoading(loadPhase)
  const field = mode === 'field'
  const gaps = missingPlanGaps(allObjects, allChecklists)
  const activeFilters = kindFilters.length + originFilters.length + (stageFilter === 'all' ? 0 : 1)

  const filters = (
    <div className="space-y-1.5">
      <p className="text-[9px] text-muted-foreground">Giai đoạn</p>
      <FilterChips
        options={(['gd1', 'gd2', 'gd3'] as const).map(id => ({ id, label: STAGE_META[id].short }))}
        value={stageFilter}
        onToggle={id => setStage(id)}
        onAll={() => setStage('all')}
      />
      <p className="text-[9px] text-muted-foreground pt-1">Đối tượng</p>
      <FilterChips
        options={KIND_OPTIONS}
        value={kindFilters}
        multiple
        counts={kindCounts}
        onToggle={toggleKind}
        onAll={clearKinds}
      />
      <p className="text-[9px] text-muted-foreground pt-1">Nguồn</p>
      <FilterChips
        options={ORIGIN_OPTIONS}
        value={originFilters}
        multiple
        counts={originCounts}
        onToggle={toggleOrigin}
        onAll={clearOrigins}
      />
    </div>
  )

  const tree = (onPick: (id: string, additive: boolean) => void) => (
    <ComponentTree
      objects={allObjects}
      visibleIds={visibleIds}
      selectedIds={selectedIds}
      hoveredId={hoveredId}
      onSelect={onPick}
      onHover={setHovered}
    />
  )

  const pickFromSheet = (id: string, additive: boolean) => {
    handleSelect(id, additive)
    if (!additive) setTreeOpen(false)
  }

  return (
    <>
      <Header
        title={asset.code}
        subtitle={`${asset.name} · ${fileLabel}`}
      />
      <PageLayout className="!p-2 sm:!p-3" scrollable={!wide}>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0 px-1 pb-1 flex-wrap">
          <Link to={flowPaths.home()} className="hover:text-foreground">Nghiệm thu số</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to={flowPaths.asset(flowAssetId, 'bim')} className="hover:text-foreground">{flowAsset?.asset.name ?? asset.code}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Engineering Mode · {asset.code}</span>
          <span className="text-[#2a3855]">/</span>
          <span>{project.ifcVersion}</span>
          <span className="text-[#2a3855]">/</span>
          <span>{project.planVersion}</span>
          <PlanStatusChip status={project.planStatus} />
          {unsaved && <span className="text-amber-400 font-semibold">Unsaved</span>}
          {savedFlash && <span className="text-green-400 font-semibold">Saved</span>}
        </div>

        <div className="shrink-0 px-1 pb-2">
          <StageSelector
            value={stageFilter}
            onChange={setStage}
            counts={stageCounts}
            statuses={asset.stages}
            onHover={setStagePreview}
          />
        </div>

        {!wide && !field && (
          <div className="shrink-0 flex items-center gap-2 px-1 pb-2">
            <button
              type="button"
              onClick={() => setTreeOpen(true)}
              className="h-10 px-3 rounded-lg border border-primary/50 bg-primary/10 text-[12px] font-semibold text-foreground inline-flex items-center gap-1.5"
            >
              <ListTree className="w-4 h-4 text-primary" />
              Cây cấu kiện
              <span className="tabular-nums text-muted-foreground">{visibleObjects.length}</span>
              {activeFilters > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-primary"><Filter className="w-3 h-3" />{activeFilters}</span>
              )}
            </button>
            <span className="text-[11px] text-muted-foreground truncate min-w-0">
              {selected.length === 0 ? 'Chạm cấu kiện trên mô hình hoặc trong cây' : selected.length === 1 ? selected[0].name : `${selected.length} cấu kiện đã chọn`}
            </span>
          </div>
        )}

        <div className={cn(
          'grid gap-2',
          wide ? 'flex-1 min-h-0' : '',
          !wide ? 'grid-cols-1' : field ? 'grid-cols-[1fr_320px]' : 'grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(260px,300px)]',
        )}>
          {wide && !field && (
            <aside className="min-h-0 rounded-lg border border-[#1e2433] bg-[#0d1117] p-2.5 flex flex-col overflow-hidden">
              <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Component tree</p>
              <div className="mb-2 shrink-0">{filters}</div>
              {tree(handleSelect)}
            </aside>
          )}

          <section className={cn(
            'relative rounded-lg border border-[#1e2433] bg-[#070b12] overflow-hidden touch-none',
            wide ? 'min-h-0' : 'h-[52dvh] min-h-[280px] max-h-[640px]',
          )}>
            <BimViewer
              assetId={asset.id}
              objects={allObjects}
              visibleIds={visibleIds}
              selectedIds={selectedIds}
              hoveredId={hoveredId}
              highlightIds={highlightIds}
              isolatedIds={isolatedIds}
              stageFilter={stagePreview ?? stageFilter}
              onSelect={handleSelect}
              onHover={setHovered}
              onCatalog={mergeIfcObjects}
              onProgress={handleProgress}
              onReady={handleReady}
              onError={handleError}
            />
            {loading && ifcObjects.length === 0 && (
              <div className="absolute inset-0 z-10 bg-[#070b12]/85 flex flex-col items-center justify-center gap-2">
                <p className="text-xs font-semibold text-foreground text-center px-4">
                  {loadMessage || (
                    <>
                      {loadPhase === 'ifc' && 'Đang tải mô hình BIM...'}
                      {loadPhase === 'parse' && 'Đang phân tích cấu kiện...'}
                      {loadPhase === 'stage' && 'Đang xây dựng Inspection Stage...'}
                    </>
                  )}
                </p>
                <div className="w-48 h-1 rounded-full bg-[#1e2433] overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${loadPct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground tabular-nums">{loadPct}%</p>
              </div>
            )}
            {loading && ifcObjects.length > 0 && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 rounded-md border border-[#1e2433] bg-[#0d1117]/90 px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {loadMessage} · {loadPct}%
                </p>
              </div>
            )}
            {kindEmptyHint && !loading && (
              <div className="absolute bottom-8 left-2 right-2 z-10 rounded-md border border-amber-500/30 bg-amber-950/80 px-2 py-1.5">
                <p className="text-[11px] text-amber-200 text-center">{kindEmptyHint}</p>
              </div>
            )}
            {loadError && (
              <div className="absolute bottom-8 left-2 right-2 z-10 rounded-md border border-red-500/30 bg-red-950/80 px-2 py-1.5">
                <p className="text-[11px] text-red-300 text-center">{loadError}</p>
              </div>
            )}
            <div className="absolute left-2 top-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80 bg-black/40 px-1.5 py-0.5 rounded">
              3D BIM · {fileLabel} (gộp)
            </div>
            {allObjects.length > 0 && (
              <div className="absolute right-2 top-2 hidden sm:flex items-center gap-2 text-[9px] text-muted-foreground bg-black/40 px-1.5 py-0.5 rounded">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#fb923c]" />IFC</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#fb923c]/50" />Đề xuất (nhạt)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm border border-[#38bdf8]/60" />Ống gen</span>
              </div>
            )}
          </section>

          <aside className={cn(
            'rounded-lg border border-[#1e2433] bg-[#0d1117] p-2.5',
            wide && 'min-h-0 overflow-y-auto',
            field && 'text-[13px] [&_button]:py-2.5 [&_button]:text-xs',
          )}>
            <InspectionPanel
              asset={asset}
              objects={allObjects}
              selected={selected}
              checklists={stageFilter === 'all' ? allChecklists : allChecklists.filter(c => c.stage === stageFilter)}
              focusedChecklistId={focusedChecklistId}
              completeness={completeness}
              completenessPct={asset.completenessPct}
              onHoverChecklist={setHoveredChecklist}
              onFocusChecklist={setFocusedChecklist}
              onViewBim={handleViewBim}
              onAssignStage={(s) => assignStage(selectedIds, s)}
              onSupplement={() => setSupplementOpen(true)}
            />
          </aside>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 pt-2 text-[11px]">
          <span className="text-muted-foreground">
            {selectedIds.length === 0
              ? 'Chưa chọn đối tượng'
              : `${selectedIds.length} selected`}
            {isolatedIds && ' · Isolated'}
            {gaps.count > 0 && (
              <span className="text-amber-400" title={gaps.labels.join('\n')}>
                {gaps.count === 1
                  ? ` · Cần bổ sung: ${gaps.labels[0]}`
                  : ` · Cần bổ sung ${gaps.count} mục plan — ${gaps.labels[0]}`}
              </span>
            )}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {isolatedIds && (
              <button
                type="button"
                onClick={() => isolate(null)}
                className="px-2 py-1 rounded-md border border-[#1e2433] text-muted-foreground hover:text-foreground"
              >
                Bỏ isolate
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode(field ? 'planning' : 'field')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md border',
                field ? 'border-primary text-primary' : 'border-[#1e2433] text-muted-foreground hover:text-foreground',
              )}
            >
              {field ? <ScanLine className="w-3 h-3" /> : <Tablet className="w-3 h-3" />}
              {field ? 'Field mode' : 'Chuẩn bị field'}
            </button>
            <button
              type="button"
              onClick={savePlan}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground font-semibold"
            >
              <Save className="w-3 h-3" />
              Save Inspection Plan
            </button>
          </div>
        </div>
      </PageLayout>

      {!wide && (
        <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
          <SheetContent side="bottom" className="h-[85dvh] max-h-[85dvh] bg-[#0d1117] border-[#1e2433] p-3 gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle>Cây cấu kiện · {visibleObjects.length}</SheetTitle>
            </SheetHeader>
            <details className="shrink-0 rounded-lg border border-[#1e2433] px-2.5 py-2" open={activeFilters > 0}>
              <summary className="text-[12px] font-semibold text-foreground cursor-pointer inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-primary" /> Bộ lọc{activeFilters > 0 ? ` · ${activeFilters} đang bật` : ''}
              </summary>
              <div className="pt-2">{filters}</div>
            </details>
            <div className="flex-1 min-h-0">{tree(pickFromSheet)}</div>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={supplementOpen} onOpenChange={setSupplementOpen}>
        <SheetContent side="right" className="bg-[#0d1117] border-[#1e2433]">
          <SheetHeader>
            <SheetTitle>Bổ sung thông tin</SheetTitle>
          </SheetHeader>
          <p className="text-[11px] text-muted-foreground mt-1">
            Các mục plan còn thiếu nguồn — cần bản vẽ AFC / chỉ dẫn kỹ thuật dự án.
          </p>
          <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            {gaps.labels.map(label => (
              <li key={label} className="text-amber-200/90">• {label}</li>
            ))}
          </ul>
          <ul className="mt-4 space-y-2 text-[11px] text-muted-foreground">
            {completeness.filter(c => !c.ok).map(c => (
              <li key={c.id} className="rounded-md border border-[#1e2433] p-2">
                <p className="text-amber-300 font-semibold">{c.label}</p>
                {c.detail && <p className="mt-0.5">{c.detail}</p>}
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
