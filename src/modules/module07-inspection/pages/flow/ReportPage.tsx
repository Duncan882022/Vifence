import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download } from 'lucide-react'
import { Header } from '@/components/common/Header/Header'
import { PageLayout } from '@/components/common/PageLayout/PageLayout'
import { criteriaForStage } from '../../data/workflow/criteria'
import { COMPONENTS, POC_MOCK_LABEL, STAGES } from '../../data/workflow/hnqnProject'
import { AI_VERDICT_META, CRITERION_STATUS_META, ISSUE_STATUS_META, SIGNOFF_META } from '../../data/workflow/meta'
import { useEvidence, useIssues, useSession } from '../../hooks/useInspectionFlow'
import { flowPaths, resolveAsset } from '../../services/workflow/flowNav'
import { formatClock } from '../../services/workflow/ids'
import { finalStatus } from '../../services/workflow/reviewLogic'
import { sessionElapsedSec } from '../../services/workflow/sessionLogic'
import { EvidenceMedia } from '../../components/flow/EvidenceMedia'
import { formatDateTimeVn, TokenBadge } from '../../components/flow/FlowUi'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 text-[11px] py-0.5">
      <span className="text-muted-foreground print:text-gray-500">{label}</span>
      <span className="text-foreground print:text-black font-semibold">{value}</span>
    </div>
  )
}

/** §25 Inspection Report — in / lưu PDF từ trình duyệt. */
export function ReportPage() {
  const { sessionId = '' } = useParams()
  const session = useSession(sessionId)
  const ctx = session ? resolveAsset(session.assetId) : null
  const evidence = useEvidence({ sessionId })
  const issues = useIssues(session?.assetId)
  const criteria = useMemo(() => (session ? criteriaForStage(session.stage) : []), [session])

  if (!session || !ctx) return <Navigate to={flowPaths.home()} replace />
  const def = STAGES[session.stage]
  const sessionIssues = issues.filter(i => i.sessionId === session.id)
  const snaps = evidence.filter(e => e.type === 'snapshot')
  const voices = evidence.filter(e => e.type === 'voice')
  const measures = evidence.filter(e => e.type === 'measurement' || e.type === 'test' || e.type === 'document')
  const findings = session.ai?.findings ?? []
  const mockCount = criteria.filter(c => c.source.kind === 'MOCK').length

  const table = (group: 'quantity' | 'quality') => (
    <table className="w-full text-[10px] border-collapse">
      <thead>
        <tr className="text-left text-muted-foreground print:text-gray-500 border-b border-white/10 print:border-gray-300">
          <th className="py-1">Mã</th><th>Tiêu chí</th><th>Component</th><th>Design</th><th>Observed</th><th>Dung sai</th><th>Nguồn</th><th>Kết quả</th>
        </tr>
      </thead>
      <tbody>
        {criteria.filter(c => c.group === group).map(c => {
          const f = findings.find(x => x.criterionId === c.id)
          const st = finalStatus(session, c.id)
          return (
            <tr key={c.id} className="border-b border-white/5 print:border-gray-200">
              <td className="py-1 font-mono">{c.code}</td>
              <td>{c.title}</td>
              <td>{COMPONENTS[c.component].label}</td>
              <td>{c.design}</td>
              <td>{session.results[c.id]?.observed ?? f?.observed ?? '—'}</td>
              <td>{c.tolerance}</td>
              <td>{c.source.kind}</td>
              <td><TokenBadge token={CRITERION_STATUS_META[st]} size="small" /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <>
      <div className="print:hidden">
        <Header title="Inspection Report" subtitle={session.id} />
      </div>
      <PageLayout scrollable className="print:m-0 print:p-0 print:bg-white">
        <div className="flex items-center justify-between print:hidden">
          <Link to={flowPaths.asset(ctx.asset.id)} className="text-[11px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="w-3.5 h-3.5" /> Asset Passport
          </Link>
          <button type="button" onClick={() => window.print()} className="h-9 px-4 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[12px] font-bold inline-flex items-center gap-1">
            <Download className="w-4 h-4" /> Tải xuống PDF
          </button>
        </div>
        <article className="mx-auto w-full max-w-4xl rounded-lg border border-[#1e2433] bg-[#0b0f1a] p-6 flex flex-col gap-4 print:border-0 print:bg-white print:text-black">
          <header className="flex items-start justify-between gap-4 border-b border-white/10 print:border-gray-300 pb-3">
            <div>
              <p className="text-[10px] tracking-widest text-muted-foreground print:text-gray-500">BIÊN BẢN NGHIỆM THU SỐ · DIGITAL INSPECTION REPORT</p>
              <h1 className="text-xl font-black text-foreground print:text-black">{ctx.asset.name} · {def.code} {def.label}</h1>
              <p className="text-[11px] font-mono text-muted-foreground print:text-gray-600">{session.id} · lần {session.attempt}</p>
            </div>
            {session.signOff ? <TokenBadge token={SIGNOFF_META[session.signOff.result]} size="large" /> : <span className="text-[11px] text-amber-400">CHƯA KÝ</span>}
          </header>

          <section className="grid sm:grid-cols-2 gap-x-6">
            <div>
              <Row label="Project" value={ctx.project.name} />
              <Row label="Structure" value={ctx.structure.name} />
              <Row label="Asset / QR" value={`${ctx.asset.name} · ${session.qr.value} (${session.qr.method === 'manual' ? 'nhập tay' : 'camera'})`} />
              <Row label="Stage" value={`${def.code} ${def.label} · ${def.labelEn}`} />
              <Row label="Inspector" value={session.inspector.name} />
            </div>
            <div>
              <Row label="Thời gian" value={`${formatDateTimeVn(session.startedAt)} → ${formatDateTimeVn(session.finishedAt)}`} />
              <Row label="Thời lượng ghi" value={formatClock(sessionElapsedSec(session))} />
              <Row label="AFC / BIM" value={`${session.revisions.afc} · ${session.revisions.bim}`} />
              <Row label="Checklist / ITP / BPTC" value={`${session.revisions.checklist} · ${session.revisions.itp} · ${session.revisions.bptc}`} />
              <Row label="H1" value={`${session.helmetId}${session.simulatedH1 ? ' (mô phỏng POC)' : ''} · video ${session.video?.source ?? 'none'}`} />
              <Row
                label="Lưu ý nghiệm thu đã xem"
                value={session.briefs?.length
                  ? session.briefs.map(b => `${COMPONENTS[b.component].label} (${b.requirementIds.length} yêu cầu · ${formatDateTimeVn(b.viewedAt)})`).join(' · ')
                  : '—'}
              />
            </div>
          </section>

          {session.finishOverride && (
            <p className="text-[11px] text-amber-300 print:text-amber-700">
              Kết thúc khi còn {session.finishOverride.openItems} mục · {session.finishOverride.by}: “{session.finishOverride.reason}”
            </p>
          )}

          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">KẾT QUẢ KHỐI LƯỢNG · QUANTITY</h2>
            {table('quantity')}
          </section>
          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">KẾT QUẢ CHẤT LƯỢNG · QUALITY</h2>
            {table('quality')}
          </section>

          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">ĐO ĐẠC / THÍ NGHIỆM · {measures.length}</h2>
            <ul className="text-[10px] grid sm:grid-cols-2 gap-x-4">
              {measures.map(m => <li key={m.id}>{m.label}: <b>{m.value}{m.unit ? ` ${m.unit}` : ''}</b>{m.note ? ` · ${m.note}` : ''} · {formatClock(m.ctx.videoTs)}</li>)}
              {measures.length === 0 && <li className="text-muted-foreground">—</li>}
            </ul>
          </section>

          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">SNAPSHOT · {snaps.length} · GHI ÂM · {voices.length}</h2>
            <div className="grid grid-cols-4 gap-2">
              {snaps.slice(0, 8).map(s => (
                <figure key={s.id}>
                  <EvidenceMedia evidence={s} className="w-full aspect-video" />
                  <figcaption className="text-[8px] text-muted-foreground print:text-gray-500 font-mono">{s.ctx.criterionId} · {formatClock(s.ctx.videoTs)}</figcaption>
                </figure>
              ))}
            </div>
            <ul className="text-[10px] mt-1">
              {voices.map(v => <li key={v.id}>{v.label} · {formatClock(v.ctx.videoTs)} · {v.durationSec?.toFixed(0)}s{v.transcript ? ` · “${v.transcript}”` : ''}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">AI FINDINGS (hỗ trợ — không ký nghiệm thu)</h2>
            <ul className="text-[10px] flex flex-col gap-0.5">
              {findings.filter(f => f.verdict !== 'pass_candidate').map(f => (
                <li key={f.id} className="flex items-center gap-2">
                  <TokenBadge token={AI_VERDICT_META[f.verdict]} size="small" /> {f.summary} · video {formatClock(f.videoFrom)}–{formatClock(f.videoTo)}
                  {session.reviews[f.id] && <span className="text-muted-foreground">→ {session.reviews[f.id].action.toUpperCase()} {session.reviews[f.id].finalStatus.toUpperCase()} ({session.reviews[f.id].by})</span>}
                </li>
              ))}
              <li className="text-muted-foreground">{findings.filter(f => f.verdict === 'pass_candidate').length} PASS CANDIDATE</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[12px] font-black tracking-wider mb-1">ISSUE · {sessionIssues.length}</h2>
            <ul className="text-[10px] flex flex-col gap-0.5">
              {sessionIssues.map(i => (
                <li key={i.id} className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{i.id}</span> {i.criterionId} · Design {i.design} · Observed {i.observed} · {i.responsible}
                  <TokenBadge token={ISSUE_STATUS_META[i.status]} size="small" />
                </li>
              ))}
              {sessionIssues.length === 0 && <li className="text-muted-foreground">Không có</li>}
            </ul>
          </section>

          <footer className="grid sm:grid-cols-2 gap-4 border-t border-white/10 print:border-gray-300 pt-3">
            <div>
              <p className="text-[10px] text-muted-foreground">KẾT QUẢ CUỐI</p>
              {session.signOff ? <TokenBadge token={SIGNOFF_META[session.signOff.result]} size="large" /> : <p className="text-[12px] text-amber-400">Chưa ký</p>}
              {session.signOff?.note && <p className="text-[11px] mt-1">{session.signOff.note}</p>}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">CHỮ KÝ</p>
              {session.signOff?.signatureDataUrl ? <img src={session.signOff.signatureDataUrl} alt="Chữ ký" className="h-16 print:invert" /> : <div className="h-16" />}
              <p className="text-[11px] font-semibold">{session.signOff?.inspector.name ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">{formatDateTimeVn(session.signOff?.at)} · {session.signOff?.revision}</p>
            </div>
          </footer>
          {mockCount > 0 && <p className="text-[9px] font-bold tracking-wider text-fuchsia-400">{POC_MOCK_LABEL} · {mockCount}/{criteria.length} tiêu chí dùng dữ liệu MOCK</p>}
        </article>
      </PageLayout>
    </>
  )
}
