import * as XLSX from 'xlsx'

export function formatHours(h: number): string {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${hrs}h ${mins}m`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export function calcDuration(clockIn: string, clockOut: string): number {
  return (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000
}

export function exportToXLSX(entries: any[], filename: string) {
  const rows = entries.map(e => ({
    'Crew Name': e.crew_name || e.account_name || '',
    'Date': e.clock_in ? formatDate(e.clock_in) : '',
    'Clock In': e.clock_in ? formatDateTime(e.clock_in) : '',
    'Clock Out': e.clock_out ? formatDateTime(e.clock_out) : 'Open',
    'Hours Worked': e.clock_out ? formatHours(calcDuration(e.clock_in, e.clock_out)) : '',
    'Auto Timeout': e.auto_timeout ? 'Yes' : 'No',
    'System Timeout': e.system_timeout ? 'Yes' : 'No',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Work Hours')

  // Style column widths
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }
  ]

  XLSX.writeFile(wb, filename)
}
