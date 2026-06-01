import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { api, getUser, setUser, clearToken } from '../lib/api'
import { MangoWarriorLogo, ToastContainer, toast } from '../components/ui'

export default function ChangePinPage() {
  const navigate = useNavigate()
  const user = getUser()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!user) {
    navigate('/login')
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPin.length < 4) { setError('New PIN must be at least 4 digits'); return }
    if (newPin !== confirmPin) { setError('PINs do not match'); return }
    if (newPin === currentPin) { setError('New PIN must be different from current PIN'); return }

    setLoading(true)
    try {
      await api.changePin(currentPin, newPin)
      const updated = { ...user, mustChangePin: false }
      setUser(updated)
      toast('PIN changed successfully!', 'success')
      setTimeout(() => navigate(user.role === 'admin' ? '/admin' : '/crew'), 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to change PIN')
      toast(err.message || 'Failed to change PIN', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 -right-48 w-96 h-96 bg-mango-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-warrior-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <MangoWarriorLogo size="lg" />
        </div>

        <div className="card p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound size={18} className="text-mango-500" />
            <h1 className="font-semibold text-lg">Set New PIN</h1>
          </div>

          <div className="flex items-start gap-2 bg-mango-500/10 border border-mango-500/20 rounded-xl px-4 py-3 mb-5">
            <AlertTriangle size={15} className="text-mango-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-mango-400">
              {user.mustChangePin
                ? 'You must set a new PIN before continuing. This is required for security.'
                : 'Please create a new secure PIN.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Current PIN</label>
              <div className="relative">
                <input className="input pr-11" type={show ? 'text' : 'password'}
                  placeholder="Current PIN" value={currentPin}
                  onChange={e => setCurrentPin(e.target.value)} required inputMode="numeric" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  onClick={() => setShow(!show)}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">New PIN <span className="text-gray-600">(min. 4 digits)</span></label>
              <input className="input" type={show ? 'text' : 'password'}
                placeholder="New PIN" value={newPin}
                onChange={e => setNewPin(e.target.value)} required inputMode="numeric" minLength={4} />
            </div>

            <div>
              <label className="label">Confirm New PIN</label>
              <input className="input" type={show ? 'text' : 'password'}
                placeholder="Confirm PIN" value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)} required inputMode="numeric" />
            </div>

            {error && (
              <div className="text-warrior-400 text-sm bg-warrior-500/10 border border-warrior-500/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              disabled={loading || !currentPin || !newPin || !confirmPin}>
              {loading ? <><div className="w-4 h-4 border-2 border-dark-900/30 border-t-dark-900 rounded-full animate-spin" />Saving...</> : 'Set New PIN'}
            </button>
          </form>

          <button onClick={() => { clearToken(); navigate('/login') }}
            className="w-full text-center text-xs text-gray-600 hover:text-gray-400 mt-4 transition-colors">
            Back to login
          </button>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
