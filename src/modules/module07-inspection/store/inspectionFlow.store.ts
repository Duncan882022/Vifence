import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { criteriaForStage } from '../data/workflow/criteria'
import { ASSETS, H1_HELMET_ID, INSPECTORS, STAGES } from '../data/workflow/hnqnProject'
import { SEED_AUDIT, SEED_SESSIONS } from '../data/workflow/seedHistory'
import { clearBlobs } from '../services/workflow/evidenceBlobs'
import { issueIdFor, sessionIdFor, uid } from '../services/workflow/ids'
import { isPaused, sessionsFor } from '../services/workflow/sessionLogic'
import type {
  AiFinding,
  AuditAction,
  AuditEvent,
  BriefAck,
  ComponentId,
  CriterionResult,
  Evidence,
  FinishOverride,
  InspectionSession,
  Inspector,
  Issue,
  IssueStatus,
  ReviewDecision,
  SessionVideo,
  SignOff,
  StageCode,
  SyncState,
} from '../workflow.types'

export interface StartSessionInput {
  assetId: string
  stage: StageCode
  qr: InspectionSession['qr']
  simulatedH1: boolean
  focusComponent?: ComponentId
  briefs?: BriefAck[]
}

export type NewIssueInput = Omit<Issue, 'id' | 'status' | 'history'>

interface FlowState {
  actor: Inspector
  sessions: Record<string, InspectionSession>
  evidence: Record<string, Evidence>
  issues: Record<string, Issue>
  audit: AuditEvent[]
  issueSeq: number
  setActor: (role: Inspector['role']) => void
  log: (action: AuditAction, assetId: string, detail: string, sessionId?: string) => void
  startSession: (input: StartSessionInput) => string
  ackBrief: (sessionId: string, ack: BriefAck) => void
  setCriterion: (sessionId: string, criterionId: string, patch: Partial<CriterionResult>) => void
  addEvidence: (evidence: Evidence) => void
  pauseSession: (sessionId: string) => void
  resumeSession: (sessionId: string) => void
  finishSession: (sessionId: string, override?: Omit<FinishOverride, 'by' | 'at'>) => void
  setSync: (sessionId: string, sync: SyncState, progress: number) => void
  setVideo: (sessionId: string, video: SessionVideo) => void
  setAi: (sessionId: string, findings: AiFinding[] | null) => void
  decide: (sessionId: string, decision: Omit<ReviewDecision, 'by' | 'at'>) => void
  createIssue: (input: NewIssueInput) => string
  setIssueStatus: (issueId: string, status: IssueStatus, note: string) => void
  signOff: (sessionId: string, signOff: Omit<SignOff, 'inspector' | 'at' | 'sessionId'>) => void
  resetDemo: () => void
}

const now = () => new Date().toISOString()

function seedState() {
  return {
    sessions: Object.fromEntries(SEED_SESSIONS.map(s => [s.id, s])),
    evidence: {} as Record<string, Evidence>,
    issues: {} as Record<string, Issue>,
    audit: [...SEED_AUDIT],
    issueSeq: 0,
  }
}

function patchSession(
  state: FlowState,
  sessionId: string,
  fn: (s: InspectionSession) => InspectionSession,
): Pick<FlowState, 'sessions'> | Record<string, never> {
  const current = state.sessions[sessionId]
  if (!current) return {}
  return { sessions: { ...state.sessions, [sessionId]: fn(current) } }
}

export const useInspectionFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      actor: { ...INSPECTORS.inspector },
      ...seedState(),

      setActor: role => set({ actor: { ...(role === 'senior_inspector' ? INSPECTORS.senior : INSPECTORS.inspector) } }),

      log: (action, assetId, detail, sessionId) => set(state => ({
        audit: [...state.audit, { id: uid('audit'), at: now(), by: state.actor.name, assetId, sessionId, action, detail }],
      })),

      startSession: ({ assetId, stage, qr, simulatedH1, focusComponent, briefs }) => {
        const state = get()
        const asset = ASSETS.find(a => a.id === assetId)
        if (!asset) throw new Error(`Không tìm thấy hạng mục ${assetId}`)
        const previous = sessionsFor(Object.values(state.sessions), assetId, stage)
        const attempt = previous.length + 1
        const id = sessionIdFor(asset.code, stage, attempt)
        const at = now()
        const session: InspectionSession = {
          id,
          assetId,
          stage,
          attempt,
          inspector: state.actor,
          helmetId: H1_HELMET_ID,
          simulatedH1,
          status: 'in_progress',
          qr,
          revisions: {
            afc: asset.afc.revision,
            bim: asset.bim.revision,
            checklist: STAGES[stage].checklistRevision,
            itp: asset.itp.revision,
            bptc: asset.bptc.revision,
            lockedAt: at,
          },
          startedAt: at,
          pauses: [],
          results: {},
          sync: 'pending',
          syncProgress: 0,
          reviews: {},
          previousSessionId: previous[previous.length - 1]?.id,
          focusComponent,
          briefs: briefs ?? [],
        }
        set({ sessions: { ...state.sessions, [id]: session } })
        get().log('session.start', assetId, `${STAGES[stage].code} ${STAGES[stage].label} · lần ${attempt} · khoá AFC ${asset.afc.revision} / ${STAGES[stage].checklistRevision}`, id)
        if (simulatedH1) get().log('h1.simulated', assetId, 'H1 offline — dùng luồng mô phỏng POC', id)
        return id
      },

      ackBrief: (sessionId, ack) => {
        const s = get().sessions[sessionId]
        if (!s || s.briefs?.some(b => b.briefId === ack.briefId)) return
        set(state => patchSession(state, sessionId, x => ({ ...x, briefs: [...(x.briefs ?? []), ack] })))
        get().log('brief.view', s.assetId, `${ack.briefId} · ${ack.version} · ${ack.requirementIds.length} yêu cầu`, sessionId)
      },

      setCriterion: (sessionId, criterionId, patch) => {
        const before = get().sessions[sessionId]?.results[criterionId]?.status
        set(state => patchSession(state, sessionId, s => ({
          ...s,
          results: {
            ...s.results,
            [criterionId]: { ...(s.results[criterionId] ?? { status: 'not_checked' }), ...patch, updatedAt: now() },
          },
        })))
        const s = get().sessions[sessionId]
        if (s && patch.status && patch.status !== before) {
          get().log('criterion.set', s.assetId, `${criterionId}: ${before ?? 'not_checked'} → ${patch.status}`, sessionId)
        }
      },

      addEvidence: evidence => {
        set(state => ({ evidence: { ...state.evidence, [evidence.id]: evidence } }))
        get().log('evidence.add', evidence.ctx.assetId, `${evidence.type} · ${evidence.label}`, evidence.ctx.sessionId)
      },

      pauseSession: sessionId => {
        const s = get().sessions[sessionId]
        if (!s || isPaused(s) || s.status !== 'in_progress') return
        set(state => patchSession(state, sessionId, x => ({ ...x, status: 'paused', pauses: [...x.pauses, { from: now() }] })))
        get().log('session.pause', s.assetId, 'Tạm dừng', sessionId)
      },

      resumeSession: sessionId => {
        const s = get().sessions[sessionId]
        if (!s || !isPaused(s)) return
        set(state => patchSession(state, sessionId, x => ({
          ...x,
          status: 'in_progress',
          pauses: x.pauses.map((p, i) => (i === x.pauses.length - 1 ? { ...p, to: now() } : p)),
        })))
        get().log('session.resume', s.assetId, 'Tiếp tục', sessionId)
      },

      finishSession: (sessionId, override) => {
        const s = get().sessions[sessionId]
        if (!s || (s.status !== 'in_progress' && s.status !== 'paused')) return
        const at = now()
        set(state => patchSession(state, sessionId, x => ({
          ...x,
          status: 'closed',
          finishedAt: at,
          pauses: x.pauses.map(p => (p.to ? p : { ...p, to: at })),
          finishOverride: override ? { ...override, by: state.actor.name, at } : undefined,
        })))
        const done = Object.values(s.results).filter(r => r.status !== 'not_checked').length
        get().log('session.finish', s.assetId, `${done}/${criteriaForStage(s.stage).length} tiêu chí hoàn thành`, sessionId)
        if (override) get().log('session.finish_override', s.assetId, `Kết thúc khi còn ${override.openItems} mục · Lý do: ${override.reason}`, sessionId)
      },

      setSync: (sessionId, sync, progress) => {
        set(state => patchSession(state, sessionId, x => ({ ...x, sync, syncProgress: progress })))
        const s = get().sessions[sessionId]
        if (s && sync === 'synced') get().log('sync.done', s.assetId, 'Đồng bộ video + bằng chứng hoàn tất', sessionId)
        if (s && sync === 'failed') get().log('sync.failed', s.assetId, 'Tải lên thất bại — sẽ thử lại', sessionId)
      },

      setVideo: (sessionId, video) => set(state => patchSession(state, sessionId, x => ({ ...x, video }))),

      setAi: (sessionId, findings) => {
        set(state => patchSession(state, sessionId, x => ({
          ...x,
          status: findings ? 'in_review' : x.status,
          ai: findings ? { status: 'done', findings, finishedAt: now() } : { status: 'running', findings: [] },
        })))
        const s = get().sessions[sessionId]
        if (s && findings) {
          const flagged = findings.filter(f => f.verdict !== 'pass_candidate').length
          get().log('ai.done', s.assetId, `${findings.length} phát hiện · ${flagged} cần người xem xét`, sessionId)
        }
      },

      decide: (sessionId, decision) => {
        const s = get().sessions[sessionId]
        if (!s || s.signOff) return
        const full: ReviewDecision = { ...decision, by: get().actor.name, at: now() }
        set(state => patchSession(state, sessionId, x => ({ ...x, reviews: { ...x.reviews, [decision.findingId]: full } })))
        get().log('review.decision', s.assetId, `${decision.findingId}: ${decision.action.toUpperCase()} → ${decision.finalStatus.toUpperCase()}${decision.comment ? ` · ${decision.comment}` : ''}`, sessionId)
      },

      createIssue: input => {
        const asset = ASSETS.find(a => a.id === input.assetId)
        const seq = get().issueSeq + 1
        const id = issueIdFor(asset?.code ?? input.assetId, seq)
        const issue: Issue = {
          ...input,
          id,
          status: 'open',
          history: [{ status: 'open', at: now(), by: get().actor.name, note: input.comment }],
        }
        set(state => ({ issues: { ...state.issues, [id]: issue }, issueSeq: seq }))
        get().log('issue.create', input.assetId, `${id} · ${input.criterionId} · ${input.responsible}`, input.sessionId)
        return id
      },

      setIssueStatus: (issueId, status, note) => {
        const issue = get().issues[issueId]
        if (!issue || issue.status === status) return
        set(state => ({
          issues: {
            ...state.issues,
            [issueId]: { ...issue, status, history: [...issue.history, { status, at: now(), by: state.actor.name, note }] },
          },
        }))
        get().log('issue.status', issue.assetId, `${issueId}: ${issue.status} → ${status}${note ? ` · ${note}` : ''}`, issue.sessionId)
      },

      signOff: (sessionId, input) => {
        const s = get().sessions[sessionId]
        if (!s || s.signOff) return
        const at = now()
        const full: SignOff = { ...input, inspector: get().actor, at, sessionId }
        set(state => patchSession(state, sessionId, x => ({ ...x, status: 'signed', signOff: full })))
        get().log('signoff', s.assetId, `${input.result.toUpperCase()} · ${input.revision}`, sessionId)
        if (input.result === 'pass') {
          for (const issue of Object.values(get().issues)) {
            if (issue.assetId === s.assetId && issue.stage === s.stage && issue.status !== 'closed') {
              set(state => ({
                issues: {
                  ...state.issues,
                  [issue.id]: {
                    ...issue,
                    status: 'closed',
                    closedBySessionId: sessionId,
                    history: [...issue.history, { status: 'closed', at, by: state.actor.name, note: `Đóng bởi phiên nghiệm thu lại ${sessionId}` }],
                  },
                },
              }))
              get().log('issue.status', s.assetId, `${issue.id}: ${issue.status} → closed · ${sessionId} PASS`, sessionId)
            }
          }
        }
      },

      resetDemo: () => {
        void clearBlobs().catch(() => {})
        set({ ...seedState(), actor: { ...INSPECTORS.inspector } })
      },
    }),
    {
      name: 'vifence-m07-flow-v1',
      partialize: state => ({
        actor: state.actor,
        sessions: state.sessions,
        evidence: state.evidence,
        issues: state.issues,
        audit: state.audit,
        issueSeq: state.issueSeq,
      }),
    },
  ),
)
