import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Trash2, Edit2, Shield, ShieldAlert } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useAppStore } from '@/store/app.store'
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  type RoleApiItem
} from '@/api/user.api'

interface FormState {
  name: string
  code: string
}

const INITIAL_FORM: FormState = {
  name: '',
  code: '',
}

export function RoleManagementPage() {
  const { user: currentUser } = useAppStore()
  const isSuper = currentUser?.role === 'super'

  const [roles, setRoles] = useState<RoleApiItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Left-column form state (for Creation)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Edit modal state
  const [editingRole, setEditingRole] = useState<RoleApiItem | null>(null)
  const [editForm, setEditForm] = useState<FormState>(INITIAL_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const loadRoles = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetchRoles({ limit: 100 })
      setRoles(res.items)
    } catch (err) {
      console.error('Failed to load roles', err)
      setError('Không thể tải danh sách vai trò từ hệ thống.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadRoles()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.name.trim()) {
      setError('Vui lòng nhập tên nhóm quyền')
      return
    }
    if (!form.code.trim()) {
      setError('Vui lòng nhập mã code')
      return
    }

    const cleanedCode = form.code.trim().toLowerCase()
    if (cleanedCode === 'super') {
      setError('Không thể tạo vai trò với mã code "super"')
      return
    }

    setIsSubmitting(true)
    try {
      await createRole({
        name: form.name.trim(),
        code: cleanedCode,
      })
      setForm(INITIAL_FORM)
      setSuccess('Đã tạo nhóm quyền mới thành công!')
      await loadRoles()
      setTimeout(() => setSuccess(null), 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setError(`Tạo thất bại: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenEdit = (role: RoleApiItem) => {
    if (role.code === 'super') {
      alert('Không thể chỉnh sửa vai trò Super Admin!')
      return
    }
    setEditingRole(role)
    setEditForm({
      name: role.name,
      code: role.code,
    })
    setEditError(null)
    setEditSuccess(null)
    setIsEditOpen(true)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditError(null)
    setEditSuccess(null)

    if (!editingRole) return

    if (!editForm.name.trim()) {
      setEditError('Vui lòng nhập tên nhóm quyền')
      return
    }
    if (!editForm.code.trim()) {
      setEditError('Vui lòng nhập mã code')
      return
    }

    const cleanedCode = editForm.code.trim().toLowerCase()
    if (cleanedCode === 'super') {
      setEditError('Không thể thay đổi mã vai trò thành "super"')
      return
    }

    setIsSubmitting(true)
    try {
      await updateRole(editingRole.id, {
        name: editForm.name.trim(),
        code: cleanedCode,
      })
      setEditSuccess('Đã cập nhật vai trò thành công!')
      await loadRoles()
      setTimeout(() => {
        setIsEditOpen(false)
        setEditingRole(null)
      }, 1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setEditError(`Cập nhật thất bại: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string, code: string) => {
    if (code === 'super') {
      alert('Không thể xoá vai trò Super Admin!')
      return
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xoá vai trò "${code}" này không?`)) return
    try {
      await deleteRole(id)
      await loadRoles()
    } catch (err) {
      alert('Xoá vai trò thất bại')
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

      <div className="space-y-4">
        {/* WARNING PANEL IF NOT SUPER */}
        {!isSuper && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Bạn chỉ có quyền xem danh sách vai trò. Chỉ có Super Admin mới được phép Thêm, Sửa hoặc Xoá vai trò.</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-3 shrink-0 items-start">
          {/* LEFT COLUMN: CREATE FORM */}
          <Panel title="Thêm nhóm quyền" fit noPadding className="shrink-0 self-start xl:sticky xl:top-4 w-full">
            <form onSubmit={handleCreate} className="space-y-3 p-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Tên nhóm quyền
                </span>
                <input
                  disabled={!isSuper}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="VD: Giám Sát Ca"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45 disabled:opacity-50"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Mã code
                </span>
                <input
                  disabled={!isSuper}
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="VD: supervisor"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45 disabled:opacity-50"
                />
              </label>

              {error && <p className="text-[11px] text-red-400 pt-1 font-medium">{error}</p>}
              {success && <p className="text-[11px] text-green-400 pt-1 font-medium">{success}</p>}

              {isSuper && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:pointer-events-none mt-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isSubmitting ? 'Đang tạo...' : 'Tạo nhóm quyền'}
                </button>
              )}
            </form>
          </Panel>

          {/* RIGHT COLUMN: LIST TABLE */}
          <Panel title="Danh sách nhóm vai trò & quyền" noPadding fit className="min-h-[420px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : roles.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-muted-foreground">Chưa có vai trò nào được định nghĩa.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e2433]">
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tên nhóm quyền</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mã code</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ngày tạo</th>
                      {isSuper && <th className="px-4 py-3 w-24"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2433]">
                    {roles.map(r => (
                      <tr key={r.id} className="hover:bg-[#1a2235]/40 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2.5">
                          <Shield className={`w-4 h-4 ${
                            r.code === 'super' || r.code === 'admin'
                              ? 'text-red-400'
                              : 'text-primary'
                          }`} />
                          {r.name}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${
                            r.code === 'super'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/25'
                              : 'bg-muted/10 text-muted-foreground'
                          }`}>
                            {r.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        {isSuper && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                disabled={r.code === 'super'}
                                onClick={() => handleOpenEdit(r)}
                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                title="Chỉnh sửa"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={r.code === 'super'}
                                onClick={() => handleDelete(r.id, r.code)}
                                className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                title="Xoá nhóm quyền"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* EDIT MODAL */}
      {isEditOpen && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-[#1e2433] bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Cập nhật nhóm quyền
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Chỉnh sửa thông tin vai trò "{editingRole.code}"
              </p>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Tên nhóm quyền
                </span>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="VD: Quản Trị Viên"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Mã code
                </span>
                <input
                  value={editForm.code}
                  onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="VD: admin"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              {editError && <p className="text-[11px] text-red-400 pt-1 font-medium">{editError}</p>}
              {editSuccess && <p className="text-[11px] text-green-400 pt-1 font-medium">{editSuccess}</p>}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1e2433] mt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#161b26] hover:bg-[#1e2433] text-xs font-semibold text-foreground transition-colors"
                >
                  Huỷ bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/95 transition-colors disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
