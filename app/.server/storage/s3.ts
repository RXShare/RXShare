import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./adapter";

function getClient() {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
  });
}

const bucket = () => process.env.S3_BUCKET || "rxshare";

export function createS3Storage(): StorageAdapter {
  const client = getClient();
  return {
    async save(filePath: string, data: Buffer) {
      await client.send(new PutObjectCommand({ Bucket: bucket(), Key: filePath, Body: data }));
    },
    async saveStream(filePath: string, stream: ReadableStream<Uint8Array>) {
      // S3 PutObject accepts a web ReadableStream
      await client.send(new PutObjectCommand({ Bucket: bucket(), Key: filePath, Body: stream as any }));
    },
    async read(filePath: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async readStream(filePath: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath }));
      const size = res.ContentLength ?? 0;
      const stream = res.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
      return { stream, size };
    },
    async readRangeStream(filePath: string, start: number, end: number) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath, Range: `bytes=${start}-${end}` }));
      const totalSize = res.ContentLength ?? (end - start + 1);
      // Parse total size from Content-Range header if available
      const contentRange = res.ContentRange; // e.g. "bytes 0-999/5000"
      let fullSize = totalSize;
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)/);
        if (match) fullSize = parseInt(match[1], 10);
      }
      const stream = res.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
      return { stream, size: end - start + 1, totalSize: fullSize };
    },
    async getSize(filePath: string) {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: filePath }));
      return res.ContentLength ?? 0;
    },
    async delete(filePath: string) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: filePath })); } catch {}
    },
    async exists(filePath: string) {
      try { await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: filePath })); return true; } catch { return false; }
    },
    getUrl(filePath: string) {
      return `/api/files/${filePath}`;
    },
  };
}
