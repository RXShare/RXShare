import { getStorageType, type StorageAdapter } from "./adapter";
import { createLocalStorage } from "./local";

let storage: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storage) {
    const type = getStorageType();
    if (type === "s3") {
      const { createS3Storage } = require("./s3") as { createS3Storage: () => StorageAdapter };
      storage = createS3Storage();
    } else {
      storage = createLocalStorage();
    }
  }
  return storage;
}
