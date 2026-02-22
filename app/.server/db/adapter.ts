export interface DatabaseAdapter {
  query<T = any>(sql: string, params?: any[]): T[];
  queryOne<T = any>(sql: string, params?: any[]): T | undefined;
  execute(sql: string, params?: any[]): DbResult;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface DbResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export type DbType = "sqlite" | "mysql";

export function getDbType(): DbType {
  const t = (process.env.DB_TYPE || "sqlite").toLowerCase();
  if (t === "mysql" || t === "mariadb") return "mysql";
  return "sqlite";
}
