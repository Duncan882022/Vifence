import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Lock, User, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import axiosInstance from '@/utils/axios'
import { signinWithAliases } from '@/utils/authSignin'
import { DEFAULT_HOME_PATH } from '@/config'

export function SigninPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const setUser = useAppStore((state) => state.setUser)
  const navigate = useNavigate()

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await signinWithAliases(axiosInstance, username, password)

      if (!data) {
        setError('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.')
        return
      }

      localStorage.setItem('vifence_access_token', data.accessToken)
      localStorage.setItem('vifence_refresh_token', data.refreshToken)

      const user = data.user
      if (user) {
        const mappedUser = {
          id: user.id,
          username: user.username,
          name: user.fullName || user.username,
          email: user.email,
          role: user.role?.code || 'user',
          avatar: user.avatarUrl,
        }
        setUser(mappedUser)
        localStorage.setItem('vifence_user', JSON.stringify(mappedUser))
      }

      navigate(DEFAULT_HOME_PATH)
    } catch (err: unknown) {
      console.error(err)
      let message: string | undefined
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail
        message =
          typeof detail === 'object' && detail && 'message' in detail
            ? String((detail as { message?: string }).message)
            : typeof detail === 'string'
              ? detail
              : undefined
      }
      setError(message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#060b14] overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-primary/5 blur-[120px] animate-pulse duration-[6000ms]" />
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-blue-500/5 blur-[120px] animate-pulse duration-[8000ms]" />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle, #8b9cb8 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md p-6 sm:p-8 mx-4">
        <div className="bg-[#0d1117]/80 backdrop-blur-xl border border-[#1e2433] rounded-2xl p-6 sm:p-10 shadow-2xl shadow-black/80">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-wide uppercase">
              Vifence CMS
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5">
              Hệ thống giám sát công trường thông minh AI Camera
            </p>
          </div>

          <form onSubmit={handleSignin} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-danger/10 border border-status-danger/20 text-status-danger text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Tài khoản
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#21262d] focus:border-primary rounded-lg pl-10 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none transition-all"
                  placeholder="Nhập tên đăng nhập hoặc email"
                  disabled={isLoading}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Mật khẩu
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#21262d] focus:border-primary rounded-lg pl-10 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none transition-all"
                  placeholder="Nhập mật khẩu"
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
