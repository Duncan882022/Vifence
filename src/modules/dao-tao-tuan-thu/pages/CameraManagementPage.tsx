import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Trash2, Video, Edit2, X, Check } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import {
  fetchCameras,
  createCamera,
  updateCamera,
  deleteCamera,
  fetchAiWorkers,
  type CameraApiItem,
  type AiWorkerApiItem,
} from '@/api/camera.api'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  stopped:                    { label: 'Dừng',          color: 'text-muted-foreground' },
  streaming:                  { label: 'Đang stream',    color: 'text-green-400' },
  recording_continuous:       { label: 'Ghi liên tục',   color: 'text-blue-400' },
  recording_event:            { label: 'Ghi sự kiện',    color: 'text-amber-400' },
  recording_continuous_event:  { label: 'Liên tục + Sự kiện', color: 'text-emerald-400' },
}

interface FormState {
  name: string
  rtspUrl: string
  rtspType: 'pull' | 'push'
  address: string
  workerId: string
  lat: string
  lng: string
}

const EMPTY_FORM: FormState = {
  name: '', rtspUrl: '', rtspType: 'pull', address: '', workerId: '', lat: '21.0285', lng: '105.8342',
}

export function CameraManagementPage() {
  const [cameras, setCameras] = useState<CameraApiItem[]>([])
  const [workers, setWorkers] = useState<AiWorkerApiItem[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setIsLoading(true)
    try {
      const [camRes, wRes] = await Promise.all([
        fetchCameras({ limit: 100 }),
        fetchAiWorkers(),
      ])
      setCameras(camRes.items)
      setWorkers(wRes.items)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const resetForm = () => { setForm(EMPTY_FORM); setEditId(null); setError(null); setSaved(false) }

  const startEdit = (cam: CameraApiItem) => {
    setEditId(cam.id)
    setForm({
      name: cam.name,
      rtspUrl: cam.rtspUrl,
      rtspType: cam.rtspType,
      address: cam.address,
      workerId: cam.workerId ?? '',
      lat: String(cam.lat ?? '21.0285'),
      lng: String(cam.lng ?? '105.8342'),
    })
    setError(null); setSaved(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false); setError(null)
    if (!form.name.trim()) { setError('Vui lòng nhập tên camera'); return }
    if (!form.rtspUrl.trim()) { setError('Vui lòng nhập RTSP URL'); return }

    setIsSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        rtspUrl: form.rtspUrl.trim(),
        rtspType: form.rtspType,
        address: form.address.trim() || 'N/A',
        workerId: form.workerId || undefined,
        lat: parseFloat(form.lat) || 21.0285,
        lng: parseFloat(form.lng) || 105.8342,
      }

      if (editId) {
        await updateCamera(editId, payload)
      } else {
        await createCamera(payload)
      }

      setSaved(true)
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu camera')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xoá camera này?')) return
    try {
      await deleteCamera(id)
      await load()
    } catch {
      alert('Xoá thất bại')
    }
  }

  const inp = 'w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40'

  return (
    <PageLayout scrollable>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/dttt"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quay lại Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Form thêm / sửa */}
        <Panel
          title={editId ? 'Cập nhật Camera' : 'Thêm Camera Mới'}
          fit
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tên camera</span>
              <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Camera cổng A" />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">RTSP URL</span>
              <input className={inp} value={form.rtspUrl} onChange={e => setForm(f => ({ ...f, rtspUrl: e.target.value }))} placeholder="rtsp://..." />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Loại RTSP</span>
                <select className={inp} value={form.rtspType} onChange={e => setForm(f => ({ ...f, rtspType: e.target.value as 'pull' | 'push' }))}>
                  <option value="pull">Pull</option>
                  <option value="push">Push</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Worker</span>
                <select className={inp} value={form.workerId} onChange={e => setForm(f => ({ ...f, workerId: e.target.value }))}>
                  <option value="">— Không gán —</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.socket})</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Địa chỉ</span>
              <input className={inp} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="VD: Toà A - Tầng 1" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Vĩ độ (Lat)</span>
                <input type="number" className={inp} value={form.lat} step="any" onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Kinh độ (Lng)</span>
                <input type="number" className={inp} value={form.lng} step="any" onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} />
              </label>
            </div>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {saved && <p className="text-[11px] text-green-400">{editId ? 'Đã cập nhật camera' : 'Đã thêm camera mới'}</p>}

            <div className="flex gap-2">
              {editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e2433] text-muted-foreground text-xs hover:bg-[#1a2235] transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Huỷ
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSubmitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : editId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />
                }
                {isSubmitting ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Thêm camera'}
              </button>
            </div>
          </form>
        </Panel>

        {/* Danh sách camera */}
        <Panel title={`Danh sách Camera (${cameras.length})`} noPadding fit className="min-h-[320px]">
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : cameras.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground py-10">Chưa có camera nào</p>
          ) : (
            <div className="divide-y divide-[#1e2433]/60">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1.5fr_100px_80px_auto] gap-2 px-3 py-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
                <span>Tên</span>
                <span>RTSP URL</span>
                <span>Worker</span>
                <span>Trạng thái</span>
                <span />
              </div>
              {cameras.map(cam => {
                const st = STATUS_LABELS[cam.status] ?? { label: cam.status, color: 'text-muted-foreground' }
                const worker = workers.find(w => w.id === cam.workerId)
                return (
                  <div key={cam.id} className="grid grid-cols-[1fr_1.5fr_100px_80px_auto] gap-2 items-center px-3 py-2.5 hover:bg-[#0d1117]/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center shrink-0">
                        <Video className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-[11px] font-medium text-foreground truncate">{cam.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate font-mono">{cam.rtspUrl}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{worker ? worker.name : '—'}</span>
                    <span className={`text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(cam)}
                        className="p-1 rounded text-muted-foreground hover:bg-[#1a2235] hover:text-primary transition-colors"
                        title="Sửa"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void handleDelete(cam.id)}
                        className="p-1 rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400 transition-colors"
                        title="Xoá"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </PageLayout>
  )
}
