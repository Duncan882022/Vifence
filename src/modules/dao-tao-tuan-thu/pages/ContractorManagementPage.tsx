import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Trash2, Building2 } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { fetchContractors, createContractor, deleteContractor, type ContractorApiItem } from '@/api/contractor.api'

interface FormState {
  name: string
  code: string
  phone: string
  email: string
}

const INITIAL_FORM: FormState = {
  name: '',
  code: '',
  phone: '',
  email: '',
}

export function ContractorManagementPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [contractors, setContractors] = useState<ContractorApiItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loadContractors = async () => {
    setIsLoading(true)
    try {
      const res = await fetchContractors({ limit: 500, offset: 0 })
      setContractors(res.items)
    } catch (err) {
      console.error('Failed to load contractors', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadContractors()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    setError(null)

    if (!form.name.trim()) {
      setError('Vui lòng nhập tên nhà thầu')
      return
    }

    setIsSubmitting(true)
    try {
      await createContractor({
        name: form.name.trim(),
        code: form.code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      
      await loadContractors()
      
      setForm(INITIAL_FORM)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setError(`Không thể tạo nhà thầu: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xoá nhà thầu này?')) return
    try {
      await deleteContractor(id)
      await loadContractors()
    } catch (err) {
      alert('Xoá thất bại')
      console.error(err)
    }
  }

  return (
    <PageLayout scrollable>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/dttt"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 shrink-0 items-start">
        {/* FORM THÊM NHÀ THẦU */}
        <Panel title="Thêm nhà thầu" fit noPadding className="shrink-0 self-start xl:sticky xl:top-4 w-full">
          <form onSubmit={handleSubmit} className="space-y-3 p-4">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Tên nhà thầu
              </span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="VD: Delta Corp"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Mã nhà thầu
              </span>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="VD: DC-001"
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
                placeholder="VD: delta@example.com"
                className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
            {saved && <p className="text-[11px] text-green-400">Đã tạo nhà thầu mới</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:pointer-events-none mt-2"
            >
              {isSubmitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />
              }
              {isSubmitting ? 'Đang lưu...' : 'Thêm nhà thầu'}
            </button>
          </form>
        </Panel>

        {/* DANH SÁCH NHÀ THẦU */}
        <Panel
          title="Danh sách nhà thầu"
          noPadding
          fit
          className="min-h-[320px] sm:min-h-[420px]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : contractors.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-muted-foreground">Chưa có nhà thầu nào</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1e2433]">
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nhà thầu</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mã code</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Liên hệ</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2433]">
                  {contractors.map(c => (
                    <tr key={c.id} className="hover:bg-[#1a2235]/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.code || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{c.phone || '—'}</div>
                        <div className="text-muted-foreground/70">{c.email || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PageLayout>
  )
}
