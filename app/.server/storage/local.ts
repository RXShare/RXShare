import { join, dirname, resolve, relative } from "path";
import { readFile, writeFile, unlink, mkdir, access, stat } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { Readable } from "stream";
import type { StorageAdapter } from "./adapter";
import { encryptBuffer, decryptBuffer, getDecryptedSize, isEncryptionEnabled, ENCRYPTION_HEADER_LENGTH } from "../encryption";

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
      const toWrite = encryptBuffer(data);
      await writeFile(full, toWrite);
    },
    async saveStream(filePath: string, stream: ReadableStream<Uint8Array>) {
      const full = safePath(filePath);
      await mkdir(dirname(full), { recursive: true });

      // Collect the stream into a buffer so we can encrypt it
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const data = Buffer.concat(chunks);
      const toWrite = encryptBuffer(data);
      await writeFile(full, toWrite);
    },
    async read(filePath: string) {
      const raw = await readFile(safePath(filePath));
      return decryptBuffer(raw);
    },
    async readStream(filePath: string) {
      const full = safePath(filePath);
      const raw = await readFile(full);
      const decrypted = decryptBuffer(raw);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(decrypted);
          controller.close();
        },
      });
      return { stream, size: decrypted.length };
    },
    async readRangeStream(filePath: string, start: number, end: number) {
      const full = safePath(filePath);
      const info = await stat(full);

      if (isEncryptionEnabled() && info.size >= ENCRYPTION_HEADER_LENGTH) {
        // Encrypted file: must decrypt fully, then slice the range
        const raw = await readFile(full);
        const decrypted = decryptBuffer(raw);
        const totalSize = decrypted.length;
        const slice = decrypted.subarray(start, end + 1);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(slice);
            controller.close();
          },
        });
        return { stream, size: slice.length, totalSize };
      }

      // Unencrypted file (encryption disabled or legacy): stream range directly
      const nodeStream = createReadStream(full, { start, end });
      const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      return { stream, size: end - start + 1, totalSize: info.size };
    },
    async getSize(filePath: string) {
      const full = safePath(filePath);
      const info = await stat(full);
      return getDecryptedSize(info.size);
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
