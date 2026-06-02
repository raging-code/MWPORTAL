-- MWportal Database Schema — Secured
-- Run: wrangler d1 execute mwportal-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL UNIQUE,
  pin            TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK(role IN ('crew','admin')),
  active         INTEGER NOT NULL DEFAULT 1,
  must_change_pin INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clock_in       TEXT    NOT NULL,
  clock_out      TEXT,
  auto_timeout   INTEGER NOT NULL DEFAULT 0,   -- set to 1 when auto-closed at midnight
  system_timeout INTEGER NOT NULL DEFAULT 0,   -- set to 1 when admin deactivates account
  credited       INTEGER NOT NULL DEFAULT 1,   -- 0 = excluded from hour totals
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES accounts(id),
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_id   INTEGER,
  target_name TEXT,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_account   ON time_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in  ON time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_time_entries_open      ON time_entries(account_id, clock_out);
CREATE INDEX IF NOT EXISTS idx_audit_log_created      ON audit_log(created_at);

-- ─── Default admin account ───────────────────────────────────────────────────
-- PIN is "123456" (legacy bcrypt-like hash — worker accepts it for first login).
-- must_change_pin = 1 forces the admin to set a new PIN immediately.
-- After PIN change, the new PIN is stored as PBKDF2 (100k iterations).
INSERT OR IGNORE INTO accounts (id, name, pin, role, active, must_change_pin)
VALUES (
  1,
  'Administrator',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'admin', 1, 1
);