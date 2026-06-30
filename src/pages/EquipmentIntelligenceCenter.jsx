import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Database,
  Radio,
  List,
  Play,
  LayoutDashboard,
  AlertTriangle,
  ArrowRight,
  Calendar,
  FileText,
  Video,
} from 'lucide-react'
import { Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import './EquipmentIntelligenceCenter.css'
import {
  getEquipmentIntelligenceDataset,
  calculateCommandOverview,
  calculateImmediateActions,
  calculateEfficiencyLossBreakdown,
  calculateProjectRiskMatrix,
  calculateZoneIntelligence,
  calculateTopBestMachines,
  calculateTopWorstMachines,
  calculateCommandRecommendations,
} from '../data/equipment-intelligence/index.js'

const TABS = [
  { key: 'command', label: 'Command Center', icon: LayoutDashboard },
  { key: 'live', label: 'Live', icon: Radio },
  { key: 'events', label: 'Sự kiện', icon: List },
  { key: 'playback', label: 'Playback', icon: Play },
]

function pct(n) { return `${n}%` }
function fmt(n) { return Number(n).toLocaleString('vi-VN') }

function scoreColor(score) {
  if (score >= 70) return '#4ade80'
  if (score >= 50) return '#fbbf24'
  if (score >= 30) return '#fb923c'
  return '#f87171'
}

function riskLabel(r) {
  const map = { critical: 'Nghiêm trọng', high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
  return map[r] ?? r
}

function riskVariant(r) {
  if (r === 'critical') return 'critical'
  if (r === 'high') return 'high'
  if (r === 'medium') return 'medium'
  return 'low'
}

function ScoreBar({ score, large }) {
  return (
    <div className={cn('ecc-score-wrap', large && 'ecc-score-wrap--lg')}>
      <div className="ecc-score-bar">
        <div className="ecc-score-fill" style={{ width: pct(score), background: scoreColor(score) }} />
      </div>
      <span className="ecc-score-label" style={{ color: scoreColor(score) }}>{score}%</span>
    </div>
  )
}

function Chip({ label, variant = 'muted' }) {
  return <span className={`ecc-chip ecc-chip--${variant}`}>{label}</span>
}

function SectionHeader({ title, subtitle, badge }) {
  return (
    <div className="ecc-section-head">
      <div>
        <h2 className="ecc-section-title">{title}</h2>
        {subtitle && <p className="ecc-section-sub">{subtitle}</p>}
      </div>
      {badge}
    </div>
  )
}

function PlaceholderTab({ title, desc }) {
  return (
    <Panel title={title} fit>
      <div className="ecc-placeholder">
        <p className="ecc-placeholder-title">{title}</p>
        <p className="ecc-placeholder-desc">{desc}</p>
      </div>
    </Panel>
  )
}

/* ── SECTION 1: Command Overview ── */
function CommandOverview({ overview }) {
  const kpis = [
    { label: 'Tổng giờ mục tiêu hôm nay', value: `${fmt(overview.totalTargetHoursToday)} giờ`, tone: 'blue' },
    { label: 'Giờ tạo sản lượng thực tế', value: `${fmt(overview.totalProductiveHoursToday)} giờ`, tone: 'green' },
    { label: 'Giờ thất thoát', value: `${fmt(overview.lossHoursToday)} giờ`, tone: 'amber' },
    { label: 'Chi phí thất thoát ước tính', value: overview.estimatedLossVnd, tone: 'red', sm: true },
    { label: 'Thiết bị cần xử lý ngay', value: `${overview.machinesNeedingAction} máy`, tone: 'red' },
    { label: 'Cọc có nguy cơ chậm tiến độ', value: `${overview.pilesAtRisk} cọc`, tone: 'amber' },
    { label: 'Hiệu suất khai thác thiết bị', value: `${overview.utilizationRate20h}%`, tone: 'green', score: overview.utilizationRate20h },
    { label: 'Máy idle >30 phút', value: `${overview.machinesIdleOver30Min} máy`, tone: 'amber' },
  ]

  return (
    <section className="ecc-section">
      <SectionHeader
        title="Equipment Command Overview"
        subtitle={`Tổng quan điều hành · mục tiêu 20h/máy · ${overview.metricsDate?.slice(5) ?? 'hôm nay'}`}
      />
      <div className="ecc-overview-grid">
        {kpis.map(k => (
          <div key={k.label} className={cn('ecc-overview-card', `ecc-overview-card--${k.tone}`)}>
            <span className="ecc-overview-label">{k.label}</span>
            <span className={cn('ecc-overview-value', k.sm && 'ecc-overview-value--sm')}>{k.value}</span>
            {k.score != null && <ScoreBar score={k.score} />}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── SECTION 2: Immediate Actions ── */
function ImmediateActions({ actions }) {
  return (
    <section className="ecc-section ecc-section--highlight">
      <SectionHeader
        title="Immediate Actions Required"
        subtitle="Top máy cần xử lý ngay — phát hiện · giải thích · lượng hóa · đề xuất"
        badge={<Chip label={`${actions.length} ưu tiên`} variant="critical" />}
      />
      <div className="ecc-action-grid">
        {actions.map(a => (
          <div key={a.machineId} className="ecc-action-card">
            <div className="ecc-action-head">
              <div>
                <p className="ecc-action-machine">{a.assetTag}</p>
                <p className="ecc-action-model">{a.model}</p>
              </div>
              <Chip label={`AI ${a.aiConfidence}%`} variant="blue" />
            </div>

            <div className="ecc-action-fields">
              <div className="ecc-action-field">
                <span className="ecc-field-label">Dự án</span>
                <span>{a.projectName}</span>
              </div>
              <div className="ecc-action-field">
                <span className="ecc-field-label">Khu</span>
                <span>{a.zoneName}</span>
              </div>
              <div className="ecc-action-field ecc-action-field--alert">
                <span className="ecc-field-label">Trạng thái</span>
                <span>{a.statusLabel}</span>
              </div>
              <div className="ecc-action-field">
                <span className="ecc-field-label">Thiệt hại</span>
                <span className="ecc-loss-value">{a.estimatedLossVnd}</span>
              </div>
              <div className="ecc-action-field">
                <span className="ecc-field-label">Nguyên nhân dự đoán</span>
                <span>{a.rootCause}</span>
              </div>
              <div className="ecc-action-field">
                <span className="ecc-field-label">Nguồn</span>
                <span className="ecc-evidence">{a.evidenceSources.join(' + ')}</span>
              </div>
              <div className="ecc-action-field ecc-action-field--rec">
                <span className="ecc-field-label">Khuyến nghị</span>
                <span>{a.suggestedAction}</span>
              </div>
            </div>

            <div className="ecc-action-btns">
              <button type="button" className="ecc-btn ecc-btn--ghost">Chi tiết</button>
              <button type="button" className="ecc-btn ecc-btn--ghost">
                <Play className="w-3 h-3" /> Playback
              </button>
              <Link to="/equipment/raw-sany-data" className="ecc-btn ecc-btn--primary">
                <Database className="w-3 h-3" /> Raw Data
              </Link>
            </div>
          </div>
        ))}
        {actions.length === 0 && (
          <div className="ecc-empty">Không có máy cần xử lý khẩn cấp.</div>
        )}
      </div>
    </section>
  )
}

/* ── SECTION 3: Efficiency Loss Breakdown ── */
function LossBreakdown({ breakdown }) {
  const maxHours = breakdown[0]?.lossHours ?? 1
  return (
    <section className="ecc-section">
      <SectionHeader
        title="Efficiency Loss Breakdown"
        subtitle="Nguyên nhân làm giảm hiệu quả — giờ mất và chi phí mất"
      />
      <div className="ecc-loss-list">
        {breakdown.map(row => (
          <div key={row.label} className="ecc-loss-row">
            <div className="ecc-loss-info">
              <span className="ecc-loss-label">{row.label}</span>
              <div className="ecc-loss-bar-track">
                <div
                  className="ecc-loss-bar-fill"
                  style={{ width: pct(Math.round((row.lossHours / maxHours) * 100)) }}
                />
              </div>
            </div>
            <div className="ecc-loss-stats">
              <span className="ecc-loss-hours">{row.lossHours} giờ</span>
              <span className="ecc-loss-cost">{row.lossCostVnd}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── SECTION 4: Project Risk Matrix ── */
function ProjectRiskMatrix({ projects }) {
  return (
    <section className="ecc-section">
      <SectionHeader title="Project Risk Matrix" subtitle="Rủi ro tiến độ theo dự án" />
      <div className="ecc-project-grid">
        {projects.map(p => (
          <div
            key={p.projectId}
            className={cn(
              'ecc-project-card',
              p.riskLevel === 'critical' && 'ecc-project-card--critical',
              p.riskLevel === 'high' && 'ecc-project-card--high',
            )}
          >
            <div className="ecc-project-head">
              <span className="ecc-project-name">{p.projectName}</span>
              <Chip label={riskLabel(p.riskLevel)} variant={riskVariant(p.riskLevel)} />
            </div>
            <ScoreBar score={p.utilizationRate20h} large />
            <div className="ecc-project-metrics">
              <div><span className="ecc-metric-label">Hiệu suất</span><span>{p.utilizationRate20h}%</span></div>
              <div><span className="ecc-metric-label">Thiệt hại</span><span className="ecc-loss-value">{p.estimatedLossVnd}</span></div>
              <div><span className="ecc-metric-label">Cảnh báo mở</span><span>{p.openAlerts}</span></div>
              <div><span className="ecc-metric-label">Nguyên nhân</span><span>{p.mainRootCause}</span></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── SECTION 5: Zone Intelligence ── */
function ZoneIntelligence({ zones }) {
  const grouped = useMemo(() => {
    /** @type {Map<string, typeof zones>} */
    const map = new Map()
    for (const z of zones) {
      if (!map.has(z.projectName)) map.set(z.projectName, [])
      map.get(z.projectName).push(z)
    }
    return [...map.entries()]
  }, [zones])

  return (
    <section className="ecc-section">
      <SectionHeader title="Zone Intelligence" subtitle="Phân tích theo khu công trường — đặc trưng Vifence" />
      <div className="ecc-zone-groups">
        {grouped.map(([projectName, projectZones]) => (
          <div key={projectName} className="ecc-zone-group">
            <p className="ecc-zone-group-title">{projectName}</p>
            <div className="ecc-zone-grid">
              {projectZones.map(z => (
                <div
                  key={z.zoneId}
                  className={cn(
                    'ecc-zone-card',
                    z.riskLevel === 'critical' && 'ecc-zone-card--critical',
                    z.riskLevel === 'high' && 'ecc-zone-card--high',
                  )}
                >
                  <div className="ecc-zone-head">
                    <span className="ecc-zone-name">{z.zoneName}</span>
                    <Chip label={riskLabel(z.riskLevel)} variant={riskVariant(z.riskLevel)} />
                  </div>
                  <ScoreBar score={z.efficiencyScore} />
                  <div className="ecc-zone-stats">
                    <span>{z.machines} máy</span>
                    <span>{z.activePiles} cọc</span>
                    <span>{z.cameras} camera</span>
                    <span>Idle &gt;30p: <strong>{z.machinesIdleOver30Min}</strong></span>
                    {z.safetyEvents > 0 && (
                      <span className="ecc-zone-safety">
                        <AlertTriangle className="w-3 h-3" /> {z.safetyEvents} an toàn
                      </span>
                    )}
                  </div>
                  <p className="ecc-zone-cause">{z.mainRootCause}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── SECTION 6 & 7: Best / Worst Machines ── */
function MachineRankings({ best, worst }) {
  return (
    <section className="ecc-section ecc-section--split">
      <div className="ecc-rank-col">
        <SectionHeader title="Best Machines" subtitle="Top 5 máy hiệu quả nhất" />
        <div className="ecc-rank-list">
          {best.map((m, i) => (
            <div key={m.machineId} className="ecc-rank-item ecc-rank-item--good">
              <span className="ecc-rank-num">{i + 1}</span>
              <div className="ecc-rank-info">
                <p className="ecc-rank-tag">{m.assetTag}</p>
                <p className="ecc-rank-meta">{m.projectName} · {m.productiveHoursToday}h · {m.utilizationVs20h}%</p>
              </div>
              <ScoreBar score={m.efficiencyScore} />
            </div>
          ))}
        </div>
      </div>
      <div className="ecc-rank-col">
        <SectionHeader title="Worst Machines" subtitle="Top 5 máy cần cải thiện" />
        <div className="ecc-rank-list">
          {worst.map((m, i) => (
            <div key={m.machineId} className="ecc-rank-item ecc-rank-item--bad">
              <span className="ecc-rank-num">{i + 1}</span>
              <div className="ecc-rank-info">
                <p className="ecc-rank-tag">{m.assetTag}</p>
                <p className="ecc-rank-meta">{m.projectName} · idle {m.continuousIdleMinutes}p</p>
              </div>
              <div className="ecc-rank-side">
                <span className="ecc-loss-value">{m.estimatedLossVnd}</span>
                <span className="ecc-rank-cause">{m.rootCause}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── SECTION 8: Recommendation Center ── */
function RecommendationCenter({ recs }) {
  return (
    <section className="ecc-section">
      <SectionHeader title="Recommendation Center" subtitle="AI đề xuất hành động điều phối" />
      <div className="ecc-rec-grid">
        {recs.map(r => (
          <div key={r.id} className={cn('ecc-rec-card', `ecc-rec-card--${r.priority}`)}>
            {r.actionType === 'relocate' && r.toZone ? (
              <>
                <p className="ecc-rec-type">Điều chuyển</p>
                <p className="ecc-rec-machine">{r.assetTag}</p>
                <div className="ecc-rec-route">
                  <span>{r.fromProject} · {r.fromZone}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{r.toZone}</span>
                </div>
                <div className="ecc-rec-benefit">
                  <span>+{r.productiveGainHours} giờ productive</span>
                  <span className="ecc-rec-save">Tiết kiệm: {r.estimatedSavingsVnd}</span>
                </div>
              </>
            ) : r.actionType === 'maintenance' ? (
              <>
                <p className="ecc-rec-type">Bảo dưỡng</p>
                <p className="ecc-rec-machine">{r.assetTag}</p>
                <p className="ecc-rec-desc">{r.description}</p>
              </>
            ) : (
              <>
                <p className="ecc-rec-type">{r.title}</p>
                <p className="ecc-rec-desc">{r.description}</p>
                <div className="ecc-rec-benefit">
                  <span>+{r.estimatedImpactPct}% hiệu suất</span>
                  <span className="ecc-rec-meta">{r.assetTag} · {r.fromZone}</span>
                </div>
              </>
            )}
            <Chip
              label={r.priority === 'high' ? 'Ưu tiên cao' : r.priority === 'medium' ? 'Trung bình' : 'Thấp'}
              variant={r.priority === 'high' ? 'high' : 'medium'}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── SECTION 9: Evidence Center ── */
function EvidenceCenter() {
  const links = [
    { label: 'Tra cứu Raw SANY', icon: Database, to: '/equipment/raw-sany-data' },
    { label: 'Xem Playback Camera', icon: Video, to: '/equipment' },
    { label: 'Xem Kế hoạch Máy', icon: Calendar, to: '/equipment' },
    { label: 'Xem Nhật ký Hiện trường', icon: FileText, to: '/equipment' },
  ]

  return (
    <section className="ecc-section ecc-section--evidence">
      <SectionHeader title="Evidence Center" subtitle="Bằng chứng và tra cứu chi tiết" />
      <div className="ecc-evidence-grid">
        {links.map(l => {
          const Icon = l.icon
          return (
            <Link key={l.label} to={l.to} className="ecc-evidence-link">
              <Icon className="w-4 h-4" />
              {l.label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function CommandCenterTab({ overview, actions, breakdown, projects, zones, best, worst, recs }) {
  return (
    <div className="ecc-command">
      <div className="ecc-hero">
        <div>
          <p className="ecc-hero-eyebrow">Equipment Intelligence</p>
          <h1 className="ecc-hero-title">Equipment Command Center</h1>
          <p className="ecc-hero-desc">
            Phát hiện → Giải thích → Lượng hóa thiệt hại → Đề xuất hành động
          </p>
        </div>
        <div className="ecc-hero-meta">
          <span>Mục tiêu: <strong>20h/máy/ngày</strong></span>
          <span>Idle tối đa: <strong>30 phút liên tục</strong></span>
        </div>
      </div>

      <CommandOverview overview={overview} />
      <ImmediateActions actions={actions} />
      <LossBreakdown breakdown={breakdown} />
      <ProjectRiskMatrix projects={projects} />
      <ZoneIntelligence zones={zones} />
      <MachineRankings best={best} worst={worst} />
      <RecommendationCenter recs={recs} />
      <EvidenceCenter />
    </div>
  )
}

export default function EquipmentIntelligenceCenter() {
  const [tab, setTab] = useState('command')
  const dataset = useMemo(() => getEquipmentIntelligenceDataset(), [])

  const overview = useMemo(() => calculateCommandOverview(dataset), [dataset])
  const actions = useMemo(() => calculateImmediateActions(dataset, 5), [dataset])
  const breakdown = useMemo(() => calculateEfficiencyLossBreakdown(dataset), [dataset])
  const projects = useMemo(() => calculateProjectRiskMatrix(dataset), [dataset])
  const zones = useMemo(() => calculateZoneIntelligence(dataset), [dataset])
  const best = useMemo(() => calculateTopBestMachines(dataset, 5), [dataset])
  const worst = useMemo(() => calculateTopWorstMachines(dataset, 5), [dataset])
  const recs = useMemo(() => calculateCommandRecommendations(dataset, 6), [dataset])

  return (
    <div className="ecc-root">
      <div className="ecc-toolbar">
        <div className="ecc-tabs">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn('ecc-tab', tab === t.key && 'ecc-tab--active')}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'command' && (
        <CommandCenterTab
          overview={overview}
          actions={actions}
          breakdown={breakdown}
          projects={projects}
          zones={zones}
          best={best}
          worst={worst}
          recs={recs}
        />
      )}
      {tab === 'live' && (
        <PlaceholderTab title="Live" desc="Giám sát trực tiếp thiết bị SANY và camera AI — sẽ bổ sung sau." />
      )}
      {tab === 'events' && (
        <PlaceholderTab title="Sự kiện" desc="Danh sách sự kiện camera AI và telemetry — sẽ bổ sung sau." />
      )}
      {tab === 'playback' && (
        <PlaceholderTab title="Playback" desc="Xem lại luồng camera và timeline sự kiện — sẽ bổ sung sau." />
      )}
    </div>
  )
}
