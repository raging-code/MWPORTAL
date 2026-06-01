-- MWportal Database Schema
-- Run: wrangler d1 execute mwportal-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('crew','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_pin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  auto_timeout INTEGER NOT NULL DEFAULT 0,
  system_timeout INTEGER NOT NULL DEFAULT 0,
  credited INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES accounts(id),
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_account ON time_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Default admin account: PIN is 123456
INSERT OR IGNORE INTO accounts (id, name, pin, role, active, must_change_pin)
VALUES (1, 'Administrator', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', 1, 1);