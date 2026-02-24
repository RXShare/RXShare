import sharp from "sharp";
import { getStorage } from "~/.server/storage";

export async function generateThumbnail(filePath: string, mimeType: string): Promise<string | null> {
  if (!mimeType.startsWith("image/")) return null;
  try {
    const storage = await getStorage();
    const data = await storage.read(filePath);
    const thumb = await sharp(data).resize(300, 300, { fit: "cover" }).webp({ quality: 75 }).toBuffer();
    const thumbPath = filePath.replace(/\.[^.]+$/, "_thumb.webp");
    await storage.save(thumbPath, thumb);
    return thumbPath;
  } catch {
    return null;
  }
}

export async function generatePreview(filePath: string, mimeType: string): Promise<string | null> {
  if (!mimeType.startsWith("image/")) return null;
  try {
    const storage = await getStorage();
    const data = await storage.read(filePath);
    const preview = await sharp(data).resize(1200, 630, { fit: "inside" }).webp({ quality: 80 }).toBuffer();
    const previewPath = filePath.replace(/\.[^.]+$/, "_preview.webp");
    await storage.save(previewPath, preview);
    return previewPath;
  } catch {
    return null;
  }
}

/**
 * Generate both thumbnail and preview from a single file read.
 * More efficient than calling generateThumbnail + generatePreview separately.
 */
export async function generateThumbnails(filePath: string, mimeType: string): Promise<{ thumbnailPath: string | null; previewPath: string | null }> {
  if (!mimeType.startsWith("image/")) return { thumbnailPath: null, previewPath: null };
  try {
    const storage = await getStorage();
    const data = await storage.read(filePath);

    let thumbnailPath: string | null = null;
    let previewPath: string | null = null;

    // Run both sharp operations in parallel from the same buffer
    const [thumbResult, previewResult] = await Promise.allSettled([
      sharp(data).resize(300, 300, { fit: "cover" }).webp({ quality: 75 }).toBuffer(),
      sharp(data).resize(1200, 630, { fit: "inside" }).webp({ quality: 80 }).toBuffer(),
    ]);

    if (thumbResult.status === "fulfilled") {
      thumbnailPath = filePath.replace(/\.[^.]+$/, "_thumb.webp");
      await storage.save(thumbnailPath, thumbResult.value);
    }

    if (previewResult.status === "fulfilled") {
      previewPath = filePath.replace(/\.[^.]+$/, "_preview.webp");
      await storage.save(previewPath, previewResult.value);
    }

    return { thumbnailPath, previewPath };
  } catch {
    return { thumbnailPath: null, previewPath: null };
  }
}
