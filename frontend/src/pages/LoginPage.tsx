import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { api, setToken, setUser, getUser } from '../lib/api'
import { MangoWarriorLogo, ToastContainer, toast } from '../components/ui'

export default function LoginPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already logged in
useEffect(() => {
  const user = getUser()
  if (user && !user.mustChangePin) {
    navigate(user.role === 'admin' ? '/admin' : '/crew', { replace: true })
  }
}, [])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login(name.trim(), pin)
      setToken(res.token)
      setUser(res.user)
      if (res.user.mustChangePin) {
        navigate('/change-pin')
      } else {
        navigate(res.user.role === 'admin' ? '/admin' : '/crew')
      }
    } catch (err: any) {
      setError(err.message || 'Login failed')
      toast(err.message || 'Login failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 -right-48 w-96 h-96 bg-mango-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-warrior-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-dark-800/30 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <MangoWarriorLogo size="lg" />
          <div className="mt-4 text-center">
            <div className="text-gray-500 text-sm font-medium tracking-widest uppercase">Portal System</div>
          </div>
        </div>

        {/* Card */}
        <div className="card p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Shield size={18} className="text-mango-500" />
            <h1 className="font-semibold text-lg">Sign In</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="label">PIN</label>
              <div className="relative">
                <input
                  className="input pr-11"
                  type={showPin ? 'text' : 'password'}
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-warrior-400 text-sm bg-warrior-500/10 border border-warrior-500/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2"
              disabled={loading || !name || !pin}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-dark-900/30 border-t-dark-900 rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-dark-500 text-center">
            <p className="text-xs text-gray-600">
              Contact your administrator for account access
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-gray-700">
          MWportal v1.0 · Mango Warrior
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
