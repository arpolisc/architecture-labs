import { SqlDatabase } from './sqlite';

export interface Migration {
  version: number;
  name: string;
  /** SQL міграції. Кожна міграція виконується в окремій транзакції. */
  sql: string;
}

/**
 * Застосовує ще не виконані міграції за зростанням версії. Журнал зберігається в таблиці schema_migrations.
 * Параметр target дозволяє зупинитися на потрібному етапі (для поетапного розгортання «розширення – скорочення»).
 */
export function migrate(db: SqlDatabase, migrations: Migration[], target?: number): number[] {
  db.transaction(() =>
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    ),
  );
  const done = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version));
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(m.version)) continue;
    if (target !== undefined && m.version > target) break;
    db.transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
    });
    applied.push(m.version);
  }
  return applied;
}

export function appliedVersions(db: SqlDatabase): number[] {
  return db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version').map((r) => r.version);
}

/** Таблиці технічної інфраструктури подій; входять до початкової міграції кожного сервісу. */
export const PLATFORM_TABLES_SQL = `
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  subscriber_url TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX idx_outbox_status ON outbox (status, next_attempt_at);
CREATE TABLE processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
`;
