export interface StorageAdapter {
  save(filePath: string, data: Buffer): Promise<void>;
  read(filePath: string): Promise<Buffer>;
  delete(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  getUrl(filePath: string, request?: Request): string;
}

export type StorageType = "local" | "s3";

export function getStorageType(): StorageType {
  const t = (process.env.STORAGE_TYPE || "local").toLowerCase();
  if (t === "s3") return "s3";
  return "local";
}
