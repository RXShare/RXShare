import { isFirstRun } from "~/.server/db";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import { rateLimit } from "~/.server/rate-limit";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!isFirstRun()) return Response.json({ error: "Setup already completed" }, { status: 403 });

  // Rate limit: 5 attempts per 10 minutes
  const limited = rateLimit("setup", request, 5, 10 * 60 * 1000);
  if (limited) return limited;

  const body = await request.json();
  const { dbType, dbHost, dbPort, dbUser, dbPassword, dbName, storageType, s3Bucket, s3Region, s3AccessKey, s3SecretKey, s3Endpoint } = body;

  // Sanitize all values — strip newlines to prevent .env injection
  const clean = (v: any) => String(v || "").replace(/[\r\n]/g, "");

  const envPath = join(process.cwd(), ".env");
  const jwtSecret = crypto.randomBytes(32).toString("hex");

  const lines: string[] = [
    "# RXShare Configuration",
    "",
    `PORT=${process.env.PORT || "3000"}`,
    `JWT_SECRET=${jwtSecret}`,
    "",
    "# Database",
    `DB_TYPE=${clean(dbType) || "sqlite"}`,
  ];

  if (dbType === "mysql") {
    lines.push(`DB_HOST=${clean(dbHost) || "localhost"}`);
    lines.push(`DB_PORT=${clean(dbPort) || "3306"}`);
    lines.push(`DB_USER=${clean(dbUser) || "root"}`);
    lines.push(`DB_PASSWORD=${clean(dbPassword) || ""}`);
    lines.push(`DB_NAME=${clean(dbName) || "rxshare"}`);
  }

  lines.push("");
  lines.push("# Storage");
  lines.push(`STORAGE_TYPE=${clean(storageType) || "local"}`);

  if (storageType === "s3") {
    lines.push(`S3_BUCKET=${clean(s3Bucket) || ""}`);
    lines.push(`S3_REGION=${clean(s3Region) || "us-east-1"}`);
    lines.push(`S3_ACCESS_KEY=${clean(s3AccessKey) || ""}`);
    lines.push(`S3_SECRET_KEY=${clean(s3SecretKey) || ""}`);
    if (s3Endpoint) lines.push(`S3_ENDPOINT=${clean(s3Endpoint)}`);
  }

  lines.push("");

  try {
    writeFileSync(envPath, lines.join("\n"), "utf-8");

    // Update process.env so the current process picks up the changes
    process.env.DB_TYPE = dbType || "sqlite";
    process.env.JWT_SECRET = jwtSecret;
    process.env.STORAGE_TYPE = storageType || "local";

    if (dbType === "mysql") {
      process.env.DB_HOST = dbHost || "localhost";
      process.env.DB_PORT = dbPort || "3306";
      process.env.DB_USER = dbUser || "root";
      process.env.DB_PASSWORD = dbPassword || "";
      process.env.DB_NAME = dbName || "rxshare";
    }

    if (storageType === "s3") {
      process.env.S3_BUCKET = s3Bucket || "";
      process.env.S3_REGION = s3Region || "us-east-1";
      process.env.S3_ACCESS_KEY = s3AccessKey || "";
      process.env.S3_SECRET_KEY = s3SecretKey || "";
      if (s3Endpoint) process.env.S3_ENDPOINT = s3Endpoint;
    }

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
