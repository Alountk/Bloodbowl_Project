import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createStorageAdapter } from "@/lib/storage/factory";
import {
  keyFromValue,
  MAX_UPLOAD_BYTES,
  sniffImageBytes,
  toSquareWebp,
} from "@/lib/uploads/image";

// Re-exported so existing callers keep importing these from the route; the
// byte-identical implementations now live in the shared `lib/uploads/image.ts`.
export { MAX_UPLOAD_BYTES, sniffImageBytes };

/**
 * Pure: recover the namespaced storage key from an adapter-issued avatar value.
 *
 * Adapter-issued values are always `${publicBase}/${key}` where `key` starts
 * with the `avatars/` folder prefix (local issues `/uploads/avatars/...`, S3
 * issues `${S3_PUBLIC_URL}/avatars/...`). Extracting everything after the
 * `/avatars/` segment rebuilds the key `delete` needs without coupling the
 * route to a driver's public base. Returns null when the value has no
 * `avatars/` segment (e.g. a different image kind) — the route then skips the
 * delete.
 */
export function avatarKeyFromValue(value: string): string | null {
  return keyFromValue(value, "avatars");
}

/**
 * POST /api/me/avatar
 * Accepts a multipart `avatar` field (built-in `req.formData()`). Rejects:
 * 401 unauthenticated; 400 when the payload exceeds 2MB or its magic bytes are
 * not JPEG/PNG/WebP (MIME never trusted). On success sharp resizes the blob to
 * a 256x256 cover-cropped WebP ONLY, stores it under a server-issued key
 * `avatars/<userId>-<uuid>.webp` via the storage adapter, persists the issued
 * value on `User.avatar` (old value kept until the new put succeeds), deletes
 * the previous file, and returns 200 with `{ avatar: <issued value> }`.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const file = formData.get("avatar");
  // Duck-typed Blob/File: undici returns its own File class (not the global
  // `File` in every runtime), so `instanceof File` is unreliable. Require the
  // primitive Blob surface instead.
  if (
    !file ||
    typeof file !== "object" ||
    typeof (file as Blob).arrayBuffer !== "function" ||
    typeof (file as Blob).size !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing avatar file field" },
      { status: 400 },
    );
  }

  // Bound the payload with the parsed file size (the multipart body stays in an
  // acceptable range because the client caps its export canvas at 1024px).
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Avatar exceeds the 2MB limit" },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Never trust the multipart-provided MIME/extension — sniff the magic bytes.
  if (sniffImageBytes(bytes) === null) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WebP images are allowed" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const previousKey = user.avatar ? avatarKeyFromValue(user.avatar) : null;

  // Server issues the key; a client-supplied filename/URL is never persisted.
  const key = `avatars/${userId}-${randomUUID()}.webp`;
  const webp = await toSquareWebp(bytes, 256);

  const adapter = createStorageAdapter();
  const value = await adapter.put(key, webp);

  // DB update keeps the old value until the new put succeeded; only then is the
  // previous file deleted (safe delete makes a missing old key a no-op).
  await prisma.user.update({
    where: { id: userId },
    data: { avatar: value },
  });
  if (previousKey && previousKey !== key) {
    await adapter.delete(previousKey);
  }

  return NextResponse.json({ avatar: value });
}
