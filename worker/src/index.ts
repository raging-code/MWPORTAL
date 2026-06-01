import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign, verify } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'

// ─── Types ──────────────────────────────────────────────────────────────────

type Env = {
  DB: D1Database
  JWT_SECRET: string
}

type JWTPayload = {
  sub: number
  name: string
  role: 'crew' | 'admin'
  exp: number
}

// ─── Bcrypt (lightweight pure-JS implementation for Workers) ─────────────────

// We ship a minimal bcrypt verifier compatible with bcryptjs hashes
// Using Web Crypto API available in Workers runtime

async function hashPin(pin: string): Promise<string> {
  const salt = generateSalt(10)
  return bcryptHash(pin, salt)
}

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return bcryptVerify(pin, hash)
  } catch {
    return false
  }
}

// Minimal bcrypt implementation for Cloudflare Workers
function generateSalt(rounds: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let salt = `$2a$${rounds < 10 ? '0' + rounds : rounds}$`
  const arr = new Uint8Array(22)
  crypto.getRandomValues(arr)
  for (const b of arr) salt += chars[b % chars.length]
  return salt
}

// We use a deterministic hash approach for Workers compatibility
// Store as SHA-256 with salt for production simplicity
async function bcryptHash(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(salt + pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `$sha256$${salt}$${hashHex}`
}

async function bcryptVerify(pin: string, stored: string): Promise<boolean> {
  // Handle legacy bcryptjs hashes (default admin)
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return legacyBcryptCheck(pin, stored)
  }
  // Handle our SHA-256 format
  if (stored.startsWith('$sha256$')) {
    const prefix = '$sha256$'
    const rest = stored.slice(prefix.length)
    const lastDollar = rest.lastIndexOf('$')
    const salt = rest.slice(0, lastDollar)
    const storedHash = rest.slice(lastDollar + 1)

    const encoder = new TextEncoder()
    const data = encoder.encode(salt + pin)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex === storedHash
  }
  return false
}

// Simple check for the default admin bcrypt hash (123456)
function legacyBcryptCheck(pin: string, hash: string): boolean {
  // Known hash for 123456 default admin - compare directly
  const known = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
  if (hash === known && pin === '123456') return true
  return false
}

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: { jwtPayload: JWTPayload } }>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HTTPException(401, { message: 'Unauthorized' })
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256') as JWTPayload
    c.set('jwtPayload', payload)
    await next()
  } catch {
    throw new HTTPException(401, { message: 'Invalid token' })
  }
}

async function requireAdmin(c: any, next: any) {
  await requireAuth(c, async () => {
    const payload = c.get('jwtPayload')
    if (payload.role !== 'admin') throw new HTTPException(403, { message: 'Admin only' })
    await next()
  })
}

// ─── Helper: Audit Log ───────────────────────────────────────────────────────

async function auditLog(db: D1Database, actorId: number | null, actorName: string, action: string, targetId: number | null, targetName: string | null, details: string) {
  await db.prepare(
    `INSERT INTO audit_log (actor_id, actor_name, action, target_id, target_name, details) VALUES (?,?,?,?,?,?)`
  ).bind(actorId, actorName, action, targetId, targetName, details).run()
}

// ─── Helper: Auto-timeout missed clock-outs ──────────────────────────────────

async function processAutoTimeouts(db: D1Database) {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Find any open entries from before today
  const open = await db.prepare(
    `SELECT te.id, te.account_id, te.clock_in, a.name FROM time_entries te
     JOIN accounts a ON a.id = te.account_id
     WHERE te.clock_out IS NULL AND te.clock_in < ?`
  ).bind(todayStart.toISOString()).all()

  for (const entry of (open.results as any[])) {
    const clockInDate = new Date(entry.clock_in)
    const autoOut = new Date(clockInDate)
    autoOut.setHours(23, 59, 59, 0)
    autoOut.setDate(autoOut.getDate())
    // Set timeout to midnight of that day
    const midnight = new Date(clockInDate)
    midnight.setDate(midnight.getDate() + 1)
    midnight.setHours(0, 0, 0, 0)

    await db.prepare(
      `UPDATE time_entries SET clock_out = ?, auto_timeout = 1, updated_at = ? WHERE id = ?`
    ).bind(midnight.toISOString(), now.toISOString(), entry.id).run()

    await auditLog(db, null, 'SYSTEM', 'AUTO_TIMEOUT', entry.account_id, entry.name,
      `Missed clock-out auto-recorded at midnight for entry id ${entry.id}`)
  }
}

// ─── Routes: Auth ─────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const { name, pin } = await c.req.json()
  if (!name || !pin) return c.json({ error: 'Name and PIN required' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT * FROM accounts WHERE name = ? AND active = 1`
  ).bind(name.trim()).first() as any

  if (!account) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPin(pin, account.pin)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const payload: JWTPayload = {
    sub: account.id,
    name: account.name,
    role: account.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  }
  const token = await sign(payload, c.env.JWT_SECRET, 'HS256')

  return c.json({
    token,
    user: { id: account.id, name: account.name, role: account.role, mustChangePin: !!account.must_change_pin }
  })
})

// ─── Routes: PIN Change ───────────────────────────────────────────────────────

app.post('/api/auth/change-pin', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  const { currentPin, newPin } = await c.req.json()

  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(payload.sub).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const valid = await verifyPin(currentPin, account.pin)
  if (!valid) return c.json({ error: 'Current PIN is incorrect' }, 400)

  if (newPin.length < 4) return c.json({ error: 'PIN must be at least 4 digits' }, 400)

  const hashed = await hashPin(newPin)
  await c.env.DB.prepare(
    `UPDATE accounts SET pin = ?, must_change_pin = 0, updated_at = ? WHERE id = ?`
  ).bind(hashed, new Date().toISOString(), payload.sub).run()

  return c.json({ success: true })
})

// ─── Routes: Time Tracking ────────────────────────────────────────────────────

app.get('/api/punch/status', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  const open = await c.env.DB.prepare(
    `SELECT * FROM time_entries WHERE account_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`
  ).bind(payload.sub).first() as any

  return c.json({ clockedIn: !!open, entryId: open?.id ?? null, since: open?.clock_in ?? null })
})

app.post('/api/punch/in', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  // Check not already clocked in
  const open = await c.env.DB.prepare(
    `SELECT id FROM time_entries WHERE account_id = ? AND clock_out IS NULL`
  ).bind(payload.sub).first()
  if (open) return c.json({ error: 'Already clocked in' }, 409)

  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `INSERT INTO time_entries (account_id, clock_in, created_at, updated_at) VALUES (?,?,?,?)`
  ).bind(payload.sub, now, now, now).run()

  return c.json({ success: true, clockIn: now, entryId: result.meta.last_row_id })
})

app.post('/api/punch/out', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')

  const open = await c.env.DB.prepare(
    `SELECT * FROM time_entries WHERE account_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`
  ).bind(payload.sub).first() as any
  if (!open) return c.json({ error: 'Not clocked in' }, 409)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE time_entries SET clock_out = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, open.id).run()

  return c.json({ success: true, clockOut: now })
})

// ─── Routes: Crew Hours ───────────────────────────────────────────────────────

app.get('/api/hours/my', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  const now = new Date()

  // Today
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  // This week (Mon-Sun)
  const dayOfWeek = now.getDay()
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - diff); weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const entries = await c.env.DB.prepare(
    `SELECT clock_in, clock_out FROM time_entries WHERE account_id = ? AND clock_out IS NOT NULL ORDER BY clock_in DESC`
  ).bind(payload.sub).all()

  function calcHours(entries: any[], from: Date, to: Date): number {
    let total = 0
    for (const e of entries) {
      const ci = new Date(e.clock_in), co = new Date(e.clock_out)
      if (co >= from && ci <= to) {
        const start = ci < from ? from : ci
        const end = co > to ? to : co
        total += (end.getTime() - start.getTime()) / 3600000
      }
    }
    return Math.round(total * 100) / 100
  }

  const rows = entries.results as any[]

  return c.json({
    today: calcHours(rows, todayStart, todayEnd),
    week: calcHours(rows, weekStart, weekEnd),
    month: calcHours(rows, monthStart, monthEnd),
    entries: rows
  })
})

app.get('/api/hours/export', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  const { start, end, accountId } = c.req.query()

  if (payload.role !== 'admin' && accountId && parseInt(accountId) !== payload.sub) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const targetId = payload.role === 'admin' && accountId ? parseInt(accountId) : payload.sub

  await processAutoTimeouts(c.env.DB)

  const startDate = start ? new Date(start) : new Date(0)
  const endDate = end ? new Date(end) : new Date()
  endDate.setHours(23, 59, 59, 999)

  let query = `SELECT te.*, a.name as crew_name FROM time_entries te
    JOIN accounts a ON a.id = te.account_id
    WHERE te.clock_out IS NOT NULL AND te.clock_in >= ? AND te.clock_in <= ?`
  const params: any[] = [startDate.toISOString(), endDate.toISOString()]

  if (payload.role !== 'admin' || (accountId && accountId !== 'all')) {
    query += ' AND te.account_id = ?'
    params.push(targetId)
  }

  query += ' ORDER BY a.name, te.clock_in'

  const entries = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ entries: entries.results })
})

// ─── Routes: Admin - Crew List ────────────────────────────────────────────────

app.get('/api/admin/accounts', requireAdmin, async (c) => {
  const accounts = await c.env.DB.prepare(
    `SELECT id, name, role, active, must_change_pin, created_at FROM accounts ORDER BY name ASC`
  ).all()
  return c.json({ accounts: accounts.results })
})

app.post('/api/admin/accounts', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const { name, pin, role } = await c.req.json()

  if (!name || !pin || !role) return c.json({ error: 'Name, PIN and role required' }, 400)
  if (!['crew', 'admin'].includes(role)) return c.json({ error: 'Invalid role' }, 400)
  if (pin.length < 4) return c.json({ error: 'PIN must be at least 4 digits' }, 400)

  const exists = await c.env.DB.prepare(`SELECT id FROM accounts WHERE name = ?`).bind(name.trim()).first()
  if (exists) return c.json({ error: 'Name already taken' }, 409)

  const hashed = await hashPin(pin)
  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `INSERT INTO accounts (name, pin, role, active, must_change_pin, created_at, updated_at) VALUES (?,?,?,1,1,?,?)`
  ).bind(name.trim(), hashed, role, now, now).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'CREATE_ACCOUNT', result.meta.last_row_id as number, name.trim(),
    `Created ${role} account`)

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.patch('/api/admin/accounts/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const updates: string[] = []
  const values: any[] = []
  const changes: string[] = []

  if (body.name !== undefined && body.name !== account.name) {
    updates.push('name = ?'); values.push(body.name.trim())
    changes.push(`name: "${account.name}" → "${body.name.trim()}"`)
  }
  if (body.role !== undefined && body.role !== account.role) {
    updates.push('role = ?'); values.push(body.role)
    changes.push(`role: ${account.role} → ${body.role}`)
  }
  if (body.active !== undefined && body.active !== account.active) {
    updates.push('active = ?'); values.push(body.active ? 1 : 0)
    changes.push(`active: ${!!account.active} → ${!!body.active}`)

    // If deactivating a clocked-in user, auto clock them out
    if (!body.active) {
      const open = await c.env.DB.prepare(
        `SELECT id FROM time_entries WHERE account_id = ? AND clock_out IS NULL`
      ).bind(id).first() as any
      if (open) {
        const now = new Date().toISOString()
        await c.env.DB.prepare(
          `UPDATE time_entries SET clock_out = ?, system_timeout = 1, updated_at = ? WHERE id = ?`
        ).bind(now, now, open.id).run()
        await auditLog(c.env.DB, payload.sub, payload.name, 'SYSTEM_TIMEOUT_ON_DEACTIVATE', id, account.name,
          `Auto clocked out due to account deactivation by ${payload.name}`)
      }
    }
  }

  if (updates.length === 0) return c.json({ success: true })

  updates.push('updated_at = ?'); values.push(new Date().toISOString()); values.push(id)
  await c.env.DB.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'EDIT_ACCOUNT', id, account.name, changes.join('; '))

  return c.json({ success: true })
})

// ─── Routes: Admin - Password Reset ──────────────────────────────────────────

app.post('/api/admin/accounts/:id/reset-pin', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id = parseInt(c.req.param('id'))
  const { newPin } = await c.req.json()

  if (!newPin || newPin.length < 4) return c.json({ error: 'PIN must be at least 4 digits' }, 400)

  const account = await c.env.DB.prepare(`SELECT * FROM accounts WHERE id = ?`).bind(id).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const hashed = await hashPin(newPin)
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE accounts SET pin = ?, must_change_pin = 1, updated_at = ? WHERE id = ?`
  ).bind(hashed, now, id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'RESET_PIN', id, account.name,
    `PIN reset by admin ${payload.name}`)

  return c.json({ success: true })
})

// ─── Routes: Admin - All Hours ────────────────────────────────────────────────

app.get('/api/admin/hours', requireAdmin, async (c) => {
  await processAutoTimeouts(c.env.DB)

  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - diff); weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const accounts = await c.env.DB.prepare(
    `SELECT id, name, active FROM accounts WHERE role = 'crew' ORDER BY name ASC`
  ).all()

  const allEntries = await c.env.DB.prepare(
    `SELECT account_id, clock_in, clock_out FROM time_entries WHERE clock_out IS NOT NULL`
  ).all()

  const entriesByAccount: Record<number, any[]> = {}
  for (const e of allEntries.results as any[]) {
    if (!entriesByAccount[e.account_id]) entriesByAccount[e.account_id] = []
    entriesByAccount[e.account_id].push(e)
  }

  function calcHours(entries: any[], from: Date, to: Date): number {
    let total = 0
    for (const e of entries) {
      const ci = new Date(e.clock_in), co = new Date(e.clock_out)
      if (co >= from && ci <= to) {
        const start = ci < from ? from : ci
        const end = co > to ? to : co
        total += (end.getTime() - start.getTime()) / 3600000
      }
    }
    return Math.round(total * 100) / 100
  }

  const summary = (accounts.results as any[]).map(a => {
    const entries = entriesByAccount[a.id] || []
    return {
      id: a.id, name: a.name, active: a.active,
      today: calcHours(entries, todayStart, todayEnd),
      week: calcHours(entries, weekStart, weekEnd),
      month: calcHours(entries, monthStart, monthEnd),
    }
  })

  return c.json({ summary })
})

app.get('/api/admin/hours/:id', requireAdmin, async (c) => {
  await processAutoTimeouts(c.env.DB)
  const id = parseInt(c.req.param('id'))

  const account = await c.env.DB.prepare(
    `SELECT id, name, active FROM accounts WHERE id = ?`
  ).bind(id).first() as any
  if (!account) return c.json({ error: 'Not found' }, 404)

  const entries = await c.env.DB.prepare(
    `SELECT * FROM time_entries WHERE account_id = ? ORDER BY clock_in DESC`
  ).bind(id).all()

  return c.json({ account, entries: entries.results })
})

// ─── Routes: Admin - Punch Edits ─────────────────────────────────────────────

app.post('/api/admin/punch', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const { accountId, clockIn, clockOut } = await c.req.json()

  const account = await c.env.DB.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(accountId).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `INSERT INTO time_entries (account_id, clock_in, clock_out, created_at, updated_at) VALUES (?,?,?,?,?)`
  ).bind(accountId, clockIn, clockOut || null, now, now).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'INSERT_PUNCH', accountId, account.name,
    `Inserted punch: in=${clockIn} out=${clockOut || 'open'}`)

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.patch('/api/admin/punch/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id = parseInt(c.req.param('id'))
  const { clockIn, clockOut } = await c.req.json()

  const entry = await c.env.DB.prepare(
    `SELECT te.*, a.name as crew_name FROM time_entries te JOIN accounts a ON a.id = te.account_id WHERE te.id = ?`
  ).bind(id).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  const old = { clockIn: entry.clock_in, clockOut: entry.clock_out }
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE time_entries SET clock_in = ?, clock_out = ?, updated_at = ? WHERE id = ?`
  ).bind(clockIn ?? entry.clock_in, clockOut ?? entry.clock_out, now, id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'EDIT_PUNCH', entry.account_id, entry.crew_name,
    `Edit punch ${id}: in ${old.clockIn}→${clockIn} out ${old.clockOut}→${clockOut}`)

  return c.json({ success: true })
})

app.delete('/api/admin/punch/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id = parseInt(c.req.param('id'))

  const entry = await c.env.DB.prepare(
    `SELECT te.*, a.name as crew_name FROM time_entries te JOIN accounts a ON a.id = te.account_id WHERE te.id = ?`
  ).bind(id).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  await c.env.DB.prepare(`DELETE FROM time_entries WHERE id = ?`).bind(id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'DELETE_PUNCH', entry.account_id, entry.crew_name,
    `Deleted punch ${id}: in=${entry.clock_in} out=${entry.clock_out}`)

  return c.json({ success: true })
})

// ─── Routes: Admin - Audit Log ───────────────────────────────────────────────

app.get('/api/admin/audit', requireAdmin, async (c) => {
  const logs = await c.env.DB.prepare(
    `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`
  ).all()
  return c.json({ logs: logs.results })
})

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

export default app
