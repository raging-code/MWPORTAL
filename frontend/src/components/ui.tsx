import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { ReactNode, useState } from 'react'

// ─── Logo ─────────────────────────────────────────────────────────────────────

export function MangoWarriorLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-20 h-20' }
  const textSizes = { sm: 'text-xs', md: 'text-base', lg: 'text-2xl' }
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className={`${sizes[size]} relative flex-shrink-0`}>
        {/* 
          LOGO: To use your own favicon/logo image instead of the SVG icon below,
          replace the entire <svg>...</svg> with:
          <img src="/favicon.svg" alt="Mango Warrior Logo" className="w-full h-full object-contain" />
          (or favicon.png / favicon.ico depending on your file)
        */}
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
      <div className="card w-full max-w-md animate-scale-in mx-3 sm:mx-0">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-light-300">
          <h2 className="font-semibold text-base sm:text-lg text-light-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-light-600 hover:text-light-900 transition-colors p-1.5 rounded-lg hover:bg-light-200 min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
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

  const icons = {
    success: <CheckCircle size={16} className="text-green-600 flex-shrink-0" />,
    error: <AlertTriangle size={16} className="text-warrior-500 flex-shrink-0" />,
    info: <Loader2 size={16} className="text-mango-500 flex-shrink-0" />
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className="card px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 min-w-[220px] sm:min-w-[260px] shadow-lg animate-slide-up">
          {icons[t.type]}
          <span className="text-sm font-medium text-light-900">{t.msg}</span>
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
    <div className="card p-3 sm:p-5">
      <div className="text-xs font-semibold text-light-600 uppercase tracking-widest mb-1 sm:mb-2 truncate">{label}</div>
      <div className="text-2xl sm:text-3xl font-display tracking-wider text-mango-500">{value}</div>
      {sub && <div className="text-xs text-light-600 mt-1 truncate hidden sm:block">{sub}</div>}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-light-500">
      <div className="text-4xl sm:text-5xl mb-3">📋</div>
      <div className="text-sm">{message}</div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export function ConfirmModal({ title, message, onConfirm, onCancel, danger = false }:
  { title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-light-700 text-sm mb-5 sm:mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>Confirm</button>
      </div>
    </Modal>
  )
}
