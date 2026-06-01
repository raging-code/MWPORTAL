import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, Users, Clock, Download, Plus, ChevronDown, ChevronUp,
  Edit, Power, KeyRound, Shield, ClipboardList, ArrowLeft, Trash2, PlusCircle,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { api, getUser, clearToken } from '../lib/api'
import { formatHours, formatDateTime, calcDuration, exportToXLSX } from '../lib/utils'
import {
  MangoWarriorLogo, StatCard, EmptyState, ToastContainer, toast,
  Spinner, Modal, ConfirmModal
} from '../components/ui'

type Tab = 'crew' | 'accounts' | 'audit'
type SubView = null | { type: 'crew-detail'; account: any; entries: any[] }

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

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = getUser()!
  const [tab, setTab] = useState<Tab>('crew')
  const [subView, setSubView] = useState<SubView>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function logout() { clearToken(); navigate('/login') }

  const tabCls = (t: Tab) =>
    `flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-150 ${tab === t
      ? 'bg-mango-500/12 text-mango-600 border border-mango-500/20'
      : 'text-light-600 hover:text-light-900 hover:bg-light-200'}`

  return (
    <div className="min-h-screen bg-light-100 page-enter">
      {/* Header */}
      <header className="bg-white border-b border-light-300 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <MangoWarriorLogo size="sm" />
            <div className="hidden xs:flex items-center gap-1 px-2 py-1 rounded-lg bg-warrior-500/8 border border-warrior-500/20">
              <Shield size={12} className="text-warrior-500" />
              <span className="text-xs text-warrior-600 font-semibold">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-right hidden sm:block">
              <div className="font-mono text-sm text-mango-600">{now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
              <div className="text-xs text-light-500 truncate max-w-[120px]">{user.name}</div>
            </div>
            <button onClick={logout} className="btn-ghost !py-1.5 !px-2.5 sm:!px-3 flex items-center gap-1.5 text-sm">
              <LogOut size={15} /><span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5">
        {subView ? (
          <CrewDetailView
            account={subView.account}
            entries={subView.entries}
            onBack={() => setSubView(null)}
            onRefresh={async () => {
              const data = await api.adminCrewHours(subView.account.id)
              setSubView({ type: 'crew-detail', account: data.account, entries: data.entries })
            }}
          />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 sm:mb-5 bg-light-200 p-1 sm:p-1.5 rounded-2xl border border-light-300 w-fit">
              <button className={tabCls('crew')} onClick={() => setTab('crew')}>
                <Clock size={14} /><span>Hours</span>
              </button>
              <button className={tabCls('accounts')} onClick={() => setTab('accounts')}>
                <Users size={14} /><span>Accounts</span>
              </button>
              <button className={tabCls('audit')} onClick={() => setTab('audit')}>
                <ClipboardList size={14} /><span className="hidden xs:inline">Audit Log</span><span className="xs:hidden">Audit</span>
              </button>
            </div>

            {tab === 'crew' && <HoursTab onViewCrew={(acc, ent) => setSubView({ type: 'crew-detail', account: acc, entries: ent })} />}
            {tab === 'accounts' && <AccountsTab />}
            {tab === 'audit' && <AuditTab />}
          </>
        )}
      </div>

      <ToastContainer />
    </div>
  )
}

// ─── Hours Tab ────────────────────────────────────────────────────────────────

function HoursTab({ onViewCrew }: { onViewCrew: (acc: any, entries: any[]) => void }) {
  const [summary, setSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exportStart, setExportStart] = useState('')
  const [exportEnd, setExportEnd] = useState('')
  const [exportTarget, setExportTarget] = useState('all')
  const [exporting, setExporting] = useState(false)

  const now = new Date()
  const todayLabel = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const { start: wkStart, end: wkEnd } = getWeekBounds(now)
  const weekLabel = `${wkStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${wkEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  const monthLabel = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const load = useCallback(async () => {
    try {
      const data = await api.adminAllHours()
      setSummary(data.summary)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleViewCrew(acc: any) {
    try {
      const data = await api.adminCrewHours(acc.id)
      onViewCrew(data.account, data.entries)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  async function handleExport() {
    if (!exportStart || !exportEnd) { toast('Select start and end dates', 'error'); return }
    setExporting(true)
    try {
      const data = await api.exportHours(exportStart, exportEnd, exportTarget === 'all' ? undefined : exportTarget)
      exportToXLSX(data.entries, `hours_${exportTarget}_${exportStart}_to_${exportEnd}.xlsx`)
      toast('Exported!', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Crew Cards */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-light-300 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-light-900">Crew Work Hours</h2>
            <div className="text-xs text-light-500 mt-0.5 hidden sm:block">
              Today: {todayLabel} · Week: {weekLabel} · Month: {monthLabel}
            </div>
          </div>
          <button onClick={load} className="text-xs text-light-500 hover:text-mango-600 transition-colors px-2 py-1 rounded-lg hover:bg-light-200">Refresh</button>
        </div>

        {summary.length === 0 ? (
          <EmptyState message="No crew accounts yet" />
        ) : (
          <div className="divide-y divide-light-200">
            {summary.map(s => (
              <button key={s.id} onClick={() => handleViewCrew(s)}
                className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-light-100 transition-colors text-left group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                    ${s.active ? 'bg-mango-500/15 text-mango-600' : 'bg-light-300 text-light-500'}`}>
                    {s.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm group-hover:text-mango-600 transition-colors text-light-900 truncate">{s.name}</div>
                    <div className="text-xs text-light-500">{s.active ? 'Active' : 'Deactivated'}</div>
                  </div>
                </div>
                <div className="flex gap-3 sm:gap-4 text-right flex-shrink-0 ml-2">
                  <div className="hidden md:block">
                    <div className="text-xs text-light-500">Today</div>
                    <div className="text-sm font-mono text-light-900">{formatHours(s.today)}</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs text-light-500">Week</div>
                    <div className="text-sm font-mono text-light-900">{formatHours(s.week)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-light-500">Month</div>
                    <div className="text-sm font-mono text-mango-600">{formatHours(s.month)}</div>
                  </div>
                  <ChevronDown size={16} className="text-light-400 self-center" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download size={16} className="text-mango-500" />
          <h2 className="font-semibold text-sm text-light-900">Export Hours to Excel</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={exportStart} onChange={e => setExportStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" className="input" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
          </div>
          <div>
            <label className="label">Crew Member</label>
            <select className="input" value={exportTarget} onChange={e => setExportTarget(e.target.value)}>
              <option value="all">All Crew</option>
              {summary.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting || !exportStart || !exportEnd}
          className="btn-primary flex items-center gap-2">
          <Download size={15} />{exporting ? 'Exporting...' : 'Export XLSX'}
        </button>
      </div>
    </div>
  )
}

// ─── Crew Detail View ──────────────────────────────────────────────────────────

function CrewDetailView({ account, entries, onBack, onRefresh }: {
  account: any; entries: any[]; onBack: () => void; onRefresh: () => void
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEntry, setEditEntry] = useState<any>(null)
  const [deleteEntry, setDeleteEntry] = useState<any>(null)

  const [historyMode, setHistoryMode] = useState<'day' | 'week' | 'month'>('day')
  const [historyOffset, setHistoryOffset] = useState(0)
  const [showHistory, setShowHistory] = useState(true)

  const now = new Date()

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const { start: weekStart, end: weekEnd } = getWeekBounds(now)
  const { start: monthStart, end: monthEnd } = getMonthBounds(now.getFullYear(), now.getMonth())

  const todayLabel = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const weekLabel = `${weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  const monthLabel = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const completedEntries = entries.filter(e => e.clock_out)

  function calcH(from: Date, to: Date) {
    return calcHoursInRange(completedEntries, from, to)
  }

  const historyWindow = (() => {
    if (historyMode === 'day') {
      const d = new Date(now)
      d.setDate(d.getDate() + historyOffset)
      const start = new Date(d); start.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      return { start, end, label: fmtDay(d) }
    } else if (historyMode === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() + historyOffset * 7)
      const { start, end } = getWeekBounds(d)
      return { start, end, label: fmtWeekRange(start, end) }
    } else {
      const d = new Date(now)
      d.setMonth(d.getMonth() + historyOffset)
      const { start, end } = getMonthBounds(d.getFullYear(), d.getMonth())
      return { start, end, label: fmtMonth(d.getFullYear(), d.getMonth()) }
    }
  })()

  const historyEntries = filterEntriesInRange(entries, historyWindow.start, historyWindow.end)
  const historyHours = calcHoursInRange(completedEntries, historyWindow.start, historyWindow.end)

  async function handleDelete(entry: any) {
    try {
      await api.adminDeletePunch(entry.id)
      toast('Entry deleted', 'success')
      onRefresh()
    } catch (err: any) { toast(err.message, 'error') }
    setDeleteEntry(null)
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="btn-ghost !py-1.5 !px-2.5 sm:!px-3 flex items-center gap-1.5 text-sm">
          <ArrowLeft size={15} />Back
        </button>
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl tracking-wider text-light-900">{account.name}</h2>
          <div className={account.active ? 'badge-green' : 'badge-red'}>
            {account.active ? 'Active' : 'Deactivated'}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Today" value={formatHours(calcH(todayStart, todayEnd))} sub={todayLabel} />
        <StatCard label="This Week" value={formatHours(calcH(weekStart, weekEnd))} sub={weekLabel} />
        <StatCard label="This Month" value={formatHours(calcH(monthStart, monthEnd))} sub={monthLabel} />
      </div>

      {/* Work Hours History */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-light-300">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 hover:text-mango-600 transition-colors text-light-900"
          >
            <Clock size={16} className="text-mango-500" />
            <span className="font-semibold text-sm">Work Hours History</span>
            {showHistory ? <ChevronUp size={16} className="text-light-500" /> : <ChevronDown size={16} className="text-light-500" />}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary !py-1.5 !px-2.5 sm:!px-3 text-xs flex items-center gap-1.5"
          >
            <PlusCircle size={14} /><span className="hidden xs:inline">Add Entry</span><span className="xs:hidden">Add</span>
          </button>
        </div>

        {showHistory && (
          <>
            {/* Mode Tabs */}
            <div className="px-4 sm:px-5 py-3 border-b border-light-300">
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

            {/* Entries Table */}
            {historyEntries.length === 0 ? (
              <EmptyState message={`No entries for this ${historyMode}`} />
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>Clock In</th><th>Clock Out</th><th>Duration</th>
                      <th className="hidden sm:table-cell">Flags</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.map(e => (
                      <tr key={e.id}>
                        <td className="font-mono text-xs text-green-700 whitespace-nowrap">{formatDateTime(e.clock_in)}</td>
                        <td className="font-mono text-xs text-warrior-600 whitespace-nowrap">
                          {e.clock_out ? formatDateTime(e.clock_out) : <span className="badge-green">Open</span>}
                        </td>
                        <td className="text-xs text-light-700 whitespace-nowrap">
                          {e.clock_out ? formatHours(calcDuration(e.clock_in, e.clock_out)) : '—'}
                        </td>
                        <td className="hidden sm:table-cell">
                          {e.auto_timeout ? <span className="badge-yellow">Auto-out</span> : null}
                          {e.system_timeout ? <span className="badge-red">Sys-out</span> : null}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditEntry(e)}
                              className="p-1.5 rounded-lg hover:bg-light-200 text-light-500 hover:text-mango-600 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => setDeleteEntry(e)}
                              className="p-1.5 rounded-lg hover:bg-light-200 text-light-500 hover:text-warrior-500 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <AddPunchModal accountId={account.id} onClose={() => setShowAddModal(false)} onSuccess={onRefresh} />
      )}
      {editEntry && (
        <EditPunchModal entry={editEntry} onClose={() => setEditEntry(null)} onSuccess={onRefresh} />
      )}
      {deleteEntry && (
        <ConfirmModal
          title="Delete Entry"
          message={`Delete this time entry for ${account.name}? This cannot be undone.`}
          danger
          onConfirm={() => handleDelete(deleteEntry)}
          onCancel={() => setDeleteEntry(null)}
        />
      )}
    </div>
  )
}

// ─── Add / Edit Punch Modals ──────────────────────────────────────────────────

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toISO(localStr: string): string {
  return new Date(localStr).toISOString()
}

function AddPunchModal({ accountId, onClose, onSuccess }: { accountId: number; onClose: () => void; onSuccess: () => void }) {
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (!clockIn) { toast('Clock in time required', 'error'); return }
    setLoading(true)
    try {
      await api.adminInsertPunch(accountId, toISO(clockIn), clockOut ? toISO(clockOut) : undefined)
      toast('Entry added', 'success')
      onSuccess(); onClose()
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Add Time Entry" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Clock In</label>
          <input type="datetime-local" className="input" value={clockIn} onChange={e => setClockIn(e.target.value)} />
        </div>
        <div>
          <label className="label">Clock Out <span className="text-light-500 font-normal">(optional)</span></label>
          <input type="datetime-local" className="input" value={clockOut} onChange={e => setClockOut(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={handle} disabled={loading || !clockIn}>
            {loading ? <Spinner size={15} /> : <Plus size={15} />}Add Entry
          </button>
        </div>
      </div>
    </Modal>
  )
}

function EditPunchModal({ entry, onClose, onSuccess }: { entry: any; onClose: () => void; onSuccess: () => void }) {
  const [clockIn, setClockIn] = useState(toLocalInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(entry.clock_out ? toLocalInput(entry.clock_out) : '')
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    try {
      await api.adminEditPunch(entry.id, toISO(clockIn), clockOut ? toISO(clockOut) : undefined)
      toast('Entry updated', 'success')
      onSuccess(); onClose()
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Edit Time Entry" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Clock In</label>
          <input type="datetime-local" className="input" value={clockIn} onChange={e => setClockIn(e.target.value)} />
        </div>
        <div>
          <label className="label">Clock Out</label>
          <input type="datetime-local" className="input" value={clockOut} onChange={e => setClockOut(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={handle} disabled={loading}>
            {loading ? <Spinner size={15} /> : <Edit size={15} />}Save Changes
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────

function AccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editAccount, setEditAccount] = useState<any>(null)
  const [resetAccount, setResetAccount] = useState<any>(null)
  const [toggleAccount, setToggleAccount] = useState<any>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.adminGetAccounts()
      setAccounts(data.accounts)
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(acc: any) {
    try {
      await api.adminUpdateAccount(acc.id, { active: !acc.active })
      toast(`${acc.name} ${acc.active ? 'deactivated' : 'reactivated'}`, 'success')
      load()
    } catch (err: any) { toast(err.message, 'error') }
    setToggleAccount(null)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>

  const crew = accounts.filter(a => a.role === 'crew')
  const admins = accounts.filter(a => a.role === 'admin')

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />New Account
        </button>
      </div>

      {[{ label: 'Crew Members', list: crew }, { label: 'Administrators', list: admins }].map(({ label, list }) => (
        <div key={label} className="card overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-light-300 flex items-center gap-2">
            <h2 className="font-semibold text-sm text-light-900">{label}</h2>
            <span className="badge-gray">{list.length}</span>
          </div>
          {list.length === 0 ? <EmptyState message={`No ${label.toLowerCase()}`} /> : (
            <div className="divide-y divide-light-200">
              {list.map(acc => (
                <div key={acc.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0
                      ${acc.active ? 'bg-mango-500/15 text-mango-600' : 'bg-light-300 text-light-500'}`}>
                      {acc.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-light-900 truncate">{acc.name}</div>
                      <div className="text-xs text-light-500">{acc.role} · {acc.active ? 'Active' : 'Inactive'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 ml-2">
                    <button onClick={() => setEditAccount(acc)}
                      className="p-2 rounded-xl hover:bg-light-200 text-light-500 hover:text-mango-600 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" title="Edit">
                      <Edit size={15} />
                    </button>
                    <button onClick={() => setResetAccount(acc)}
                      className="p-2 rounded-xl hover:bg-light-200 text-light-500 hover:text-blue-500 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" title="Reset PIN">
                      <KeyRound size={15} />
                    </button>
                    <button onClick={() => setToggleAccount(acc)}
                      className={`p-2 rounded-xl hover:bg-light-200 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${acc.active ? 'text-light-500 hover:text-warrior-500' : 'text-light-500 hover:text-green-600'}`}
                      title={acc.active ? 'Deactivate' : 'Reactivate'}>
                      <Power size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onSuccess={load} />}
      {editAccount && <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} onSuccess={load} />}
      {resetAccount && <ResetPinModal account={resetAccount} onClose={() => setResetAccount(null)} onSuccess={load} />}
      {toggleAccount && (
        <ConfirmModal
          title={toggleAccount.active ? 'Deactivate Account' : 'Reactivate Account'}
          message={`${toggleAccount.active ? 'Deactivate' : 'Reactivate'} ${toggleAccount.name}? ${toggleAccount.active ? 'They will be immediately clocked out if currently active.' : ''}`}
          danger={toggleAccount.active}
          onConfirm={() => handleToggle(toggleAccount)}
          onCancel={() => setToggleAccount(null)}
        />
      )}
    </div>
  )
}

// ─── Account Modals ───────────────────────────────────────────────────────────

function CreateAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<'crew' | 'admin'>('crew')
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')

  async function handle() {
    if (!name || !pin) { toast('All fields required', 'error'); return }
    if (pin.length < 4) { toast('PIN must be at least 4 digits', 'error'); return }
    setLoading(true)
    try {
      await api.adminCreateAccount(name.trim(), pin, role)
      toast('Account created', 'success')
      setNote(`Credentials: Name="${name.trim()}" PIN="${pin}" — share these now, they won't be shown again.`)
      setTimeout(() => { onSuccess(); onClose() }, 3000)
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Create Account" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Initial PIN <span className="text-light-500 font-normal">(min. 4 digits)</span></label>
          <input className="input" type="text" inputMode="numeric" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="crew">Crew Member</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        {note && <div className="text-xs bg-mango-500/8 border border-mango-500/25 text-mango-700 rounded-xl px-4 py-3">{note}</div>}
        <p className="text-xs text-light-500">The user will be required to change their PIN on first login.</p>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={handle} disabled={loading}>
            {loading ? <Spinner size={15} /> : <Plus size={15} />}Create
          </button>
        </div>
      </div>
    </Modal>
  )
}

function EditAccountModal({ account, onClose, onSuccess }: { account: any; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(account.name)
  const [role, setRole] = useState(account.role)
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    try {
      await api.adminUpdateAccount(account.id, { name: name.trim(), role })
      toast('Account updated', 'success')
      onSuccess(); onClose()
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Edit Account" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="crew">Crew Member</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={handle} disabled={loading}>
            {loading ? <Spinner size={15} /> : <Edit size={15} />}Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResetPinModal({ account, onClose, onSuccess }: { account: any; onClose: () => void; onSuccess: () => void }) {
  const [newPin, setNewPin] = useState('')
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (newPin.length < 4) { toast('PIN must be at least 4 digits', 'error'); return }
    setLoading(true)
    try {
      await api.adminResetPin(account.id, newPin)
      toast(`PIN reset for ${account.name}`, 'success')
      onSuccess(); onClose()
    } catch (err: any) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal title={`Reset PIN — ${account.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-light-600">Set a temporary PIN. The user will be required to change it on next login.</p>
        <div>
          <label className="label">New Temporary PIN</label>
          <input className="input" type="text" inputMode="numeric" placeholder="Minimum 4 digits" value={newPin} onChange={e => setNewPin(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={handle} disabled={loading || newPin.length < 4}>
            {loading ? <Spinner size={15} /> : <KeyRound size={15} />}Reset PIN
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.adminAuditLog()
      .then(d => setLogs(d.logs))
      .catch((err: any) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  const actionColors: Record<string, string> = {
    CREATE_ACCOUNT: 'badge-green',
    EDIT_ACCOUNT: 'badge-yellow',
    RESET_PIN: 'badge-yellow',
    INSERT_PUNCH: 'badge-green',
    EDIT_PUNCH: 'badge-yellow',
    DELETE_PUNCH: 'badge-red',
    AUTO_TIMEOUT: 'badge-gray',
    SYSTEM_TIMEOUT_ON_DEACTIVATE: 'badge-red',
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>

  return (
    <div className="card overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-light-300 flex items-center gap-2">
        <ClipboardList size={16} className="text-mango-500" />
        <h2 className="font-semibold text-sm text-light-900">Audit Log</h2>
        <span className="badge-gray">{logs.length} entries</span>
      </div>

      {logs.length === 0 ? <EmptyState message="No audit logs yet" /> : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="data-table min-w-[500px]">
            <thead><tr>
              <th>Time</th><th>Action</th><th>Actor</th>
              <th className="hidden sm:table-cell">Target</th>
              <th className="hidden md:table-cell">Details</th>
            </tr></thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="font-mono text-xs text-light-600 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td><span className={actionColors[log.action] || 'badge-gray'}>{log.action.replace(/_/g, ' ')}</span></td>
                  <td className="text-xs text-mango-600">{log.actor_name}</td>
                  <td className="text-xs text-light-600 hidden sm:table-cell">{log.target_name || '—'}</td>
                  <td className="text-xs text-light-500 max-w-xs truncate hidden md:table-cell">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
