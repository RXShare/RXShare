import { join, dirname, resolve, relative } from "path";
import { readFile, writeFile, unlink, mkdir, access, stat, open } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { Readable, Writable } from "stream";
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
    async saveStream(filePath: string, stream: ReadableStream<Uint8Array>) {
      const full = safePath(filePath);
      await mkdir(dirname(full), { recursive: true });
      const nodeWritable = createWriteStream(full);
      const nodeReadable = Readable.fromWeb(stream as any);
      await new Promise<void>((resolve, reject) => {
        nodeReadable.pipe(nodeWritable);
        nodeWritable.on("finish", resolve);
        nodeWritable.on("error", reject);
        nodeReadable.on("error", reject);
      });
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
    async readRangeStream(filePath: string, start: number, end: number) {
      const full = safePath(filePath);
      const info = await stat(full);
      const nodeStream = createReadStream(full, { start, end });
      const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return { stream, size: end - start + 1, totalSize: info.size };
    },
    async getSize(filePath: string) {
      const full = safePath(filePath);
      const info = await stat(full);
      return info.size;
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
