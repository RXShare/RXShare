import { getStorageType, type StorageAdapter } from "./adapter";
import { createLocalStorage } from "./local";

let storage: StorageAdapter | null = null;

export async function getStorage(): Promise<StorageAdapter> {
  if (!storage) {
    const type = getStorageType();
    if (type === "s3") {
      const { createS3Storage } = await import("./s3");
      storage = createS3Storage();
    } else {
      storage = createLocalStorage();
    }
  }
  return storage;
}
