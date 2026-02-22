import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import type { DatabaseAdapter, DbResult } from "./adapter";

let instance: Database.Database | null = null;

function getConnection(): Database.Database {
  if (!instance) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "database.db");
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    instance = new Database(dbPath);
    instance.pragma("journal_mode = WAL");
    instance.pragma("foreign_keys = ON");
  }
  return instance;
}

export function createSqliteAdapter(): DatabaseAdapter {
  const db = getConnection();
  return {
    query<T = any>(sql: string, params: any[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    execute(sql: string, params: any[] = []): DbResult {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    exec(sql: string): void { db.exec(sql); },
    transaction<T>(fn: () => T): T { return db.transaction(fn)(); },
    close(): void { if (instance) { instance.close(); instance = null; } },
  };
}
