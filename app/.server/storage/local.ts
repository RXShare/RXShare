import { join, dirname, resolve, relative } from "path";
import { readFile, writeFile, unlink, mkdir, access, stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import type { StorageAdapter } from "./adapter";

const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), "data", "uploads");

function safePath(filePath: string): string {
  const full = resolve(uploadsDir, filePath);
  // Ensure resolved path is still inside uploadsDir
  const rel = relative(uploadsDir, full);
  if (rel.startsWith("..") || resolve(uploadsDir, rel) !== full) {
    throw new Error("Invalid file path");
  }
  return full;
}

export function createLocalStorage(): StorageAdapter {
  return {
    async save(filePath: string, data: Buffer) {
      const full = safePath(filePath);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
    },
    async read(filePath: string) {
      return readFile(safePath(filePath));
    },
    async readStream(filePath: string) {
      const full = safePath(filePath);
      const info = await stat(full);
      const nodeStream = createReadStream(full);
      const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return { stream, size: info.size };
    },
    async delete(filePath: string) {
      try { await unlink(safePath(filePath)); } catch {}
    },
    async exists(filePath: string) {
      try { await access(safePath(filePath)); return true; } catch { return false; }
    },
    getUrl(filePath: string) {
      return `/api/files/${filePath}`;
    },
  };
}
