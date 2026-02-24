export interface StorageAdapter {
  save(filePath: string, data: Buffer): Promise<void>;
  saveStream(filePath: string, stream: ReadableStream<Uint8Array>): Promise<void>;
  read(filePath: string): Promise<Buffer>;
  readStream(filePath: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
  readRangeStream(filePath: string, start: number, end: number): Promise<{ stream: ReadableStream<Uint8Array>; size: number; totalSize: number }>;
  getSize(filePath: string): Promise<number>;
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
