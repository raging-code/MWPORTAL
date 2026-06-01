import { X, AlertTriangle, CheckCircle, Loader2, Clock } from 'lucide-react'
import { ReactNode, useState } from 'react'

// ─── Logo ─────────────────────────────────────────────────────────────────────

export function MangoWarriorLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-32 h-32' }
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className={`${sizes[size]} relative flex-shrink-0`}>
        <img src="/logo.png" alt="Mango Warrior Logo" className="w-full h-full object-contain" />
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-md animate-scale-in mx-3 sm:mx-0">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-light-300">
          <h2 className="font-semibold text-base text-light-900">{title}</h2>
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

// ─── StatCard (legacy single — kept for compatibility) ────────────────────────

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="text-xs font-semibold text-light-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl sm:text-3xl font-mono font-semibold text-mango-500 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-light-500 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

// ─── HoursWidget — combined Today / This Week / This Month ───────────────────
//
//  Renders a single card with three rows separated by hairline dividers.
//  Pass `today`, `week`, `month` as formatted strings (e.g. "3h 20m")
//  and the date sub-labels.

export interface HoursWidgetProps {
  todayValue: string
  todaySub: string
  weekValue: string
  weekSub: string
  monthValue: string
  monthSub: string
}

export function HoursWidget({ todayValue, todaySub, weekValue, weekSub, monthValue, monthSub }: HoursWidgetProps) {
  const rows = [
    { label: 'Today',      value: todayValue,  sub: todaySub  },
    { label: 'This Week',  value: weekValue,   sub: weekSub   },
    { label: 'This Month', value: monthValue,  sub: monthSub  },
  ]

  return (
    <div className="card overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-light-300 bg-light-100/60">
        <Clock size={13} className="text-mango-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-light-600 uppercase tracking-widest">Hours Summary</span>
      </div>

      {rows.map((row, i) => (
        <div key={row.label}>
          {i > 0 && <hr className="stat-divider" />}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-light-500 uppercase tracking-widest leading-none mb-0.5">
                {row.label}
              </div>
              <div className="text-xs text-light-400 truncate">{row.sub}</div>
            </div>
            <div className="font-mono font-semibold text-xl text-mango-500 tracking-tight flex-shrink-0 ml-4">
              {row.value}
            </div>
          </div>
        </div>
      ))}
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
      <p className="text-light-700 text-sm mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>Confirm</button>
      </div>
    </Modal>
  )
}