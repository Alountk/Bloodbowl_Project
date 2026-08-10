import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type { StorageAdapter } from "./adapter";

/**
 * Configuration for the local-disk storage adapter.
 *
 * `root` is the absolute directory blobs are written under (production uses
 * `public/uploads` so Next serves them statically). `publicBase` is the URL
 * prefix returned as the adapter-issued value (`/uploads` by default). Tests
 * override both to a temp dir so no real `public/` file is touched.
 */
export interface LocalAdapterOptions {
  root: string;
  publicBase: string;
}

/**
 * Disk-backed `StorageAdapter`.
 *
 * Writes `key` under `<root>/<key>` and issues `/uploads/<key>` as its opaque
 * value (configurable via `publicBase`). Serves the file at the URL formed by
 * `publicBase + "/" + key`. `delete` removes the file only when present.
 */
export function createLocalAdapter(options: LocalAdapterOptions): StorageAdapter {
  const { root, publicBase } = options;

  /** Resolve and enforce that keys stay inside `root` (no path traversal). */
  function resolvePath(key: string): string {
    const full = normalize(join(root, key));
    if (!full.startsWith(root)) {
      throw new Error(`Storage key escapes the local root: ${key}`);
    }
    return full;
  }

  return {
    async put(key, buffer) {
      const filePath = resolvePath(key);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, buffer);
      return `${publicBase}/${key}`;
    },

    async read(key) {
      const filePath = resolvePath(key);
      if (!existsSync(filePath)) return null;
      return readFileSync(filePath);
    },

    async delete(key) {
      const filePath = resolvePath(key);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    },
  };
}

export type LocalStorageAdapter = StorageAdapter;
