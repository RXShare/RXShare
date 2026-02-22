import { join, dirname } from "path";
import { readFile, writeFile, unlink, mkdir, access } from "fs/promises";
import type { StorageAdapter } from "./adapter";

const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), "data", "uploads");

export function createLocalStorage(): StorageAdapter {
  return {
    async save(filePath: string, data: Buffer) {
      const full = join(uploadsDir, filePath);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
    },
    async read(filePath: string) {
      return readFile(join(uploadsDir, filePath));
    },
    async delete(filePath: string) {
      try { await unlink(join(uploadsDir, filePath)); } catch {}
    },
    async exists(filePath: string) {
      try { await access(join(uploadsDir, filePath)); return true; } catch { return false; }
    },
    getUrl(filePath: string) {
      return `/api/files/${filePath}`;
    },
  };
}
