import { getDbType, type DatabaseAdapter, type DbResult } from "./adapter";
import { createSqliteAdapter } from "./sqlite";
import { getMigrationSQL, getIndexSQL, getMigrationUpdates, getNewTablesSQL } from "./migrations";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

let db: DatabaseAdapter | null = null;
let initialized = false;

const dataDir = join(process.cwd(), "data");
const setupMarker = join(dataDir, ".setup-done");

export function isFirstRun(): boolean {
  return !existsSync(setupMarker);
}

export function markSetupDone(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(setupMarker, new Date().toISOString(), "utf-8");
}

export async function getDb(): Promise<DatabaseAdapter> {
  if (!db) {
    const dbType = getDbType();
    if (dbType === "mysql") {
      const { createMysqlAdapter } = await import("./mysql");
      db = createMysqlAdapter();
    } else {
      db = createSqliteAdapter();
    }
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  if (initialized) return;
  const dbType = getDbType();
  if (dbType === "sqlite") {
    const adapter = await getDb();
    for (const sql of getMigrationSQL("sqlite")) adapter.exec(sql);
    for (const sql of getIndexSQL()) { try { adapter.exec(sql); } catch {} }
    for (const sql of getMigrationUpdates()) { try { adapter.exec(sql); } catch {} }
    for (const sql of getNewTablesSQL("sqlite")) { try { adapter.exec(sql); } catch {} }
    // Rebuild short_links if upload_id is NOT NULL (needed for external URL support)
    try {
      const tableInfo = adapter.query<any>("PRAGMA table_info(short_links)", []);
      const uploadIdCol = tableInfo.find((c: any) => c.name === "upload_id");
      if (uploadIdCol && uploadIdCol.notnull === 1) {
        adapter.exec("DROP TABLE IF EXISTS short_links_rebuild");
        adapter.exec(`CREATE TABLE short_links_rebuild (
          id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, upload_id TEXT, user_id TEXT NOT NULL,
          external_url TEXT, clicks INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        adapter.exec("INSERT OR IGNORE INTO short_links_rebuild (id, code, upload_id, user_id, external_url, clicks, created_at) SELECT id, code, upload_id, user_id, external_url, clicks, created_at FROM short_links");
        adapter.exec("DROP TABLE short_links");
        adapter.exec("ALTER TABLE short_links_rebuild RENAME TO short_links");
        adapter.exec("CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links(code)");
      }
    } catch {}
    initialized = true;
  }
}

export async function initDatabaseAsync(): Promise<void> {
  if (initialized) return;
  const dbType = getDbType();
  if (dbType === "mysql") {
    const { mysqlExec } = await import("./mysql");
    for (const sql of getMigrationSQL("mysql")) await mysqlExec(sql);
    for (const sql of getIndexSQL()) { try { await mysqlExec(sql); } catch {} }
    for (const sql of getMigrationUpdates()) { try { await mysqlExec(sql); } catch {} }
    for (const sql of getNewTablesSQL("mysql")) { try { await mysqlExec(sql); } catch {} }
    initialized = true;
  } else {
    await initDatabase();
  }
}

// These sync wrappers only work with SQLite (which is sync).
// For MySQL, initDatabaseAsync must be called first via the root loader.
function ensureInit() {
  if (!initialized && getDbType() === "sqlite") {
    // For SQLite, we can init synchronously since getDb resolves immediately for sqlite
    const adapter = createSqliteAdapter();
    if (!db) db = adapter;
    for (const sql of getMigrationSQL("sqlite")) adapter.exec(sql);
    for (const sql of getIndexSQL()) { try { adapter.exec(sql); } catch {} }
    for (const sql of getMigrationUpdates()) { try { adapter.exec(sql); } catch {} }
    for (const sql of getNewTablesSQL("sqlite")) { try { adapter.exec(sql); } catch {} }
    // Rebuild short_links if upload_id is NOT NULL (needed for external URL support)
    try {
      const tableInfo = adapter.query<any>("PRAGMA table_info(short_links)", []);
      const uploadIdCol = tableInfo.find((c: any) => c.name === "upload_id");
      if (uploadIdCol && uploadIdCol.notnull === 1) {
        adapter.exec("DROP TABLE IF EXISTS short_links_rebuild");
        adapter.exec(`CREATE TABLE short_links_rebuild (
          id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, upload_id TEXT, user_id TEXT NOT NULL,
          external_url TEXT, clicks INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        adapter.exec("INSERT OR IGNORE INTO short_links_rebuild (id, code, upload_id, user_id, external_url, clicks, created_at) SELECT id, code, upload_id, user_id, external_url, clicks, created_at FROM short_links");
        adapter.exec("DROP TABLE short_links");
        adapter.exec("ALTER TABLE short_links_rebuild RENAME TO short_links");
        adapter.exec("CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links(code)");
      }
    } catch {}
    initialized = true;
  }
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  ensureInit(); return db!.query<T>(sql, params);
}
export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  ensureInit(); return db!.queryOne<T>(sql, params);
}
export function execute(sql: string, params: any[] = []): DbResult {
  ensureInit(); return db!.execute(sql, params);
}
export function transaction<T>(fn: () => T): T {
  ensureInit(); return db!.transaction(fn);
}
