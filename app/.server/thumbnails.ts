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
