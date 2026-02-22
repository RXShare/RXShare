import type { DatabaseAdapter, DbResult } from "./adapter";

let pool: any = null;

function getPool() {
  if (!pool) {
    const mysql = require("mysql2/promise");
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "xshare",
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

export async function mysqlExec(sql: string): Promise<void> {
  const p = getPool();
  await p.execute(sql);
}

export function createMysqlAdapter(): DatabaseAdapter {
  const p = getPool();
  return {
    query<T = any>(sql: string, params: any[] = []): T[] {
      throw new Error("MySQL adapter requires async — use initDatabaseAsync");
    },
    queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
      throw new Error("MySQL adapter requires async — use initDatabaseAsync");
    },
    execute(sql: string, params: any[] = []): DbResult {
      throw new Error("MySQL adapter requires async");
    },
    exec(sql: string): void {
      throw new Error("MySQL adapter requires async");
    },
    transaction<T>(fn: () => T): T {
      throw new Error("MySQL adapter requires async");
    },
    close(): void { if (pool) { pool.end(); pool = null; } },
  };
}
