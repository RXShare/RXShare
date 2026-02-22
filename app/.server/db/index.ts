import { getDbType, type DatabaseAdapter, type DbResult } from "./adapter";
import { createSqliteAdapter } from "./sqlite";
import { getMigrationSQL, getIndexSQL, getMigrationUpdates } from "./migrations";
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

export function getDb(): DatabaseAdapter {
  if (!db) {
    const dbType = getDbType();
    if (dbType === "mysql") {
      const { createMysqlAdapter } = require("./mysql") as { createMysqlAdapter: () => DatabaseAdapter };
      db = createMysqlAdapter();
    } else {
      db = createSqliteAdapter();
    }
  }
  return db;
}

export function initDatabase(): void {
  if (initialized) return;
  const dbType = getDbType();
  if (dbType === "sqlite") {
    const adapter = getDb();
    for (const sql of getMigrationSQL("sqlite")) adapter.exec(sql);
    for (const sql of getIndexSQL()) { try { adapter.exec(sql); } catch {} }
    for (const sql of getMigrationUpdates()) { try { adapter.exec(sql); } catch {} }
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
    initialized = true;
  } else {
    initDatabase();
  }
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  initDatabase(); return getDb().query<T>(sql, params);
}
export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  initDatabase(); return getDb().queryOne<T>(sql, params);
}
export function execute(sql: string, params: any[] = []): DbResult {
  initDatabase(); return getDb().execute(sql, params);
}
export function transaction<T>(fn: () => T): T {
  initDatabase(); return getDb().transaction(fn);
}
