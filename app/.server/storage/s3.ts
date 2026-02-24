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
