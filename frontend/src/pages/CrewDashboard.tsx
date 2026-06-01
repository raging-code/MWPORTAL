import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Clock, Download, ChevronDown, ChevronUp, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, getUser, clearToken } from '../lib/api'
import { formatHours, formatDateTime, calcDuration, exportToXLSX } from '../lib/utils'
import { MangoWarriorLogo, HoursWidget, EmptyState, ToastContainer, toast, Spinner, ConfirmModal } from '../components/ui'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  const start = new Date(d)
  start.setDate(d.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function getMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

function calcHoursInRange(entries: any[], from: Date, to: Date): number {
  let total = 0
  for (const e of entries) {
    if (!e.clock_out) continue
    const ci = new Date(e.clock_in), co = new Date(e.clock_out)
    if (co >= from && ci <= to) {
      const s = ci < from ? from : ci
      const en = co > to ? to : co
      total += (en.getTime() - s.getTime()) / 3600000
    }
  }
  return Math.round(total * 100) / 100
}

function filterEntriesInRange(entries: any[], from: Date, to: Date): any[] {
  return entries.filter(e => {
    const ci = new Date(e.clock_in)
    const co = e.clock_out ? new Date(e.clock_out) : new Date()
    return co >= from && ci <= to
  })
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtWeekRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const e = end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

function fmtMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CrewDashboard() {
  const navigate = useNavigate()
  const user = getUser()!

  const [status, setStatus] = useState<{ clockedIn: boolean; since: string | null } | null>(null)
  const [hours, setHours] = useState<{ today: number; week: number; month: number; entries: any[] } | null>(null)
  const [punching, setPunching] = useState(false)
  const [showEntries, setShowEntries] = useState(false)
  const [exportStart, setExportStart] = useState('')
  const [exportEnd, setExportEnd] = useState('')
  const [exporting, setExporting] = useState(false)
  const [now, setNow] = useState(new Date())

  const [confirmAction, setConfirmAction] = useState<'in' | 'out' | null>(null)

  const [historyMode, setHistoryMode] = useState<'day' | 'week' | 'month'>('day')
  const [historyOffset, setHistoryOffset] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.punchStatus(), api.myHours()])
      setStatus(s)
      setHours(h)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ─── Computed history window ──────────────────────────────────────────────

  const historyWindow = (() => {
    const base = new Date()
    if (historyMode === 'day') {
      const d = new Date(base)
      d.setDate(d.getDate() + historyOffset)
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      return { start, end, label: fmtDay(d) }
    } else if (historyMode === 'week') {
      const d = new Date(base)
      d.setDate(d.getDate() + historyOffset * 7)
      const { start, end } = getWeekBounds(d)
      return { start, end, label: fmtWeekRange(start, end) }
    } else {
      const d = new Date(base)
      d.setMonth(d.getMonth() + historyOffset)
      const { start, end } = getMonthBounds(d.getFullYear(), d.getMonth())
      return { start, end, label: fmtMonth(d.getFullYear(), d.getMonth()) }
    }
  })()

  const historyEntries = hours ? filterEntriesInRange(hours.entries, historyWindow.start, historyWindow.end) : []
  const historyHours = hours ? calcHoursInRange(hours.entries, historyWindow.start, historyWindow.end) : 0

  // ─── Stat card date labels ────────────────────────────────────────────────

  const todayLabel = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const { start: wkStart, end: wkEnd } = getWeekBounds(now)
  const weekLabel = `${wkStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${wkEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  const monthLabel = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  // ─── Punch handlers ───────────────────────────────────────────────────────

  function requestPunch() {
    if (status?.clockedIn) {
      setConfirmAction('out')
    } else {
      setConfirmAction('in')
    }
  }

  async function handlePunch() {
    setConfirmAction(null)
    setPunching(true)
    try {
      if (status?.clockedIn) {
        await api.punchOut()
        toast('Clocked out successfully', 'success')
      } else {
        await api.punchIn()
        toast('Clocked in successfully', 'success')
      }
      await refresh()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setPunching(false)
    }
  }

  async function handleExport() {
    if (!exportStart || !exportEnd) { toast('Select start and end dates', 'error'); return }
    setExporting(true)
    try {
      const data = await api.exportHours(exportStart, exportEnd)
      const entries = data.entries.map((e: any) => ({ ...e, crew_name: user.name }))
      exportToXLSX(entries, `${user.name}_hours_${exportStart}_${exportEnd}.xlsx`)
      toast('Exported successfully!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  function logout() {
    clearToken()
    navigate('/login')
  }

  const clockedIn = status?.clockedIn ?? false
  const elapsed = status?.since ? (now.getTime() - new Date(status.since).getTime()) / 3600000 : 0

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-light-100 page-enter">
      {/* Header */}
      <header className="bg-white border-b border-light-300 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          <MangoWarriorLogo size="sm" />
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm text-light-600 hidden sm:block truncate max-w-[160px]">{user.name}</span>
            <button onClick={logout} className="btn-ghost !py-1.5 !px-2.5 sm:!px-3 flex items-center gap-1.5 text-sm">
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Welcome + Clock */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-semibold text-light-500 uppercase tracking-widest">Welcome back</div>
              <h1 className="text-2xl sm:text-3xl font-bold mt-1 text-light-900 tracking-tight">{user.name}</h1>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg sm:text-2xl font-medium text-mango-500">
                {now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-xs text-light-500">
                {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Status indicator */}
          <div className={`flex items-center gap-2 text-sm font-medium mb-5 sm:mb-6 ${clockedIn ? 'text-green-600' : 'text-light-500'}`}>
            <div className={`w-2 h-2 rounded-full ${clockedIn ? 'bg-green-500 animate-pulse' : 'bg-light-400'}`} />
            {clockedIn
              ? <span>Clocked in · <span className="font-mono">{formatHours(elapsed)}</span> elapsed</span>
              : 'Currently clocked out'}
          </div>

          {/* Punch Buttons */}
          {status === null ? (
            <div className="flex justify-center py-4"><Spinner size={28} /></div>
          ) : (
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={requestPunch}
                disabled={punching || clockedIn}
                className={`flex-1 relative py-4 sm:py-5 rounded-2xl font-semibold text-base sm:text-lg transition-all duration-200 active:scale-95
                  ${!clockedIn
                    ? 'bg-green-500 hover:bg-green-600 text-white glow-green'
                    : 'bg-light-200 text-light-400 cursor-not-allowed border border-light-300'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle size={20} />
                  <span>Time In</span>
                </div>
                {punching && !clockedIn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-500 rounded-2xl">
                    <Spinner />
                  </div>
                )}
              </button>

              <button
                onClick={requestPunch}
                disabled={punching || !clockedIn}
                className={`flex-1 relative py-4 sm:py-5 rounded-2xl font-semibold text-base sm:text-lg transition-all duration-200 active:scale-95
                  ${clockedIn
                    ? 'bg-warrior-500 hover:bg-warrior-600 text-white glow-warrior'
                    : 'bg-light-200 text-light-400 cursor-not-allowed border border-light-300'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <XCircle size={20} />
                  <span>Time Out</span>
                </div>
                {punching && clockedIn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-warrior-500 rounded-2xl">
                    <Spinner />
                  </div>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Hours Summary — single combined widget */}
        {hours && (
          <HoursWidget
            todayValue={formatHours(hours.today)}
            todaySub={todayLabel}
            weekValue={formatHours(hours.week)}
            weekSub={weekLabel}
            monthValue={formatHours(hours.month)}
            monthSub={monthLabel}
          />
        )}

        {/* Work Hours History */}
        {hours && (
          <div className="card overflow-hidden">
            {/* Section Header */}
            <button
              onClick={() => setShowEntries(!showEntries)}
              className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-light-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-mango-500" />
                <span className="font-semibold text-sm text-light-900">Work Hours History</span>
              </div>
              {showEntries
                ? <ChevronUp size={16} className="text-light-500" />
                : <ChevronDown size={16} className="text-light-500" />}
            </button>

            {showEntries && (
              <>
                {/* Mode Tabs */}
                <div className="px-4 sm:px-5 pb-3 border-b border-light-300">
                  <div className="flex gap-1 bg-light-200 p-1 rounded-xl w-fit">
                    {(['day', 'week', 'month'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => { setHistoryMode(m); setHistoryOffset(0) }}
                        className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize
                          ${historyMode === m
                            ? 'bg-mango-500 text-white shadow-sm'
                            : 'text-light-600 hover:text-light-900'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-light-100 border-b border-light-300">
                  <button
                    onClick={() => setHistoryOffset(o => o - 1)}
                    className="p-2 rounded-lg hover:bg-light-300 text-light-600 hover:text-light-900 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="text-center flex-1 px-2">
                    <div className="text-sm font-semibold text-light-900 truncate">{historyWindow.label}</div>
                    <div className="text-xs text-mango-600 font-mono mt-0.5">
                      {formatHours(historyHours)} total
                      {historyOffset === 0 && (
                        <span className="ml-2 text-light-400">· current</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setHistoryOffset(o => o + 1)}
                    disabled={historyOffset >= 0}
                    className="p-2 rounded-lg hover:bg-light-300 text-light-600 hover:text-light-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Entries */}
                {historyEntries.length === 0 ? (
                  <EmptyState message={`No entries for this ${historyMode}`} />
                ) : (
                  <>
                    <div className="max-h-72 overflow-y-auto overflow-x-auto">
                      <table className="data-table min-w-full">
                        <thead>
                          <tr>
                            <th>Clock In</th>
                            <th>Clock Out</th>
                            <th className="text-right">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyEntries.map((e: any) => (
                            <tr key={e.id}>
                              <td className="font-mono text-xs text-green-700 whitespace-nowrap">{formatDateTime(e.clock_in)}</td>
                              <td className="font-mono text-xs text-warrior-600 whitespace-nowrap">
                                {e.clock_out ? formatDateTime(e.clock_out) : <span className="badge-green">Active</span>}
                                {e.auto_timeout && <span className="ml-1 badge-yellow">Auto</span>}
                              </td>
                              <td className="text-right text-xs font-mono text-light-700">
                                {e.clock_out ? formatHours(calcDuration(e.clock_in, e.clock_out)) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Total Hours Footer */}
                    <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-mango-500/6 border-t-2 border-mango-500/20">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-light-700 uppercase tracking-wider">
                        <Clock size={13} className="text-mango-500" />
                        Total {historyMode === 'day' ? 'Day' : historyMode === 'week' ? 'Week' : 'Month'} Hours
                      </div>
                      <div className="font-mono font-semibold text-base text-mango-600">
                        {formatHours(historyHours)}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Export */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Download size={16} className="text-mango-500" />
            <h2 className="font-semibold text-sm text-light-900">Export Hours to Excel</h2>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={exportStart} onChange={e => setExportStart(e.target.value)} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || !exportStart || !exportEnd}
            className="btn-primary flex items-center gap-2"
          >
            <Download size={15} />
            {exporting ? 'Exporting...' : 'Export XLSX'}
          </button>
        </div>
      </main>

      {/* Confirm Punch Modal */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction === 'in' ? 'Confirm Time In' : 'Confirm Time Out'}
          message={
            confirmAction === 'in'
              ? `Clock in now at ${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}?`
              : `Clock out now at ${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}? You've been working for ${formatHours(elapsed)}.`
          }
          danger={confirmAction === 'out'}
          onConfirm={handlePunch}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <ToastContainer />
    </div>
  )
}