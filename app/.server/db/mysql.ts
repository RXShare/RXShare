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
      database: process.env.DB_NAME || "rxshare",
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
  const syncError = (method: string) =>
    new Error(`MySQL adapter: ${method}() is not available synchronously. MySQL support is experimental — all route handlers currently use synchronous DB calls which only work with SQLite. Use initDatabaseAsync() for migrations.`);
  return {
    query<T = any>(sql: string, params: any[] = []): T[] {
      throw syncError("query");
    },
    queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
      throw syncError("queryOne");
    },
    execute(sql: string, params: any[] = []): DbResult {
      throw syncError("execute");
    },
    exec(sql: string): void {
      throw syncError("exec");
    },
    transaction<T>(fn: () => T): T {
      throw syncError("transaction");
    },
    close(): void { if (pool) { pool.end(); pool = null; } },
  };
}
