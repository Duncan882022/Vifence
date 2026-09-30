import { useEffect, useMemo, useState } from 'react'
import { useInspectionFlowStore } from '../store/inspectionFlow.store'
import { getBlob } from '../services/workflow/evidenceBlobs'
import type { AuditEvent, Evidence, InspectionSession, Issue } from '../workflow.types'

export function useSessions(): InspectionSession[] {
  const record = useInspectionFlowStore(s => s.sessions)
  return useMemo(() => Object.values(record), [record])
}

export function useIssues(assetId?: string): Issue[] {
  const record = useInspectionFlowStore(s => s.issues)
  return useMemo(() => Object.values(record).filter(i => !assetId || i.assetId === assetId), [record, assetId])
}

export function useEvidence(filter?: { assetId?: string; sessionId?: string }): Evidence[] {
  const record = useInspectionFlowStore(s => s.evidence)
  const assetId = filter?.assetId
  const sessionId = filter?.sessionId
  return useMemo(
    () => Object.values(record)
      .filter(e => (!assetId || e.ctx.assetId === assetId) && (!sessionId || e.ctx.sessionId === sessionId))
      .sort((a, b) => a.ctx.timestamp.localeCompare(b.ctx.timestamp)),
    [record, assetId, sessionId],
  )
}

export function useAudit(assetId: string, sessionId?: string): AuditEvent[] {
  const audit = useInspectionFlowStore(s => s.audit)
  return useMemo(
    () => audit.filter(a => a.assetId === assetId && (!sessionId || a.sessionId === sessionId)),
    [audit, assetId, sessionId],
  )
}

export function useSession(sessionId: string | undefined): InspectionSession | undefined {
  return useInspectionFlowStore(s => (sessionId ? s.sessions[sessionId] : undefined))
}

/** Object URL cho blob trong IndexedDB — tự thu hồi khi unmount. */
export function useBlobUrl(key: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!key) {
      setUrl(null)
      return
    }
    let revoked = false
    let created: string | null = null
    void getBlob(key).then(blob => {
      if (revoked || !blob) return
      created = URL.createObjectURL(blob)
      setUrl(created)
    }).catch(() => setUrl(null))
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [key])
  return url
}

/** Đồng hồ 1s cho timer phiên. */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}
