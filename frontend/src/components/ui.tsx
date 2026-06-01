import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { ReactNode, useState } from 'react'

// ─── Logo ─────────────────────────────────────────────────────────────────────

export function MangoWarriorLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-20 h-20' }
  const textSizes = { sm: 'text-xs', md: 'text-base', lg: 'text-2xl' }
  return (
    <div className="flex items-center gap-3">
      <div className={`${sizes[size]} relative flex-shrink-0`}>
        <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Mango shape */}
          <ellipse cx="30" cy="45" rx="18" ry="28" fill="#F5C518" opacity="0.95" />
          <ellipse cx="30" cy="45" rx="14" ry="22" fill="#FBBF24" />
          {/* Leaf */}
          <ellipse cx="33" cy="18" rx="6" ry="10" fill="#1a5c2e" transform="rotate(-20 33 18)" />
          {/* Warrior helmet */}
          <path d="M48 20 Q65 15 72 30 Q75 45 65 55 Q58 60 50 58 L50 45 Q60 43 62 35 Q58 25 48 28Z" fill="#E63329" />
          {/* Helmet crest */}
          <path d="M55 20 Q58 8 65 5 Q70 10 68 18 Q62 16 58 22Z" fill="#E63329" />
          {/* MW letters */}
          <text x="20" y="54" fontFamily="Impact,Arial" fontSize="20" fontWeight="900" fill="white" opacity="0.9">M</text>
          <text x="42" y="54" fontFamily="Impact,Arial" fontSize="20" fontWeight="900" fill="white" opacity="0.9">W</text>
        </svg>
      </div>
      {size !== 'sm' && (
        <div>
          <div className={`font-display ${textSizes[size]} tracking-widest text-mango-500 leading-none`}>MANGO</div>
          <div className={`font-display ${textSizes[size]} tracking-widest text-warrior-500 leading-none`}>WARRIOR</div>
        </div>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between p-5 border-b border-dark-500">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-dark-500">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'
interface ToastItem { id: number; msg: string; type: ToastType }

let toastListeners: ((t: ToastItem) => void)[] = []
let nextId = 1

export function toast(msg: string, type: ToastType = 'success') {
  const item = { id: nextId++, msg, type }
  toastListeners.forEach(fn => fn(item))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  toastListeners = [(item: ToastItem) => {
    setToasts(prev => [...prev, item])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== item.id)), 3500)
  }]

  const icons = { success: <CheckCircle size={16} className="text-green-400 flex-shrink-0" />, error: <AlertTriangle size={16} className="text-warrior-400 flex-shrink-0" />, info: <Loader2 size={16} className="text-mango-500 flex-shrink-0" /> }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className="card px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-sm shadow-xl animate-slide-up">
          {icons[t.type]}
          <span className="text-sm font-medium">{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-mango-500" />
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="text-3xl font-display tracking-wider text-mango-500">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
      <div className="text-5xl mb-3">📋</div>
      <div className="text-sm">{message}</div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export function ConfirmModal({ title, message, onConfirm, onCancel, danger = false }:
  { title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-gray-400 text-sm mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>Confirm</button>
      </div>
    </Modal>
  )
}
