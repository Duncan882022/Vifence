import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Trash2, Pencil, X, Upload, FileDown, Download, Image as ImageIcon } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { fetchWorkers, createWorker, updateWorker, deleteWorker, uploadWorkerAvatar, downloadWorkersTemplate, importWorkersZip, exportWorkers, type WorkerApiItem, type ImportWorkersResponse } from '@/api/worker.api'
import { fetchContractors, type ContractorApiItem } from '@/api/contractor.api'
import { ChevronDown, Search } from 'lucide-react'

interface FormState {
  name: string
  phone: string
  email: string
  cccd: string
  contractorId: string
  gender: string
  birthDate: string
  faceFrontFile: File | null
  faceLeftFile: File | null
  faceRightFile: File | null
  faceFrontUrlPreview: string | null
  faceLeftUrlPreview: string | null
  faceRightUrlPreview: string | null
}

const INITIAL_FORM: FormState = {
  name: '',
  phone: '',
  email: '',
  cccd: '',
  contractorId: '',
  gender: '',
  birthDate: '2000-01-01',
  faceFrontFile: null,
  faceLeftFile: null,
  faceRightFile: null,
  faceFrontUrlPreview: null,
  faceLeftUrlPreview: null,
  faceRightUrlPreview: null,
}

interface FacePhotoSlotProps {
  label: string
  displayUrl: string | null
  onPick: (file: File | null) => void
}

function FacePhotoSlot({ label, displayUrl, onPick }: FacePhotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="relative flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      {displayUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative h-28 w-full overflow-hidden rounded-lg border border-[#1e2433] bg-black group"
          title={`Đổi ảnh ${label}`}
        >
          <img src={displayUrl} alt={label} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white">
              <Upload className="w-3.5 h-3.5" />
              Đổi ảnh
            </span>
          </div>
          <span className="absolute bottom-1 left-1 right-1 text-center text-[8px] font-medium text-white/90 bg-black/55 rounded py-0.5">
            {label}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#1e2433] bg-[#0b0f1a] text-muted-foreground/50 transition-colors hover:border-primary/40 hover:bg-[#1a2235] hover:text-muted-foreground"
        >
          <ImageIcon className="mb-1 h-5 w-5" />
          <span className="text-[9px] font-medium uppercase tracking-wider">{label}</span>
          <span className="mt-0.5 text-[8px] text-muted-foreground/60">Chọn ảnh</span>
        </button>
      )}
    </div>
  )
}

export function WorkerManagementPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [workers, setWorkers] = useState<WorkerApiItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [contractors, setContractors] = useState<ContractorApiItem[]>([])
  
  // Combobox state
  const [isContractorOpen, setIsContractorOpen] = useState(false)
  const [contractorSearch, setContractorSearch] = useState('')

  // Bulk import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportWorkersResponse | null>(null)

  const loadWorkers = async () => {
    setIsLoading(true)
    try {
      const res = await fetchWorkers({ limit: 500, offset: 0 })
      setWorkers(res.items)
    } catch (err) {
      console.error('Failed to load workers', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadWorkersTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'workers_template.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download template', err)
      alert('Tải file mẫu thất bại. Vui lòng thử lại.')
    }
  }

  const handleImportZip = async () => {
    if (!importFile) return
    setIsImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const result = await importWorkersZip(importFile)
      setImportResult(result)
      if (result.success > 0) {
        void loadWorkers()
      }
    } catch (err: any) {
      console.error('Failed to import zip', err)
      const rawDetail = err.response?.data?.detail
      const errorMsg = typeof rawDetail === 'object' && rawDetail !== null
        ? (rawDetail.message || JSON.stringify(rawDetail))
        : (typeof rawDetail === 'string' ? rawDetail : 'Import thất bại. Vui lòng kiểm tra lại định dạng file.')
      setImportError(errorMsg)
    } finally {
      setIsImporting(false)
    }
  }

  const handleExportWorkers = async () => {
    try {
      const blob = await exportWorkers()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'workers_export.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export workers', err)
      alert('Xuất danh sách nhân sự thất bại. Vui lòng thử lại.')
    }
  }

  useEffect(() => {
    void loadWorkers()
    fetchContractors({ limit: 100 }).then(res => setContractors(res.items)).catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    setError(null)

    if (!form.name.trim()) {
      setError('Vui lòng nhập tên nhân sự')
      return
    }
    if (!form.cccd.trim()) {
      setError('Vui lòng nhập số CCCD')
      return
    }
    if (form.cccd.trim().length < 9) {
      setError('Số CCCD phải có độ dài từ 9 ký tự trở lên')
      return
    }

    setIsSubmitting(true)
    try {
      const hasFaceFiles = !!(form.faceFrontFile || form.faceLeftFile || form.faceRightFile)

      let savedWorker: WorkerApiItem
      if (editingId) {
        savedWorker = await updateWorker(editingId, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          cccd: form.cccd.trim() || null,
          contractorId: form.contractorId || null,
          gender: (form.gender || null) as any,
          birthDate: form.birthDate || null,
        })
      } else {
        savedWorker = await createWorker({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          cccd: form.cccd.trim() || null,
          contractorId: form.contractorId || null,
          gender: (form.gender || null) as any,
          birthDate: form.birthDate || null,
        })
      }

      // Upload ảnh chân dung nếu có file mới
      if (hasFaceFiles) {
        await uploadWorkerAvatar(savedWorker.id, {
          faceFront: form.faceFrontFile,
          faceLeft:  form.faceLeftFile,
          faceRight: form.faceRightFile,
        })
      }
      
      await loadWorkers()
      
      setForm(INITIAL_FORM)
      setEditingId(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setError(`Không thể ${editingId ? 'cập nhật' : 'tạo'} nhân sự: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (worker: WorkerApiItem) => {
    setEditingId(worker.id)
    setForm({
      name: worker.name,
      phone: worker.phone || '',
      email: worker.email || '',
      cccd: worker.cccd || '',
      contractorId: worker.contractorId || '',
      gender: worker.gender || '',
      birthDate: worker.birthDate ? worker.birthDate.split('T')[0] : '',
      faceFrontFile: null,
      faceLeftFile: null,
      faceRightFile: null,
      faceFrontUrlPreview: worker.faceFrontUrl || null,
      faceLeftUrlPreview: worker.faceLeftUrl || null,
      faceRightUrlPreview: worker.faceRightUrl || null,
    })
    setSaved(false)
    setError(null)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xoá nhân sự này?')) return
    try {
      await deleteWorker(id)
      await loadWorkers()
    } catch (err) {
      alert('Xoá thất bại')
      console.error(err)
    }
  }

  return (
    <PageLayout scrollable>
      <div className="flex items-center justify-between shrink-0 mb-1">
        <Link
          to="/dttt"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2235] text-xs text-muted-foreground hover:text-foreground transition-colors border border-[#2d3852]"
          >
            <FileDown className="w-3.5 h-3.5" />
            Tải Excel mẫu
          </button>
          <button
            onClick={handleExportWorkers}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2235] text-xs text-muted-foreground hover:text-foreground transition-colors border border-[#2d3852]"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất danh sách
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-xs text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import từ ZIP
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 shrink-0 items-start">
        {/* FORM THÊM / SỬA NHÂN SỰ */}
        <Panel title={editingId ? 'Sửa nhân sự' : 'Thêm nhân sự'} fit noPadding overflowVisible className="shrink-0 self-start xl:sticky xl:top-4 w-full z-10">
          <form onSubmit={handleSubmit} className="space-y-3 p-4">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Họ và Tên
              </span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Số CCCD (Căn cước công dân)
              </span>
              <input
                value={form.cccd}
                onChange={e => setForm(f => ({ ...f, cccd: e.target.value }))}
                placeholder="VD: 012345678912"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Số điện thoại
              </span>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="VD: 0987654321"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Email
              </span>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="VD: a@example.com"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Giới tính (Tuỳ chọn)
                </span>
                <select
                  value={form.gender}
                  onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="">Chọn...</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Ngày sinh (Tuỳ chọn)
                </span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                />
              </label>
            </div>

            <div className="block space-y-1 relative">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Nhà thầu (Tuỳ chọn)
              </span>
              <button
                type="button"
                onClick={() => setIsContractorOpen(!isContractorOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-left focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <span className={form.contractorId ? 'text-foreground' : 'text-muted-foreground/40'}>
                  {form.contractorId ? contractors.find(c => c.id === form.contractorId)?.name : 'Chọn nhà thầu...'}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              
              {isContractorOpen && (
                <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-[#0d1117] border border-[#1e2433] rounded-lg shadow-xl overflow-hidden flex flex-col max-h-48">
                  <div className="p-2 border-b border-[#1e2433] relative shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={contractorSearch}
                      onChange={e => setContractorSearch(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 rounded bg-[#1a2235] text-xs text-foreground focus:outline-none"
                    />
                  </div>
                  <div className="overflow-y-auto p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, contractorId: '' }))
                        setIsContractorOpen(false)
                        setContractorSearch('')
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-[#1a2235] rounded transition-colors"
                    >
                      Bỏ chọn (Không gán)
                    </button>
                    {contractors
                      .filter(c => c.name.toLowerCase().includes(contractorSearch.toLowerCase()) || c.code?.toLowerCase().includes(contractorSearch.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, contractorId: c.id }))
                            setIsContractorOpen(false)
                            setContractorSearch('')
                          }}
                          className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-[#1a2235] rounded transition-colors"
                        >
                          {c.name} {c.code && <span className="text-muted-foreground ml-1">({c.code})</span>}
                        </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Ảnh khuôn mặt (Tuỳ chọn)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'faceLeft', label: 'Mặt trái' },
                  { key: 'faceFront', label: 'Chính diện' },
                  { key: 'faceRight', label: 'Mặt phải' },
                ] as const).map((item) => {
                  const fileKey = `${item.key}File` as keyof FormState
                  const previewKey = `${item.key}UrlPreview` as keyof FormState
                  const file = form[fileKey] as File | null
                  const previewUrl = form[previewKey] as string | null
                  const displayUrl = file ? URL.createObjectURL(file) : previewUrl

                  return (
                    <FacePhotoSlot
                      key={item.key}
                      label={item.label}
                      displayUrl={displayUrl}
                      onPick={(picked) => {
                        setForm(prev => ({ ...prev, [fileKey]: picked }))
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {saved && <p className="text-[11px] text-green-400">Đã lưu thông tin nhân sự</p>}

            <div className="flex items-center gap-2 mt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:pointer-events-none"
              >
                {isSubmitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />
                }
                {isSubmitting ? 'Đang lưu...' : (editingId ? 'Cập nhật' : 'Thêm nhân sự')}
              </button>
              
              {editingId && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setEditingId(null)
                    setForm(INITIAL_FORM)
                    setError(null)
                    setSaved(false)
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#1a2235] text-muted-foreground text-sm font-semibold hover:text-foreground hover:bg-[#232d45] transition-colors disabled:opacity-60 disabled:pointer-events-none"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </Panel>

        {/* DANH SÁCH NHÂN SỰ */}
        <Panel
          title="Danh sách nhân sự"
          noPadding
          fit
          className="min-h-[320px] sm:min-h-[420px]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : workers.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-muted-foreground">Chưa có nhân sự nào</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-[#1e2433]">
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tên</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Giới tính</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ngày sinh</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Số CCCD</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Số điện thoại</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nhà thầu</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2433]">
                    {workers.map(w => {
                      const initial = w.name ? w.name.charAt(0).toUpperCase() : '?'
                      const genderText = w.gender === 'male' ? 'Nam' : w.gender === 'female' ? 'Nữ' : '—'
                      const birthDateText = w.birthDate ? w.birthDate.split('T')[0].split('-').reverse().join('/') : '—'
                      return (
                        <tr key={w.id} className="hover:bg-[#1a2235]/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border border-primary/20">
                                {w.faceFrontUrl ? (
                                  <img src={w.faceFrontUrl} alt={w.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-primary font-bold text-xs">{initial}</span>
                                )}
                              </div>
                              <span>{w.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{genderText}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{birthDateText}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{w.cccd || '—'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{w.phone || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{w.email || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {w.contractor?.name || '—'}
                        </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(w)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(w.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* MODAL IMPORT FILE ZIP */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-xl bg-[#0d121f] border border-[#1e2433] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433]">
              <span className="text-sm font-bold text-foreground">Import nhân sự hàng loạt</span>
              <button
                onClick={() => {
                  setIsImportModalOpen(false)
                  setImportFile(null)
                  setImportError(null)
                  setImportResult(null)
                }}
                className="p-1 hover:bg-[#1a2235] rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {!importResult && !isImporting && (
                <div className="space-y-4">
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Vui lòng chọn file <strong>.zip</strong> chứa file <code>workers.xlsx</code> và thư mục <code>faces/</code> chứa ảnh của công nhân (tên thư mục con trong <code>faces/</code> là CCCD tương ứng).
                  </div>
                  <div className="p-3 rounded-lg bg-[#070a12] border border-[#1e2433] font-mono text-[10px] text-muted-foreground/90 space-y-0.5">
                    <div className="text-[10px] font-semibold text-primary mb-1.5 font-sans uppercase tracking-wider">Cấu trúc file ZIP mẫu:</div>
                    <div>import_workers.zip</div>
                    <div>├── workers.xlsx</div>
                    <div>└── faces/</div>
                    <div>    ├── 031205001234/ <span className="text-muted-foreground/40">(Thư mục đặt tên theo CCCD 1)</span></div>
                    <div>    │   ├── 001.jpg   <span className="text-muted-foreground/40">(Ảnh chính diện)</span></div>
                    <div>    │   ├── 002.jpg   <span className="text-muted-foreground/40">(Ảnh mặt trái)</span></div>
                    <div>    │   └── 003.jpg   <span className="text-muted-foreground/40">(Ảnh mặt phải)</span></div>
                    <div>    └── 031205005678/ <span className="text-muted-foreground/40">(Thư mục đặt tên theo CCCD 2)</span></div>
                  </div>
                  <label className="flex flex-col items-center justify-center h-32 border border-dashed border-[#232d45] rounded-xl bg-[#090b11] hover:bg-[#111624] transition-colors cursor-pointer text-center px-4">
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null
                        setImportFile(file)
                        setImportError(null)
                      }}
                    />
                    <Upload className="w-8 h-8 text-muted-foreground/60 mb-2" />
                    {importFile ? (
                      <span className="text-xs font-semibold text-primary">{importFile.name}</span>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-foreground">Kéo thả hoặc click chọn file ZIP</span>
                        <span className="text-[10px] text-muted-foreground mt-1">Hỗ trợ định dạng file .zip tối đa 200MB</span>
                      </>
                    )}
                  </label>

                  {importError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      {importError}
                    </div>
                  )}
                </div>
              )}

              {isImporting && (
                <div className="flex flex-col items-center justify-center py-6 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Đang xử lý dữ liệu import, vui lòng không tắt cửa sổ này...</span>
                </div>
              )}

              {importResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded bg-[#1a2235]">
                      <div className="text-lg font-bold text-foreground">{importResult.total}</div>
                      <div className="text-[9px] text-muted-foreground uppercase">Tổng số</div>
                    </div>
                    <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                      <div className="text-lg font-bold text-green-400">{importResult.success}</div>
                      <div className="text-[9px] text-green-400/80 uppercase">Thành công</div>
                    </div>
                    <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                      <div className="text-lg font-bold text-yellow-400">{importResult.skipped}</div>
                      <div className="text-[9px] text-yellow-400/80 uppercase">Bỏ qua</div>
                    </div>
                    <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                      <div className="text-lg font-bold text-red-400">{importResult.failed}</div>
                      <div className="text-[9px] text-red-400/80 uppercase">Lỗi</div>
                    </div>
                  </div>

                  <div className="border border-[#1e2433] rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#0b0f1a] sticky top-0 border-b border-[#1e2433]">
                        <tr>
                          <th className="px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Dòng</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Tên</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground">CCCD</th>
                          <th className="px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e2433]">
                        {importResult.details.map((detail, idx) => (
                          <tr key={idx} className="hover:bg-[#1a2235]/30">
                            <td className="px-3 py-2 text-muted-foreground">{detail.row}</td>
                            <td className="px-3 py-2 font-medium text-foreground">{detail.name || '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">{detail.cccd || '—'}</td>
                            <td className="px-3 py-2">
                              {detail.status === 'success' && (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-semibold text-[10px]">
                                  Thành công
                                </span>
                              )}
                              {detail.status === 'skipped' && (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-semibold text-[10px]" title={detail.reason}>
                                  Bỏ qua
                                </span>
                              )}
                              {detail.status === 'failed' && (
                                <span className="inline-flex px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-semibold text-[10px]" title={detail.reason}>
                                  Lỗi: {detail.reason}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[#1e2433] bg-[#0b0f1a] rounded-b-xl flex items-center justify-end gap-2">
              {!importResult ? (
                <>
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-[#1a2235] transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleImportZip}
                    disabled={!importFile || isImporting}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Bắt đầu Import
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsImportModalOpen(false)
                    setImportFile(null)
                    setImportError(null)
                    setImportResult(null)
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Đóng
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
