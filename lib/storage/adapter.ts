/**
 * Pluggable blob store for user-generated images.
 *
 * A `StorageAdapter` owns `put` (store a blob and return the opaque value a
 * caller persists — a relative path or a public URL), `read` (retrieve the
 * blob back, resolving `null` for a missing key) and `delete` (remove the
 * blob; missing keys are a silent no-op so replace/clear stay idempotent).
 *
 * Adapters MUST NOT contain avatar-specific logic: keys are namespaced by
 * folder prefix (`avatars/...`, `shields/...`) so future image kinds reuse the
 * same interface unchanged.
 */
export interface StorageAdapter {
  /**
   * Stores `buffer` under `key` and resolves to the adapter-issued opaque value
   * (a `/uploads/...` path for local, a public URL for S3) that the caller
   * persists on the model.
   */
  put(key: string, buffer: Buffer): Promise<string>;
  /**
   * Reads the blob for `key`; resolves `null` when it does not exist.
   */
  read(key: string): Promise<Buffer | null>;
  /**
   * Removes the backing blob for `key`. Missing files/objects are treated as a
   * no-op and never raise an error.
   */
  delete(key: string): Promise<void>;
}
