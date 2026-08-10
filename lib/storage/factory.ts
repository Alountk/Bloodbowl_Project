import { S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./adapter";
import { createLocalAdapter } from "./local";
import { createS3Adapter, type S3SendShape } from "./s3";

/**
 * Batch-injectable overrides so tests keep the factory env-driven without
 * touching `public/uploads/` or constructing a real AWS client.
 */
export interface Overrides {
  /** Local root dir (production defaults to `<cwd>/public/uploads`). */
  localRoot?: string;
  /** Public base path issued by local values (default `/uploads`). */
  localPublicBase?: string;
  /** Public URL issued by S3 values (defaults to `S3_PUBLIC_URL`). */
  publicUrl?: string;
  /** Injected fake S3 `send` surface (defaults to a real S3Client). */
  s3Client?: S3SendShape;
}

/**
 * Builds the storage adapter selected by `STORAGE_DRIVER`.
 *
 * - `local` (default): disk-backed, requires no S3 environment, never builds
 *   an AWS client.
 * - `s3`: S3-backed, configured from `S3_BUCKET`, `S3_REGION`, optional
 *   `S3_ENDPOINT`, optional credentials, and `S3_PUBLIC_URL`.
 * - Any other value (or unset): falls back to `local`.
 */
export function createStorageAdapter(overrides: Overrides = {}): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();

  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET ?? "";
    const region = process.env.S3_REGION ?? "";
    if (!bucket || !region) {
      throw new Error(
        "STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION to be configured",
      );
    }
    const publicUrl = overrides.publicUrl ?? process.env.S3_PUBLIC_URL ?? "";
    if (!publicUrl) {
      throw new Error(
        "STORAGE_DRIVER=s3 requires S3_PUBLIC_URL to be configured",
      );
    }
    const client =
      overrides.s3Client ??
      new S3Client({
        region,
        endpoint: process.env.S3_ENDPOINT || undefined,
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
    return createS3Adapter({ bucket, client, publicUrl });
  }

  // Default (including invalid driver values) is the local driver.
  return createLocalAdapter({
    root: overrides.localRoot ?? `${process.cwd()}/public/uploads`,
    publicBase: overrides.localPublicBase ?? "/uploads",
  });
}
