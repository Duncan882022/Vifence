import { useState } from 'react'
import { 
  User, Mail, Phone, Shield, Calendar, Lock, Key, 
  Eye, EyeOff, Save, Edit2, X, CheckCircle, AlertCircle, 
  Loader2 
} from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { updateUser, changePassword } from '@/api/user.api'
import { cn } from '@/utils/cn'

export function ProfilePage() {
  const { user, setUser } = useAppStore()
  
  // Tabs: 'info' | 'password'
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info')
  
  // Edit mode for Info
  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState({
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  
  // Password Form
  const [pwdForm, setPwdForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  
  // Show/Hide password states
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  
  // Request States
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Clear messages after timeout
  const showBanner = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg)
      setErrorMsg(null)
    } else {
      setErrorMsg(msg)
      setSuccessMsg(null)
    }
    setTimeout(() => {
      setSuccessMsg(null)
      setErrorMsg(null)
    }, 4000)
  }

  // Handle Info Submit
  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    
    setLoading(true)
    setSuccessMsg(null)
    setErrorMsg(null)
    
    try {
      const updatedUser = await updateUser(user.id, {
        fullName: infoForm.fullName,
        email: infoForm.email,
        phone: infoForm.phone || null,
      })
      
      // Update store
      setUser({
        ...user,
        fullName: updatedUser.fullName,
        name: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone,
      })
      
      setIsEditingInfo(false)
      showBanner('success', 'Cập nhật thông tin cá nhân thành công!')
    } catch (err: any) {
      console.error(err)
      const rawDetail = err.response?.data?.detail
      const msg = err.response?.data?.message || (
        typeof rawDetail === 'object' && rawDetail !== null
          ? (rawDetail.message || JSON.stringify(rawDetail))
          : (typeof rawDetail === 'string' ? rawDetail : 'Cập nhật thông tin thất bại.')
      )
      showBanner('error', msg)
    } finally {
      setLoading(false)
    }
  }

  // Handle Change Password Submit
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!pwdForm.oldPassword || !pwdForm.newPassword || !pwdForm.confirmPassword) {
      showBanner('error', 'Vui lòng nhập đầy đủ các trường mật khẩu.')
      return
    }
    
    if (pwdForm.newPassword.length < 6) {
      showBanner('error', 'Mật khẩu mới phải có tối thiểu 6 ký tự.')
      return
    }
    
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      showBanner('error', 'Mật khẩu xác nhận không khớp.')
      return
    }
    
    if (pwdForm.oldPassword === pwdForm.newPassword) {
      showBanner('error', 'Mật khẩu mới không được trùng với mật khẩu cũ.')
      return
    }
    
    setLoading(true)
    setSuccessMsg(null)
    setErrorMsg(null)
    
    try {
      await changePassword({
        old_password: pwdForm.oldPassword,
        new_password: pwdForm.newPassword,
      })
      
      // Clear form
      setPwdForm({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      
      showBanner('success', 'Thay đổi mật khẩu thành công!')
    } catch (err: any) {
      console.error(err)
      const rawDetail = err.response?.data?.detail
      const msg = err.response?.data?.message || (
        typeof rawDetail === 'object' && rawDetail !== null
          ? (rawDetail.message || JSON.stringify(rawDetail))
          : (typeof rawDetail === 'string' ? rawDetail : 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu cũ.')
      )
      showBanner('error', msg)
    } finally {
      setLoading(false)
    }
  }

  // Helper for generating initials for Avatar
  const getInitials = (name: string) => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name[0].toUpperCase()
  }

  // Mapping role to Vietnamese display
  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      super: 'Super Admin',
      admin: 'Quản trị viên',
      manager: 'Quản lý',
      safety: 'Safety',
      contractor: 'Nhà thầu',
      supervisor: 'Giám sát',
      user: 'Người dùng',
    }
    return map[role] || role
  }

  const userDisplayName = user?.fullName || user?.name || user?.username || 'Người dùng'
  const userInitials = getInitials(userDisplayName)

  return (
    <div className="min-h-screen bg-[#070b13] text-foreground pl-[70px] sm:pl-[240px] pt-16 pb-8 transition-all">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Banner Alert */}
        {successMsg && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-green-500/25 bg-green-500/10 text-green-400 text-xs animate-fadeIn shrink-0">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-red-500/25 bg-red-500/10 text-red-400 text-xs animate-fadeIn shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Profile Card Header */}
        <div className="border border-[#1e2433] bg-[#0d111a] rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
          
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20 shrink-0 shadow-lg shadow-primary/10">
            {user?.avatarUrl ? (
              <img 
                src={user.avatarUrl} 
                alt={userDisplayName} 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary tracking-wide">{userInitials}</span>
            )}
          </div>
          
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-1.5">
            <h1 className="text-xl font-bold text-foreground leading-snug tracking-tight">{userDisplayName}</h1>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/25">
                <Shield className="w-3 h-3" />
                {getRoleLabel(user?.role || 'user')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-muted-foreground border border-white/10">
                <User className="w-3 h-3" />
                @{user?.username}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1e2433]">
          <button
            onClick={() => { setActiveTab('info'); setSuccessMsg(null); setErrorMsg(null); }}
            className={cn(
              "px-5 py-3 text-xs font-semibold tracking-wide border-b-2 transition-all flex items-center gap-2",
              activeTab === 'info' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="w-4 h-4" />
            Thông tin cá nhân
          </button>
          <button
            onClick={() => { setActiveTab('password'); setSuccessMsg(null); setErrorMsg(null); }}
            className={cn(
              "px-5 py-3 text-xs font-semibold tracking-wide border-b-2 transition-all flex items-center gap-2",
              activeTab === 'password' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Lock className="w-4 h-4" />
            Bảo mật & Mật khẩu
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'info' ? (
          <div className="border border-[#1e2433] bg-[#0d111a] rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Chi tiết tài khoản</h2>
              {!isEditingInfo ? (
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-foreground hover:bg-white/10 border border-white/10 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Chỉnh sửa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingInfo(false)
                    setInfoForm({
                      fullName: user?.fullName || user?.name || '',
                      email: user?.email || '',
                      phone: user?.phone || '',
                    })
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Huỷ
                </button>
              )}
            </div>

            <form onSubmit={handleUpdateInfo} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Username (Disabled) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tên tài khoản</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={user?.username || ''}
                      disabled
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-white/5 text-muted-foreground/50 cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                {/* Role (Disabled) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vai trò hệ thống</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <Shield className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={getRoleLabel(user?.role || 'user')}
                      disabled
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-white/5 text-muted-foreground/50 cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Họ và tên</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={infoForm.fullName}
                      onChange={e => setInfoForm({ ...infoForm, fullName: e.target.value })}
                      disabled={!isEditingInfo}
                      required
                      className={cn(
                        "w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none transition-all",
                        isEditingInfo ? "focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924]" : "cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Thư điện tử (Email)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={infoForm.email}
                      onChange={e => setInfoForm({ ...infoForm, email: e.target.value })}
                      disabled={!isEditingInfo}
                      required
                      className={cn(
                        "w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none transition-all",
                        isEditingInfo ? "focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924]" : "cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Số điện thoại</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={infoForm.phone}
                      onChange={e => setInfoForm({ ...infoForm, phone: e.target.value })}
                      disabled={!isEditingInfo}
                      placeholder="Chưa cập nhật số điện thoại"
                      className={cn(
                        "w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none transition-all",
                        isEditingInfo ? "focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924]" : "cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>

                {/* Date Created (Disabled) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ngày gia nhập hệ thống</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '—'}
                      disabled
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#1e2433] bg-white/5 text-muted-foreground/50 cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

              </div>

              {isEditingInfo && (
                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md shadow-primary/10 disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Lưu thay đổi
                  </button>
                </div>
              )}
            </form>
          </div>
        ) : (
          <div className="border border-[#1e2433] bg-[#0d111a] rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Thay đổi mật khẩu tài khoản</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Để đảm bảo bảo mật, mật khẩu mới của bạn cần tối thiểu 6 ký tự và khác hoàn toàn so với mật khẩu cũ.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cột trái: Mật khẩu hiện tại */}
                <div className="space-y-1.5 self-start">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu hiện tại</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type={showOldPwd ? "text" : "password"}
                      value={pwdForm.oldPassword}
                      onChange={e => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
                      required
                      className="w-full pl-9 pr-10 py-2.5 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPwd(!showOldPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground outline-none"
                    >
                      {showOldPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Cột phải: 2 hàng (Mật khẩu mới & Xác nhận mật khẩu mới) */}
                <div className="space-y-4">
                  {/* Hàng 1: Mật khẩu mới */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mật khẩu mới</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                        <Lock className="w-4 h-4" />
                      </span>
                      <input
                        type={showNewPwd ? "text" : "password"}
                        value={pwdForm.newPassword}
                        onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                        required
                        className="w-full pl-9 pr-10 py-2.5 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground outline-none"
                      >
                        {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Hàng 2: Xác nhận mật khẩu mới */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Xác nhận mật khẩu mới</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                        <Lock className="w-4 h-4" />
                      </span>
                      <input
                        type={showConfirmPwd ? "text" : "password"}
                        value={pwdForm.confirmPassword}
                        onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                        required
                        className="w-full pl-9 pr-10 py-2.5 text-xs rounded-lg border border-[#1e2433] bg-transparent outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-[#131924] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground outline-none"
                      >
                        {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nút cập nhật bên dưới */}
              <div className="flex justify-end pt-4 border-t border-[#1e2433]/70">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-md shadow-primary/10 disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Cập nhật mật khẩu
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
