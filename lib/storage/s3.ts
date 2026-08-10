import {
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./adapter";

/**
 * The subset of the S3 client the adapter uses. Typed structurally so tests
 * may inject a fake `send` without constructing a real AWS client.
 */
export interface S3SendShape {
  send(command: { constructor: { name: string }; input: unknown }): Promise<unknown>;
}

/**
 * Configuration for the S3 storage adapter.
 *
 * In production the factory builds the concrete `S3Client` from environment
 * variables and passes it here. Tests pass a mocked `client` so no live
 * credentials or network calls are ever required.
 */
export interface S3AdapterOptions {
  /** Bucket name whose objects are addressed. */
  bucket: string;
  /** Any object satisfying the S3 `send` surface (a real client or a fake). */
  client: S3SendShape;
  /** Public CDN/bucket base URL; issued values are `${publicUrl}/${key}`. */
  publicUrl: string;
}

/**
 * S3-backed `StorageAdapter`.
 *
 * Issues `${publicUrl}/${key}` as its opaque value and maps `delete` to a
 * `DeleteObject` call. A `NotFound` on delete is swallowed so replace/clear
 * stays idempotent (missing objects are inert).
 */
export function createS3Adapter(options: S3AdapterOptions): StorageAdapter {
  const { bucket, client, publicUrl } = options;

  return {
    async put(key, buffer) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer }),
      );
      return `${publicUrl}/${key}`;
    },

    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      ).catch((err: unknown) => {
        // A missing object is a no-op — do not break replace/clear flows.
        if (!(err instanceof Error) || err.name !== "NotFound") {
          throw err;
        }
      });
    },
  };
}

export type S3StorageAdapter = StorageAdapter;
