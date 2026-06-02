import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign, verify } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'

// ─── Types ───────────────────────────────────────────────────────────────────

type Env = {
  DB: D1Database
  JWT_SECRET: string
  ALLOWED_ORIGIN: string
}

type JWTPayload = {
  sub: number
  name: string
  role: 'crew' | 'admin'
  iat: number
  exp: number
}

// ─── In-memory rate-limit store (per isolate, best-effort brute-force guard) ──

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const RATE_MAX       = 10              // max attempts per window per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_MAX) return false
  entry.count++
  return true
}

function resetRateLimit(ip: string) {
  loginAttempts.delete(ip)
}

// ─── Input validators ────────────────────────────────────────────────────────

function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,12}$/.test(pin)
}

function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const t = name.trim()
  return t.length >= 1 && t.length <= 80
}

function isValidRole(role: unknown): role is 'crew' | 'admin' {
  return role === 'crew' || role === 'admin'
}

function isValidISODate(val: unknown): val is string {
  if (typeof val !== 'string') return false
  const d = new Date(val)
  return !isNaN(d.getTime())
}

function safeInt(val: unknown): number | null {
  const n = parseInt(String(val), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ─── PIN hashing — PBKDF2 via Web Crypto (Workers-native, no bcrypt needed) ──
//
// Format: $pbkdf2-sha256$<hex-salt>$<hex-hash>
// 100 000 iterations, 256-bit output.  Backward-compat with old $sha256$ hashes.

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pin, salt)
  return `$pbkdf2-sha256$${hex(salt)}$${hex(hash)}`
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith('$pbkdf2-sha256$')) {
      const parts = stored.split('$')            // ['','pbkdf2-sha256','salt','hash']
      if (parts.length !== 4) return false
      const salt = unhex(parts[2])
      const hash = await pbkdf2(pin, salt)
      return constEq(hex(hash), parts[3])
    }
    if (stored.startsWith('$sha256$')) {         // legacy format from original code
      return legacySha256(pin, stored)
    }
    if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
      return legacyBcrypt(pin, stored)           // seeded default admin only
    }
    return false
  } catch {
    return false
  }
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  )
  return new Uint8Array(bits)
}

function hex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}
function unhex(s: string): Uint8Array {
  const a = new Uint8Array(s.length / 2)
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return a
}
function constEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function legacySha256(pin: string, stored: string): Promise<boolean> {
  const rest = stored.slice('$sha256$'.length)
  const cut  = rest.lastIndexOf('$')
  const salt = rest.slice(0, cut)
  const want = rest.slice(cut + 1)
  const enc  = new TextEncoder()
  const buf  = await crypto.subtle.digest('SHA-256', enc.encode(salt + pin))
  return constEq(hex(new Uint8Array(buf)), want)
}

function legacyBcrypt(pin: string, stored: string): boolean {
  // The seeded default admin hash only matches PIN "123456".
  // Once the admin logs in and changes their PIN via the mustChangePin flow,
  // the new PIN is stored as PBKDF2 and this function is never used again.
  const SEED_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
  return constEq(stored, SEED_HASH) && constEq(pin, '123456')
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env; Variables: { jwtPayload: JWTPayload } }>()

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Locks down to ALLOWED_ORIGIN (set as wrangler var, e.g. your Pages domain).
// Falls back to '*' only if the var is missing — set it before going to prod!

app.use('*', async (c, next) => {
  const origin = (c.env.ALLOWED_ORIGIN || '*').trim()
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })(c, next)
})

// ─── Security response headers ────────────────────────────────────────────────

app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  c.res.headers.delete('Server')
})

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HTTPException(401, { message: 'Unauthorized' })
  try {
    const token   = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256') as JWTPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired')
    c.set('jwtPayload', payload)
    await next()
  } catch (e: any) {
    if (e instanceof HTTPException) throw e
    throw new HTTPException(401, { message: 'Invalid or expired token' })
  }
}

async function requireAdmin(c: any, next: any) {
  await requireAuth(c, async () => {
    if (c.get('jwtPayload').role !== 'admin')
      throw new HTTPException(403, { message: 'Admin only' })
    await next()
  })
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function auditLog(
  db: D1Database,
  actorId: number | null, actorName: string,
  action: string,
  targetId: number | null, targetName: string | null,
  details: string
) {
  await db.prepare(
    `INSERT INTO audit_log (actor_id, actor_name, action, target_id, target_name, details)
     VALUES (?,?,?,?,?,?)`
  ).bind(actorId, actorName, action, targetId, targetName, details).run()
}

// ─── Auto-timeout: close any entry that started on a PREVIOUS calendar day ───
//
// Cloudflare Workers have no cron-like persistent timer, so we call this helper
// on every authenticated request.  It finds all open (clock_out IS NULL) entries
// whose clock_in is before today's local midnight and closes them at exactly
// midnight of that same day.
//
// credited = 0  → the duration is excluded from all hour totals.
// auto_timeout = 1 → displayed in admin UI with an "Auto-out" badge so the
//                    admin knows to add a corrected credited entry if needed.

async function processAutoTimeouts(db: D1Database) {
  const now       = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const open = await db.prepare(
    `SELECT te.id, te.account_id, te.clock_in, a.name
       FROM time_entries te
       JOIN accounts a ON a.id = te.account_id
      WHERE te.clock_out IS NULL
        AND te.clock_in < ?`
  ).bind(todayStart.toISOString()).all()

  for (const entry of open.results as any[]) {
    // Clock-out = midnight that ends the clock-in day (start of next day = midnight)
    const clockInDate = new Date(entry.clock_in)
    const midnight    = new Date(clockInDate)
    midnight.setDate(midnight.getDate() + 1)
    midnight.setHours(0, 0, 0, 0)

    await db.prepare(
      `UPDATE time_entries
          SET clock_out = ?, auto_timeout = 1, credited = 0, updated_at = ?
        WHERE id = ?`
    ).bind(midnight.toISOString(), now.toISOString(), entry.id).run()

    await auditLog(
      db, null, 'SYSTEM', 'AUTO_TIMEOUT',
      entry.account_id, entry.name,
      `Auto clock-out at midnight for entry ${entry.id}. ` +
      `credited=0 — admin must add a new entry if hours should count.`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (c) => {
  // Rate limit by IP
  const ip = c.req.header('CF-Connecting-IP') ||
             c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
             'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too many attempts — try again in 15 minutes' }, 429)
  }

  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { name, pin } = body

  if (!isValidName(name)) return c.json({ error: 'Name and PIN required' }, 400)
  if (!isValidPin(pin))   return c.json({ error: 'Name and PIN required' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, name, pin, role, active, must_change_pin
       FROM accounts WHERE name = ? AND active = 1`
  ).bind(name.trim()).first() as any

  // Always run hash comparison even when account is null to prevent timing attacks
  const dummyHash = '$pbkdf2-sha256$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'
  const valid = account
    ? await verifyPin(pin, account.pin)
    : (await verifyPin(pin, dummyHash), false)

  if (!account || !valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  resetRateLimit(ip)

  const now = Math.floor(Date.now() / 1000)
  const payload: JWTPayload = {
    sub:  account.id,
    name: account.name,
    role: account.role,
    iat:  now,
    exp:  now + 60 * 60 * 12,  // 12-hour token
  }
  const token = await sign(payload, c.env.JWT_SECRET, 'HS256')

  return c.json({
    token,
    user: {
      id:           account.id,
      name:         account.name,
      role:         account.role,
      mustChangePin: !!account.must_change_pin,
    }
  })
})

app.post('/api/auth/change-pin', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { currentPin, newPin } = body
  if (!isValidPin(currentPin)) return c.json({ error: 'Current PIN must be 4–12 digits' }, 400)
  if (!isValidPin(newPin))     return c.json({ error: 'New PIN must be 4–12 digits' }, 400)
  if (currentPin === newPin)   return c.json({ error: 'New PIN must differ from current PIN' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, pin FROM accounts WHERE id = ?`
  ).bind(payload.sub).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  if (!await verifyPin(currentPin, account.pin))
    return c.json({ error: 'Current PIN is incorrect' }, 400)

  const hashed = await hashPin(newPin)
  await c.env.DB.prepare(
    `UPDATE accounts SET pin = ?, must_change_pin = 0, updated_at = ? WHERE id = ?`
  ).bind(hashed, new Date().toISOString(), payload.sub).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'CHANGE_PIN',
    payload.sub, payload.name, 'User changed own PIN')

  return c.json({ success: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  PUNCH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/punch/status', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  const open = await c.env.DB.prepare(
    `SELECT id, clock_in FROM time_entries
      WHERE account_id = ? AND clock_out IS NULL
      ORDER BY clock_in DESC LIMIT 1`
  ).bind(payload.sub).first() as any

  return c.json({ clockedIn: !!open, entryId: open?.id ?? null, since: open?.clock_in ?? null })
})

app.post('/api/punch/in', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  const open = await c.env.DB.prepare(
    `SELECT id FROM time_entries WHERE account_id = ? AND clock_out IS NULL LIMIT 1`
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
    `SELECT id FROM time_entries
      WHERE account_id = ? AND clock_out IS NULL
      ORDER BY clock_in DESC LIMIT 1`
  ).bind(payload.sub).first() as any
  if (!open) return c.json({ error: 'Not clocked in' }, 409)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE time_entries SET clock_out = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, open.id).run()

  return c.json({ success: true, clockOut: now })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  CREW HOURS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/hours/my', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  await processAutoTimeouts(c.env.DB)

  const now = new Date()

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  const dow       = now.getDay()
  const diff      = dow === 0 ? 6 : dow - 1
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - diff); weekStart.setHours(0, 0, 0, 0)
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  // IDOR-safe: always scoped to payload.sub
  const entries = await c.env.DB.prepare(
    `SELECT id, clock_in, clock_out, auto_timeout, credited
       FROM time_entries
      WHERE account_id = ?
      ORDER BY clock_in DESC`
  ).bind(payload.sub).all()

  function calcHours(list: any[], from: Date, to: Date): number {
    let total = 0
    for (const e of list) {
      if (!e.clock_out) continue
      const ci = new Date(e.clock_in), co = new Date(e.clock_out)
      if (co >= from && ci <= to) {
        const s = ci < from ? from : ci
        const n = co > to   ? to   : co
        total += (n.getTime() - s.getTime()) / 3600000
      }
    }
    return Math.round(total * 100) / 100
  }

  const rows         = entries.results as any[]
  const creditedRows = rows.filter((e: any) => e.credited !== 0)

  return c.json({
    today:   calcHours(creditedRows, todayStart, todayEnd),
    week:    calcHours(creditedRows, weekStart, weekEnd),
    month:   calcHours(creditedRows, monthStart, monthEnd),
    entries: rows,          // all rows returned for history display (auto-timeout flagged)
  })
})

app.get('/api/hours/export', requireAuth, async (c) => {
  const payload = c.get('jwtPayload')
  const { start, end, accountId } = c.req.query()

  if (start && !isValidISODate(start)) return c.json({ error: 'Invalid start date' }, 400)
  if (end   && !isValidISODate(end))   return c.json({ error: 'Invalid end date' }, 400)

  // Non-admins can only export their own data
  if (payload.role !== 'admin' && accountId && parseInt(accountId) !== payload.sub) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const targetId = payload.role === 'admin' && accountId ? parseInt(accountId) : payload.sub
  if (!Number.isFinite(targetId) || targetId <= 0) return c.json({ error: 'Invalid account' }, 400)

  await processAutoTimeouts(c.env.DB)

  const startDate = start ? new Date(start) : new Date(0)
  const endDate   = end   ? new Date(end)   : new Date()
  endDate.setHours(23, 59, 59, 999)

  let query = `SELECT te.id, te.account_id, te.clock_in, te.clock_out,
                      te.auto_timeout, te.system_timeout, te.credited, a.name as crew_name
                 FROM time_entries te
                 JOIN accounts a ON a.id = te.account_id
                WHERE te.clock_out IS NOT NULL
                  AND te.clock_in >= ? AND te.clock_in <= ?`
  const params: any[] = [startDate.toISOString(), endDate.toISOString()]

  if (payload.role !== 'admin' || (accountId && accountId !== 'all')) {
    query += ' AND te.account_id = ?'
    params.push(targetId)
  }

  query += ' ORDER BY a.name, te.clock_in'

  const entries = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ entries: entries.results })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN — ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/accounts', requireAdmin, async (c) => {
  // NEVER return pin column
  const accounts = await c.env.DB.prepare(
    `SELECT id, name, role, active, must_change_pin, created_at
       FROM accounts ORDER BY name ASC`
  ).all()
  return c.json({ accounts: accounts.results })
})

app.post('/api/admin/accounts', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { name, pin, role } = body
  if (!isValidName(name)) return c.json({ error: 'Valid name required' }, 400)
  if (!isValidPin(pin))   return c.json({ error: 'PIN must be 4–12 digits' }, 400)
  if (!isValidRole(role)) return c.json({ error: 'Role must be crew or admin' }, 400)

  const trimName = name.trim()
  const exists = await c.env.DB.prepare(
    `SELECT id FROM accounts WHERE name = ?`
  ).bind(trimName).first()
  if (exists) return c.json({ error: 'Name already taken' }, 409)

  const hashed = await hashPin(pin)
  const now    = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `INSERT INTO accounts (name, pin, role, active, must_change_pin, created_at, updated_at)
     VALUES (?,?,?,1,1,?,?)`
  ).bind(trimName, hashed, role, now, now).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'CREATE_ACCOUNT',
    result.meta.last_row_id as number, trimName, `Created ${role} account`)

  return c.json({ success: true, id: result.meta.last_row_id })
})

app.patch('/api/admin/accounts/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id      = safeInt(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid account ID' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  if (body.name !== undefined && !isValidName(body.name))  return c.json({ error: 'Invalid name' }, 400)
  if (body.role !== undefined && !isValidRole(body.role))  return c.json({ error: 'Invalid role' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, name, role, active FROM accounts WHERE id = ?`
  ).bind(id).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const updates: string[] = [], values: any[] = [], changes: string[] = []

  if (body.name !== undefined && body.name.trim() !== account.name) {
    updates.push('name = ?'); values.push(body.name.trim())
    changes.push(`name: "${account.name}" → "${body.name.trim()}"`)
  }
  if (body.role !== undefined && body.role !== account.role) {
    updates.push('role = ?'); values.push(body.role)
    changes.push(`role: ${account.role} → ${body.role}`)
  }
  if (body.active !== undefined && !!body.active !== !!account.active) {
    updates.push('active = ?'); values.push(body.active ? 1 : 0)
    changes.push(`active: ${!!account.active} → ${!!body.active}`)

    if (!body.active) {
      const open = await c.env.DB.prepare(
        `SELECT id FROM time_entries WHERE account_id = ? AND clock_out IS NULL LIMIT 1`
      ).bind(id).first() as any
      if (open) {
        const now = new Date().toISOString()
        await c.env.DB.prepare(
          `UPDATE time_entries SET clock_out = ?, system_timeout = 1, updated_at = ? WHERE id = ?`
        ).bind(now, now, open.id).run()
        await auditLog(c.env.DB, payload.sub, payload.name, 'SYSTEM_TIMEOUT_ON_DEACTIVATE',
          id, account.name, `Auto clocked out on deactivation by ${payload.name}`)
      }
    }
  }

  if (updates.length === 0) return c.json({ success: true })

  updates.push('updated_at = ?'); values.push(new Date().toISOString()); values.push(id)
  await c.env.DB.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'EDIT_ACCOUNT', id, account.name, changes.join('; '))
  return c.json({ success: true })
})

app.post('/api/admin/accounts/:id/reset-pin', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id      = safeInt(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid account ID' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  if (!isValidPin(body.newPin)) return c.json({ error: 'PIN must be 4–12 digits' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, name FROM accounts WHERE id = ?`
  ).bind(id).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const hashed = await hashPin(body.newPin)
  await c.env.DB.prepare(
    `UPDATE accounts SET pin = ?, must_change_pin = 1, updated_at = ? WHERE id = ?`
  ).bind(hashed, new Date().toISOString(), id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'RESET_PIN', id, account.name,
    `PIN reset by admin ${payload.name}`)
  return c.json({ success: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN — HOURS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/hours', requireAdmin, async (c) => {
  await processAutoTimeouts(c.env.DB)

  const now        = new Date()
  const dow        = now.getDay()
  const diff       = dow === 0 ? 6 : dow - 1
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - diff); weekStart.setHours(0, 0, 0, 0)
  const weekEnd    = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  const accounts = await c.env.DB.prepare(
    `SELECT id, name, active FROM accounts WHERE role = 'crew' ORDER BY name ASC`
  ).all()

  const allEntries = await c.env.DB.prepare(
    `SELECT account_id, clock_in, clock_out, credited
       FROM time_entries WHERE clock_out IS NOT NULL`
  ).all()

  const byAccount: Record<number, any[]> = {}
  for (const e of allEntries.results as any[]) {
    if (!byAccount[e.account_id]) byAccount[e.account_id] = []
    byAccount[e.account_id].push(e)
  }

  function calcHours(list: any[], from: Date, to: Date): number {
    let total = 0
    for (const e of list) {
      const ci = new Date(e.clock_in), co = new Date(e.clock_out)
      if (co >= from && ci <= to) {
        const s = ci < from ? from : ci
        const n = co > to   ? to   : co
        total += (n.getTime() - s.getTime()) / 3600000
      }
    }
    return Math.round(total * 100) / 100
  }

  const summary = (accounts.results as any[]).map(a => {
    const all      = byAccount[a.id] || []
    const credited = all.filter((e: any) => e.credited !== 0)
    return {
      id:    a.id, name: a.name, active: a.active,
      today: calcHours(credited, todayStart, todayEnd),
      week:  calcHours(credited, weekStart, weekEnd),
      month: calcHours(credited, monthStart, monthEnd),
    }
  })

  return c.json({ summary })
})

app.get('/api/admin/hours/:id', requireAdmin, async (c) => {
  await processAutoTimeouts(c.env.DB)
  const id = safeInt(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid account ID' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, name, active FROM accounts WHERE id = ?`
  ).bind(id).first() as any
  if (!account) return c.json({ error: 'Not found' }, 404)

  // Explicit columns — never return pin
  const entries = await c.env.DB.prepare(
    `SELECT id, account_id, clock_in, clock_out,
            auto_timeout, system_timeout, credited, created_at, updated_at
       FROM time_entries WHERE account_id = ? ORDER BY clock_in DESC`
  ).bind(id).all()

  return c.json({ account, entries: entries.results })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN — PUNCH EDITS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/punch', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { accountId, clockIn, clockOut } = body
  const aId = safeInt(accountId)
  if (!aId)                         return c.json({ error: 'Invalid account ID' }, 400)
  if (!isValidISODate(clockIn))     return c.json({ error: 'Valid clockIn required' }, 400)
  if (clockOut && !isValidISODate(clockOut)) return c.json({ error: 'Invalid clockOut' }, 400)
  if (clockOut && new Date(clockOut) <= new Date(clockIn))
    return c.json({ error: 'clockOut must be after clockIn' }, 400)

  const account = await c.env.DB.prepare(`SELECT name FROM accounts WHERE id = ?`).bind(aId).first() as any
  if (!account) return c.json({ error: 'Account not found' }, 404)

  const now    = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `INSERT INTO time_entries (account_id, clock_in, clock_out, credited, created_at, updated_at)
     VALUES (?,?,?,1,?,?)`
  ).bind(aId, clockIn, clockOut || null, now, now).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'INSERT_PUNCH', aId, account.name,
    `Inserted punch: in=${clockIn} out=${clockOut || 'open'}`)
  return c.json({ success: true, id: result.meta.last_row_id })
})

app.patch('/api/admin/punch/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id      = safeInt(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid entry ID' }, 400)

  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const { clockIn, clockOut } = body
  if (clockIn  && !isValidISODate(clockIn))  return c.json({ error: 'Invalid clockIn' }, 400)
  if (clockOut && !isValidISODate(clockOut)) return c.json({ error: 'Invalid clockOut' }, 400)

  const entry = await c.env.DB.prepare(
    `SELECT te.id, te.clock_in, te.clock_out, te.account_id, a.name as crew_name
       FROM time_entries te JOIN accounts a ON a.id = te.account_id WHERE te.id = ?`
  ).bind(id).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  const finalIn  = clockIn  ?? entry.clock_in
  const finalOut = clockOut ?? entry.clock_out
  if (finalOut && new Date(finalOut) <= new Date(finalIn))
    return c.json({ error: 'clockOut must be after clockIn' }, 400)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE time_entries SET clock_in = ?, clock_out = ?, updated_at = ? WHERE id = ?`
  ).bind(finalIn, finalOut, now, id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'EDIT_PUNCH', entry.account_id, entry.crew_name,
    `Edit punch ${id}: in ${entry.clock_in}→${clockIn} out ${entry.clock_out}→${clockOut}`)
  return c.json({ success: true })
})

app.delete('/api/admin/punch/:id', requireAdmin, async (c) => {
  const payload = c.get('jwtPayload')
  const id      = safeInt(c.req.param('id'))
  if (!id) return c.json({ error: 'Invalid entry ID' }, 400)

  const entry = await c.env.DB.prepare(
    `SELECT te.id, te.clock_in, te.clock_out, te.account_id, a.name as crew_name
       FROM time_entries te JOIN accounts a ON a.id = te.account_id WHERE te.id = ?`
  ).bind(id).first() as any
  if (!entry) return c.json({ error: 'Entry not found' }, 404)

  await c.env.DB.prepare(`DELETE FROM time_entries WHERE id = ?`).bind(id).run()

  await auditLog(c.env.DB, payload.sub, payload.name, 'DELETE_PUNCH', entry.account_id, entry.crew_name,
    `Deleted punch ${id}: in=${entry.clock_in} out=${entry.clock_out}`)
  return c.json({ success: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN — AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/audit', requireAdmin, async (c) => {
  const limitN  = Math.min(parseInt(c.req.query('limit')  || '200', 10), 500)
  const offsetN = Math.max(parseInt(c.req.query('offset') || '0',   10), 0)

  const logs = await c.env.DB.prepare(
    `SELECT id, actor_id, actor_name, action, target_id, target_name, details, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(limitN, offsetN).all()

  return c.json({ logs: logs.results })
})

// ═══════════════════════════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// ─── Catch-all / Error handlers ───────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error('[worker error]', err)
  // Never leak stack traces or internal error details to clients
  return c.json({ error: 'Internal server error' }, 500)
})

export default app