import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";

// NOTE: Imported symbols must exist in production code; these imports are the
// RED target for this task. The S3 adapter accepts an injected client so the
// suite never needs real AWS credentials or a network call.

import { createLocalAdapter, type LocalStorageAdapter } from "./local";
import { createS3Adapter, type S3StorageAdapter } from "./s3";
import { createStorageAdapter, type Overrides } from "./factory";

/** Returns a unique temp dir path for the local adapter under the OS temp dir. */
function tempUploadsDir(): string {
  return `${process.cwd()}.storage-test-${Date.now()}`;
}

function makeLocal(options?: { dir?: string; publicBase?: string }): LocalStorageAdapter {
  return createLocalAdapter({
    root: options?.dir ?? tempUploadsDir(),
    publicBase: options?.publicBase ?? "/uploads",
  });
}

// ---------------------------------------------------------------------------
// Local adapter — real filesystem behaviour.
// ---------------------------------------------------------------------------

describe("createLocalAdapter", () => {
  let local: LocalStorageAdapter;
  let dir: string;

  beforeEach(() => {
    dir = tempUploadsDir();
    local = makeLocal({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("puts a blob under public/uploads/avatars and returns a /uploads/… value", async () => {
    const value = await local.put("avatars/u-abc.webp", Buffer.from("webp-bytes"));
    expect(value).toBe("/uploads/avatars/u-abc.webp");

    const written = readFileSync(`${dir}/avatars/u-abc.webp`);
    expect(written.toString()).toBe("webp-bytes");
  });

  it("writes the backing file so the issued value addresses it back", async () => {
    const value = await local.put("avatars/u-abc.webp", Buffer.from("x"));
    const file = readFileSync(`${dir}/${value.replace(/^\/uploads\//, "")}`);
    expect(file.toString()).toBe("x");
    await local.delete("avatars/u-abc.webp");
  });

  it("delete removes the backing file when it exists", async () => {
    await local.put("avatars/u-abc.webp", Buffer.from("gone"));
    await local.delete("avatars/u-abc.webp");

    expect(existsSync(`${dir}/avatars/u-abc.webp`)).toBe(false);
  });

  it("delete of a missing key is a no-op and never throws", async () => {
    await expect(local.delete("avatars/no-such.webp")).resolves.toBeUndefined();
  });

  it("serves a distinct namespace without colliding with the avatars prefix", async () => {
    await local.put("shields/t-xyz.webp", Buffer.from("shield"));
    const value = await local.put("avatars/u-abc.webp", Buffer.from("avatar"));
    expect(value).toBe("/uploads/avatars/u-abc.webp");
    expect(existsSync(`${dir}/shields/t-xyz.webp`)).toBe(true);
    await local.delete("shields/t-xyz.webp");
    await local.delete("avatars/u-abc.webp");
  });
});

// ---------------------------------------------------------------------------
// S3 adapter — asserted against an injected fake S3 client.
// ---------------------------------------------------------------------------

interface S3CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

/** Fake client object whose `send` records every command it receives. */
function fakeS3Client() {
  const send = vi.fn();
  return {
    /// A bare `{ send }` client shape the S3 adapter accepts.
    client: { send: send as unknown as (command: S3CommandLike) => Promise<unknown> },
    sendMock: send,
  };
}

describe("createS3Adapter", () => {
  it("put returns `${S3_PUBLIC_URL}/${key}` and sends a PutObject", async () => {
    const { client, sendMock } = fakeS3Client();
    sendMock.mockResolvedValue({});
    const adapter: S3StorageAdapter = createS3Adapter({
      client,
      bucket: "bloodbowl",
      publicUrl: "https://cdn.example.com",
    });

    const value = await adapter.put("avatars/u-abc.webp", Buffer.from("img"));
    expect(value).toBe("https://cdn.example.com/avatars/u-abc.webp");

    const putCommand = sendMock.mock.calls[0]?.[0];
    expect(putCommand).toBeDefined();
    expect((putCommand.constructor as { name: string }).name).toBe("PutObjectCommand");
    expect(putCommand.input).toMatchObject({ Key: "avatars/u-abc.webp" });
  });

  it("delete sends a DeleteObject and resolves", async () => {
    const { client, sendMock } = fakeS3Client();
    sendMock.mockResolvedValue({});
    const adapter: S3StorageAdapter = createS3Adapter({
      client,
      bucket: "bloodbowl",
      publicUrl: "https://cdn.example.com",
    });

    await adapter.delete("avatars/u-abc.webp");

    const delCommand = sendMock.mock.calls[0]?.[0];
    expect(delCommand).toBeDefined();
    expect((delCommand.constructor as { name: string }).name).toBe("DeleteObjectCommand");
    expect(delCommand.input).toMatchObject({ Key: "avatars/u-abc.webp" });
  });

  it("delete of a missing key resolves without throwing", async () => {
    const { client, sendMock } = fakeS3Client();
    // S3 DeleteObject on a missing key may surface a NotFound; the adapter
    // treats missing as a no-op so replace/clear stays idempotent.
    sendMock.mockRejectedValue(
      Object.assign(new Error("not found"), { name: "NotFound" }),
    );
    const adapter: S3StorageAdapter = createS3Adapter({
      client,
      bucket: "bloodbowl",
      publicUrl: "https://cdn.example.com",
    });
    await expect(adapter.delete("avatars/none.webp")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Factory — driver selection driven by STORAGE_DRIVER.
// ---------------------------------------------------------------------------

const envBackup = { ...process.env };

describe("createStorageAdapter", () => {
  afterEach(() => {
    process.env = { ...envBackup };
  });
  afterAll(() => {
    vi.resetAllMocks();
  });

  it("returns a local adapter that produces /uploads/… values when STORAGE_DRIVER is unset", async () => {
    delete process.env.STORAGE_DRIVER;
    const localRoot = tempUploadsDir();
    const adapter = createStorageAdapter({
      localRoot,
      publicUrl: "https://cdn.example.com",
    });
    const value = await adapter.put("avatars/u-a.webp", Buffer.from("p"));
    expect(value).toBe("/uploads/avatars/u-a.webp");
    expect(existsSync(`${localRoot}/avatars/u-a.webp`)).toBe(true);
    rmSync(localRoot, { recursive: true, force: true });
  });

  it("returns an S3 adapter (URL values) when STORAGE_DRIVER=s3", async () => {
    process.env.STORAGE_DRIVER = "s3";
    process.env.S3_BUCKET = "bloodbowl";
    process.env.S3_REGION = "us-east-1";
    const { client, sendMock } = fakeS3Client();
    sendMock.mockResolvedValue({});
    const overrides: Overrides = {
      publicUrl: "https://cdn.example.com",
      s3Client: client,
    };
    const adapter = createStorageAdapter(overrides);
    const value = await adapter.put("avatars/u-a.webp", Buffer.from("p"));
    expect(value).toBe("https://cdn.example.com/avatars/u-a.webp");
  });

  it("falls back to the local adapter for an unknown driver value", async () => {
    process.env.STORAGE_DRIVER = "gopher";
    const localRoot = tempUploadsDir();
    const adapter = createStorageAdapter({
      localRoot,
      publicUrl: "https://cdn.example.com",
    });
    const value = await adapter.put("avatars/u-a.webp", Buffer.from("f"));
    expect(value).toBe("/uploads/avatars/u-a.webp");
    rmSync(localRoot, { recursive: true, force: true });
  });
});
