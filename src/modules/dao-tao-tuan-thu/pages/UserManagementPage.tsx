import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Trash2, Edit2, User, Key, ShieldAlert } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'
import { useAppStore } from '@/store/app.store'
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchRoles,
  type UserApiItem,
  type RoleApiItem
} from '@/api/user.api'

interface FormState {
  username: string
  fullName: string
  email: string
  phone: string
  password?: string
  roleId: string
}

const INITIAL_FORM: FormState = {
  username: '',
  fullName: '',
  email: '',
  phone: '',
  password: '',
  roleId: '',
}

export function UserManagementPage() {
  const { user: currentUser } = useAppStore()
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super'

  const [users, setUsers] = useState<UserApiItem[]>([])
  const [roles, setRoles] = useState<RoleApiItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Create / Edit mode states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserApiItem | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetchUsers({ limit: 100 }),
        fetchRoles({ limit: 100 }),
      ])
      const filteredRoles = rolesRes.items.filter(r => r.code !== 'super')
      setUsers(usersRes.items)
      setRoles(filteredRoles)
      
      // Auto select first role if not set
      if (filteredRoles.length > 0 && !form.roleId) {
        setForm(f => ({ ...f, roleId: filteredRoles[0].id }))
      }
    } catch (err) {
      console.error('Failed to load users/roles', err)
      setError('Không thể tải danh sách tài khoản hoặc vai trò.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setForm({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      roleId: roles[0]?.id || '',
    })
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (user: UserApiItem) => {
    setEditingUser(user)
    setForm({
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      password: '', // blank by default, only updated if filled
      roleId: user.roleId || '',
    })
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.username.trim() && !editingUser) {
      setError('Vui lòng nhập tên đăng nhập')
      return
    }
    if (!form.fullName.trim()) {
      setError('Vui lòng nhập tên đầy đủ')
      return
    }
    if (!form.email.trim()) {
      setError('Vui lòng nhập email')
      return
    }
    if (!editingUser && !form.password) {
      setError('Vui lòng nhập mật khẩu')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingUser) {
        // Update user
        await updateUser(editingUser.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password?.trim() || null,
          roleId: form.roleId || null,
        })
        setSuccess('Đã cập nhật thông tin tài khoản thành công!')
      } else {
        // Create user
        await createUser({
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password?.trim(),
          roleId: form.roleId || null,
        })
        setForm(INITIAL_FORM)
        setSuccess('Đã tạo tài khoản mới thành công!')
      }

      await loadData()
      setTimeout(() => {
        setIsModalOpen(false)
        setSuccess(null)
      }, 1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối API'
      setError(`Thao tác thất bại: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string, username: string) => {
    if (id === currentUser?.id) {
      alert('Bạn không thể tự xoá chính mình!')
      return
    }
    if (!window.confirm(`Bạn có chắc muốn xoá tài khoản "${username}" này?`)) return
    try {
      await deleteUser(id)
      await loadData()
    } catch (err) {
      alert('Xoá tài khoản thất bại')
      console.error(err)
    }
  }

  return (
    <PageLayout scrollable>
      <div className="flex items-center justify-between gap-3 shrink-0">
        <Link
          to="/dttt"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Về giám sát
        </Link>

        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo tài khoản
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* WARNING PANEL IF NOT ADMIN */}
        {!isAdmin && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Bạn chỉ có quyền xem danh sách người dùng. Chỉ có quản trị viên mới được phép Thêm, Sửa hoặc Xoá tài khoản.</span>
          </div>
        )}

        {/* LIST TABLE PANEL */}
        <Panel title="Danh sách tài khoản hệ thống" noPadding fit className="min-h-[420px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error && users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <p className="text-sm text-red-400 font-medium">{error}</p>
              <button onClick={loadData} className="px-3 py-1 text-xs bg-[#1e2433] hover:bg-[#2b354d] text-foreground rounded transition-all">Tải lại</button>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-muted-foreground">Chưa có người dùng nào được tạo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1e2433]">
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Người dùng</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tên đăng nhập</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email & SĐT</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Vai trò</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ngày tạo</th>
                    {isAdmin && <th className="px-4 py-3 w-24"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2433]">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-[#1a2235]/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.fullName} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground leading-tight">{u.fullName}</div>
                          {u.id === currentUser?.id && (
                            <span className="inline-block text-[8px] bg-primary/25 border border-primary/45 text-primary-foreground rounded-full px-1.5 mt-0.5 font-medium scale-95 origin-left">
                              Bạn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{u.username}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground/90">{u.email}</div>
                        <div className="text-muted-foreground/60">{u.phone || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-semibold border ${
                          u.role?.code === 'super' || u.role?.code === 'admin'
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}>
                          {u.role?.name || u.roleId || 'User'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(u.id, u.username)}
                              disabled={u.id === currentUser?.id}
                              className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                              title="Xoá tài khoản"
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

      {/* CREATE & EDIT USER DIALOG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-[#1e2433] bg-[#0d1117] shadow-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {editingUser ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {editingUser ? `Chỉnh sửa thông tin cho ${editingUser.username}` : 'Đăng ký thành viên mới vào hệ thống Vin'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* TÊN ĐĂNG NHẬP (Chỉ cho phép khi tạo mới) */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Tên đăng nhập
                </span>
                <input
                  disabled={!!editingUser}
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="VD: nguyenvanad"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45 disabled:opacity-50"
                />
              </label>

              {/* HỌ VÀ TÊN */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Họ và tên
                </span>
                <input
                  value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              {/* EMAIL */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Email
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="VD: nva@gmail.com"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              {/* SỐ ĐIỆN THOẠI */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Số điện thoại
                </span>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="VD: 0912345678"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              {/* MẬT KHẨU */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  Mật khẩu {editingUser && <span className="text-[9px] text-muted-foreground/60 capitalize font-normal">(để trống nếu không đổi)</span>}
                </span>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={editingUser ? "••••••••" : "Nhập mật khẩu an toàn"}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </label>

              {/* VAI TRÒ */}
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Vai trò / Quyền hạn
                </span>
                <select
                  value={form.roleId}
                  onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0f1a] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/45"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </label>

              {error && <p className="text-[11px] text-red-400 pt-1 font-medium">{error}</p>}
              {success && <p className="text-[11px] text-green-400 pt-1 font-medium">{success}</p>}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1e2433] mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
