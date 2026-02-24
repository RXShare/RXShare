import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./adapter";
import { encryptBuffer, decryptBuffer, getDecryptedSize, isEncryptionEnabled, ENCRYPTION_HEADER_LENGTH } from "../encryption";

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
      const toUpload = encryptBuffer(data);
      await client.send(new PutObjectCommand({ Bucket: bucket(), Key: filePath, Body: toUpload }));
    },
    async saveStream(filePath: string, stream: ReadableStream<Uint8Array>) {
      // Collect the stream into a buffer so we can encrypt it
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const data = Buffer.concat(chunks);
      const toUpload = encryptBuffer(data);
      await client.send(new PutObjectCommand({ Bucket: bucket(), Key: filePath, Body: toUpload }));
    },
    async read(filePath: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath }));
      const raw = Buffer.from(await res.Body!.transformToByteArray());
      return decryptBuffer(raw);
    },
    async readStream(filePath: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath }));
      const raw = Buffer.from(await res.Body!.transformToByteArray());
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
      if (isEncryptionEnabled()) {
        // Encrypted file: must download and decrypt fully, then slice
        const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: filePath }));
        const raw = Buffer.from(await res.Body!.transformToByteArray());
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

      // Unencrypted: use S3 range request directly
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
      const onDiskSize = res.ContentLength ?? 0;
      return getDecryptedSize(onDiskSize);
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
