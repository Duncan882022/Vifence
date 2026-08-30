import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Download, Eye, FileSpreadsheet, Loader2, Pencil, RefreshCw,
  ScanFace, Search, Trash2, Upload, UserCheck, Users,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { cn } from '@/utils/cn'
import {
  deletePatrolWorkerProfile,
  fetchPatrolWorkerProfiles,
  importPatrolWorkerProfiles,
  pingPatrolProfileBackend,
  type PatrolImportRow,
  type PatrolImportResult,
  type PatrolWorkerPerson,
} from '../services/patrolWorkerProfile.service'
import { WorkerProfileDetailModal } from '../components/WorkerProfileDetailModal'

const TEMPLATE_HEADERS = ['Họ tên', 'Mã nhân viên', 'Đơn vị'] as const

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    ['Nguyễn Văn A', 'NV001', 'Vincons'],
    ['Trần Văn B', 'SGC-0000123', 'SGC'],
  ])
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'CongNhan')
  XLSX.writeFile(wb, 'patrol_workers_template.xlsx')
}

function parseExcelRows(file: File): Promise<PatrolImportRow[]> {
  return file.arrayBuffer().then(buf => {
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
    return rows.map(row => ({
      full_name: String(row['Họ tên'] ?? row.ho_ten ?? row.full_name ?? '').trim(),
      employee_code: String(row['Mã nhân viên'] ?? row.ma_nv ?? row.employee_code ?? '').trim(),
      contractor: String(row['Đơn vị'] ?? row.don_vi ?? row.contractor ?? '').trim(),
    })).filter(r => r.full_name || r.employee_code)
  })
}

function FaceBadge({ count, complete }: { count: number; complete?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border tabular-nums',
      complete
        ? 'bg-green-400/10 text-green-400 border-green-400/30'
        : count > 0
          ? 'bg-violet-400/10 text-violet-400 border-violet-400/30'
          : 'bg-amber-400/10 text-amber-400 border-amber-400/30',
    )}>
      <ScanFace className="w-2.5 h-2.5" />
      {count}/3
    </span>
  )
}

export function WorkerProfileManagementPage() {
  const [profiles, setProfiles] = useState<PatrolWorkerPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<PatrolImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [detailPersId, setDetailPersId] = useState<string | null>(null)
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ok = await pingPatrolProfileBackend()
      setBackendOk(ok)
      if (!ok) {
        setProfiles([])
        return
      }
      const items = await fetchPatrolWorkerProfiles('identified')
      setProfiles(items)
    } catch {
      setBackendOk(false)
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(p =>
      (p.full_name ?? '').toLowerCase().includes(q)
      || (p.employee_code ?? '').toLowerCase().includes(q)
      || (p.contractor ?? '').toLowerCase().includes(q)
      || p.pers_id.toLowerCase().includes(q),
    )
  }, [profiles, search])

  const stats = useMemo(() => {
    const total = profiles.length
    const withFace = profiles.filter(p => (p.face_count ?? 0) > 0).length
    const complete = profiles.filter(p => p.face_enrollment_complete).length
    return { total, withFace, complete }
  }, [profiles])

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const rows = await parseExcelRows(importFile)
      if (rows.length === 0) {
        setImportError('File Excel không có dòng hợp lệ.')
        return
      }
      const invalid = rows.filter(r => !r.full_name || !r.employee_code)
      if (invalid.length > 0) {
        setImportError(`${invalid.length} dòng thiếu Họ tên hoặc Mã nhân viên.`)
        return
      }
      const result = await importPatrolWorkerProfiles(rows)
      setImportResult(result)
      if (result.success > 0) void load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import thất bại.')
    } finally {
      setImporting(false)
    }
  }

  const openDetail = (persId: string, mode: 'view' | 'edit' = 'view') => {
    setDetailMode(mode)
    setDetailPersId(persId)
    setRowError(null)
  }

  const handleQuickDelete = async (p: PatrolWorkerPerson) => {
    const name = p.full_name ?? p.display_name
    if (!window.confirm(`Xóa hồ sơ "${name}" (${p.employee_code})?\nVector mặt cũng bị xóa — không hoàn tác.`)) {
      return
    }
    setDeletingId(p.pers_id)
    setRowError(null)
    try {
      await deletePatrolWorkerProfile(p.pers_id)
      if (detailPersId === p.pers_id) setDetailPersId(null)
      void load()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Xóa thất bại.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <PageLayout scrollable>
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/module05"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Về Module 05
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Làm mới
            </button>
            <Link
              to="/module05/quet-mat?admin=1"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold bg-violet-500 text-white hover:bg-violet-500/90"
            >
              <ScanFace className="w-3 h-3" />
              Quét mặt
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Hồ sơ', value: stats.total, icon: Users, color: 'text-sky-400' },
            { label: 'Có vector', value: stats.withFace, icon: ScanFace, color: 'text-violet-400' },
            { label: 'Đủ 3 góc', value: stats.complete, icon: UserCheck, color: 'text-green-400' },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="rounded-lg border border-[#1e2433] bg-[#0a0e17] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground uppercase tracking-wide">
                  <Icon className={cn('w-3 h-3', k.color)} />
                  {k.label}
                </div>
                <p className={cn('text-lg font-bold tabular-nums mt-0.5', k.color)}>{k.value}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col xl:grid xl:grid-cols-[minmax(0,1fr)_320px] gap-3 shrink-0">
        <Panel title="Danh sách hồ sơ" className="min-h-[360px] flex flex-col shrink-0">
          <div className="flex flex-col gap-2 p-3 border-b border-[#1e2433] shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm tên, mã NV, đơn vị…"
                className="w-full pl-8 pr-3 py-2 text-[11px] rounded-lg border border-[#1e2433] bg-[#0a0e17] outline-none focus:border-primary/50"
              />
            </div>
            {backendOk === false && (
              <p className="text-[10px] text-amber-400">Backend tuần tra chưa sẵn sàng — kiểm tra URL backend.</p>
            )}
            {rowError && (
              <p className="text-[10px] text-red-400">{rowError}</p>
            )}
          </div>

          <div className="max-h-[min(60dvh,520px)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-16">
                Chưa có hồ sơ — tải mẫu Excel và import bên phải.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#0b0f1a] border-b border-[#1e2433] text-[9px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Họ tên</th>
                    <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Mã NV</th>
                    <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Đơn vị</th>
                    <th className="text-left px-3 py-2 font-semibold">Vector</th>
                    <th className="text-right px-3 py-2 font-semibold min-w-[140px]">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.pers_id} className="border-b border-[#1e2433]/60 hover:bg-[#0c1019]">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground truncate max-w-[160px]">{p.full_name ?? p.display_name}</p>
                        <p className="text-[9px] text-muted-foreground font-mono sm:hidden">{p.employee_code}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] hidden sm:table-cell">{p.employee_code ?? '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell truncate max-w-[120px]">{p.contractor ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <FaceBadge count={p.face_count ?? 0} complete={p.face_enrollment_complete} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-0.5 flex-wrap">
                          <button
                            type="button"
                            title="Xem chi tiết"
                            onClick={() => openDetail(p.pers_id, 'view')}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Sửa hồ sơ"
                            onClick={() => openDetail(p.pers_id, 'edit')}
                            className="p-1.5 rounded text-muted-foreground hover:text-sky-400 hover:bg-sky-400/10"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            to={`/module05/quet-mat?code=${encodeURIComponent(p.employee_code ?? '')}`}
                            title="Quét mặt"
                            className="p-1.5 rounded text-violet-300 hover:bg-violet-500/10"
                          >
                            <ScanFace className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            title="Xóa hồ sơ"
                            disabled={deletingId === p.pers_id}
                            onClick={() => void handleQuickDelete(p)}
                            className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            {deletingId === p.pers_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>

        <Panel title="Import Excel" className="shrink-0 h-fit xl:sticky xl:top-3">
          <div className="p-3 space-y-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Cột bắt buộc: <strong className="text-foreground">Họ tên</strong>, <strong className="text-foreground">Mã nhân viên</strong>.
              Upsert theo mã — trùng mã sẽ cập nhật tên/đơn vị. Sau import, sang trang Quét mặt để lưu vector.
            </p>

            <button
              type="button"
              onClick={downloadTemplate}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-semibold border border-[#1e2433] hover:bg-[#1a2235]"
            >
              <Download className="w-3.5 h-3.5" />
              Tải file mẫu (.xlsx)
            </button>

            <label className="block">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Chọn file</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => {
                  setImportFile(e.target.files?.[0] ?? null)
                  setImportResult(null)
                  setImportError(null)
                }}
                className="block w-full text-[10px] file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-primary file:text-primary-foreground"
              />
            </label>

            {importFile && (
              <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                {importFile.name}
              </p>
            )}

            {importError && (
              <p className="text-[10px] text-red-400">{importError}</p>
            )}

            {importResult && (
              <div className="rounded-lg border border-[#1e2433] bg-[#0c1019] p-2.5 text-[10px] space-y-1">
                <p className="text-green-400 font-semibold">Thành công: {importResult.success}/{importResult.total}</p>
                {importResult.failed > 0 && (
                  <p className="text-amber-400">Lỗi: {importResult.failed} dòng</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!importFile || importing}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Import hồ sơ
            </button>
          </div>
        </Panel>
      </div>

      <WorkerProfileDetailModal
        persId={detailPersId}
        initialMode={detailMode}
        onClose={() => setDetailPersId(null)}
        onChanged={() => void load()}
      />
    </PageLayout>
  )
}
